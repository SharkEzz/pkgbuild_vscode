import { beforeAll, describe, expect, it } from 'vitest';

import { loadFixtures } from './fixtures.ts';
import { PkgbuildParser } from './index.ts';
import type { PkgbuildModel } from './model.ts';
import { resolveBashWasmPath } from './test-support.ts';

let parser: PkgbuildParser;
beforeAll(async () => {
  parser = await PkgbuildParser.create(resolveBashWasmPath());
});

/** Parses and returns just the model; the tree is released immediately. */
function model(text: string): PkgbuildModel {
  const result = parser.parse(text);
  try {
    return result.model;
  } finally {
    result.tree.delete();
  }
}

describe('assignments', () => {
  it('records scalars with their unquoted text', () => {
    const m = model(`pkgname=foo\npkgver="1.0"\nurl='https://x.co'\n`);
    expect(m.globals.get('pkgname')?.scalar?.text).toBe('foo');
    expect(m.globals.get('pkgver')?.scalar?.text).toBe('1.0');
    expect(m.globals.get('url')?.scalar?.text).toBe('https://x.co');
  });

  it('records arrays element by element, mixing quote styles', () => {
    const m = model(`arch=('x86_64' "aarch64" any)\n`);
    const arch = m.globals.get('arch');
    expect(arch?.kind).toBe('array');
    expect(arch?.items.map((i) => i.text)).toEqual(['x86_64', 'aarch64', 'any']);
  });

  it('gives each array element its own range', () => {
    const m = model(`arch=('x86_64' 'any')\n`);
    const [first, second] = m.globals.get('arch')!.items;
    expect(first!.range).toEqual({
      start: { line: 0, character: 6 },
      end: { line: 0, character: 14 },
    });
    expect(second!.range.start.character).toBe(15);
  });

  it('resolves architecture-suffixed names to their base', () => {
    const m = model(`source_x86_64=(a.tar.gz)\nsha256sums_x86_64=('abc')\n`);
    const source = m.globals.get('source_x86_64');
    expect(source?.base).toBe('source');
    expect(source?.arch).toBe('x86_64');
    expect(m.globals.get('sha256sums_x86_64')?.base).toBe('sha256sums');
  });

  it('flags values containing an expansion', () => {
    const m = model(`source=("$pkgname-$pkgver.tar.gz" plain.patch)\n`);
    const items = m.globals.get('source')!.items;
    expect(items[0]!.hasExpansion).toBe(true);
    expect(items[1]!.hasExpansion).toBe(false);
  });

  it('keeps the last assignment when a name is set twice', () => {
    const m = model(`pkgver=1.0\npkgver=2.0\n`);
    expect(m.globals.get('pkgver')?.scalar?.text).toBe('2.0');
  });

  it('separates function-local assignments from globals', () => {
    const m = model(`pkgdesc="outer"\npackage_foo() {\n  pkgdesc="inner"\n  depends=('a')\n}\n`);
    expect(m.globals.get('pkgdesc')?.scalar?.text).toBe('outer');
    expect(m.globals.has('depends')).toBe(false);
    expect(m.overrides.get('package_foo')?.map((a) => a.name)).toEqual(['pkgdesc', 'depends']);
  });
});

describe('functions', () => {
  it('records every build function', () => {
    const m = model(`prepare() { :; }\nbuild() { :; }\ncheck() { :; }\npackage() { :; }\n`);
    expect([...m.functions.keys()]).toEqual(['prepare', 'build', 'check', 'package']);
  });

  it('handles hyphenated split package function names', () => {
    const m = model(`package_my-pkg-docs() { :; }\n`);
    expect(m.functions.has('package_my-pkg-docs')).toBe(true);
  });
});

describe('split packages', () => {
  it('joins each pkgname entry to its package function', () => {
    const m = model(
      `pkgname=('foo' 'foo-docs')\npackage_foo() { :; }\npackage_foo-docs() { :; }\n`,
    );
    expect(m.packages.map((p) => p.name)).toEqual(['foo', 'foo-docs']);
    expect(m.packages.every((p) => p.fn)).toBe(true);
  });

  it('leaves fn undefined when the package function is missing', () => {
    const m = model(`pkgname=('foo' 'foo-docs')\npackage_foo() { :; }\n`);
    expect(m.packages.find((p) => p.name === 'foo-docs')?.fn).toBeUndefined();
  });

  it('is empty for a plain scalar pkgname', () => {
    expect(model(`pkgname=foo\n`).packages).toEqual([]);
  });
});

describe('variable references', () => {
  it('attributes references to the enclosing function', () => {
    const m = model(`build() { echo "$srcdir"; }\npackage() { echo "$pkgdir"; }\n`);
    expect(m.references.find((r) => r.name === 'srcdir')?.container).toBe('build');
    expect(m.references.find((r) => r.name === 'pkgdir')?.container).toBe('package');
  });

  it('leaves top-level references uncontained', () => {
    const m = model(`source=("$pkgname.tar.gz")\n`);
    expect(m.references.find((r) => r.name === 'pkgname')?.container).toBeUndefined();
  });

  it('distinguishes quoted from unquoted expansions', () => {
    const m = model(`package() {\n  cp a "$pkgdir/x"\n  cp b $pkgdir/y\n}\n`);
    const refs = m.references.filter((r) => r.name === 'pkgdir');
    expect(refs.map((r) => r.quoted)).toEqual([true, false]);
  });

  it('treats a quoted part of a concatenation as quoted', () => {
    const m = model(`build() { make DESTDIR="$pkgdir"; }\n`);
    expect(m.references.find((r) => r.name === 'pkgdir')?.quoted).toBe(true);
  });

  it('reads names out of both $foo and ${foo}', () => {
    const m = model(`source=("$pkgname-\${pkgver}.tar.gz")\n`);
    expect(m.references.map((r) => r.name)).toEqual(['pkgname', 'pkgver']);
  });
});

describe('error tolerance', () => {
  it('still reports symbols found before an unparseable region', () => {
    const m = model(`pkgname=broken\npkgver=1.0\nbuild() {\n  echo "unclosed\n}\n`);
    expect(m.hasError).toBe(true);
    expect(m.globals.get('pkgname')?.scalar?.text).toBe('broken');
    expect(m.errors.length).toBeGreaterThan(0);
  });

  it('reports no errors for well-formed input', () => {
    expect(model(`pkgname=foo\n`).hasError).toBe(false);
  });
});

describe('position encoding', () => {
  // LSP positions are UTF-16 code units. A maintainer comment with an accent, or a
  // pkgdesc with an emoji, must not shift every range on the line.
  it('reports ranges in UTF-16 code units, not bytes', () => {
    const m = model(`# Maintainer: Zoé Ünicode\npkgname=foo\n`);
    const name = m.globals.get('pkgname')!.nameRange;
    expect(name).toEqual({ start: { line: 1, character: 0 }, end: { line: 1, character: 7 } });
  });

  it('places ranges correctly after a multi-byte character on the same line', () => {
    const m = model(`pkgdesc="héllo"\npkgver=1.0\n`);
    // "héllo" is 5 UTF-16 units; the closing quote sits at character 14.
    expect(m.globals.get('pkgdesc')!.range.end.character).toBe(15);
  });
});

describe('real PKGBUILD corpus', () => {
  const fixtures = loadFixtures();

  it('has fixtures to test against', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => f.name))('parses %s without errors', (name) => {
    const fixture = fixtures.find((f) => f.name === name)!;
    const m = model(fixture.text);
    expect(m.errors).toEqual([]);
    expect(m.hasError).toBe(false);
  });

  it.each(fixtures.map((f) => f.name))('extracts pkgname and pkgver from %s', (name) => {
    const fixture = fixtures.find((f) => f.name === name)!;
    const m = model(fixture.text);
    expect(m.globals.has('pkgname') || m.globals.has('pkgbase')).toBe(true);
    expect(m.globals.has('pkgver')).toBe(true);
  });
});
