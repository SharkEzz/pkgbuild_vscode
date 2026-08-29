# PKGBUILD Language Support

Language support for Arch Linux `PKGBUILD` files: syntax highlighting, hover
documentation, context-aware completion, an outline, snippets, and a diagnostics engine
that catches the mistakes `makepkg` only reports after a full build.

## Features

**Diagnostics with quick fixes.** Fifteen rules, all implemented natively — no external
tools required:

| Code          | Catches                                                                |
| ------------- | ---------------------------------------------------------------------- |
| `PKGBUILD001` | A required field (`pkgname`, `pkgver`, `pkgrel`, `arch`) is missing    |
| `PKGBUILD002` | `source()` and a `*sums()` array have different lengths                |
| `PKGBUILD003` | `$pkgdir` used in `build()`, where it does not exist yet               |
| `PKGBUILD004` | `SKIP` on a downloaded tarball, disabling integrity checking           |
| `PKGBUILD005` | A split package with no `package_<name>()`                             |
| `PKGBUILD006` | `pkgver` containing `-`, `:` or whitespace                             |
| `PKGBUILD007` | Malformed `pkgrel` or `epoch`                                          |
| `PKGBUILD008` | Unquoted `$pkgdir` / `$srcdir`, which word-splits on paths with spaces |
| `PKGBUILD009` | Sources verified only by MD5 or SHA-1                                  |
| `PKGBUILD010` | A package name pacman would reject                                     |
| `PKGBUILD011` | A `license()` entry that is not valid SPDX (Arch RFC 0016)             |
| `PKGBUILD012` | No `package()` function at all                                         |
| `PKGBUILD013` | `$startdir`, which breaks chroot builds                                |
| `PKGBUILD014` | `arch=('any')` on a package that compiles native code                  |
| `PKGBUILD015` | A malformed dependency or an inequality in `provides`                  |

**Hover** documents every PKGBUILD field, build function and makepkg variable, resolves
interpolated `source` entries to their real URL, and names SPDX licenses in full.

**Completion** is driven by the syntax around the cursor: architectures inside `arch=(`,
both polarities of every option inside `options=(`, SPDX identifiers inside `license=(`,
VCS fragments after `#`, and the file's own `_private` variables alongside `$srcdir`.

**Snippets** for the common shapes: `pkgbuild`, `pkgbuild-git`, `pkgbuild-bin`,
`pkgbuild-split`, `pkgbuild-python`, `pkgbuild-rust`, `pkgbuild-meson`, `pkgbuild-cmake`.

## Settings

| Setting                              | Default | Purpose                                  |
| ------------------------------------ | ------- | ---------------------------------------- |
| `pkgbuild.diagnostics.disabledRules` | `[]`    | Rules to turn off, by code or name       |
| `pkgbuild.server.nodePath`           | `""`    | Run the server on a specific Node binary |
| `pkgbuild.trace.server`              | `off`   | Log LSP traffic                          |

By default the language server runs on the editor's own Node runtime, so nothing extra
needs installing and it works unchanged over Remote-SSH, in WSL and in dev containers.

## Installing

Download the `.vsix` from the releases page and install it:

```bash
code --install-extension pkgbuild-vscode.vsix
```

## Language server

The server is a standard LSP implementation and is not tied to VS Code. It ships inside
the extension at `dist/server/cli.cjs` and speaks stdio:

```bash
node /path/to/extension/dist/server/cli.cjs --stdio
```
