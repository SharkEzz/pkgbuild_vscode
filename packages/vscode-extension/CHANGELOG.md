# Changelog

## 0.1.0

Initial release.

- Syntax highlighting for PKGBUILD, layered over the shell grammar, plus semantic tokens
  that distinguish makepkg's fields and variables from ordinary shell identifiers.
- Hover documentation for every field, build function and makepkg variable, with
  interpolated `source` entries resolved to their real URL.
- Context-aware completion for fields, architectures, options, SPDX licenses, VCS
  fragments and the file's own variables.
- Fifteen diagnostic rules with quick fixes, implemented natively with no external tools.
- Document outline and eleven snippet templates.
