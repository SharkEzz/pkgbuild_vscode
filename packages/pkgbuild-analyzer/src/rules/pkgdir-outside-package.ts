import { FUNCTIONS, isPackageFunction } from '@pkgbuild-lsp/data';

import { Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/**
 * The makepkg functions that provably run before `$pkgdir` exists.
 *
 * Restricting the rule to these is what keeps it honest. A PKGBUILD may define its own
 * helper — `_package()` called from each `package_*()` of a split package is a common
 * pattern — and `$pkgdir` is entirely valid there. Without seeing the call site we
 * cannot know when a user-defined function runs, so we say nothing about it.
 */
const RUNS_BEFORE_PKGDIR: ReadonlySet<string> = new Set(
  FUNCTIONS.filter((f) => !f.writesPkgdir).map((f) => f.name),
);

export const pkgdirOutsidePackage: Rule = {
  code: 'PKGBUILD003',
  name: 'pkgdir-outside-package',
  summary: '`$pkgdir` is referenced where it does not exist yet.',

  check({ model }) {
    return model.references
      .filter((ref) => ref.name === 'pkgdir')
      .filter((ref) => {
        if (!ref.container) return true; // top level: runs during sourcing
        if (isPackageFunction(ref.container)) return false;
        return RUNS_BEFORE_PKGDIR.has(ref.container);
      })
      .map((ref) => ({
        range: ref.range,
        message: ref.container
          ? `\`$pkgdir\` is only available in package(); \`${ref.container}()\` runs before it exists.`
          : '`$pkgdir` is only available inside package().',
        severity: Severity.Error,
      }));
  },
};
