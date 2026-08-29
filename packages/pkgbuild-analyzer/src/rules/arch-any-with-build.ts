import { findByBase, Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/** Commands that indicate the build produces native, architecture-specific code. */
const COMPILING_COMMANDS =
  /\b(gcc|g\+\+|clang|clang\+\+|cargo build|go build|make\b|cmake|meson|ninja|\.\/configure|setup\.py build_ext|zig build)\b/;

/**
 * `arch=('any')` promises the package works on every architecture.
 *
 * If the build compiles something, that promise is false and the resulting package
 * will ship x86_64 binaries to ARM users.
 */
export const archAnyWithBuild: Rule = {
  code: 'PKGBUILD014',
  name: 'arch-any-with-build',
  summary: "`arch=('any')` on a package that compiles native code.",

  check({ model, lines }) {
    const arch = findByBase(model, 'arch');
    if (!arch || arch.kind !== 'array') return [];
    if (!arch.items.some((i) => i.text === 'any')) return [];
    if (arch.items.length > 1) return [];

    const build = model.functions.get('build');
    if (!build) return [];

    const body = lines
      .slice(build.bodyRange.start.line, build.bodyRange.end.line + 1)
      .join('\n');
    const match = COMPILING_COMMANDS.exec(body);
    if (!match) return [];

    const item = arch.items.find((i) => i.text === 'any')!;
    return [
      {
        range: item.range,
        message:
          `\`arch=('any')\` means architecture-independent, but build() runs \`${match[0]}\`, ` +
          'which produces native code. List the concrete architectures instead.',
        severity: Severity.Warning,
        related: [{ range: build.nameRange, message: 'This build() compiles native code.' }],
      },
    ];
  },
};
