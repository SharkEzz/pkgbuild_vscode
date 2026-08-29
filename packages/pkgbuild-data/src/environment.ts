import type { EnvVarDoc } from './types.ts';

/** Variables makepkg exports into the build functions. */
export const ENVIRONMENT: readonly EnvVarDoc[] = [
  {
    name: 'srcdir',
    summary: 'Directory holding the extracted sources',
    documentation: `The directory makepkg extracts \`source()\` into, and the working directory for \`prepare()\`, \`build()\` and \`check()\`.

Always quote it — the path can contain spaces: \`cd "$srcdir/$pkgname-$pkgver"\`.`,
  },
  {
    name: 'pkgdir',
    summary: 'Staging root that becomes the package',
    documentation: `The fakeroot staging directory whose contents are turned into the final package. Treat it as the filesystem root: a binary goes to \`"$pkgdir/usr/bin/foo"\`.

**Only valid inside \`package()\` / \`package_<name>()\`.** It does not exist while \`build()\` runs.

Always quote it.`,
  },
  {
    name: 'pkgbase',
    summary: 'Base name of the package group',
    documentation: `The value of \`pkgbase\`, or the first element of \`pkgname\` when \`pkgbase\` is unset. Useful in split packages for referring to the shared source directory.`,
  },
  {
    name: 'startdir',
    summary: 'Directory makepkg was invoked from',
    documentation: `The directory containing the PKGBUILD.

Referring to it makes a PKGBUILD depend on where it was run from, which breaks reproducible and chroot builds.`,
    deprecated: {
      reason: 'Using $startdir breaks builds run from another directory or inside a chroot.',
      replacement: '$srcdir or $pkgdir',
    },
  },
  {
    name: 'CARCH',
    summary: 'Architecture being built for',
    documentation: `The current build architecture, e.g. \`x86_64\`. Use it to branch on architecture inside build functions.`,
  },
  {
    name: 'CHOST',
    summary: 'Host triplet for the compiler',
    documentation: `The GNU host triplet, e.g. \`x86_64-pc-linux-gnu\`. Commonly passed as \`./configure --host=$CHOST\`.`,
  },
  {
    name: 'CFLAGS',
    summary: 'C compiler flags from makepkg.conf',
    documentation: `Compiler flags for C, as configured in \`makepkg.conf\`. Append to them rather than replacing them, so distribution-wide hardening flags survive.`,
  },
  {
    name: 'CXXFLAGS',
    summary: 'C++ compiler flags from makepkg.conf',
    documentation: `Compiler flags for C++, as configured in \`makepkg.conf\`.`,
  },
  {
    name: 'LDFLAGS',
    summary: 'Linker flags from makepkg.conf',
    documentation: `Linker flags, as configured in \`makepkg.conf\`.`,
  },
  {
    name: 'MAKEFLAGS',
    summary: 'Flags passed to make',
    documentation: `Flags for \`make\`, typically carrying the parallelism setting such as \`-j8\`.`,
  },
  {
    name: 'SRCDEST',
    summary: 'Shared download cache directory',
    documentation: `Where makepkg stores downloaded sources so they can be reused across builds. Entries in \`$srcdir\` are symlinks into it.`,
  },
];
