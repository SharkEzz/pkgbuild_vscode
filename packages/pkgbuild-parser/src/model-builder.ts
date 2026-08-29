import { resolveVariableName } from '@pkgbuild-lsp/data';
import type { Range } from 'vscode-languageserver-types';
import type { Node, Tree } from 'web-tree-sitter';

import type {
  PkgAssignment,
  PkgbuildModel,
  PkgFunction,
  PkgValue,
  PkgVarRef,
  SplitPackage,
} from './model.ts';

/** Node types that introduce a shell expansion. */
const EXPANSION_TYPES: ReadonlySet<string> = new Set([
  'simple_expansion',
  'expansion',
  'command_substitution',
  'arithmetic_expansion',
  'process_substitution',
]);

/** Node types that hold a `$name` reference we want to index. */
const REFERENCE_TYPES: ReadonlySet<string> = new Set(['simple_expansion', 'expansion']);

export function toRange(node: Node): Range {
  return {
    start: { line: node.startPosition.row, character: node.startPosition.column },
    end: { line: node.endPosition.row, character: node.endPosition.column },
  };
}

/** Strips one layer of matching single or double quotes. */
function unquote(raw: string): string {
  if (raw.length >= 2) {
    const first = raw[0];
    if ((first === '"' || first === "'") && raw.at(-1) === first) return raw.slice(1, -1);
  }
  return raw;
}

function containsExpansion(node: Node): boolean {
  if (EXPANSION_TYPES.has(node.type)) return true;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && containsExpansion(child)) return true;
  }
  return false;
}

function toValue(node: Node, text: string): PkgValue {
  const raw = text.slice(node.startIndex, node.endIndex);
  return {
    raw,
    text: unquote(raw),
    range: toRange(node),
    hasExpansion: containsExpansion(node),
  };
}

/**
 * True when the reference sits inside a double-quoted string.
 *
 * Word splitting only threatens an expansion that is not quoted, so this is what
 * separates a safe `"$pkgdir"` from a dangerous bare `$pkgdir`.
 */
function isQuoted(node: Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'string') return true;
    // A concatenation splices quoted and unquoted parts; keep looking outward only
    // through nodes that can still be wrapped in quotes.
    if (p.type !== 'concatenation') return false;
  }
  return false;
}

/** The `variable_name` inside a `$foo` or `${foo}` node, if it has one. */
function referencedName(node: Node, text: string): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'variable_name' || child?.type === 'special_variable_name') {
      return text.slice(child.startIndex, child.endIndex);
    }
  }
  // `${foo%bar}` and friends put the name first even without a variable_name field.
  const raw = text.slice(node.startIndex, node.endIndex);
  const match = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)/.exec(raw);
  return match?.[1];
}

function buildAssignment(node: Node, text: string, container?: string): PkgAssignment | undefined {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return undefined;

  const name = text.slice(nameNode.startIndex, nameNode.endIndex);
  const resolved = resolveVariableName(name);
  const valueNode = node.childForFieldName('value');

  // `foo=` with no right-hand side still assigns an empty value.
  const valueRange = valueNode
    ? toRange(valueNode)
    : { start: toRange(node).end, end: toRange(node).end };

  const base: Omit<PkgAssignment, 'kind' | 'items' | 'scalar'> = {
    name,
    base: resolved?.doc.name ?? name,
    ...(resolved?.arch ? { arch: resolved.arch } : {}),
    range: toRange(node),
    nameRange: toRange(nameNode),
    valueRange,
    ...(container ? { container } : {}),
  };

  if (valueNode?.type === 'array') {
    const items: PkgValue[] = [];
    for (let i = 0; i < valueNode.namedChildCount; i++) {
      const child = valueNode.namedChild(i);
      if (child && child.type !== 'comment') items.push(toValue(child, text));
    }
    return { ...base, kind: 'array', items };
  }

  return {
    ...base,
    kind: 'scalar',
    items: [],
    ...(valueNode ? { scalar: toValue(valueNode, text) } : {}),
  };
}

function buildFunction(node: Node, text: string): PkgFunction | undefined {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return undefined;
  const body = node.childForFieldName('body');
  return {
    name: text.slice(nameNode.startIndex, nameNode.endIndex),
    range: toRange(node),
    nameRange: toRange(nameNode),
    bodyRange: body ? toRange(body) : toRange(node),
  };
}

/**
 * Lifts a parsed bash tree into a PKGBUILD-shaped model.
 *
 * A single walk collects assignments, functions, variable references and error nodes,
 * tracking the enclosing function so that scope-sensitive rules (`$pkgdir` outside
 * `package()`) have what they need without a second pass.
 */
export function buildModel(tree: Tree, text: string): PkgbuildModel {
  const globals = new Map<string, PkgAssignment>();
  const functions = new Map<string, PkgFunction>();
  const overrides = new Map<string, PkgAssignment[]>();
  const references: PkgVarRef[] = [];
  const errors: Range[] = [];

  const walk = (node: Node, container: string | undefined): void => {
    if (node.type === 'ERROR' || node.isMissing) {
      errors.push(toRange(node));
      // Children of an error region are unreliable; do not mine them for symbols.
      return;
    }

    if (node.type === 'function_definition') {
      const fn = buildFunction(node, text);
      if (fn) {
        functions.set(fn.name, fn);
        const body = node.childForFieldName('body');
        if (body) walk(body, fn.name);
        return;
      }
    }

    if (node.type === 'variable_assignment') {
      const assignment = buildAssignment(node, text, container);
      if (assignment) {
        if (container) {
          const list = overrides.get(container);
          if (list) list.push(assignment);
          else overrides.set(container, [assignment]);
        } else {
          globals.set(assignment.name, assignment);
        }
      }
      // Fall through: the right-hand side can still contain references.
    }

    if (REFERENCE_TYPES.has(node.type)) {
      const name = referencedName(node, text);
      if (name) {
        references.push({
          name,
          range: toRange(node),
          ...(container ? { container } : {}),
          quoted: isQuoted(node),
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child, container);
    }
  };

  walk(tree.rootNode, undefined);

  return {
    globals,
    functions,
    overrides,
    references,
    errors,
    packages: buildSplitPackages(globals, functions),
    hasError: errors.length > 0,
  };
}

/** Joins each entry of a `pkgname` array to the `package_<name>()` that builds it. */
function buildSplitPackages(
  globals: ReadonlyMap<string, PkgAssignment>,
  functions: ReadonlyMap<string, PkgFunction>,
): SplitPackage[] {
  const pkgname = globals.get('pkgname');
  if (!pkgname || pkgname.kind !== 'array') return [];

  // oxlint-disable-next-line oxc/no-map-spread
  return pkgname.items.map((item) => {
    const fn = functions.get(`package_${item.text}`);
    return { name: item.text, nameRange: item.range, ...(fn ? { fn } : {}) };
  });
}
