import type { PkgAssignment, PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { Position, Range, TextEdit } from 'vscode-languageserver-types';

/** Severity constants, inlined so the analyzer stays free of a runtime dependency. */
export const Severity = {
  Error: 1,
  Warning: 2,
  Information: 3,
  Hint: 4,
} as const;

/**
 * The effective assignment for a base name, ignoring architecture-suffixed variants.
 *
 * Rules almost always want `source` regardless of whether the file wrote `source` or
 * `source_x86_64`, so this looks up by base name rather than as-written name.
 */
export function findByBase(
  model: PkgbuildModel,
  base: string,
): PkgAssignment | undefined {
  const direct = model.globals.get(base);
  if (direct) return direct;
  for (const assignment of model.globals.values()) {
    if (assignment.base === base) return assignment;
  }
  return undefined;
}

/** Every assignment whose base name matches, including all arch-suffixed variants. */
export function findAllByBase(model: PkgbuildModel, base: string): PkgAssignment[] {
  return [...model.globals.values()].filter((a) => a.base === base);
}

/** The `pkgname` values, whether written as a scalar or as a split-package array. */
export function packageNames(model: PkgbuildModel): string[] {
  const pkgname = model.globals.get('pkgname');
  if (!pkgname) return [];
  return pkgname.kind === 'array'
    ? pkgname.items.map((i) => i.text)
    : pkgname.scalar
      ? [pkgname.scalar.text]
      : [];
}

/** A zero-width range at a position, for insertions. */
export function at(position: Position): Range {
  return { start: position, end: position };
}

/** The line a new top-level assignment should be inserted on, as an edit. */
export function insertAfterLine(line: number, content: string): TextEdit {
  return { range: at({ line: line + 1, character: 0 }), newText: `${content}\n` };
}

/** Indentation of the given line, for edits that must match surrounding style. */
export function indentOf(lines: readonly string[], line: number): string {
  return /^[ \t]*/.exec(lines[line] ?? '')?.[0] ?? '';
}
