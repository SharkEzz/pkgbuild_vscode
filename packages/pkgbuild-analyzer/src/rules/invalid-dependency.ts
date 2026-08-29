import { PKGNAME_PATTERN, VERSION_COMPARATORS } from '@pkgbuild-lsp/data';

import { findAllByBase, Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

const DEPENDENCY_FIELDS = ['depends', 'makedepends', 'checkdepends', 'conflicts', 'provides'];

/** Splits `gtk4>=4.10` into its name and comparator parts. */
function parseDependency(entry: string): { name: string; comparator?: string; version?: string } {
  for (const comparator of VERSION_COMPARATORS) {
    const index = entry.indexOf(comparator);
    if (index > 0) {
      return {
        name: entry.slice(0, index),
        comparator,
        version: entry.slice(index + comparator.length),
      };
    }
  }
  return { name: entry };
}

/**
 * Dependency entries are `name`, optionally followed by a comparator and a version.
 *
 * `provides` is stricter: an inequality there is meaningless, because pacman cannot
 * know which version a virtual name actually satisfies.
 */
export const invalidDependency: Rule = {
  code: 'PKGBUILD015',
  name: 'invalid-dependency',
  summary: 'A dependency entry is malformed.',

  check({ model }) {
    const diagnostics: RuleDiagnostic[] = [];

    for (const field of DEPENDENCY_FIELDS) {
      for (const assignment of findAllByBase(model, field)) {
        if (assignment.kind !== 'array') continue;

        for (const item of assignment.items) {
          if (item.hasExpansion || item.text.length === 0) continue;
          const { name, comparator, version } = parseDependency(item.text);

          if (!PKGNAME_PATTERN.test(name)) {
            // A soname like `libfoo.so=1-64` is legitimate in provides.
            if (assignment.base === 'provides' && /\.so$/.test(name)) continue;
            diagnostics.push({
              range: item.range,
              message: `\`${name}\` is not a valid package name.`,
              severity: Severity.Warning,
            });
            continue;
          }

          if (comparator && !version) {
            diagnostics.push({
              range: item.range,
              message: `\`${item.text}\` has a \`${comparator}\` with no version after it.`,
              severity: Severity.Error,
            });
            continue;
          }

          if (assignment.base === 'provides' && comparator && comparator !== '=') {
            diagnostics.push({
              range: item.range,
              message: `\`provides\` entries may only use \`=\`; \`${comparator}\` cannot be resolved to a concrete version.`,
              severity: Severity.Error,
            });
          }
        }
      }
    }

    return diagnostics;
  },
};
