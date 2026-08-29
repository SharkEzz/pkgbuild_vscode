import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { at, Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/**
 * Every entry in a `pkgname` array needs its own `package_<name>()`.
 *
 * makepkg fails late on this — after the whole build has run — so catching it while
 * editing saves the entire build.
 */
export const splitPackageFunction: Rule = {
  code: 'PKGBUILD005',
  name: 'split-package-function',
  summary: 'A split package has no package function.',

  check({ model }) {
    return model.packages
      .filter((pkg) => !pkg.fn)
      .map((pkg) => ({
        range: pkg.nameRange,
        message: `Split package \`${pkg.name}\` has no \`package_${pkg.name}()\` function.`,
        severity: Severity.Error,
        fixData: { name: pkg.name },
      }));
  },

  fix(diagnostic: Diagnostic, context, uri): CodeAction[] {
    const name = (diagnostic.data as { name?: string } | undefined)?.name;
    if (!name) return [];

    // Append after the last function, or at end of file if there are none.
    let line = context.lines.length;
    for (const fn of context.model.functions.values()) {
      line = Math.max(line === context.lines.length ? 0 : line, fn.range.end.line + 1);
    }

    const body = `\npackage_${name}() {\n  cd "\$srcdir"\n  \n}\n`;
    return [
      {
        title: `Add package_${name}() stub`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: { changes: { [uri]: [{ range: at({ line, character: 0 }), newText: body }] } },
      },
    ];
  },
};
