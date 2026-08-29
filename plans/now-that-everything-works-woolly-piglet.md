# Add oxlint + oxfmt, wired into Turborepo

## Context

The repo currently has **no linter and no formatter at all** — an exhaustive search
turned up no ESLint, Prettier, Biome, dprint, `.editorconfig` or git hooks. The only
trace of any intent is `.vscode/extensions.json`, which recommends
`dbaeumer.vscode-eslint` with nothing backing it.

Now that the build, test, typecheck and package pipeline works end to end, the goal is
to add the oxc toolchain — `oxlint` for linting and `oxfmt` for formatting — and hook
both into the existing Turborepo pipeline and CI, so style and correctness regressions
are caught before merge rather than by review.

The rules themselves will be tuned by hand afterwards. This plan installs the tools,
lays down starting configs that **match the code style already in the tree** (single
quotes, semicolons, 2-space indent, trailing commas, ~100 col), wires the tasks, and
runs one mechanical format pass so the tree is clean.

Decisions already made:

| Question        | Choice                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| Turbo wiring    | Root-level single task (`//#lint`, `//#format:check`)                   |
| Format scope    | JS/TS + JSON + YAML; **no** Markdown; **no** `package.json` key sorting |
| Type-aware lint | **Yes** — add `oxlint-tsgolint`, enable `--type-aware`                  |
| Extras          | Blocking CI steps · fix `.vscode/extensions.json` · initial format pass |

Versions at time of writing: `oxlint@1.80.0`, `oxfmt@0.65.0`, `oxlint-tsgolint@7.0.2001`.

> ⚠️ `oxfmt` is still pre-1.0 (0.65.0). Its output may shift between minor releases,
> which would show up as CI format failures after a bump. Pin it exactly (no `^`) and
> treat version bumps as "run `pnpm run format` and commit the churn".

---

## Step 0 — Branch

`HEAD` is currently on `main`, clean, tracking `origin/main`. Do not commit here.

```bash
git checkout -b chore/oxlint-oxfmt
```

---

## Step 1 — Install

Root dev dependencies only — these are repo-wide tools, not per-package ones.

```bash
pnpm add -Dw oxlint oxfmt oxlint-tsgolint
```

Then pin `oxfmt` to an exact version in the root `package.json` (`"oxfmt": "0.65.0"`,
no caret) for the reason above. `oxlint` and `oxlint-tsgolint` can keep `^`.

Also add to `pnpm-workspace.yaml` under `allowBuilds` if pnpm prompts about a postinstall
for the oxc binaries — `.npmrc` sets `enable-pre-post-scripts=false`, so verify
`node_modules/.bin/oxlint` and `node_modules/.bin/oxfmt` actually exist and run after install:

```bash
pnpm exec oxlint --version && pnpm exec oxfmt --version
```

---

## Step 2 — `.oxlintrc.json` (repo root)

Starting point only; the user will tune the categories and rules afterwards.

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "promise", "node", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn",
    "pedantic": "off",
    "style": "off",
    "restriction": "off",
  },
  "env": { "node": true, "es2024": true },
  "ignorePatterns": [
    "**/*.generated.ts",
    "packages/vscode-extension/syntaxes/**",
    "packages/pkgbuild-analyzer/src/__snapshots__/**",
    "fixtures/**",
    "plans/**",
  ],
}
```

Notes:

- `**/*.generated.ts` covers `packages/pkgbuild-data/src/spdx.generated.ts` (840 lines,
  emitted by `scripts/gen-licenses.ts`, header says "do not edit by hand").
- `fixtures/**` holds 15 `.PKGBUILD` bash files — no JS, but keep them out explicitly.
- oxlint honours `.gitignore`, so `dist/`, `node_modules/`, `*.vsix`, `.turbo/` are
  already excluded.
- **This is the first tool to see `scripts/*.ts`, `vitest.shared.ts` and
  `packages/*/vitest.config.ts`** — those files are in no `tsconfig.json` `include`, so
  `pnpm run typecheck` has never checked them. Expect first-run findings there.

### Type-aware

`--type-aware` needs each file to belong to a `tsconfig.json`. Decide at implementation
time between:

- **Flag in the script** — `oxlint --type-aware`. Simple, but the VS Code extension
  won't do type-aware analysis.
- **Config key** — set the type-aware option inside `.oxlintrc.json` so the editor gets
  it too. **Verify the exact key against `node_modules/oxlint/configuration_schema.json`
  before writing it** (docs say `options.typeAware`, schema is authoritative).

Prefer the config key if the schema confirms it. Either way, the files outside any
tsconfig (above) will silently skip type-aware rules; that is acceptable and should be
noted rather than fixed here. If it becomes annoying, the follow-up is a root
`tsconfig.json` covering `scripts/**` and `vitest.shared.ts` — out of scope for this change.

TypeScript in the repo is already `^7.0.2`, which satisfies tsgolint's TS 7.0+ requirement.

---

## Step 3 — `.oxfmtrc.json` (repo root)

Defaults are chosen to reproduce the style already in the tree, so the initial pass is
mostly a no-op on `.ts` files. oxfmt defaults to `singleQuote: false` and
`sortPackageJson: true` — both are overridden below.

```jsonc
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "insertFinalNewline": true,
  "sortPackageJson": false,
  "sortImports": false,
  "ignorePatterns": [
    "pnpm-lock.yaml",
    "**/*.generated.ts",
    "packages/vscode-extension/syntaxes/**",
    "packages/pkgbuild-analyzer/src/__snapshots__/**",
    "fixtures/**",
    "plans/**",
    "**/*.md",
  ],
}
```

Why each ignore matters:

| Pattern                                           | Reason                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/vscode-extension/syntaxes/**`           | `pkgbuild.tmLanguage.json` is emitted by `scripts/gen-grammar.ts` via `JSON.stringify(g, null, 2)`, and **CI runs `git diff --exit-code` on this path**. Reformatting it breaks CI on every run. |
| `**/*.generated.ts`                               | `spdx.generated.ts` would be reverted the next time `pnpm run gen:licenses` runs.                                                                                                                |
| `packages/pkgbuild-analyzer/src/__snapshots__/**` | vitest snapshot `corpus.md`; reformatting produces spurious snapshot diffs.                                                                                                                      |
| `pnpm-lock.yaml`                                  | oxfmt formats YAML natively; the lockfile is pnpm-owned.                                                                                                                                         |
| `**/*.md`                                         | Per the chosen scope. Markdown in oxfmt is Prettier-backed (not native Rust) and would also churn `README.md` / `CHANGELOG.md`.                                                                  |
| `fixtures/**`, `plans/**`                         | Test corpus and scratch docs.                                                                                                                                                                    |

`sortPackageJson: false` specifically protects `packages/vscode-extension/package.json`,
whose 3.6 KB hand-ordered `contributes` block reads much better in its current order.

**Watch item:** `tsconfig.base.json` is the only `.json` file in the repo containing
`//` comments. oxfmt follows Prettier's lenient JSON parser so this should be fine, but
confirm it survives the format pass (see verification).

---

## Step 4 — Root `package.json` scripts

Add:

```json
"lint": "oxlint",
"lint:fix": "oxlint --fix",
"format": "oxfmt",
"format:check": "oxfmt --check",
"check": "turbo run lint format:check typecheck test"
```

(Append `--type-aware` to `lint` / `lint:fix` if Step 2 puts the flag in the script
rather than the config.)

> **Do not** write `"lint": "turbo run lint"`. Turbo's `//#lint` task invokes the root
> package's `lint` script, so a turbo-wrapping root script recurses infinitely. This is
> why `check` exists as the separate turbo entry point, and it is the one deviation from
> the existing `build`/`test`/`typecheck` convention — it needs a comment or a README line.

Result: `pnpm run lint` is the direct, uncached, instant path; `pnpm run check` is the
full cached pipeline.

---

## Step 5 — `turbo.json`

Add two **root tasks** (`//#` prefix). Root tasks default to hashing only files that
belong to no workspace, so explicit `inputs` reaching into `packages/` are mandatory —
without them the cache would never invalidate on source changes.

```jsonc
{
  "tasks": {
    // ... existing build / typecheck / test / package / clean ...

    "//#lint": {
      "inputs": [
        "packages/*/src/**/*.ts",
        "packages/*/*.ts",
        "scripts/**/*.ts",
        "vitest.shared.ts",
        "tsconfig.base.json",
        "packages/*/tsconfig.json",
        ".oxlintrc.json",
      ],
      "outputs": [],
    },

    "//#format:check": {
      "inputs": [
        "packages/**",
        "scripts/**",
        ".github/**",
        "*.ts",
        "*.json",
        "*.yaml",
        ".oxfmtrc.json",
      ],
      "outputs": [],
    },
  },
}
```

`typecheck` and `test` already exist and stay as-is. Turbo only hashes git-tracked
files, so `packages/**` will not sweep in `dist/` or `node_modules/`.

**Pre-existing bug worth mentioning to the user but _not_ fixing here:** `test.inputs`
uses `"../../vitest.shared.ts"` and `"../../fixtures/**"`. Turbo 2.x does not resolve
`../` in `inputs` — the supported form is `$TURBO_ROOT$/…`, so those two entries are
almost certainly inert today.

---

## Step 6 — CI (`.github/workflows/ci.yml`)

Insert two blocking steps between `pnpm install --frozen-lockfile` and `Typecheck`,
going through turbo so the cache applies:

```yaml
- name: Lint
  run: pnpm exec turbo run lint

- name: Format check
  run: pnpm exec turbo run format:check
```

Ordering rationale: lint/format are the fastest checks and fail most often, so they
should short-circuit before the ~minute of typecheck + test + package.

Note the initial format pass (Step 7) will itself reformat this file, since oxfmt
formats YAML natively — make the edit first, then format, then re-read the result.

---

## Step 7 — Editor integration

**`.vscode/extensions.json`** — replace the dangling ESLint recommendation:

```json
{ "recommendations": ["oxc.oxc-vscode"] }
```

**`.vscode/settings.json`** — new file:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "oxc.fmt.experimental": true,
  "[typescript]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[json]": { "editor.defaultFormatter": "oxc.oxc-vscode" },
  "[jsonc]": { "editor.defaultFormatter": "oxc.oxc-vscode" }
}
```

`oxc.fmt.experimental` is required because oxfmt is still alpha and the extension keeps
its formatter behind that flag. Verify the key against the installed extension's
contributed settings; if it has been renamed in a newer extension build, use the current
name.

---

## Step 8 — Initial format pass

```bash
pnpm run format
git diff --stat
```

Expected churn, and how to sanity-check it:

- **`.ts` files** — should be near-empty. The tree already uses single quotes,
  semicolons, 2-space indent, trailing commas and LF. Any large diff here means a config
  option in Step 3 is wrong; fix the config rather than accepting the churn.
- **`packages/pkgbuild-data/src/*.ts`** — the real churn. `variables.ts` has 31 lines
  over 100 chars, `enums.ts` 22, `environment.ts` 10, `functions.ts` 8. These are wide
  data tables and oxfmt will rewrap them at `printWidth: 100`. Skim the result; if the
  rewrapping makes the tables unreadable, the fix is either a wider `printWidth` or an
  `overrides` entry for that directory — a decision for the user.
- **`tsconfig.base.json`** — confirm its `//` comments survived.
- **YAML** — `ci.yml` and `pnpm-workspace.yaml` will be normalised; both contain
  meaningful comments, so verify they are intact.

Then run the linter and fix what it reports:

```bash
pnpm run lint
pnpm run lint:fix   # only after reading the unfixed output
```

Expect the first real findings in `scripts/*.ts`, `vitest.shared.ts` and
`packages/*/vitest.config.ts`, which no tool has ever checked.

---

## Files touched

| File                       | Change                                                                         |
| -------------------------- | ------------------------------------------------------------------------------ |
| `package.json` (root)      | 3 devDeps + 5 scripts                                                          |
| `pnpm-lock.yaml`           | regenerated                                                                    |
| `turbo.json`               | `//#lint`, `//#format:check` tasks                                             |
| `.oxlintrc.json`           | **new**                                                                        |
| `.oxfmtrc.json`            | **new**                                                                        |
| `.github/workflows/ci.yml` | 2 new steps                                                                    |
| `.vscode/extensions.json`  | ESLint → oxc                                                                   |
| `.vscode/settings.json`    | **new**                                                                        |
| `README.md`                | short "Linting and formatting" section documenting `lint` / `format` / `check` |
| source tree                | mechanical reformat from Step 8                                                |

Consider two commits: one for tooling+config, one for the mechanical reformat, so the
reformat can be added to `.git-blame-ignore-revs` later if desired.

---

## Verification

1. **Binaries resolve** — `pnpm exec oxlint --version`, `pnpm exec oxfmt --version`.
2. **Turbo sees the tasks and hashes the right files** —
   `pnpm exec turbo run lint --dry=json | jq '.tasks[] | {taskId, inputs: (.inputs|keys|length), hash}'`.
   Confirm the input count reflects the `packages/` sources; if it is near zero, the root
   task's `inputs` globs are not reaching into workspace directories and need
   `$TURBO_ROOT$/` prefixes.
3. **Cache actually works** — run `pnpm exec turbo run lint` twice; the second run must
   report `FULL TURBO`. Touch a file in `packages/pkgbuild-analyzer/src/` and confirm it
   misses.
4. **Format is idempotent** — `pnpm run format && pnpm run format:check` exits 0, and a
   second `pnpm run format` produces no diff.
5. **Generated files untouched** — `git diff --exit-code -- packages/vscode-extension/syntaxes/ packages/pkgbuild-data/src/spdx.generated.ts`
   must be clean after the format pass. This is the single highest-risk item: if
   `syntaxes/` shows a diff, the CI "Check generated files are current" step will fail on
   every future run.
6. **The existing pipeline still passes** — `pnpm run typecheck && pnpm run test && pnpm run package`.
7. **The generated-file CI gate still passes** —
   `pnpm run gen:grammar && git diff --exit-code -- packages/vscode-extension/syntaxes/`.
8. **Full pipeline** — `pnpm run check` green from a cold cache (`rm -rf .turbo/cache`).
9. **Editor** — open a `.ts` file in VS Code, introduce a formatting deviation, save,
   confirm oxfmt fixes it; introduce an obvious lint error and confirm the squiggle.

---

## Out of scope (flagged, not done)

- `test.inputs` `../../` → `$TURBO_ROOT$/` fix in `turbo.json`.
- Root `tsconfig.json` covering `scripts/**` and `vitest.shared.ts` so both `typecheck`
  and type-aware lint see them.
- CI's "Check generated files are current" step regenerates only the grammar, never
  `gen:licenses` / `spdx.generated.ts`, despite the comment and README claiming both.
- Git hooks / lint-staged (explicitly declined).
- `globalDependencies` in `turbo.json` — `tsconfig.base.json` changes currently do not
  invalidate the `typecheck` cache.
