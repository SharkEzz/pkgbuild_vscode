import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['node', 'oxc', 'typescript'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
    pedantic: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  },
  rules: {
    'no-await-in-loop': 'off',
  },
  options: {
    typeAware: true,
  },
  env: {
    node: true,
    builtin: true,
  },
  ignorePatterns: [
    '**/*.generated.ts',
    'packages/vscode-extension/syntaxes/**',
    'packages/pkgbuild-analyzer/src/__snapshots__/**',
    'fixtures/**',
    'plans/**',
  ],
});
