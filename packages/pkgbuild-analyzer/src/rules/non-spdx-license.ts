import {
  isDeprecatedLicenseId,
  isValidAtom,
  spdxAtoms,
  suggestLicenseId,
} from '@pkgbuild-lsp/data';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

/** Arch's pre-SPDX escape hatches, still accepted by makepkg. */
const ARCH_LEGACY_ALLOWED = new Set(['custom', 'none', 'unknown']);

/**
 * Arch RFC 0016 moved `license=()` to SPDX identifiers.
 *
 * Only the exact position of the offending identifier is flagged, so a compound
 * expression with one bad atom does not underline the whole entry.
 */
export const nonSpdxLicense: Rule = {
  code: 'PKGBUILD011',
  name: 'non-spdx-license',
  summary: 'A license identifier is not valid SPDX.',

  check({ model }) {
    const license = model.globals.get('license');
    if (!license || license.kind !== 'array') return [];

    const diagnostics: RuleDiagnostic[] = [];

    for (const item of license.items) {
      if (item.hasExpansion) continue;
      // `custom:Name` is Arch's documented form for an unlisted license.
      if (ARCH_LEGACY_ALLOWED.has(item.text.split(':')[0]!.toLowerCase())) continue;

      for (const atom of spdxAtoms(item.text)) {
        const { id } = atom;
        if (isValidAtom(atom)) {
          if (atom.kind === 'exception' || !isDeprecatedLicenseId(id)) continue;
          diagnostics.push({
            range: locate(item.range, item.raw, id),
            message: `\`${id}\` is a deprecated SPDX identifier.`,
            severity: Severity.Information,
            deprecated: true,
          });
          continue;
        }

        if (atom.kind === 'exception') {
          diagnostics.push({
            range: locate(item.range, item.raw, id),
            message: `\`${id}\` is not an SPDX license exception. The operand of \`WITH\` must come from the SPDX exceptions list.`,
            severity: Severity.Warning,
          });
          continue;
        }

        const suggestion = suggestLicenseId(id);
        diagnostics.push({
          range: locate(item.range, item.raw, id),
          message: suggestion
            ? `\`${id}\` is not an SPDX identifier. Did you mean \`${suggestion}\`?`
            : `\`${id}\` is not an SPDX identifier. Use an SPDX id, or \`LicenseRef-${id}\` if the license has none.`,
          severity: Severity.Warning,
          fixData: { id, suggestion },
        });
      }
    }

    return diagnostics;
  },

  fix(diagnostic: Diagnostic, _context, uri): CodeAction[] {
    const data = diagnostic.data as { id?: string; suggestion?: string } | undefined;
    if (!data?.id) return [];

    const actions: CodeAction[] = [];
    if (data.suggestion) {
      actions.push({
        title: `Replace with ${data.suggestion}`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: diagnostic.range, newText: data.suggestion }] } },
      });
    }
    actions.push({
      title: `Mark as LicenseRef-${data.id}`,
      kind: 'quickfix',
      diagnostics: [diagnostic],
      edit: { changes: { [uri]: [{ range: diagnostic.range, newText: `LicenseRef-${data.id}` }] } },
    });
    return actions;
  },
};

/** Narrows an array element's range down to one identifier inside it. */
function locate(
  itemRange: RuleDiagnostic['range'],
  raw: string,
  id: string,
): RuleDiagnostic['range'] {
  const offset = raw.indexOf(id);
  if (offset < 0) return itemRange;
  // Identifiers never span lines, so only the character axis moves.
  const start = itemRange.start.character + offset;
  return {
    start: { line: itemRange.start.line, character: start },
    end: { line: itemRange.start.line, character: start + id.length },
  };
}
