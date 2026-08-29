import { analyze } from '@pkgbuild-lsp/analyzer';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import { PkgbuildParser } from '@pkgbuild-lsp/parser';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic } from 'vscode-languageserver/node';

export interface Analysis {
  readonly version: number;
  readonly text: string;
  readonly model: PkgbuildModel;
  readonly diagnostics: Diagnostic[];
}

export interface AnalysisSettings {
  readonly disabledRules: readonly string[];
}

/**
 * Parses and analyzes documents, caching the result per document version.
 *
 * Hover, completion and code actions all need the same model for the same keystroke;
 * caching on version means one parse serves all of them without re-deriving anything.
 *
 * Trees are released as soon as the model is built. The model holds only plain data, so
 * nothing outside this module has to think about tree-sitter's manual memory management.
 */
export class AnalysisCache {
  readonly #parser: PkgbuildParser;
  readonly #entries = new Map<string, Analysis>();
  #settings: AnalysisSettings;

  private constructor(parser: PkgbuildParser, settings: AnalysisSettings) {
    this.#parser = parser;
    this.#settings = settings;
  }

  static async create(wasmPath: string, settings: AnalysisSettings): Promise<AnalysisCache> {
    return new AnalysisCache(await PkgbuildParser.create(wasmPath), settings);
  }

  /** Replaces the settings and drops cached results computed under the old ones. */
  updateSettings(settings: AnalysisSettings): void {
    this.#settings = settings;
    this.#entries.clear();
  }

  /** The analysis for a document, computing it only if the version changed. */
  get(document: TextDocument): Analysis {
    const cached = this.#entries.get(document.uri);
    if (cached && cached.version === document.version) return cached;

    const text = document.getText();
    const { tree, model } = this.#parser.parse(text);
    try {
      const analysis: Analysis = {
        version: document.version,
        text,
        model,
        diagnostics: analyze(model, text, { disabledRules: this.#settings.disabledRules }),
      };
      this.#entries.set(document.uri, analysis);
      return analysis;
    } finally {
      // The model is plain data; the tree itself is not needed past this point.
      tree.delete();
    }
  }

  forget(uri: string): void {
    this.#entries.delete(uri);
  }
}
