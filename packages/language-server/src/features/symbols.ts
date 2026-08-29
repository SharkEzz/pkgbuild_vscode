import { isPackageFunction, resolveVariableName } from '@pkgbuild-lsp/data';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { DocumentSymbol } from 'vscode-languageserver-types';

/** LSP SymbolKind values used here. */
const Kind = {
  Function: 12,
  Variable: 13,
  Array: 18,
  String: 15,
} as const;

/** Outline of a PKGBUILD: its metadata fields and its build functions. */
export function documentSymbols(model: PkgbuildModel): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const assignment of model.globals.values()) {
    const doc = resolveVariableName(assignment.name);
    // Private `_foo` helpers are noise in an outline unless they are the only content.
    symbols.push({
      name: assignment.name,
      kind: assignment.kind === 'array' ? Kind.Array : Kind.String,
      range: assignment.range,
      selectionRange: assignment.nameRange,
      ...(doc ? { detail: doc.doc.summary } : {}),
      ...(assignment.kind === 'array'
        ? {
            children: assignment.items.map((item) => ({
              name: item.text,
              kind: Kind.String,
              range: item.range,
              selectionRange: item.range,
            })),
          }
        : {}),
    });
  }

  for (const fn of model.functions.values()) {
    const overrides = model.overrides.get(fn.name) ?? [];
    symbols.push({
      name: `${fn.name}()`,
      kind: Kind.Function,
      range: fn.range,
      selectionRange: fn.nameRange,
      ...(isPackageFunction(fn.name) ? { detail: 'installs into $pkgdir' } : {}),
      ...(overrides.length > 0
        ? {
            children: overrides.map((o) => ({
              name: o.name,
              kind: o.kind === 'array' ? Kind.Array : Kind.Variable,
              range: o.range,
              selectionRange: o.nameRange,
            })),
          }
        : {}),
    });
  }

  return symbols.sort((a, b) => a.range.start.line - b.range.start.line);
}
