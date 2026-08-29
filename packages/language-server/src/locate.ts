import type { PkgAssignment, PkgbuildModel, PkgFunction, PkgValue, PkgVarRef } from '@pkgbuild-lsp/parser';
import type { Position, Range } from 'vscode-languageserver-types';

/** What the cursor is sitting on. */
export type Located =
  | { readonly kind: 'variable-name'; readonly assignment: PkgAssignment }
  | { readonly kind: 'array-item'; readonly assignment: PkgAssignment; readonly item: PkgValue }
  | { readonly kind: 'scalar-value'; readonly assignment: PkgAssignment; readonly value: PkgValue }
  | { readonly kind: 'function-name'; readonly fn: PkgFunction }
  | { readonly kind: 'reference'; readonly reference: PkgVarRef };

export function contains(range: Range, position: Position): boolean {
  const { start, end } = range;
  if (position.line < start.line || position.line > end.line) return false;
  if (position.line === start.line && position.character < start.character) return false;
  if (position.line === end.line && position.character > end.character) return false;
  return true;
}

/**
 * Finds the most specific thing at `position`.
 *
 * Ordering matters: a `$pkgname` inside a `source=()` element is both an array item and a
 * variable reference, and the reference is the more useful answer, so it wins.
 */
export function locate(model: PkgbuildModel, position: Position): Located | undefined {
  for (const reference of model.references) {
    if (contains(reference.range, position)) return { kind: 'reference', reference };
  }

  for (const assignment of model.globals.values()) {
    if (contains(assignment.nameRange, position)) return { kind: 'variable-name', assignment };
  }

  for (const list of model.overrides.values()) {
    for (const assignment of list) {
      if (contains(assignment.nameRange, position)) return { kind: 'variable-name', assignment };
    }
  }

  for (const assignment of allAssignments(model)) {
    for (const item of assignment.items) {
      if (contains(item.range, position)) return { kind: 'array-item', assignment, item };
    }
    if (assignment.scalar && contains(assignment.scalar.range, position)) {
      return { kind: 'scalar-value', assignment, value: assignment.scalar };
    }
  }

  for (const fn of model.functions.values()) {
    if (contains(fn.nameRange, position)) return { kind: 'function-name', fn };
  }

  return undefined;
}

export function* allAssignments(model: PkgbuildModel): Generator<PkgAssignment> {
  yield* model.globals.values();
  for (const list of model.overrides.values()) yield* list;
}
