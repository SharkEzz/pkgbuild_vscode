import { createRequire } from 'node:module';

/**
 * Absolute path to the bash grammar inside node_modules.
 *
 * Test-only: the bundled server ships the wasm beside its own bundle and passes that
 * path explicitly instead.
 */
export function resolveBashWasmPath(): string {
  const require = createRequire(import.meta.url);
  return require.resolve('tree-sitter-bash/tree-sitter-bash.wasm');
}

export { PkgbuildParser } from './index.ts';
