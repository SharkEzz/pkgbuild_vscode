import { CHECKSUM_VARIABLES } from '@pkgbuild-lsp/data';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { findAllByBase, Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

/**
 * Every `*sums` array must have exactly one entry per `source` entry, at the same index.
 *
 * This is the single most common way a PKGBUILD fails: adding a patch to `source()` and
 * forgetting the matching checksum, which makepkg only reports after downloading.
 *
 * Architecture-suffixed arrays are compared against the source array with the *same*
 * suffix, since `source_x86_64` and `sha256sums_x86_64` form their own pair.
 */
export const checksumCountMismatch: Rule = {
  code: 'PKGBUILD002',
  name: 'checksum-count-mismatch',
  summary: 'A checksum array does not have one entry per source entry.',

  check({ model }) {
    const diagnostics: RuleDiagnostic[] = [];
    const sources = findAllByBase(model, 'source');
    if (sources.length === 0) return [];

    for (const source of sources) {
      if (source.kind !== 'array') continue;
      const expected = source.items.length;

      for (const base of CHECKSUM_VARIABLES) {
        const sums = model.globals.get(source.arch ? `${base}_${source.arch}` : base);
        if (!sums || sums.kind !== 'array') continue;

        const actual = sums.items.length;
        if (actual === expected) continue;

        diagnostics.push({
          range: sums.range,
          message:
            `\`${sums.name}\` has ${actual} ${actual === 1 ? 'entry' : 'entries'} but ` +
            `\`${source.name}\` has ${expected}. Each source needs a checksum at the same index.`,
          severity: Severity.Error,
          related: [
            { range: source.range, message: `\`${source.name}\` declares ${expected} sources.` },
          ],
          fixData: { sums: sums.name, expected, actual },
        });
      }
    }
    return diagnostics;
  },

  fix(diagnostic: Diagnostic, context, uri): CodeAction[] {
    const data = diagnostic.data;
    if (!data?.sums || data.expected === undefined || data.actual === undefined) return [];
    if (data.expected <= data.actual) return [];

    const sums = context.model.globals.get(data.sums);
    if (!sums || sums.kind !== 'array') return [];

    // Append placeholder entries just inside the closing paren, matching the existing
    // quote style so the result does not look pasted in.
    const last = sums.items.at(-1);
    const quote = last?.raw.startsWith("'") ? "'" : last?.raw.startsWith('"') ? '"' : "'";
    const additions = Array.from(
      { length: data.expected - data.actual },
      () => `${quote}SKIP${quote}`,
    ).join(' ');

    const insertAt = last?.range.end ?? {
      line: sums.valueRange.start.line,
      character: sums.valueRange.start.character + 1,
    };

    return [
      {
        title: `Add ${data.expected - data.actual} missing checksum ${
          data.expected - data.actual === 1 ? 'entry' : 'entries'
        }`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [uri]: [{ range: { start: insertAt, end: insertAt }, newText: ` ${additions}` }],
          },
        },
      },
    ];
  },
};
