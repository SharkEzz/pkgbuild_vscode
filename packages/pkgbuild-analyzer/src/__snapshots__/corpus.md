envi-bin: clean
environment-modules: clean
gemmul8:
  L30 warn PKGBUILD008 `$pkgdir` is unquoted and will word-split if the path contains a space. Write `"$pkgdir"`.
  L32 warn PKGBUILD008 `$pkgdir` is unquoted and will word-split if the path contains a space. Write `"$pkgdir"`.
  L33 warn PKGBUILD008 `$pkgdir` is unquoted and will word-split if the path contains a space. Write `"$pkgdir"`.
  L34 warn PKGBUILD008 `$pkgdir` is unquoted and will word-split if the path contains a space. Write `"$pkgdir"`.
git-xet: clean
golangci-lint-bin:
  L10 info PKGBUILD011 `GPL-3.0` is a deprecated SPDX identifier.
nagelfar:
  L13 warn PKGBUILD011 `GPL` is not an SPDX identifier. Did you mean `GPL-2.0-or-later`?
  L44 warn PKGBUILD008 `$pkgdir` is unquoted and will word-split if the path contains a space. Write `"$pkgdir"`.
python-lsp-tree-sitter:
  L15 warn PKGBUILD011 `GPL3` is not an SPDX identifier. Did you mean `GPL-3.0-or-later`?
python-tree-sitter-bash: clean
python-tree-sitter: clean
rocm-gfx120x-bin:
  L34 warn PKGBUILD008 `$srcdir` is unquoted and will word-split if the path contains a space. Write `"$srcdir"`.
shelly-icons:
  L17 warn PKGBUILD004 `SKIP` disables integrity checking for `${pkgname}-${pkgver}.tar.gz::https://github.com/Seafoam-Labs/shelly-icon-stream/archive/refs/heads/main.tar.gz`, which is not a VCS source. Run `updpkgsums` to generate a real checksum.
termux-language-server:
  L17 warn PKGBUILD011 `GPL3` is not an SPDX identifier. Did you mean `GPL-3.0-or-later`?
visual-studio-code-bin: clean
vulkan-low-latency-layer-bin: clean