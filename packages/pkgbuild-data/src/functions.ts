import type { FunctionDoc } from './types.ts';

/** Prefix of a split package's build function, e.g. `package_foo-docs`. */
export const PACKAGE_FUNCTION_PREFIX = 'package_';

/**
 * The functions makepkg calls, in invocation order.
 *
 * `package_<name>()` is not listed: it is matched by prefix, since its suffix is
 * whatever appears in the `pkgname` array.
 */
export const FUNCTIONS: readonly FunctionDoc[] = [
  {
    name: 'pkgver',
    order: 0,
    summary: 'Compute pkgver automatically, for VCS packages',
    documentation: `Prints the version to use, letting makepkg rewrite \`pkgver=\` in the PKGBUILD itself.

Runs after sources are fetched and \`prepare()\` has completed. The output must not contain a hyphen, a colon or whitespace.

A common form for a git package:

    pkgver() {
      cd "$srcdir/$pkgname"
      printf "r%s.%s" "$(git rev-list --count HEAD)" "$(git rev-parse --short HEAD)"
    }`,
    writesPkgdir: false,
  },
  {
    name: 'prepare',
    order: 1,
    summary: 'Patch and prepare the extracted sources',
    documentation: `Runs after sources are extracted and before \`build()\`. Apply patches and run code generators here.

Skipped when makepkg is invoked with \`-e/--noextract\`.`,
    writesPkgdir: false,
  },
  {
    name: 'build',
    order: 2,
    summary: 'Compile the software',
    documentation: `Compiles the sources. Runs in \`$srcdir\`.

**Nothing may be installed here.** \`$pkgdir\` does not exist yet at this point — writing to it belongs in \`package()\`.`,
    writesPkgdir: false,
  },
  {
    name: 'check',
    order: 3,
    summary: "Run the project's test suite",
    documentation: `Runs the upstream test suite between \`build()\` and \`package()\`. A non-zero exit aborts the build.

Dependencies needed only here belong in \`checkdepends\`. Users can skip this with \`makepkg --nocheck\`.`,
    writesPkgdir: false,
  },
  {
    name: 'package',
    order: 4,
    summary: 'Install the built files into $pkgdir',
    documentation: `Installs the built artifacts into \`$pkgdir\`, whose contents become the package.

This is the **only** function in which \`$pkgdir\` may be written to. It runs in a fakeroot environment, so ownership and permissions are recorded without real root.

For a split package, use one \`package_<name>()\` per entry in \`pkgname\` instead.`,
    writesPkgdir: true,
  },
];

/** True for `package()` and for any `package_<name>()`. */
export function isPackageFunction(name: string): boolean {
  return name === 'package' || name.startsWith(PACKAGE_FUNCTION_PREFIX);
}

/** For `package_foo-docs` returns `foo-docs`; otherwise undefined. */
export function splitPackageTarget(functionName: string): string | undefined {
  return functionName.startsWith(PACKAGE_FUNCTION_PREFIX)
    ? functionName.slice(PACKAGE_FUNCTION_PREFIX.length)
    : undefined;
}
