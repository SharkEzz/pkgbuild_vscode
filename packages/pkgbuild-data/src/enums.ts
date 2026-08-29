import type { EnumValueDoc } from './types.ts';

/** Architectures makepkg recognises. `any` means architecture-independent. */
export const ARCHITECTURES: readonly EnumValueDoc[] = [
  { value: 'x86_64', documentation: '64-bit x86. The only architecture officially supported by Arch Linux.' },
  { value: 'any', documentation: 'Architecture-independent. Use only when the package contains no compiled code.' },
  { value: 'aarch64', documentation: '64-bit ARM (ARMv8). Used by Arch Linux ARM.' },
  { value: 'armv7h', documentation: '32-bit ARMv7 with hardware floating point.' },
  { value: 'armv6h', documentation: '32-bit ARMv6 with hardware floating point.' },
  { value: 'arm', documentation: '32-bit ARMv5, soft float.' },
  { value: 'riscv64', documentation: '64-bit RISC-V.' },
  { value: 'i686', documentation: '32-bit x86. Dropped by Arch Linux proper; still used by derivatives.' },
];

/** Values valid inside `options=()`. Each may be negated with a leading `!`. */
export const OPTIONS: readonly EnumValueDoc[] = [
  { value: 'strip', documentation: 'Strip symbols from binaries and libraries. Disable with `!strip` when shipping a debugger-friendly build.' },
  { value: 'docs', documentation: 'Keep directories listed in `DOC_DIRS`. `!docs` removes bundled documentation.' },
  { value: 'libtool', documentation: 'Keep `.la` files. `!libtool` removes them, which is almost always what you want.' },
  { value: 'staticlibs', documentation: 'Keep static `.a` libraries. `!staticlibs` removes them unless they have no shared counterpart.' },
  { value: 'emptydirs', documentation: 'Keep empty directories in the package.' },
  { value: 'zipman', documentation: 'Compress man and info pages with gzip.' },
  { value: 'ccache', documentation: 'Allow ccache during the build. `!ccache` disables it for packages it breaks.' },
  { value: 'distcc', documentation: 'Allow distributed compilation with distcc.' },
  { value: 'buildflags', documentation: 'Apply `CFLAGS`/`CXXFLAGS`/`LDFLAGS` from makepkg.conf. `!buildflags` builds without them.' },
  { value: 'makeflags', documentation: 'Apply `MAKEFLAGS` from makepkg.conf. `!makeflags` disables parallel builds for fragile Makefiles.' },
  { value: 'debug', documentation: 'Add debug flags and split symbols into a separate `-debug` package.' },
  { value: 'lto', documentation: 'Enable link-time optimisation. `!lto` disables it for code that miscompiles under LTO.' },
  { value: 'autodeps', documentation: 'Let makepkg detect library dependencies automatically and add them to `depends`.' },
  { value: 'purge', documentation: 'Remove files listed in `PURGE_TARGETS` from the package.' },
];

/** VCS prefixes accepted at the start of a `source()` entry. */
export const VCS_PREFIXES: readonly EnumValueDoc[] = [
  { value: 'git+', documentation: 'Clone a Git repository.' },
  { value: 'hg+', documentation: 'Clone a Mercurial repository.' },
  { value: 'svn+', documentation: 'Check out a Subversion repository.' },
  { value: 'bzr+', documentation: 'Branch a Bazaar repository.' },
  { value: 'fossil+', documentation: 'Clone a Fossil repository.' },
];

/** Fragments appended to a VCS source URL after `#`. */
export const VCS_FRAGMENTS: readonly EnumValueDoc[] = [
  { value: 'branch', documentation: 'Check out a named branch. Git, Mercurial and Bazaar.' },
  { value: 'tag', documentation: 'Check out a named tag. Pins the build to a release, which is what most packages want.' },
  { value: 'commit', documentation: 'Check out an exact revision. Git and Mercurial.' },
  { value: 'revision', documentation: 'Check out an exact revision. Subversion, Mercurial and Bazaar.' },
  { value: 'signed', documentation: 'Verify the tag or commit signature against `validpgpkeys`. Git only; takes no value.' },
];

/** Functions permitted in a `.install` scriptlet. */
export const INSTALL_HOOKS: readonly EnumValueDoc[] = [
  { value: 'pre_install', documentation: 'Runs before the package is installed. Receives the new version.' },
  { value: 'post_install', documentation: 'Runs after the package is installed. Receives the new version.' },
  { value: 'pre_upgrade', documentation: 'Runs before an upgrade. Receives the new version, then the old.' },
  { value: 'post_upgrade', documentation: 'Runs after an upgrade. Receives the new version, then the old.' },
  { value: 'pre_remove', documentation: 'Runs before the package is removed. Receives the installed version.' },
  { value: 'post_remove', documentation: 'Runs after the package is removed. Receives the removed version.' },
];

/** Comparators accepted in a dependency specification. */
export const VERSION_COMPARATORS = ['>=', '<=', '=', '>', '<'] as const;

/** The literal that skips checksum verification for one source entry. */
export const CHECKSUM_SKIP = 'SKIP';
