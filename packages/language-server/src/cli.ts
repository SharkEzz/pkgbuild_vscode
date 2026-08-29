import { join } from 'node:path';

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';

import { startServer } from './server.ts';

/**
 * Present because esbuild emits CommonJS for this entry point; the bundled server ships
 * its wasm files as siblings of the bundle.
 */
declare const __dirname: string;

startServer(createConnection(ProposedFeatures.all), {
  wasmPath: join(__dirname, 'tree-sitter-bash.wasm'),
});
