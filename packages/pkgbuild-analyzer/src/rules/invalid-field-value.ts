import { EPOCH_PATTERN, PKGNAME_PATTERN, PKGREL_PATTERN, PKGVER_PATTERN } from '@pkgbuild-lsp/data';

import { packageNames, Severity } from '../rule-utils.ts';
import type { Rule, RuleDiagnostic } from '../types.ts';

/** `pkgver` may not contain the characters that delimit a full version string. */
export const invalidPkgver: Rule = {
  code: 'PKGBUILD006',
  name: 'invalid-pkgver',
  summary: '`pkgver` contains a character makepkg does not allow.',

  check({ model }) {
    const pkgver = model.globals.get('pkgver');
    const value = pkgver?.scalar;
    // A computed pkgver() writes this field; its literal text is a placeholder.
    if (!pkgver || !value || value.hasExpansion || model.functions.has('pkgver')) return [];
    if (PKGVER_PATTERN.test(value.text)) return [];

    const offenders = [...new Set(value.text.split('').filter((c) => /[\s:-]/.test(c)))]
      .map((c) => (c === ' ' ? 'a space' : `\`${c}\``))
      .join(', ');

    return [
      {
        range: value.range,
        message: `\`pkgver\` may not contain ${offenders}. Replace it with an underscore, or set \`epoch\` if you need a colon's ordering effect.`,
        severity: Severity.Error,
      },
    ];
  },
};

/** `pkgrel` and `epoch` are numeric fields with narrow formats. */
export const invalidVersionField: Rule = {
  code: 'PKGBUILD007',
  name: 'invalid-version-field',
  summary: '`pkgrel` or `epoch` is not a valid number.',

  check({ model }) {
    const diagnostics: RuleDiagnostic[] = [];

    const pkgrel = model.globals.get('pkgrel')?.scalar;
    if (pkgrel && !pkgrel.hasExpansion && !PKGREL_PATTERN.test(pkgrel.text)) {
      diagnostics.push({
        range: pkgrel.range,
        message: `\`pkgrel\` must be a positive integer, optionally with one decimal part (\`1\`, \`2.1\`). Got \`${pkgrel.text}\`.`,
        severity: Severity.Error,
      });
    }

    const epoch = model.globals.get('epoch')?.scalar;
    if (epoch && !epoch.hasExpansion && !EPOCH_PATTERN.test(epoch.text)) {
      diagnostics.push({
        range: epoch.range,
        message: `\`epoch\` must be a non-negative integer. Got \`${epoch.text}\`.`,
        severity: Severity.Error,
      });
    }

    return diagnostics;
  },
};

/** Package names have a restricted character set that pacman enforces. */
export const invalidPkgname: Rule = {
  code: 'PKGBUILD010',
  name: 'invalid-pkgname',
  summary: '`pkgname` contains characters pacman does not allow.',

  check({ model }) {
    const pkgname = model.globals.get('pkgname');
    if (!pkgname) return [];

    const values =
      pkgname.kind === 'array' ? pkgname.items : pkgname.scalar ? [pkgname.scalar] : [];

    return values
      .filter((v) => !v.hasExpansion && !PKGNAME_PATTERN.test(v.text))
      .map((v) => ({
        range: v.range,
        message:
          `\`${v.text}\` is not a valid package name. Use lowercase alphanumerics and ` +
          '`@ . _ + -` only, and do not start with a hyphen or a dot.',
        severity: Severity.Error,
      }));
  },
};

/** A single-package PKGBUILD still needs somewhere to install its files from. */
export const missingPackageFunction: Rule = {
  code: 'PKGBUILD012',
  name: 'missing-package-function',
  summary: 'The PKGBUILD has no package() function.',

  check({ model, lines }) {
    if (model.globals.size === 0 && model.functions.size === 0) return [];
    // Split packages are covered by PKGBUILD005, which is more specific.
    if (model.packages.length > 0) return [];
    if (model.functions.has('package')) return [];
    if (packageNames(model).length === 0) return [];

    return [
      {
        range: {
          start: { line: Math.max(0, lines.length - 1), character: 0 },
          end: { line: Math.max(0, lines.length - 1), character: 0 },
        },
        message: 'No `package()` function. Without one the built package would be empty.',
        severity: Severity.Error,
      },
    ];
  },
};
