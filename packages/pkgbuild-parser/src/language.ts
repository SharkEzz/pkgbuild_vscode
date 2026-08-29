import { Language, Parser } from 'web-tree-sitter';

let initialized: Promise<void> | undefined;
const languages = new Map<string, Promise<Language>>();

/**
 * Loads the bash grammar, memoized per wasm path.
 *
 * `Parser.init()` boots the tree-sitter runtime and must complete exactly once per
 * process; concurrent callers share the same promise.
 *
 * The path is explicit rather than resolved here because the two consumers locate the
 * file very differently: tests read it out of node_modules, while the bundled server
 * reads it from beside its own bundle.
 */
export async function loadBashLanguage(wasmPath: string): Promise<Language> {
  initialized ??= Parser.init();
  await initialized;

  let language = languages.get(wasmPath);
  if (!language) {
    language = Language.load(wasmPath);
    languages.set(wasmPath, language);
  }
  return language;
}

/** A parser bound to the bash grammar. Cheap to create once the language is loaded. */
export async function createBashParser(wasmPath: string): Promise<Parser> {
  const language = await loadBashLanguage(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
