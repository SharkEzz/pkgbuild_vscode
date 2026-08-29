# PKGBUILD Language Support for VS Code

## Context

Writing Arch Linux `PKGBUILD` files today means editing an untyped bash script where the
most common mistakes are silent: a `source=()` array that has more entries than
`sha256sums=()`, `$pkgdir` referenced from `build()`, a `pkgver` containing a `-`, a split
package whose `package_foo()` is missing. None of these surface until `makepkg` fails,
often minutes into a build.

This project builds a **VS Code extension plus a reusable language server** that catches
those errors as you type and documents the format inline. The greenfield repo is at
`/Users/tristandida/Documents/DEV/AI/PKGBUILD_VSCODE` (currently empty).

**Outcome for v0.1:** syntax highlighting, hover documentation, completion, outline,
snippets, and a native diagnostics engine with quick fixes — installed from a `.vsix`
built locally and published on GitHub Releases.

### Decisions already made

| Area | Decision |
|---|---|
| Parser | Own LSP built on `web-tree-sitter` + `tree-sitter-bash` WASM |
| Node target | Extension-host Node by default; `pkgbuild.server.nodePath` as an opt-in escape hatch |
| Build | pnpm workspaces + Turborepo + esbuild; TypeScript 7 for typechecking only |
| Distribution | Local `vsce package` → `.vsix` attached to GitHub Releases. No Marketplace/OpenVSX/npm |
| Package data | Local pacman sync DBs; network (AUR/archlinux.org) opt-in and disk-cached — **deferred to v0.2** |
| Arch tools | Detect on PATH only, disable with a hint when absent — **deferred to v0.2** |

### Verification already completed

These were tested in a scratchpad, not assumed:

- `tree-sitter-wasms@0.1.13` (the commonly suggested source) is **ABI-incompatible** with
  `web-tree-sitter@0.26` — it is built against `tree-sitter-cli@0.20`. It fails at
  `Language.load` with a dylink metadata error. **Do not use it.**
- `tree-sitter-bash@0.25.1` ships its own `tree-sitter-bash.wasm` (1.3 MB, ABI 15) plus
  `queries/highlights.scm`. It loads cleanly under `web-tree-sitter@0.26.13`.
- Parsing a real PKGBUILD yields exact ranges for every top-level assignment and function.
- Split packages work: `package_mypkg-docs` (hyphen in the function name) parses correctly,
  and array assignments *inside* package functions are distinguishable from top-level ones
  by anchoring the query with `(program ...)`.
- Error tolerance holds: a file with an unterminated string still reports `pkgname` and
  `pkgver`, with the `ERROR` node localized — so intelligence survives mid-typing.
- `tree-sitter-bash` has an `install: node-gyp-build` script. pnpm 10+ blocks postinstall
  scripts by default, so the native binding is never built; we only consume the `.wasm`.

## Architecture

```
PKGBUILD_VSCODE/
├─ pnpm-workspace.yaml, turbo.json, tsconfig.base.json
├─ .github/workflows/ci.yml
├─ fixtures/                        real PKGBUILDs for regression tests
└─ packages/
   ├─ pkgbuild-data/                pure data, zero runtime deps
   ├─ pkgbuild-parser/              tree-sitter + semantic model
   ├─ pkgbuild-analyzer/            diagnostic rules + quick fixes
   ├─ language-server/              LSP wiring only
   └─ vscode-extension/             client + grammar + snippets → .vsix
```

The dependency direction is strictly one-way:
`data → parser → analyzer → server → extension`. Everything below `server` is pure and
synchronous, which is what makes the rule engine cheap to unit-test without an editor.

### `packages/pkgbuild-data`

Static knowledge about the PKGBUILD format, as typed tables. No logic, no dependencies —
this is what hover, completion and several diagnostics all read from.

- **Variables**: `pkgbase`, `pkgname`, `pkgver`, `pkgrel`, `epoch`, `pkgdesc`, `arch`,
  `url`, `license`, `groups`, `depends`, `optdepends`, `makedepends`, `checkdepends`,
  `provides`, `conflicts`, `replaces`, `backup`, `options`, `install`, `changelog`,
  `source`, `noextract`, `validpgpkeys`, and the checksum family (`md5sums`, `sha1sums`,
  `sha224sums`, `sha256sums`, `sha384sums`, `sha512sums`, `b2sums`, `cksums`).
  Each entry carries: markdown docs, `required`/`optional`, scalar-vs-array, whether it
  accepts an architecture suffix, and whether it is overridable inside a package function.
- **Architecture suffixes**: `source_x86_64`, `depends_aarch64`, `sha256sums_x86_64`, … are
  resolved by rule (`<base>_<arch>`), not enumerated.
- **Functions**: `prepare`, `pkgver`, `build`, `check`, `package`, `package_<pkgname>` —
  with docs and the execution order makepkg uses.
- **makepkg environment**: `$srcdir`, `$pkgdir`, `$startdir` (deprecated), `$CARCH`,
  `$CHOST`, `$CFLAGS`, `$CXXFLAGS`, `$LDFLAGS`, `$MAKEFLAGS`, `$pkgbase`.
- **Enumerations**: `arch` values (`x86_64`, `i686`, `aarch64`, `armv7h`, `armv6h`,
  `riscv64`, `any`); `options` values (`strip`, `docs`, `libtool`, `staticlibs`,
  `emptydirs`, `zipman`, `ccache`, `distcc`, `buildflags`, `makeflags`, `debug`, `lto`,
  `autodeps`, `purge`, each negatable with `!`); the SPDX license identifier list;
  VCS source fragments (`#branch=`, `#tag=`, `#commit=`, `git+`, `hg+`, `svn+`, `bzr+`).

### `packages/pkgbuild-parser`

Wraps tree-sitter and lifts the bash AST into a PKGBUILD-shaped model.

- `loadParser()` — `Parser.init()` once, `Language.load()` the vendored wasm, memoized.
  The wasm path is injectable so the server and the tests can both locate it.
- Incremental reparse via `tree.edit()` driven by LSP `didChange` ranges. Keep the previous
  `Tree` per URI and dispose it on close.
- Semantic model, every node carrying a precise `Range`:
  ```ts
  interface PkgbuildModel {
    variables: Map<string, PkgVariable>   // top-level only, (program ...)-anchored
    functions: Map<string, PkgFunction>   // incl. package_* with hyphens
    arrays:    Map<string, PkgArrayItem[]>// per-element ranges, quotes stripped
    packages:  SplitPackage[]             // pkgname[] joined to its package_* function
    errors:    Range[]                    // ERROR / MISSING nodes
  }
  ```
- Variable-reference index (`$pkgdir`, `${srcdir}`) with the enclosing function recorded —
  this is what powers the scope-sensitive diagnostics below.
- A minimal expander for `$pkgname-$pkgver` style interpolation, used by hover and by the
  source/checksum rules. Best-effort by design: it resolves literal top-level scalars and
  gives up on anything command-substituted.

**Build step:** copy `tree-sitter-bash.wasm` from the devDependency into
`packages/language-server/dist/` at bundle time. `tree-sitter-bash` stays a
**devDependency** so no native binding is ever installed.

### `packages/pkgbuild-analyzer`

Pure rule engine: `(model, text) → Diagnostic[]`, plus quick fixes as
`(diagnostic, model) → CodeAction[]`. Each rule is its own module with a stable code
(`PKGBUILD001`…) so users can disable individual rules via settings.

v0.1 rule set, ordered by how much pain each one actually prevents:

| Code | Rule | Fix |
|---|---|---|
| 001 | Missing required field (`pkgname`, `pkgver`, `pkgrel`, `arch`) | Insert field |
| 002 | `source[]` / `*sums[]` length mismatch | Add or remove entries |
| 003 | `$pkgdir` used outside `package()` / `package_*()` | — |
| 004 | `SKIP` checksum on a non-VCS source | — |
| 005 | Split package declared in `pkgname[]` has no `package_<name>()` | Insert stub |
| 006 | Invalid `pkgver` (contains `-`, `:`, or whitespace) | — |
| 007 | Invalid `pkgrel` (not `N` or `N.M`) / `epoch` (not a non-negative int) | — |
| 008 | Unquoted `$pkgdir` / `$srcdir` | Add quotes |
| 009 | Deprecated `md5sums` / `sha1sums` | Convert to `sha256sums` |
| 010 | Invalid `pkgname` (must match `^[a-z0-9@._+][a-z0-9@._+-]*$`) | — |
| 011 | Non-SPDX `license` identifier (Arch RFC 0016) | Suggest closest SPDX ID |
| 012 | No `package()` function at all | Insert stub |
| 013 | Deprecated `$startdir` | — |
| 014 | `arch=('any')` alongside a `build()` that compiles | — |
| 015 | Malformed version comparator in `depends`/`provides` | — |

Rules 003 and 008 need the reference index from the parser; the rest read the model
directly. Rules run synchronously on a debounced `didChange` — the whole set is string and
map work over an already-built model, so there is no need for a worker.

### `packages/language-server`

Thin LSP wiring on `vscode-languageserver@10.1.1`, deliberately holding no analysis logic.

- Document store via `vscode-languageserver-textdocument`, incremental sync.
- Handlers: `initialize` (capability negotiation), `didOpen`/`didChange` (debounced ~150 ms
  → parse → analyze → publish), `hover`, `completion` (+`completionResolve`),
  `documentSymbol`, `codeAction`, `semanticTokens/full`.
- **Hover** — resolves the symbol under the cursor against `pkgbuild-data`; for
  `source=()` entries, additionally shows the interpolated URL.
- **Completion** — context-driven off the AST, not a flat word list: at top level offer
  variable names; inside `arch=(` offer arch values; inside `options=(` offer option values
  (both polarities); inside `license=(` offer SPDX IDs; after `git+https://…#` offer VCS
  fragments; at statement position inside a function offer `$srcdir`/`$pkgdir`.
- **Semantic tokens** — mark recognized PKGBUILD keys and makepkg variables distinctly from
  generic bash identifiers, so the two are visually separable regardless of theme.
- `bin/pkgbuild-language-server` with `--stdio` exists from day one for local testing with
  other editors, but is **not published to npm** in this phase.

### `packages/vscode-extension`

- **Language contribution** — id `pkgbuild`, matching `PKGBUILD`, `*.PKGBUILD`,
  `PKGBUILD.*`, `*.install`, `.SRCINFO`.
- **TextMate grammar** at `syntaxes/pkgbuild.tmLanguage.json`, scope
  `source.shell.pkgbuild`: `include: source.shell` for all of bash, plus PKGBUILD-specific
  patterns matched *before* it. This gives correct highlighting instantly on open, before
  the server has started — semantic tokens then refine it.
- **Snippets** — `basic`, `-git` (with `pkgver()`), `-bin`, `python`, `rust`, `meson`,
  `cmake`, `split package`.
- **Client** — `vscode-languageclient@10.1.1`. Defaults to `TransportKind.ipc`; when
  `pkgbuild.server.nodePath` is set, spawns that binary instead.
  `extensionKind: ["workspace"]` so it runs on the remote under Remote-SSH, which is where
  the Arch tooling and pacman DBs live for v0.2.
- Settings: `pkgbuild.server.nodePath`, `pkgbuild.trace.server`,
  `pkgbuild.diagnostics.disabledRules[]`.

### Root configuration

- `pnpm-workspace.yaml` over `packages/*`.
- `turbo.json` — `build` depends on `^build`; `test` depends on `build`; `package` depends
  on `build`. Cache `dist/**`.
- `tsconfig.base.json` — `strict`, `target: es2023`, `moduleResolution: bundler`, composite
  project references.
- esbuild bundles the client as CJS and the server as CJS, both `--target=node20`, which is
  safely below any extension-host Node. Node 26 is used for tooling only.

## Milestones

1. **Scaffold** — workspace, turbo, tsconfig, esbuild scripts, F5 launch config. Exit
   criterion: extension activates on a PKGBUILD and logs a server handshake.
2. **Highlighting + data** — TextMate grammar, `pkgbuild-data` tables, snippets. Ship value
   with no server involvement.
3. **Parser + model** — wasm loading, incremental reparse, semantic model, document symbols.
4. **Hover + completion** — the two features users notice first.
5. **Diagnostics + quick fixes** — rules 001–015, semantic tokens.
6. **Package + release** — `vsce package`, CI attaches the `.vsix` to a GitHub Release.

## Verification

**Unit tests** — `node --test` with native type stripping (Node 26), covering
`pkgbuild-data`, `pkgbuild-parser` and `pkgbuild-analyzer`. These are pure functions, so
this is the bulk of the coverage.

**Fixture corpus** — the Arch box at `tristan@192.168.0.20` has 25 real PKGBUILDs in
`~/.cache/paru/clone/*/PKGBUILD`, including AUR `-bin` and VCS packages. Rsync them into
`fixtures/` as a regression corpus, expandable by cloning more from the AUR. Two assertions
over every fixture:
1. the parser produces `hasError === false` and a non-empty model;
2. the analyzer emits **no** diagnostics for known-good published packages — any hit is
   either a real upstream bug or a false positive in our rules, and both are worth seeing.

**Snapshot tests** — model and diagnostics output per fixture, so rule changes show up as
reviewable diffs rather than silent behavior drift.

**Integration tests** — `@vscode/test-cli` + `@vscode/test-electron` drive a real extension
host: open a PKGBUILD, assert hover text, completion items at a given position, and that
diagnostics appear and clear as text is edited.

**Manual end-to-end** — build the `.vsix`, install it into VS Code connected over
Remote-SSH to `tristan@192.168.0.20`, and edit a package from the paru cache. That is the
real target environment, and it is also the setup v0.2's `makepkg`/`namcap` integration
will need, so it is worth exercising now.

**Cross-check against ground truth** — for any fixture, `makepkg --printsrcinfo` on the
Arch box produces the authoritative resolved values. Comparing our model's expansion
against it is the strongest available correctness signal for the parser.

## Deferred to v0.2

Both were explicitly scoped out of v0.1:

- **Arch tool integration** — `namcap` and `shellcheck` as diagnostic sources, `shfmt` as
  the document formatter, `updpkgsums` and `makepkg --printsrcinfo` as commands and
  CodeLens. Detected on PATH; disabled with a one-time hint when absent.
- **Package-index completion** — parse `/var/lib/pacman/sync/*.db` (gzipped tar; pure TS via
  `node:zlib` plus a small tar reader) for real package names in
  `depends`/`makedepends`/`provides`/`conflicts`, with version and description on hover.
  Opt-in AUR RPC and archlinux.org fallback, disk-cached with a TTL.

Further ideas, unscheduled: inlay hints showing resolved `$pkgname-$pkgver` expansions;
`.SRCINFO` drift detection against the PKGBUILD; document links on `url=` and `source=`
entries; `.install` hook-name validation; `pkgrel` bump command.
