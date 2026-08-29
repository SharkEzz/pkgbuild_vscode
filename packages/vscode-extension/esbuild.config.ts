import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const outdir = new URL('./dist/', import.meta.url).pathname;
const watch = process.argv.includes('--watch');

mkdirSync(outdir, { recursive: true });

/**
 * The server bundle ships inside the extension.
 *
 * vsce packages only this directory, so the server and its two wasm files have to be
 * copied in rather than referenced across the workspace.
 */
const serverDist = join(dirname(require.resolve('@pkgbuild-lsp/server/package.json')), 'dist');
cpSync(serverDist, join(outdir, 'server'), { recursive: true });

await build({
  entryPoints: { extension: new URL('./src/extension.ts', import.meta.url).pathname },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  target: 'node20',
  // Provided by the extension host, never bundled.
  external: ['vscode'],
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
});

console.log(`bundled extension to ${outdir}`);
