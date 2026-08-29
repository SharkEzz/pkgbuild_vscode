import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/** Path variables whose values routinely contain characters that word-split. */
const PATH_VARIABLES = new Set(['pkgdir', 'srcdir', 'startdir']);

/**
 * An unquoted `$pkgdir` breaks as soon as the build path contains a space.
 *
 * This is the classic PKGBUILD bug that only reproduces on someone else's machine,
 * because it depends entirely on where the package happened to be built.
 */
export const unquotedPathVariable: Rule = {
  code: 'PKGBUILD008',
  name: 'unquoted-path-variable',
  summary: 'A path variable is used without quotes.',

  check({ model }) {
    return model.references
      .filter((ref) => PATH_VARIABLES.has(ref.name) && !ref.quoted)
      .map((ref) => ({
        range: ref.range,
        message: `\`$${ref.name}\` is unquoted and will word-split if the path contains a space. Write \`"$${ref.name}"\`.`,
        severity: Severity.Warning,
        fixData: { name: ref.name },
      }));
  },

  fix(diagnostic: Diagnostic, context, uri): CodeAction[] {
    const { range } = diagnostic;
    const line = context.lines[range.start.line];
    if (line === undefined) return [];

    // Quote the whole whitespace-delimited word, so `$pkgdir/usr/bin` becomes
    // `"$pkgdir/usr/bin"` rather than `"$pkgdir"/usr/bin`.
    let start = range.start.character;
    let end = range.end.character;
    while (end < line.length && !/[\s;&|)'"`]/.test(line[end]!)) end += 1;
    while (start > 0 && !/[\s;&|(='"`]/.test(line[start - 1]!)) start -= 1;

    const word = line.slice(start, end);
    if (word.includes('"')) return [];

    return [
      {
        title: `Quote "${word}"`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [uri]: [
              {
                range: {
                  start: { line: range.start.line, character: start },
                  end: { line: range.start.line, character: end },
                },
                newText: `"${word}"`,
              },
            ],
          },
        },
      },
    ];
  },
};
