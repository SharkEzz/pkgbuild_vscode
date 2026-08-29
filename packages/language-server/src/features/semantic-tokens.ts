import { resolveEnvironmentName, resolveFunctionName, resolveVariableName } from '@pkgbuild-lsp/data';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { Range } from 'vscode-languageserver-types';

/**
 * Token types we emit, in the order the client is told about them.
 *
 * The point is to separate what makepkg understands from ordinary shell identifiers:
 * a themed PKGBUILD should make it obvious that `pkgver` is a format field while
 * `_mycommit` is just a variable someone made up.
 */
export const TOKEN_TYPES = ['property', 'function', 'variable', 'parameter'] as const;
export const TOKEN_MODIFIERS = ['declaration', 'defaultLibrary', 'deprecated'] as const;

const TYPE_INDEX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i])) as Record<
  (typeof TOKEN_TYPES)[number],
  number
>;
const MOD_BIT = Object.fromEntries(TOKEN_MODIFIERS.map((m, i) => [m, 1 << i])) as Record<
  (typeof TOKEN_MODIFIERS)[number],
  number
>;

interface Token {
  readonly range: Range;
  readonly type: number;
  readonly modifiers: number;
}

/** Encodes tokens into the LSP's delta-relative flat array. */
function encode(tokens: Token[]): number[] {
  const sorted = [...tokens].sort(
    (a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character,
  );

  const data: number[] = [];
  let lastLine = 0;
  let lastChar = 0;

  for (const token of sorted) {
    const { line, character } = token.range.start;
    // Multi-line tokens cannot be expressed in this encoding; skip them rather than
    // emit a length that runs past the end of the line.
    if (token.range.end.line !== line) continue;

    const deltaLine = line - lastLine;
    data.push(
      deltaLine,
      deltaLine === 0 ? character - lastChar : character,
      token.range.end.character - character,
      token.type,
      token.modifiers,
    );
    lastLine = line;
    lastChar = character;
  }

  return data;
}

export function semanticTokens(model: PkgbuildModel): number[] {
  const tokens: Token[] = [];

  const addAssignment = (name: string, range: Range): void => {
    const resolved = resolveVariableName(name);
    if (!resolved) return;
    tokens.push({
      range,
      type: TYPE_INDEX.property,
      modifiers:
        MOD_BIT.declaration |
        MOD_BIT.defaultLibrary |
        (resolved.doc.deprecated ? MOD_BIT.deprecated : 0),
    });
  };

  for (const assignment of model.globals.values()) {
    addAssignment(assignment.name, assignment.nameRange);
  }
  for (const list of model.overrides.values()) {
    for (const assignment of list) addAssignment(assignment.name, assignment.nameRange);
  }

  for (const fn of model.functions.values()) {
    if (!resolveFunctionName(fn.name)) continue;
    tokens.push({
      range: fn.nameRange,
      type: TYPE_INDEX.function,
      modifiers: MOD_BIT.declaration | MOD_BIT.defaultLibrary,
    });
  }

  for (const reference of model.references) {
    const env = resolveEnvironmentName(reference.name);
    if (!env) continue;
    tokens.push({
      range: reference.range,
      type: TYPE_INDEX.parameter,
      modifiers: MOD_BIT.defaultLibrary | (env.deprecated ? MOD_BIT.deprecated : 0),
    });
  }

  return encode(tokens);
}
