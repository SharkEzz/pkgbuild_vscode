import { CHECKSUM_SKIP, CHECKSUM_VARIABLES, VCS_PREFIXES } from '@pkgbuild-lsp/data';

import { findAllByBase, Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

const VCS_PREFIX_VALUES = VCS_PREFIXES.map((p) => p.value);

/** The URL part of a source entry, past any `filename::` rename prefix. */
function sourceUrl(entry: string): string {
  return entry.includes('::') ? entry.slice(entry.indexOf('::') + 2) : entry;
}

/** True when a source entry is fetched from version control. */
function isVcsSource(entry: string): boolean {
  return VCS_PREFIX_VALUES.some((prefix) => sourceUrl(entry).startsWith(prefix));
}

/**
 * True when makepkg has to download the entry.
 *
 * A local file sits in the same directory as the PKGBUILD and is normally tracked
 * beside it, so `SKIP` on one weakens nothing an attacker could reach. The risk only
 * exists for content fetched over the network.
 */
function isRemoteSource(entry: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(sourceUrl(entry));
}

/**
 * `SKIP` disables integrity checking for one source.
 *
 * That is legitimate for a VCS checkout, whose revision already pins the content, and
 * harmless for a local file tracked beside the PKGBUILD. On a downloaded tarball it
 * means the build accepts whatever the server happens to return.
 */
export const skipChecksumNonVcs: Rule = {
  code: 'PKGBUILD004',
  name: 'skip-checksum-non-vcs',
  summary: '`SKIP` is used for a source that is not fetched from version control.',

  check({ model }) {
    const diagnostics: RuleDiagnostic[] = [];

    for (const source of findAllByBase(model, 'source')) {
      if (source.kind !== 'array') continue;

      for (const base of CHECKSUM_VARIABLES) {
        const sums = model.globals.get(source.arch ? `${base}_${source.arch}` : base);
        if (!sums || sums.kind !== 'array') continue;

        sums.items.forEach((sum, index) => {
          if (sum.text !== CHECKSUM_SKIP) return;
          const entry = source.items[index];
          // A count mismatch is reported by PKGBUILD002; do not pile on here.
          if (!entry || isVcsSource(entry.text)) return;
          // Local files carry no download-integrity risk.
          if (!isRemoteSource(entry.text)) return;

          diagnostics.push({
            range: sum.range,
            message:
              `\`SKIP\` disables integrity checking for \`${entry.text}\`, which is not a ` +
              'VCS source. Run `updpkgsums` to generate a real checksum.',
            severity: Severity.Warning,
            related: [{ range: entry.range, message: 'The source this checksum covers.' }],
          });
        });
      }
    }
    return diagnostics;
  },
};
