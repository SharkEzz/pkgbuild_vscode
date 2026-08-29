import { join } from 'node:path';

import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';

import { startServer } from './server.ts';

/**
 * Present because esbuild emits CommonJS for this entry point; the bundled server ships
 * its wasm files as siblings of the bundle.
 */
const dirname = import.meta.dirname;

startServer(createConnection(ProposedFeatures.all), {
  wasmPath: join(dirname, 'tree-sitter-bash.wasm'),
});
