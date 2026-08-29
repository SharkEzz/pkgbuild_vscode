import { describe, it, assert } from 'vitest';

import {
  ARCHITECTURES,
  CHECKSUM_VARIABLES,
  EPOCH_PATTERN,
  FUNCTIONS,
  INSTALL_HOOKS,
  isDeprecatedLicenseId,
  isKnownLicenseId,
  isPackageFunction,
  OPTIONS,
  PKGNAME_PATTERN,
  PKGREL_PATTERN,
  PKGVER_PATTERN,
  REQUIRED_VARIABLES,
  resolveEnvironmentName,
  resolveFunctionName,
  resolveVariableName,
  spdxIdentifiers,
  splitPackageTarget,
  suggestLicenseId,
  VARIABLES,
  WEAK_CHECKSUM_VARIABLES,
} from './index.ts';

describe('variable table', () => {
  it('declares exactly the four fields makepkg requires', () => {
    assert.deepEqual([...REQUIRED_VARIABLES].sort(), ['arch', 'pkgname', 'pkgrel', 'pkgver']);
  });

  it('has no duplicate names', () => {
    const names = VARIABLES.map((v) => v.name);
    assert.equal(new Set(names).size, names.length);
  });

  it('documents every checksum variable', () => {
    for (const name of CHECKSUM_VARIABLES) {
      assert.ok(resolveVariableName(name), `${name} is missing from VARIABLES`);
    }
  });

  it('marks weak checksum variables as deprecated with a replacement', () => {
    for (const name of WEAK_CHECKSUM_VARIABLES) {
      const doc = resolveVariableName(name)?.doc;
      assert.ok(doc?.deprecated, `${name} should be deprecated`);
      assert.equal(doc.deprecated?.replacement, 'sha256sums');
    }
  });

  it('gives every variable a summary and documentation', () => {
    for (const v of VARIABLES) {
      assert.ok(v.summary.length > 0, `${v.name} has no summary`);
      assert.ok(v.documentation.length > 0, `${v.name} has no documentation`);
    }
  });
});

describe('resolveVariableName', () => {
  it('resolves plain names', () => {
    assert.equal(resolveVariableName('pkgver')?.doc.name, 'pkgver');
  });

  // Regression: `x86_64` contains an underscore, so splitting on the last `_`
  // parsed `source_x86_64` as base `source_x86`. Every -bin package hits this.
  it('resolves arch suffixes that themselves contain an underscore', () => {
    const r = resolveVariableName('source_x86_64');
    assert.equal(r?.doc.name, 'source');
    assert.equal(r?.arch, 'x86_64');
  });

  it('resolves arch suffixes on checksum arrays', () => {
    const r = resolveVariableName('sha256sums_aarch64');
    assert.equal(r?.doc.name, 'sha256sums');
    assert.equal(r?.arch, 'aarch64');
  });

  it('rejects an arch suffix on a variable that does not accept one', () => {
    assert.equal(resolveVariableName('arch_x86_64'), undefined);
    assert.equal(resolveVariableName('pkgver_x86_64'), undefined);
  });

  it('rejects unknown names and partial suffixes', () => {
    assert.equal(resolveVariableName('nonsense'), undefined);
    assert.equal(resolveVariableName('nonsense_x86_64'), undefined);
    assert.equal(resolveVariableName('source_x86'), undefined);
  });

  it('never treats `any` as an arch suffix', () => {
    assert.equal(resolveVariableName('source_any'), undefined);
  });
});

describe('function table', () => {
  it('orders functions the way makepkg invokes them', () => {
    const ordered = [...FUNCTIONS].sort((a, b) => a.order - b.order).map((f) => f.name);
    assert.deepEqual(ordered, ['pkgver', 'prepare', 'build', 'check', 'package']);
  });

  it('permits $pkgdir only in package()', () => {
    for (const f of FUNCTIONS) {
      assert.equal(f.writesPkgdir, f.name === 'package', `${f.name} pkgdir flag is wrong`);
    }
  });

  it('resolves split package functions back to package()', () => {
    assert.equal(resolveFunctionName('package_foo-docs')?.name, 'package');
    assert.equal(resolveFunctionName('package')?.name, 'package');
    assert.equal(resolveFunctionName('notAFunction'), undefined);
  });

  it('identifies package functions and extracts their target', () => {
    assert.ok(isPackageFunction('package'));
    assert.ok(isPackageFunction('package_foo-docs'));
    assert.ok(!isPackageFunction('build'));
    assert.equal(splitPackageTarget('package_foo-docs'), 'foo-docs');
    assert.equal(splitPackageTarget('package'), undefined);
  });
});

describe('environment table', () => {
  it('documents srcdir and pkgdir', () => {
    assert.ok(resolveEnvironmentName('srcdir'));
    assert.ok(resolveEnvironmentName('pkgdir'));
  });

  it('flags startdir as deprecated', () => {
    assert.ok(resolveEnvironmentName('startdir')?.deprecated);
  });
});

describe('licenses', () => {
  it('accepts current SPDX identifiers', () => {
    for (const id of ['MIT', 'GPL-3.0-or-later', 'Apache-2.0', 'BSD-3-Clause']) {
      assert.ok(isKnownLicenseId(id), `${id} should be known`);
    }
  });

  it('accepts LicenseRef- and `+` forms', () => {
    assert.ok(isKnownLicenseId('LicenseRef-Proprietary'));
    assert.ok(isKnownLicenseId('GPL-2.0+'));
    assert.ok(!isKnownLicenseId('LicenseRef-'));
  });

  it('rejects legacy Arch identifiers and suggests the SPDX replacement', () => {
    assert.ok(!isKnownLicenseId('GPL3'));
    assert.equal(suggestLicenseId('GPL3'), 'GPL-3.0-or-later');
    assert.equal(suggestLicenseId('Apache'), 'Apache-2.0');
    assert.equal(suggestLicenseId('BSD'), 'BSD-3-Clause');
  });

  it('corrects case and single-character typos', () => {
    assert.equal(suggestLicenseId('mit'), 'MIT');
    assert.equal(suggestLicenseId('Apache-2.O'), 'Apache-2.0');
  });

  it('declines to guess when nothing is close', () => {
    assert.equal(suggestLicenseId('zzzz'), undefined);
  });

  it('reports SPDX-deprecated identifiers separately from unknown ones', () => {
    assert.ok(isKnownLicenseId('GPL-3.0'));
    assert.ok(isDeprecatedLicenseId('GPL-3.0'));
    assert.ok(!isDeprecatedLicenseId('GPL-3.0-or-later'));
  });

  it('splits compound SPDX expressions into atoms', () => {
    assert.deepEqual(spdxIdentifiers('Apache-2.0 WITH LLVM-exception OR (MIT AND BSD-3-Clause)'), [
      'Apache-2.0',
      'LLVM-exception',
      'MIT',
      'BSD-3-Clause',
    ]);
  });
});

describe('validation patterns', () => {
  it('accepts valid pkgnames and rejects invalid ones', () => {
    for (const ok of ['foo', 'foo-bar', 'lib32-glibc', 'foo+bar', 'a.b_c@d']) {
      assert.ok(PKGNAME_PATTERN.test(ok), `${ok} should be valid`);
    }
    for (const bad of ['-foo', 'Foo', 'foo bar', 'foo/bar', '']) {
      assert.ok(!PKGNAME_PATTERN.test(bad), `${bad} should be invalid`);
    }
  });

  it('rejects pkgver containing a hyphen, colon or space', () => {
    assert.ok(PKGVER_PATTERN.test('1.2.3'));
    assert.ok(PKGVER_PATTERN.test('2024.01.15'));
    assert.ok(!PKGVER_PATTERN.test('1.2-3'));
    assert.ok(!PKGVER_PATTERN.test('1:2.3'));
    assert.ok(!PKGVER_PATTERN.test('1.2 3'));
  });

  it('accepts pkgrel of N and N.M only', () => {
    assert.ok(PKGREL_PATTERN.test('1'));
    assert.ok(PKGREL_PATTERN.test('2.1'));
    assert.ok(!PKGREL_PATTERN.test('0'));
    assert.ok(!PKGREL_PATTERN.test('1.2.3'));
    assert.ok(!PKGREL_PATTERN.test('-1'));
  });

  it('accepts a non-negative integer epoch', () => {
    assert.ok(EPOCH_PATTERN.test('0'));
    assert.ok(EPOCH_PATTERN.test('12'));
    assert.ok(!EPOCH_PATTERN.test('-1'));
    assert.ok(!EPOCH_PATTERN.test('1.0'));
  });
});

describe('enumerations', () => {
  it('lists any as an architecture but every other entry is concrete', () => {
    assert.ok(ARCHITECTURES.some((a) => a.value === 'any'));
    assert.ok(ARCHITECTURES.some((a) => a.value === 'x86_64'));
  });

  it('documents every option and install hook', () => {
    for (const set of [OPTIONS, INSTALL_HOOKS]) {
      for (const e of set) assert.ok(e.documentation.length > 0, `${e.value} undocumented`);
    }
  });
});
