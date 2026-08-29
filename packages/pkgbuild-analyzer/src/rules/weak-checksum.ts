import { PREFERRED_CHECKSUM_VARIABLE, WEAK_CHECKSUM_VARIABLES } from '@pkgbuild-lsp/data';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

/**
 * MD5 and SHA-1 are broken; a checksum in either does not establish that a source is
 * the one the packager reviewed.
 *
 * Only reported when no strong checksum array is present alongside — plenty of
 * PKGBUILDs carry `md5sums` for compatibility next to a real `sha256sums`.
 */
export const weakChecksum: Rule = {
  code: 'PKGBUILD009',
  name: 'weak-checksum',
  summary: 'Sources are verified only by a cryptographically broken checksum.',

  check({ model }) {
    const present = [...model.globals.values()].filter((a) => a.base.endsWith('sums'));
    const hasStrong = present.some((a) => !WEAK_CHECKSUM_VARIABLES.has(a.base));
    if (hasStrong) return [];

    const diagnostics: RuleDiagnostic[] = [];
    for (const assignment of present) {
      if (!WEAK_CHECKSUM_VARIABLES.has(assignment.base)) continue;
      diagnostics.push({
        range: assignment.nameRange,
        message: `\`${assignment.base}\` is cryptographically broken. Use \`${PREFERRED_CHECKSUM_VARIABLE}\` or \`b2sums\` instead.`,
        severity: Severity.Warning,
        deprecated: true,
        fixData: { name: assignment.name, base: assignment.base, arch: assignment.arch },
      });
    }
    return diagnostics;
  },

  fix(diagnostic: Diagnostic, _context, uri): CodeAction[] {
    const data = diagnostic.data as { arch?: string } | undefined;
    const replacement = data?.arch
      ? `${PREFERRED_CHECKSUM_VARIABLE}_${data.arch}`
      : PREFERRED_CHECKSUM_VARIABLE;

    return [
      {
        title: `Rename to ${replacement} (checksums must then be regenerated with updpkgsums)`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        edit: { changes: { [uri]: [{ range: diagnostic.range, newText: replacement }] } },
      },
    ];
  },
};
