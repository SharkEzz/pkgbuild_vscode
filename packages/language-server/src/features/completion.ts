import {
  ARCHITECTURES,
  ENVIRONMENT,
  FUNCTIONS,
  OPTIONS,
  SPDX_LICENSES,
  VARIABLES,
  VCS_FRAGMENTS,
  VCS_PREFIXES,
} from '@pkgbuild-lsp/data';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { CompletionItem } from 'vscode-languageserver-types';

/** LSP CompletionItemKind values, inlined to keep this module dependency-light. */
const Kind = {
  Function: 3,
  Field: 5,
  Variable: 6,
  Value: 12,
  Enum: 13,
  Keyword: 14,
  Constant: 21,
} as const;

/**
 * The syntactic context the cursor is in.
 *
 * Derived from the line prefix rather than the AST: while someone is mid-keystroke the
 * tree is frequently in an error state, but the text to the left of the cursor is always
 * exactly what they typed.
 */
export type CompletionContext =
  | { readonly kind: 'array-value'; readonly variable: string }
  | { readonly kind: 'vcs-fragment' }
  | { readonly kind: 'variable-reference'; readonly prefix: string }
  | { readonly kind: 'top-level' }
  | { readonly kind: 'statement' };

/**
 * Classifies the cursor from everything to its left in the document.
 *
 * Taking the whole preceding text rather than just the current line is what makes
 * multi-line arrays work -- `source=(` on one line and the cursor three lines below is
 * still inside that array, which is how most real PKGBUILDs are written.
 */
export function completionContext(textBefore: string): CompletionContext {
  const currentLine = textBefore.slice(textBefore.lastIndexOf('\n') + 1);

  // Inside `$...` or `${...}`.
  const reference = /\$\{?([A-Za-z_][A-Za-z0-9_]*)?$/.exec(currentLine);
  if (reference) return { kind: 'variable-reference', prefix: reference[1] ?? '' };

  // Inside a VCS fragment: `...git+https://x#bra`
  if (/\+[a-z]+:\/\/\S*#[A-Za-z]*$/.test(currentLine)) return { kind: 'vcs-fragment' };

  // Inside an unclosed `name=(`, which may have opened several lines earlier.
  const array = /(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=\([^)]*$/.exec(textBefore);
  if (array) return { kind: 'array-value', variable: array[1]! };

  // An indented line is inside a function body.
  if (/^\s+/.test(currentLine)) return { kind: 'statement' };

  return { kind: 'top-level' };
}

/**
 * Completions for the cursor, given everything to its left in the document.
 *
 * `model` supplies the file's own variables, so a private `$_commit` completes alongside
 * the makepkg-provided `$srcdir`.
 */
export function complete(model: PkgbuildModel, textBefore: string): CompletionItem[] {
  const context = completionContext(textBefore);

  switch (context.kind) {
    case 'variable-reference':
      return referenceCompletions(model);

    case 'vcs-fragment':
      return VCS_FRAGMENTS.map((f) => ({
        label: f.value,
        kind: Kind.Enum,
        detail: 'VCS fragment',
        documentation: { kind: 'markdown' as const, value: f.documentation },
        insertText: f.value === 'signed' ? f.value : `${f.value}=`,
      }));

    case 'array-value':
      return arrayValueCompletions(context.variable);

    case 'statement':
      // Inside a function body: offer the makepkg environment and nothing else, since
      // arbitrary shell commands are the shell's business, not ours.
      return referenceCompletions(model);

    case 'top-level':
      return topLevelCompletions(model);

    default:
      return [];
  }
}

function topLevelCompletions(model: PkgbuildModel): CompletionItem[] {
  const items: CompletionItem[] = VARIABLES.map((v) => ({
    label: v.name,
    kind: Kind.Field,
    detail: v.summary,
    documentation: { kind: 'markdown' as const, value: v.documentation },
    // Required fields first, then the rest alphabetically.
    sortText: `${v.required ? '0' : '1'}${v.name}`,
    insertText: v.shape === 'array' ? `${v.name}=(` : `${v.name}=`,
  }));

  for (const fn of FUNCTIONS) {
    if (model.functions.has(fn.name)) continue;
    items.push({
      label: `${fn.name}()`,
      kind: Kind.Function,
      detail: fn.summary,
      documentation: { kind: 'markdown', value: fn.documentation },
      sortText: `2${fn.order}`,
      insertText: `${fn.name}() {\n  $0\n}`,
      insertTextFormat: 2,
    });
  }

  return items;
}

function arrayValueCompletions(variable: string): CompletionItem[] {
  const base = variable.replace(/_[a-z0-9_]+$/, '');

  if (base === 'arch' || variable === 'arch') {
    return ARCHITECTURES.map((a) => ({
      label: a.value,
      kind: Kind.Enum,
      detail: 'architecture',
      documentation: { kind: 'markdown' as const, value: a.documentation },
    }));
  }

  if (base === 'options') {
    // Offer both polarities; `!lto` is as common as `lto`.
    return OPTIONS.flatMap((o) => [
      {
        label: o.value,
        kind: Kind.Enum,
        detail: 'enable',
        documentation: { kind: 'markdown' as const, value: o.documentation },
      },
      {
        label: `!${o.value}`,
        kind: Kind.Enum,
        detail: 'disable',
        documentation: { kind: 'markdown' as const, value: o.documentation },
      },
    ]);
  }

  if (base === 'license') {
    return [...SPDX_LICENSES].map(([id, name]) => ({
      label: id,
      kind: Kind.Constant,
      detail: name,
    }));
  }

  if (base === 'source') {
    return VCS_PREFIXES.map((p) => ({
      label: p.value,
      kind: Kind.Keyword,
      detail: 'VCS source prefix',
      documentation: { kind: 'markdown' as const, value: p.documentation },
    }));
  }

  return [];
}

function referenceCompletions(model: PkgbuildModel): CompletionItem[] {
  // oxlint-disable-next-line oxc/no-map-spread
  const items: CompletionItem[] = ENVIRONMENT.map((e) => ({
    label: e.name,
    kind: Kind.Variable,
    detail: e.summary,
    documentation: { kind: 'markdown' as const, value: e.documentation },
    sortText: `0${e.name}`,
    ...(e.deprecated ? { tags: [1] } : {}),
  }));

  // The file's own variables, including private `_foo` helpers.
  for (const assignment of model.globals.values()) {
    items.push({
      label: assignment.name,
      kind: Kind.Variable,
      detail:
        assignment.kind === 'array'
          ? `(${assignment.items.length} items)`
          : (assignment.scalar?.text ?? ''),
      sortText: `1${assignment.name}`,
    });
  }

  return items;
}
