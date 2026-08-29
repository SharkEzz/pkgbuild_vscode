import { PkgbuildParser, resolveBashWasmPath } from '@pkgbuild-lsp/parser/test-support';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import { beforeAll, describe, expect, it } from 'vitest';

import { expand } from './expand.ts';
import { complete, completionContext } from './features/completion.ts';
import { hover } from './features/hover.ts';
import { semanticTokens } from './features/semantic-tokens.ts';
import { documentSymbols } from './features/symbols.ts';

let parser: PkgbuildParser;
beforeAll(async () => {
  parser = await PkgbuildParser.create(resolveBashWasmPath());
});

function model(text: string): PkgbuildModel {
  const result = parser.parse(text);
  try {
    return result.model;
  } finally {
    result.tree.delete();
  }
}

const SAMPLE = `pkgname=hello
pkgver=1.2.3
pkgrel=1
arch=('x86_64')
license=('MIT')
options=('!strip' 'debug')
source=("$pkgname-$pkgver.tar.gz")

build() {
  make
}

package() {
  install -Dm755 hello "$pkgdir/usr/bin/hello"
}
`;

describe('hover', () => {
  it('documents a PKGBUILD field', () => {
    const h = hover(model(SAMPLE), { line: 1, character: 3 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('Upstream version') });
  });

  it('documents a makepkg environment variable', () => {
    const h = hover(model(SAMPLE), { line: 13, character: 26 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('Staging root') });
  });

  it('documents a build function', () => {
    const h = hover(model(SAMPLE), { line: 8, character: 2 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('Compile') });
  });

  it('names an architecture value', () => {
    const h = hover(model(SAMPLE), { line: 3, character: 8 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('64-bit x86') });
  });

  it('explains an option, including its polarity', () => {
    const h = hover(model(SAMPLE), { line: 5, character: 12 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('disabled') });
  });

  it('gives the full name of an SPDX license', () => {
    const h = hover(model(SAMPLE), { line: 4, character: 11 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('MIT License') });
  });

  it('resolves an interpolated source entry', () => {
    // Character 30 is in the literal `.tar.gz` tail, outside any `$` reference.
    const h = hover(model(SAMPLE), { line: 6, character: 30 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('hello-1.2.3.tar.gz') });
  });

  // A `$pkgver` inside source=() is both an array element and a variable reference.
  // The reference is the more specific answer, so it takes precedence.
  it('prefers the variable reference over the enclosing array element', () => {
    const h = hover(model(SAMPLE), { line: 6, character: 20 });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('$pkgver') });
    expect(h?.contents).toMatchObject({ value: expect.stringContaining('1.2.3') });
  });

  it('returns nothing for empty space', () => {
    expect(hover(model(SAMPLE), { line: 7, character: 0 })).toBeUndefined();
  });
});

describe('expand', () => {
  // Built inside beforeAll: the parser is not ready while describe bodies are collected.
  let m: PkgbuildModel;
  beforeAll(() => {
    m = model(`_base=hello\npkgname=$_base\npkgver=1.0\n`);
  });

  it('resolves a chain of scalar references', () => {
    expect(expand('$pkgname-$pkgver.tar.gz', m)).toBe('hello-1.0.tar.gz');
  });

  it('resolves braced references', () => {
    expect(expand('${pkgname}_${pkgver}', m)).toBe('hello_1.0');
  });

  it('leaves unknown names as written', () => {
    expect(expand('$nothing/$pkgver', m)).toBe('$nothing/1.0');
  });

  it('does not guess at command substitution', () => {
    const c = model(`pkgver=$(git describe)\n`);
    expect(expand('$pkgver', c)).toBe('$(git describe)');
  });
});

describe('completionContext', () => {
  it('detects a variable reference', () => {
    expect(completionContext('  cd "$srcd')).toEqual({
      kind: 'variable-reference',
      prefix: 'srcd',
    });
  });

  it('detects an array being filled in', () => {
    expect(completionContext("arch=('x86_64' ")).toEqual({ kind: 'array-value', variable: 'arch' });
  });

  // Most real PKGBUILDs open source=( and list entries on following lines.
  it('detects an array that opened on an earlier line', () => {
    expect(completionContext('source=(\n  "a.tar.gz"\n  ')).toEqual({
      kind: 'array-value',
      variable: 'source',
    });
  });

  it('does not treat a closed array as still open', () => {
    expect(completionContext('arch=(x86_64)\n')).toEqual({ kind: 'top-level' });
  });

  it('detects a VCS fragment', () => {
    expect(completionContext('source=("git+https://e.com/r.git#')).toEqual({
      kind: 'vcs-fragment',
    });
  });

  it('treats an indented line as a statement', () => {
    expect(completionContext('build() {\n  ma')).toEqual({ kind: 'statement' });
  });
});

describe('complete', () => {
  let m: PkgbuildModel;
  beforeAll(() => {
    m = model(`_commit=abc\npkgname=hello\n`);
  });

  it('offers PKGBUILD fields at the top level, required ones first', () => {
    const items = complete(m, 'pkg');
    const labels = items.map((i) => i.label);
    expect(labels).toContain('pkgver');
    expect(labels).toContain('source');
    const required = items.filter((i) => String(i.sortText).startsWith('0')).map((i) => i.label);
    expect(required).toEqual(['pkgname', 'pkgver', 'pkgrel', 'arch']);
  });

  it('offers architectures inside arch=(', () => {
    expect(complete(m, 'arch=(').map((i) => i.label)).toContain('aarch64');
  });

  it('offers both polarities of every option', () => {
    const labels = complete(m, 'options=(').map((i) => i.label);
    expect(labels).toContain('lto');
    expect(labels).toContain('!lto');
  });

  it('offers SPDX identifiers inside license=(', () => {
    expect(complete(m, "license=('").map((i) => i.label)).toContain('GPL-3.0-or-later');
  });

  it('offers VCS fragments after a #', () => {
    expect(complete(m, 'source=("git+https://e.com/r.git#').map((i) => i.label)).toContain('tag');
  });

  it("offers the file's own variables alongside makepkg's", () => {
    const labels = complete(m, '  echo "$').map((i) => i.label);
    expect(labels).toContain('srcdir');
    expect(labels).toContain('_commit');
  });

  it('offers function skeletons only for functions not yet defined', () => {
    const defined = model(`build() { :; }\n`);
    const labels = complete(defined, '').map((i) => i.label);
    expect(labels).toContain('package()');
    expect(labels).not.toContain('build()');
  });
});

describe('documentSymbols', () => {
  it('lists fields and functions in source order', () => {
    const symbols = documentSymbols(model(SAMPLE));
    expect(symbols.map((s) => s.name)).toEqual([
      'pkgname',
      'pkgver',
      'pkgrel',
      'arch',
      'license',
      'options',
      'source',
      'build()',
      'package()',
    ]);
  });

  it('nests array elements under their field', () => {
    const options = documentSymbols(model(SAMPLE)).find((s) => s.name === 'options');
    expect(options?.children?.map((c) => c.name)).toEqual(['!strip', 'debug']);
  });

  it('nests overrides under their package function', () => {
    const symbols = documentSymbols(model(`package_foo() {\n  pkgdesc="x"\n}\n`));
    expect(symbols[0]?.children?.map((c) => c.name)).toEqual(['pkgdesc']);
  });
});

describe('semanticTokens', () => {
  it('encodes five integers per token', () => {
    expect(semanticTokens(model(SAMPLE)).length % 5).toBe(0);
  });

  it('marks known fields but not private variables', () => {
    const known = semanticTokens(model(`pkgver=1.0\n`)).length / 5;
    const unknown = semanticTokens(model(`_private=1.0\n`)).length / 5;
    expect(known).toBe(1);
    expect(unknown).toBe(0);
  });

  it('emits line deltas rather than absolute lines', () => {
    const data = semanticTokens(model(`pkgname=a\npkgver=b\npkgrel=1\n`));
    // First token on line 0, then one line further each time.
    expect([data[0], data[5], data[10]]).toEqual([0, 1, 1]);
  });
});
