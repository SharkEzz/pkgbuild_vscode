import { loadFixtures } from '@pkgbuild-lsp/parser/fixtures';
import { PkgbuildParser, resolveBashWasmPath } from '@pkgbuild-lsp/parser/test-support';
import type { Diagnostic } from 'vscode-languageserver-types';

import { analyze, codeActions } from './analyze.ts';

export { loadFixtures };

let parser: PkgbuildParser | undefined;

export async function getParser(): Promise<PkgbuildParser> {
  parser ??= await PkgbuildParser.create(resolveBashWasmPath());
  return parser;
}

/** Analyzes a PKGBUILD snippet and returns its diagnostics, sorted for stability. */
export async function diagnose(text: string, disabledRules?: string[]): Promise<Diagnostic[]> {
  const { tree, model } = (await getParser()).parse(text);
  try {
    return analyze(model, text, disabledRules ? { disabledRules } : {}).sort(
      (a, b) =>
        a.range.start.line - b.range.start.line ||
        a.range.start.character - b.range.start.character ||
        String(a.code).localeCompare(String(b.code)),
    );
  } finally {
    tree.delete();
  }
}

/** Diagnostics from a single rule, by code. */
export async function diagnoseRule(code: string, text: string): Promise<Diagnostic[]> {
  return (await diagnose(text)).filter((d) => d.code === code);
}

/** Applies every quick fix offered for `text` and returns the resulting document. */
export async function applyFixes(text: string): Promise<string[]> {
  const { tree, model } = (await getParser()).parse(text);
  try {
    const diagnostics = analyze(model, text);
    const actions = codeActions(model, text, 'file:///test', diagnostics);
    return actions.map((action) => {
      const edits = action.edit?.changes?.['file:///test'] ?? [];
      return applyEdits(text, edits);
    });
  } finally {
    tree.delete();
  }
}

/** Applies text edits back-to-front so earlier offsets stay valid. */
export function applyEdits(
  text: string,
  edits: readonly {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
  }[],
): string {
  const lines = text.split('\n');
  const offsetOf = (p: { line: number; character: number }): number => {
    let offset = 0;
    for (let i = 0; i < p.line && i < lines.length; i++) offset += lines[i]!.length + 1;
    return offset + p.character;
  };
  return [...edits]
    .sort((a, b) => offsetOf(b.range.start) - offsetOf(a.range.start))
    .reduce(
      (acc, e) =>
        acc.slice(0, offsetOf(e.range.start)) + e.newText + acc.slice(offsetOf(e.range.end)),
      text,
    );
}
