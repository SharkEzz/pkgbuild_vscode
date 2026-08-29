import { describe, expect, it } from 'vitest';

import { RULES } from './rules/index.ts';
import { applyEdits, diagnose, diagnoseRule, getParser } from './test-support.ts';
import { analyze, codeActions } from './analyze.ts';

/** A minimal PKGBUILD that every rule should be happy with. */
const CLEAN = `pkgname=hello
pkgver=1.0.0
pkgrel=1
pkgdesc="A greeting"
arch=('x86_64')
url="https://example.com"
license=('MIT')
source=("$pkgname-$pkgver.tar.gz::https://example.com/v$pkgver.tar.gz")
sha256sums=('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

package() {
  cd "$srcdir/$pkgname-$pkgver"
  install -Dm755 hello "$pkgdir/usr/bin/hello"
}
`;

describe('rule registry', () => {
  it('has unique codes and names', () => {
    expect(new Set(RULES.map((r) => r.code)).size).toBe(RULES.length);
    expect(new Set(RULES.map((r) => r.name)).size).toBe(RULES.length);
  });

  it('numbers codes as PKGBUILDnnn', () => {
    for (const rule of RULES) expect(rule.code).toMatch(/^PKGBUILD\d{3}$/);
  });
});

describe('a well-formed PKGBUILD', () => {
  it('produces no diagnostics at all', async () => {
    expect(await diagnose(CLEAN)).toEqual([]);
  });

  it('produces nothing for an empty file', async () => {
    expect(await diagnose('')).toEqual([]);
    expect(await diagnose('# just a comment\n')).toEqual([]);
  });
});

describe('PKGBUILD001 missing-required-field', () => {
  it('reports each absent required field', async () => {
    const d = await diagnoseRule('PKGBUILD001', 'pkgname=foo\n');
    expect(d.map((x) => x.message)).toEqual([
      expect.stringContaining('pkgver'),
      expect.stringContaining('pkgrel'),
      expect.stringContaining('arch'),
    ]);
  });

  it('accepts pkgbase in place of pkgname', async () => {
    const text = `pkgbase=foo\npkgname=('foo')\npkgver=1\npkgrel=1\narch=(any)\npackage_foo() { :; }\n`;
    expect(await diagnoseRule('PKGBUILD001', text)).toEqual([]);
  });

  it('accepts an architecture-suffixed source as satisfying source', async () => {
    const d = await diagnoseRule('PKGBUILD001', `pkgname=f\npkgver=1\npkgrel=1\narch=(x86_64)\n`);
    expect(d).toEqual([]);
  });
});

describe('PKGBUILD002 checksum-count-mismatch', () => {
  it('reports fewer checksums than sources', async () => {
    const d = await diagnoseRule('PKGBUILD002', `source=(a.tar.gz b.patch)\nsha256sums=('aa')\n`);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('1 entry but');
    expect(d[0]!.message).toContain('has 2');
  });

  it('reports more checksums than sources', async () => {
    const d = await diagnoseRule('PKGBUILD002', `source=(a.tar.gz)\nsha256sums=('aa' 'bb')\n`);
    expect(d).toHaveLength(1);
  });

  it('accepts a matching count', async () => {
    expect(
      await diagnoseRule('PKGBUILD002', `source=(a.tar.gz b.patch)\nsha256sums=('aa' 'bb')\n`),
    ).toEqual([]);
  });

  // Each architecture has its own source/checksum pair; they must not be cross-compared.
  it('pairs architecture-suffixed arrays with their own suffix', async () => {
    const text = `source_x86_64=(a.tar.gz)\nsha256sums_x86_64=('aa')\nsource_aarch64=(b.tar.gz c.patch)\nsha256sums_aarch64=('bb' 'cc')\n`;
    expect(await diagnoseRule('PKGBUILD002', text)).toEqual([]);
  });

  it('offers a fix that adds the missing entries', async () => {
    const text = `source=(a.tar.gz b.patch c.patch)\nsha256sums=('aa')\n`;
    const parser = await getParser();
    const { tree, model } = parser.parse(text);
    const actions = codeActions(model, text, 'file:///t', analyze(model, text));
    tree.delete();
    const fix = actions.find((a) => a.title.includes('missing checksum'));
    expect(fix?.title).toBe('Add 2 missing checksum entries');
    const edits = fix!.edit!.changes!['file:///t']!;
    expect(applyEdits(text, edits)).toContain(`sha256sums=('aa' 'SKIP' 'SKIP')`);
  });
});

describe('PKGBUILD003 pkgdir-outside-package', () => {
  it('reports $pkgdir in build()', async () => {
    const d = await diagnoseRule('PKGBUILD003', `build() { make DESTDIR="$pkgdir"; }\n`);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('build()');
  });

  it('allows $pkgdir in package() and package_*()', async () => {
    const text = `package() { cp a "$pkgdir/x"; }\npackage_foo() { cp b "$pkgdir/y"; }\n`;
    expect(await diagnoseRule('PKGBUILD003', text)).toEqual([]);
  });

  // Regression: a split package commonly funnels every package_*() through one helper.
  // We cannot see the call site, so a user-defined function must not be flagged.
  it('stays silent about user-defined helper functions', async () => {
    const text = `_package() { cp a "$pkgdir/x"; }\npackage_foo() { _package; }\n`;
    expect(await diagnoseRule('PKGBUILD003', text)).toEqual([]);
  });

  it('reports $pkgdir at the top level', async () => {
    expect(await diagnoseRule('PKGBUILD003', `_dest="$pkgdir/usr"\n`)).toHaveLength(1);
  });
});

describe('PKGBUILD004 skip-checksum-non-vcs', () => {
  it('reports SKIP on a downloaded tarball', async () => {
    const text = `source=("https://e.com/a.tar.gz")\nsha256sums=('SKIP')\n`;
    expect(await diagnoseRule('PKGBUILD004', text)).toHaveLength(1);
  });

  it('allows SKIP on a VCS source', async () => {
    const text = `source=("git+https://e.com/r.git")\nsha256sums=('SKIP')\n`;
    expect(await diagnoseRule('PKGBUILD004', text)).toEqual([]);
  });

  it('allows SKIP on a VCS source behind a rename prefix', async () => {
    const text = `source=("foo::git+https://e.com/r.git#tag=v1")\nb2sums=('SKIP')\n`;
    expect(await diagnoseRule('PKGBUILD004', text)).toEqual([]);
  });

  // Regression: a local file sits beside the PKGBUILD and carries no download risk.
  it('allows SKIP on a local file', async () => {
    const text = `source=("https://e.com/a.tar.gz" 'LICENSE')\nsha256sums=('aa' SKIP)\n`;
    expect(await diagnoseRule('PKGBUILD004', text)).toEqual([]);
  });
});

describe('PKGBUILD005 split-package-function', () => {
  it('reports a split package with no package function', async () => {
    const text = `pkgname=('foo' 'foo-docs')\npackage_foo() { :; }\n`;
    const d = await diagnoseRule('PKGBUILD005', text);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('package_foo-docs()');
  });

  it('accepts a complete split package', async () => {
    const text = `pkgname=('foo' 'foo-docs')\npackage_foo() { :; }\npackage_foo-docs() { :; }\n`;
    expect(await diagnoseRule('PKGBUILD005', text)).toEqual([]);
  });
});

describe('PKGBUILD006 invalid-pkgver', () => {
  it.each([
    ['1.2-3', '`-`'],
    ['1:2.0', '`:`'],
  ])('rejects %s', async (version, expected) => {
    const d = await diagnoseRule('PKGBUILD006', `pkgver=${version}\n`);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain(expected);
  });

  it('accepts a normal version', async () => {
    expect(await diagnoseRule('PKGBUILD006', `pkgver=1.2.3\n`)).toEqual([]);
  });

  // A pkgver() function rewrites the literal, so the written value is a placeholder.
  it('stays silent when a pkgver() function computes the version', async () => {
    const text = `pkgver=r1-gabc\npkgver() { echo x; }\n`;
    expect(await diagnoseRule('PKGBUILD006', text)).toEqual([]);
  });

  it('stays silent when the value is an expansion', async () => {
    expect(await diagnoseRule('PKGBUILD006', `pkgver=$_commit\n`)).toEqual([]);
  });
});

describe('PKGBUILD007 invalid-version-field', () => {
  it.each(['0', '-1', '1.2.3', 'abc'])('rejects pkgrel=%s', async (value) => {
    expect(await diagnoseRule('PKGBUILD007', `pkgrel=${value}\n`)).toHaveLength(1);
  });

  it.each(['1', '2.1'])('accepts pkgrel=%s', async (value) => {
    expect(await diagnoseRule('PKGBUILD007', `pkgrel=${value}\n`)).toEqual([]);
  });

  it('rejects a negative epoch', async () => {
    expect(await diagnoseRule('PKGBUILD007', `epoch=-1\n`)).toHaveLength(1);
  });
});

describe('PKGBUILD008 unquoted-path-variable', () => {
  it('reports an unquoted $pkgdir', async () => {
    const d = await diagnoseRule('PKGBUILD008', `package() { make DESTDIR=$pkgdir install; }\n`);
    expect(d).toHaveLength(1);
  });

  it('accepts a quoted one', async () => {
    expect(
      await diagnoseRule('PKGBUILD008', `package() { make DESTDIR="$pkgdir" install; }\n`),
    ).toEqual([]);
  });

  it('quotes the whole path, not just the variable', async () => {
    const text = `package() {\n  cd $srcdir/foo-1.0\n}\n`;
    const parser = await getParser();
    const { tree, model } = parser.parse(text);
    const actions = codeActions(model, text, 'file:///t', analyze(model, text));
    tree.delete();
    const fix = actions.find((a) => a.title.startsWith('Quote'));
    expect(fix?.title).toBe('Quote "$srcdir/foo-1.0"');
    expect(applyEdits(text, fix!.edit!.changes!['file:///t']!)).toContain('cd "$srcdir/foo-1.0"');
  });
});

describe('PKGBUILD009 weak-checksum', () => {
  it('reports md5sums used alone', async () => {
    expect(await diagnoseRule('PKGBUILD009', `md5sums=('aa')\n`)).toHaveLength(1);
  });

  // Carrying md5sums alongside a strong hash is a compatibility choice, not a defect.
  it('stays silent when a strong checksum is also present', async () => {
    expect(await diagnoseRule('PKGBUILD009', `md5sums=('aa')\nsha256sums=('bb')\n`)).toEqual([]);
  });
});

describe('PKGBUILD010 invalid-pkgname', () => {
  it.each(['My-Pkg', '-leading', 'has space'])('rejects %s', async (name) => {
    expect(await diagnoseRule('PKGBUILD010', `pkgname=${JSON.stringify(name)}\n`)).toHaveLength(1);
  });

  it('accepts conventional names', async () => {
    expect(await diagnoseRule('PKGBUILD010', `pkgname=lib32-foo+bar\n`)).toEqual([]);
  });
});

describe('PKGBUILD011 non-spdx-license', () => {
  it('suggests the SPDX replacement for a legacy identifier', async () => {
    const d = await diagnoseRule('PKGBUILD011', `license=('GPL3')\n`);
    expect(d[0]!.message).toContain('GPL-3.0-or-later');
  });

  it('underlines only the offending identifier in a compound expression', async () => {
    const d = await diagnoseRule('PKGBUILD011', `license=('MIT OR Bogus')\n`);
    expect(d).toHaveLength(1);
    // The element (including its quote) starts at character 9; "Bogus" is 8 further in.
    expect(d[0]!.range.start.character).toBe(17);
    expect(d[0]!.range.end.character).toBe(22);
  });

  it('accepts valid SPDX, custom and LicenseRef forms', async () => {
    for (const value of ['MIT', 'Apache-2.0 WITH LLVM-exception', 'custom:Foo', 'LicenseRef-X']) {
      expect(await diagnoseRule('PKGBUILD011', `license=('${value}')\n`)).toEqual([]);
    }
  });

  it('rejects an unknown operand after WITH', async () => {
    const d = await diagnoseRule('PKGBUILD011', `license=('Apache-2.0 WITH Nonsense')\n`);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toContain('not an SPDX license exception');
  });

  it('flags an SPDX-deprecated identifier as information', async () => {
    const d = await diagnoseRule('PKGBUILD011', `license=('GPL-3.0')\n`);
    expect(d).toHaveLength(1);
    expect(d[0]!.severity).toBe(3);
  });
});

describe('PKGBUILD012 missing-package-function', () => {
  it('reports a single package with no package()', async () => {
    const text = `pkgname=foo\npkgver=1\npkgrel=1\narch=(any)\nbuild() { :; }\n`;
    expect(await diagnoseRule('PKGBUILD012', text)).toHaveLength(1);
  });

  // PKGBUILD005 covers split packages with a more precise message.
  it('defers to PKGBUILD005 for split packages', async () => {
    const text = `pkgname=('a' 'b')\npkgver=1\npkgrel=1\narch=(any)\n`;
    expect(await diagnoseRule('PKGBUILD012', text)).toEqual([]);
  });
});

describe('PKGBUILD013 deprecated-startdir', () => {
  it('reports $startdir', async () => {
    expect(await diagnoseRule('PKGBUILD013', `build() { cp "$startdir/x" .; }\n`)).toHaveLength(1);
  });
});

describe('PKGBUILD014 arch-any-with-build', () => {
  it('reports arch=(any) on a build that compiles', async () => {
    const text = `arch=('any')\nbuild() {\n  make\n}\n`;
    expect(await diagnoseRule('PKGBUILD014', text)).toHaveLength(1);
  });

  it('accepts arch=(any) for a build that only copies files', async () => {
    const text = `arch=('any')\nbuild() {\n  cp -r src out\n}\n`;
    expect(await diagnoseRule('PKGBUILD014', text)).toEqual([]);
  });

  it('accepts a concrete architecture alongside a compiling build', async () => {
    expect(await diagnoseRule('PKGBUILD014', `arch=('x86_64')\nbuild() { make; }\n`)).toEqual([]);
  });
});

describe('PKGBUILD015 invalid-dependency', () => {
  it('reports a comparator with no version', async () => {
    expect(await diagnoseRule('PKGBUILD015', `depends=('gtk4>=')\n`)).toHaveLength(1);
  });

  it('reports an inequality in provides', async () => {
    const d = await diagnoseRule('PKGBUILD015', `provides=('foo>=1.0')\n`);
    expect(d[0]!.message).toContain('may only use');
  });

  it('accepts a soname in provides', async () => {
    expect(await diagnoseRule('PKGBUILD015', `provides=('libfoo.so=1-64')\n`)).toEqual([]);
  });

  it('accepts normal dependencies', async () => {
    expect(await diagnoseRule('PKGBUILD015', `depends=('glibc' 'gtk4>=4.10')\n`)).toEqual([]);
  });
});

describe('rule filtering', () => {
  it('skips rules disabled by code or by name', async () => {
    const text = `build() { make DESTDIR=$pkgdir install; }\n`;
    const codes = (await diagnose(text)).map((d) => d.code);
    expect(codes).toContain('PKGBUILD003');
    expect(codes).toContain('PKGBUILD008');

    // One rule disabled by code, the other by name.
    const filtered = (await diagnose(text, ['PKGBUILD003', 'unquoted-path-variable'])).map(
      (d) => d.code,
    );
    expect(filtered).not.toContain('PKGBUILD003');
    expect(filtered).not.toContain('PKGBUILD008');
  });
});
