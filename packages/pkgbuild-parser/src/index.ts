import type { Parser, Tree } from 'web-tree-sitter';

import { createBashParser } from './language.ts';
import { buildModel } from './model-builder.ts';
import type { PkgbuildModel } from './model.ts';

export * from './model.ts';
export { loadBashLanguage, createBashParser } from './language.ts';
export { buildModel, toRange } from './model-builder.ts';

export interface ParseResult {
  /** The concrete syntax tree. Owned by the caller, who must `delete()` it. */
  readonly tree: Tree;
  readonly model: PkgbuildModel;
}

/**
 * Parses PKGBUILD text into a semantic model.
 *
 * Construct one per process with `PkgbuildParser.create()`; the underlying grammar is
 * memoized, so repeated creation is cheap but unnecessary.
 */
export class PkgbuildParser {
  readonly #parser: Parser;

  private constructor(parser: Parser) {
    this.#parser = parser;
  }

  static async create(wasmPath: string): Promise<PkgbuildParser> {
    return new PkgbuildParser(await createBashParser(wasmPath));
  }

  /**
   * Parses `text`, optionally reusing `previous` for an incremental reparse.
   *
   * When passing `previous`, the caller must already have applied the corresponding
   * `tree.edit()` calls. The previous tree is not deleted here.
   */
  parse(text: string, previous?: Tree): ParseResult {
    const tree = this.#parser.parse(text, previous);
    if (!tree) throw new Error('tree-sitter returned no tree');
    return { tree, model: buildModel(tree, text) };
  }
}
