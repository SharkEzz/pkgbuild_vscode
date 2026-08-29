import { Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/**
 * `$startdir` is whatever directory makepkg happened to be invoked from.
 *
 * Depending on it breaks chroot builds and any build run from elsewhere, which is how
 * every automated builder runs.
 */
export const deprecatedStartdir: Rule = {
  code: 'PKGBUILD013',
  name: 'deprecated-startdir',
  summary: '`$startdir` is used.',

  check({ model }) {
    return model.references
      .filter((ref) => ref.name === 'startdir')
      .map((ref) => ({
        range: ref.range,
        message:
          '`$startdir` depends on where makepkg was run from and breaks chroot builds. Use `$srcdir` or `$pkgdir`.',
        severity: Severity.Warning,
        deprecated: true,
      }));
  },
};
