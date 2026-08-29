import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const outdir = new URL('./dist/', import.meta.url).pathname;
const watch = process.argv.includes('--watch');

mkdirSync(outdir, { recursive: true });

/**
 * Both wasm files must sit beside the bundle.
 *
 * web-tree-sitter locates its own runtime with `scriptDirectory + "web-tree-sitter.wasm"`,
 * which after bundling resolves to dist/. The grammar is loaded by the path the server
 * computes from __dirname. Neither is discoverable by esbuild, so they are copied here.
 */
const ASSETS = [
  require.resolve('tree-sitter-bash/tree-sitter-bash.wasm'),
  join(dirname(require.resolve('web-tree-sitter')), 'web-tree-sitter.wasm'),
];

for (const asset of ASSETS) {
  copyFileSync(asset, join(outdir, asset.slice(asset.lastIndexOf('/') + 1)));
}

await build({
  entryPoints: { cli: new URL('./src/cli.ts', import.meta.url).pathname },
  outdir,
  bundle: true,
  platform: 'node',
  // CommonJS so the bundle runs on whatever Node the extension host provides, and so
  // __dirname resolves for the wasm lookup.
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  // Comfortably below any extension-host Node; see the Node target decision in the plan.
  target: 'node20',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
  // web-tree-sitter calls `createRequire(import.meta.url)` to reach node:fs. Converting
  // ESM to CJS leaves `import.meta.url` undefined, so createRequire throws before the
  // grammar is ever loaded. Point it at the bundle's own path instead.
  banner: {
    js: "const __IMPORT_META_URL__ = require('node:url').pathToFileURL(__filename).href;",
  },
  define: {
    'import.meta.url': '__IMPORT_META_URL__',
    'import.meta.dirname': '__dirname',
    'import.meta.filename': '__filename',
  },
});

console.log(`bundled language server to ${outdir}`);
