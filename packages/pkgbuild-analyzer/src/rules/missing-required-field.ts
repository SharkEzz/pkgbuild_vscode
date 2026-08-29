import { REQUIRED_VARIABLES, resolveVariableName } from '@pkgbuild-lsp/data';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { at, findByBase, Severity } from '../rule-utils.ts';
import type { Rule } from '../types.ts';

/** Sensible starting values, so the quick fix inserts something buildable. */
const PLACEHOLDERS: Record<string, string> = {
  pkgname: 'pkgname=',
  pkgver: 'pkgver=',
  pkgrel: 'pkgrel=1',
  arch: "arch=('x86_64')",
};

export const missingRequiredField: Rule = {
  code: 'PKGBUILD001',
  name: 'missing-required-field',
  summary: 'A field makepkg requires is absent.',

  check({ model }) {
    // An empty file is a new file, not a broken one.
    if (model.globals.size === 0 && model.functions.size === 0) return [];

    // `pkgbase` stands in for `pkgname` in a split package.
    const absent = REQUIRED_VARIABLES.filter(
      (name) =>
        !findByBase(model, name) && !(name === 'pkgname' && model.globals.has('pkgbase')),
    );

    return absent.map((name) => ({
      range: at({ line: 0, character: 0 }),
      message: `Missing required field \`${name}\`. ${resolveVariableName(name)?.doc.summary ?? ''}`.trim(),
      severity: Severity.Error,
      fixData: { name },
    }));
  },

  fix(diagnostic: Diagnostic, context, uri): CodeAction[] {
    const name = (diagnostic.data as { name?: string } | undefined)?.name;
    if (!name) return [];

    // Insert after the last existing top-level assignment so ordering stays conventional.
    let line = 0;
    for (const assignment of context.model.globals.values()) {
      line = Math.max(line, assignment.range.end.line + 1);
    }

    return [
      {
        title: `Add ${name}`,
        kind: 'quickfix',
        diagnostics: [diagnostic],
        isPreferred: true,
        edit: {
          changes: {
            [uri]: [
              {
                range: at({ line, character: 0 }),
                newText: `${PLACEHOLDERS[name] ?? `${name}=`}\n`,
              },
            ],
          },
        },
      },
    ];
  },
};
