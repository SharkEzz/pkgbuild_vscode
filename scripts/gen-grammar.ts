/**
 * Generates the TextMate grammar from the same tables that drive hover and completion.
 *
 * Generating rather than hand-writing is the point: a field added to `pkgbuild-data`
 * is highlighted, documented and completed from one edit, and the grammar can never
 * drift out of sync with the language server.
 *
 * Run with: pnpm run gen:grammar
 */
import { ARCHITECTURES, ENVIRONMENT, FUNCTIONS, VARIABLES } from '@pkgbuild-lsp/data';
import { writeFileSync } from 'node:fs';

const TARGET = new URL(
  '../packages/vscode-extension/syntaxes/pkgbuild.tmLanguage.json',
  import.meta.url,
).pathname;

/** Longest first, so alternation prefers `sha256sums` over a shorter prefix. */
const byLengthDesc = (a: string, b: string): number => b.length - a.length || a.localeCompare(b);

const fields = VARIABLES.map((v) => v.name).sort(byLengthDesc);
const archSuffixable = VARIABLES.filter((v) => v.archSuffixable)
  .map((v) => v.name)
  .sort(byLengthDesc);
const arches = ARCHITECTURES.map((a) => a.value).filter((v) => v !== 'any');
const functions = FUNCTIONS.map((f) => f.name);
const envs = ENVIRONMENT.map((e) => e.name).sort(byLengthDesc);

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'PKGBUILD',
  scopeName: 'source.shell.pkgbuild',
  patterns: [
    { include: '#maintainer-comment' },
    { include: '#pkgbuild-field' },
    { include: '#pkgbuild-function' },
    { include: '#makepkg-variable' },
    // Everything else is ordinary shell.
    { include: 'source.shell' },
  ],
  repository: {
    'maintainer-comment': {
      match: '^(#\\s*(?:Maintainer|Contributor|Co-Maintainer|Former [Mm]aintainer)\\s*:)(.*)$',
      captures: {
        1: { name: 'keyword.other.maintainer.pkgbuild' },
        2: { name: 'comment.line.number-sign.pkgbuild' },
      },
    },
    'pkgbuild-field': {
      match: `^\\s*\\b(?:(${fields.join('|')})|(${archSuffixable.join('|')})(_(?:${arches.join('|')})))\\b(?=\\+?=)`,
      captures: {
        1: { name: 'support.type.property-name.pkgbuild' },
        2: { name: 'support.type.property-name.pkgbuild' },
        3: { name: 'entity.other.attribute-name.architecture.pkgbuild' },
      },
    },
    'pkgbuild-function': {
      match: `^\\s*\\b(${functions.join('|')}|package_[A-Za-z0-9@._+-]+)\\b(?=\\s*\\(\\s*\\))`,
      captures: { 1: { name: 'entity.name.function.pkgbuild' } },
    },
    'makepkg-variable': {
      match: `(\\$)(?:(${envs.join('|')})\\b|\\{(${envs.join('|')})\\})`,
      captures: {
        1: { name: 'punctuation.definition.variable.shell' },
        2: { name: 'support.variable.makepkg.pkgbuild' },
        3: { name: 'support.variable.makepkg.pkgbuild' },
      },
    },
  },
};

writeFileSync(TARGET, `${JSON.stringify(grammar, null, 2)}\n`);
console.log(
  `wrote pkgbuild.tmLanguage.json: ${fields.length} fields, ${envs.length} makepkg variables`,
);
