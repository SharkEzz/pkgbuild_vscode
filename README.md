# PKGBUILD VS Code

A VS Code extension and language server for Arch Linux `PKGBUILD` files.

The point is to catch, while you type, the mistakes `makepkg` only reports after a full
build: a `source()` array longer than its `sha256sums()`, `$pkgdir` used in `build()`
where it does not exist yet, a `pkgver` containing a hyphen, a split package missing its
`package_<name>()`.

See [the extension README](packages/vscode-extension/README.md) for the feature list and
the full table of diagnostic rules.

## Layout

```
packages/
  pkgbuild-data/      Format knowledge: fields, functions, makepkg vars, SPDX, enums
  pkgbuild-parser/    tree-sitter-bash -> PKGBUILD semantic model
  pkgbuild-analyzer/  Diagnostic rules and quick fixes
  language-server/    LSP wiring (hover, completion, symbols, semantic tokens)
  vscode-extension/   Client, TextMate grammar, snippets -> .vsix
fixtures/aur/         Real published PKGBUILDs, used as a regression corpus
scripts/              Generators for the SPDX table and the TextMate grammar
```

Dependencies run one way: `data -> parser -> analyzer -> server -> extension`. Everything
below `server` is pure and synchronous, which is what makes the rule engine cheap to test
without an editor.

The first three are **source packages**: they expose `./src/index.ts` directly and are
bundled by esbuild at the leaves. Only `language-server` and `vscode-extension` have a
build step.

## Development

```bash
pnpm install
pnpm build          # bundle the server and the extension
pnpm test           # 194 tests
pnpm typecheck
pnpm lint           # oxlint, type-aware
pnpm format         # oxfmt, writes in place
pnpm package        # produces packages/vscode-extension/pkgbuild-vscode.vsix
```

Press <kbd>F5</kbd> to launch an Extension Development Host with `fixtures/` open.

To install a local build:

```bash
code --install-extension packages/vscode-extension/pkgbuild-vscode.vsix --force
```

### Linting and formatting

[oxlint](https://oxc.rs/docs/guide/usage/linter.html) and
[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), configured in `.oxlintrc.json`
and `.oxfmtrc.json`. Linting is type-aware (`options.typeAware`), which is why
`oxlint-tsgolint` is a dependency.

```bash
pnpm lint           # pnpm lint:fix applies the safe autofixes
pnpm format         # pnpm format:check to only report
pnpm check          # lint + format:check + typecheck + test, through turbo
```

Both run repo-wide from a single process rather than per package -- they are fast enough
that per-package fan-out costs more than it saves. Turbo wires them as root tasks
(`//#lint`, `//#format:check`) whose `inputs` are listed explicitly, because a root task
otherwise hashes only files belonging to no workspace and would never invalidate on a
source change.

`pnpm lint` and `pnpm format` call the binaries directly; `pnpm check` is the turbo entry
point. They are deliberately not the same script -- a `"lint": "turbo run lint"` would
recurse, since turbo's `//#lint` task invokes the root `lint` script.

Generated files (`syntaxes/`, `*.generated.ts`, `__snapshots__/`) are excluded from both.
Reformatting them would break the staleness check below.

### Generated files

Two files are generated and must not be edited by hand. CI fails if they are stale.

```bash
pnpm gen:licenses   # SPDX license + exception tables, from the official SPDX list
pnpm gen:grammar    # TextMate grammar, from packages/pkgbuild-data
```

Generating the grammar from the same tables that drive hover and completion is
deliberate: adding a field in one place makes it highlighted, documented and completed
at once, and the grammar cannot drift away from the server.

### Fixture corpus

`fixtures/aur/` holds real PKGBUILDs people actually build. The analyzer snapshots its
findings over them in `packages/pkgbuild-analyzer/src/__snapshots__/corpus.md`. Expected
state is _near_ clean, not clean — every recorded finding has been reviewed and is a
genuine issue in the upstream file. A snapshot diff therefore means a rule got broader
(possible false positive) or narrower (possible regression), and both are worth reading.

Refresh the corpus from a machine with PKGBUILDs on disk:

```bash
pnpm fixtures:sync user@host
```

## Design notes

**The server runs on the extension host's Node.** Nothing needs installing, and it works
unchanged over Remote-SSH, in WSL and in dev containers. `pkgbuild.server.nodePath` is an
opt-in escape hatch for pointing at a specific Node binary.

**Full reparse, not incremental.** Measured over the corpus, parse plus model build is
0.43 ms mean and 0.88 ms worst case. Against a 150 ms debounce, mapping LSP ranges onto
tree-sitter points would add a well-known class of off-by-one bugs to save nothing.

**The grammar wasm comes from `tree-sitter-bash` itself**, not from `tree-sitter-wasms` —
that package is built against `tree-sitter-cli` 0.20 and fails to load under
`web-tree-sitter` 0.26 with an opaque dylink error.

## Distribution

CI builds the `.vsix` on every push and attaches it to a GitHub Release on a `v*` tag.
Not published to the Marketplace or OpenVSX.
