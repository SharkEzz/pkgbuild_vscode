import type { VariableDoc } from './types.ts';

/** Checksum array names, in the order makepkg prefers them (strongest first). */
export const CHECKSUM_VARIABLES = [
  'b2sums',
  'sha512sums',
  'sha384sums',
  'sha256sums',
  'sha224sums',
  'sha1sums',
  'md5sums',
  'cksums',
] as const;

/** Checksum algorithms too weak to vouch for a source tarball. */
export const WEAK_CHECKSUM_VARIABLES: ReadonlySet<string> = new Set([
  'md5sums',
  'sha1sums',
  'cksums',
]);

/** The checksum variable to steer people toward in quick fixes. */
export const PREFERRED_CHECKSUM_VARIABLE = 'sha256sums';

const checksumDoc = (name: string, algo: string, bits: number): VariableDoc => ({
  name,
  shape: 'array',
  scope: 'global',
  required: false,
  archSuffixable: true,
  summary: `${algo} checksums for each entry in source()`,
  documentation: `An array of ${algo} checksums (${bits}-bit), one per entry in \`source()\` and **in the same order**.

makepkg verifies every downloaded file against this list before extracting it. A mismatch aborts the build.

Use the literal \`SKIP\` in place of a checksum to skip verification for one entry. This is only appropriate for VCS sources (\`git+\`, \`hg+\`, ...), whose integrity is established by the revision itself.

Generate or refresh these with \`updpkgsums\`.`,
  example: `${name}=('4a1b...ef' 'SKIP')`,
  ...(WEAK_CHECKSUM_VARIABLES.has(name)
    ? {
        deprecated: {
          reason: `${algo} is cryptographically broken and does not meaningfully protect against a tampered source.`,
          replacement: PREFERRED_CHECKSUM_VARIABLE,
        },
      }
    : {}),
});

/**
 * Every PKGBUILD variable makepkg understands.
 *
 * Architecture-suffixed forms (`source_x86_64`, `depends_aarch64`, ...) are not listed
 * here; they are resolved by rule in `resolveVariableName()`.
 */
export const VARIABLES: readonly VariableDoc[] = [
  {
    name: 'pkgbase',
    shape: 'scalar',
    scope: 'global',
    required: false,
    archSuffixable: false,
    summary: 'Base name of a split package',
    documentation: `The name used to refer to the group of packages built from this PKGBUILD, and the directory makepkg builds them in.

Only meaningful when \`pkgname\` is an array (a split package). If omitted, the first element of \`pkgname\` is used.

It must not also appear in the \`pkgname\` array.`,
    example: `pkgbase=gcc\npkgname=('gcc' 'gcc-libs' 'gcc-fortran')`,
  },
  {
    name: 'pkgname',
    shape: 'scalar',
    scope: 'global',
    required: true,
    archSuffixable: false,
    summary: 'Package name, or an array of names for a split package',
    documentation: `The name of the package. Must consist only of lowercase alphanumerics and \`@ . _ + -\`, and may not start with a hyphen or a dot.

Set it to an **array** to build several packages from one PKGBUILD (a *split package*). Each element then requires its own \`package_<name>()\` function.`,
    example: `pkgname=hello-world`,
  },
  {
    name: 'pkgver',
    shape: 'scalar',
    scope: 'global',
    required: true,
    archSuffixable: false,
    summary: 'Upstream version of the software',
    documentation: `The version of the software as released upstream.

It **may not contain a hyphen (\`-\`), a colon (\`:\`), or whitespace** — those characters delimit fields in a package's full version string. Replace upstream hyphens with underscores.

For VCS packages, compute this in a \`pkgver()\` function rather than hardcoding it.`,
    example: `pkgver=1.2.3`,
  },
  {
    name: 'pkgrel',
    shape: 'scalar',
    scope: 'global',
    required: true,
    archSuffixable: false,
    summary: 'Release number of this PKGBUILD for a given pkgver',
    documentation: `Distinguishes successive builds of the same upstream version. A positive integer, optionally with one decimal part (\`1\`, \`2\`, \`1.1\`).

Increment it whenever you change the PKGBUILD without changing \`pkgver\`. Reset it to \`1\` when \`pkgver\` changes.`,
    example: `pkgrel=1`,
  },
  {
    name: 'epoch',
    shape: 'scalar',
    scope: 'global',
    required: false,
    archSuffixable: false,
    summary: 'Forces a package to be seen as newer regardless of version',
    documentation: `A non-negative integer, default \`0\`. It takes precedence over \`pkgver\` in every version comparison.

Use it **only** when upstream changes its versioning scheme such that a newer release compares as older — for example \`1.10\` followed by \`1.9\`. Once raised it can never be lowered.`,
    example: `epoch=1`,
  },
  {
    name: 'pkgdesc',
    shape: 'scalar',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'Short description of the package',
    documentation: `A one-line description, conventionally under 80 characters.

By convention it should not repeat the package name, should not end with a period, and should not begin with an article ("A", "The").`,
    example: `pkgdesc="Fast terminal emulator with GPU acceleration"`,
  },
  {
    name: 'arch',
    shape: 'array',
    scope: 'global',
    required: true,
    archSuffixable: false,
    summary: 'Architectures the package can be built for',
    documentation: `The architectures this package builds on, such as \`x86_64\` or \`aarch64\`.

Use \`any\` **only** for packages whose contents are architecture-independent — scripts, fonts, documentation, pure-Python modules. Anything that compiles native code must list concrete architectures.

The architecture being built for is available during the build as \`$CARCH\`.`,
    example: `arch=('x86_64')`,
  },
  {
    name: 'url',
    shape: 'scalar',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: "Upstream project's homepage",
    documentation: `The URL of the software's official homepage — not the download link, and not the VCS clone URL.`,
    example: `url="https://example.com/project"`,
  },
  {
    name: 'license',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'License(s) the software is distributed under',
    documentation: `The licenses covering this package, as **SPDX identifiers** (Arch RFC 0016).

Compound expressions use SPDX operators: \`'GPL-3.0-or-later OR MIT'\`, \`'Apache-2.0 WITH LLVM-exception'\`.

For a license not in the SPDX list, use \`LicenseRef-<name>\` and install the license text to \`/usr/share/licenses/$pkgname/\`.`,
    example: `license=('GPL-3.0-or-later')`,
  },
  {
    name: 'groups',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'Groups this package belongs to',
    documentation: `Group names this package is part of. Installing a group installs all of its members.`,
    example: `groups=('gnome')`,
  },
  {
    name: 'depends',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: true,
    summary: 'Packages required at runtime',
    documentation: `Packages that must be installed for this one to run.

Entries may constrain the version with \`=\`, \`>=\`, \`<=\`, \`>\` or \`<\`.`,
    example: `depends=('glibc' 'gtk4>=4.10' 'libx11')`,
  },
  {
    name: 'optdepends',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: true,
    summary: 'Optional packages, with a reason for each',
    documentation: `Packages that unlock additional functionality but are not required.

Each entry takes the form \`name: reason\`. The reason is shown to the user at install time.`,
    example: `optdepends=('python-pillow: image thumbnail support')`,
  },
  {
    name: 'makedepends',
    shape: 'array',
    scope: 'global',
    required: false,
    archSuffixable: true,
    summary: 'Packages required only to build',
    documentation: `Packages needed to build this one but not to run it — compilers, build systems, header-only libraries.

Anything already listed in \`depends\` should not be repeated here.`,
    example: `makedepends=('meson' 'ninja' 'git')`,
  },
  {
    name: 'checkdepends',
    shape: 'array',
    scope: 'global',
    required: false,
    archSuffixable: true,
    summary: 'Packages required only by check()',
    documentation: `Packages needed to run the test suite in \`check()\`, and nothing else. Installed only when makepkg will actually run \`check()\`.`,
    example: `checkdepends=('python-pytest')`,
  },
  {
    name: 'provides',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: true,
    summary: 'Virtual names or sonames this package satisfies',
    documentation: `Names this package can stand in for, letting it satisfy another package's \`depends\`.

Version them explicitly with \`=\` when other packages depend on the name with a constraint. Comparators other than \`=\` are not valid here.`,
    example: `provides=('cronie' 'cron' 'libfoo.so=1-64')`,
  },
  {
    name: 'conflicts',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: true,
    summary: 'Packages that cannot be installed alongside this one',
    documentation: `Packages that must be removed before this one can be installed — typically because they own the same files.`,
    example: `conflicts=('foo-git')`,
  },
  {
    name: 'replaces',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: true,
    summary: 'Packages this one supersedes',
    documentation: `Obsolete packages that pacman should transparently replace with this one during an upgrade — used when a package is renamed or absorbed.`,
    example: `replaces=('foo-legacy')`,
  },
  {
    name: 'backup',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'Files pacman should preserve on upgrade',
    documentation: `Files whose local modifications must survive upgrades. On upgrade pacman writes the incoming version as \`.pacnew\` instead of overwriting.

Paths are **relative** — no leading slash.`,
    example: `backup=('etc/myapp.conf')`,
  },
  {
    name: 'options',
    shape: 'array',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'Override makepkg behaviour for this package',
    documentation: `Toggles that override the corresponding settings in \`makepkg.conf\`.

Prefix a value with \`!\` to disable it.`,
    example: `options=('!strip' 'debug' '!lto')`,
  },
  {
    name: 'install',
    shape: 'scalar',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: 'Scriptlet run on install, upgrade and removal',
    documentation: `Name of a \`.install\` file containing any of \`pre_install\`, \`post_install\`, \`pre_upgrade\`, \`post_upgrade\`, \`pre_remove\`, \`post_remove\`.

The file must sit next to the PKGBUILD.`,
    example: `install=myapp.install`,
  },
  {
    name: 'changelog',
    shape: 'scalar',
    scope: 'overridable',
    required: false,
    archSuffixable: false,
    summary: "Name of the package's changelog file",
    documentation: `A changelog file shipped alongside the PKGBUILD, viewable with \`pacman -Qc\`.`,
    example: `changelog=ChangeLog`,
  },
  {
    name: 'source',
    shape: 'array',
    scope: 'global',
    required: false,
    archSuffixable: true,
    summary: 'Files and URLs needed to build the package',
    documentation: `Everything needed to build: tarballs, patches, desktop files, VCS repositories.

Local files are resolved relative to the PKGBUILD. Remote entries are downloaded to \`$SRCDEST\` and symlinked into \`$srcdir\`.

Rename a downloaded file with \`filename::url\`. Fetch from version control with a \`vcs+url\` prefix and an optional \`#fragment\`:

    source=("$pkgname::git+https://example.com/repo.git#tag=v$pkgver")

Every entry needs a matching checksum at the same index in a \`*sums\` array.`,
    example: `source=("$pkgname-$pkgver.tar.gz::https://example.com/v$pkgver.tar.gz")`,
  },
  {
    name: 'noextract',
    shape: 'array',
    scope: 'global',
    required: false,
    archSuffixable: true,
    summary: 'Source files makepkg should not extract',
    documentation: `Filenames from \`source()\` that makepkg should download but leave compressed, for archives you want to handle yourself.

These are **filenames**, not URLs or indices.`,
    example: `noextract=("$pkgname-$pkgver.zip")`,
  },
  {
    name: 'validpgpkeys',
    shape: 'array',
    scope: 'global',
    required: false,
    archSuffixable: false,
    summary: 'PGP fingerprints accepted for signature verification',
    documentation: `Full 40-character PGP key fingerprints, uppercase and without spaces, trusted to sign the sources.

Required when \`source()\` includes \`.sig\` or \`.asc\` signature files.`,
    example: `validpgpkeys=('ABAF11C65A2970B130ABE3C479BE3E4300411886')`,
  },
  checksumDoc('b2sums', 'BLAKE2b', 512),
  checksumDoc('sha512sums', 'SHA-512', 512),
  checksumDoc('sha384sums', 'SHA-384', 384),
  checksumDoc('sha256sums', 'SHA-256', 256),
  checksumDoc('sha224sums', 'SHA-224', 224),
  checksumDoc('sha1sums', 'SHA-1', 160),
  checksumDoc('md5sums', 'MD5', 128),
  checksumDoc('cksums', 'CRC', 32),
];

/** Variables makepkg refuses to build without. */
export const REQUIRED_VARIABLES: readonly string[] = VARIABLES.filter((v) => v.required).map(
  (v) => v.name,
);
