import { codeActions, DIAGNOSTIC_SOURCE } from '@pkgbuild-lsp/analyzer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  type Connection,
  DidChangeConfigurationNotification,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';

import { AnalysisCache } from './analysis.ts';
import { complete } from './features/completion.ts';
import { hover } from './features/hover.ts';
import { semanticTokens, TOKEN_MODIFIERS, TOKEN_TYPES } from './features/semantic-tokens.ts';
import { documentSymbols } from './features/symbols.ts';

/** How long to wait after a keystroke before re-publishing diagnostics. */
const DEBOUNCE_MS = 150;

export interface ServerOptions {
  /** Absolute path to tree-sitter-bash.wasm. */
  readonly wasmPath: string;
}

interface Settings {
  readonly disabledRules: readonly string[];
}

const DEFAULT_SETTINGS: Settings = { disabledRules: [] };

function readSettings(raw: unknown): Settings {
  const section = (raw as { pkgbuild?: { diagnostics?: { disabledRules?: unknown } } } | undefined)
    ?.pkgbuild;
  const disabled = section?.diagnostics?.disabledRules;
  return {
    disabledRules: Array.isArray(disabled) ? disabled.filter((r) => typeof r === 'string') : [],
  };
}

export function startServer(connection: Connection, options: ServerOptions): void {
  const documents = new TextDocuments(TextDocument);
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let cache: AnalysisCache | undefined;
  let settings: Settings = DEFAULT_SETTINGS;

  /** The analysis for a URI, or undefined if the document or parser is not ready. */
  const analysisFor = (uri: string) => {
    const document = documents.get(uri);
    if (!document || !cache) return undefined;
    return { document, analysis: cache.get(document) };
  };

  const publish = (uri: string): void => {
    const found = analysisFor(uri);
    if (!found) return;
    void connection.sendDiagnostics({
      uri,
      version: found.document.version,
      diagnostics: found.analysis.diagnostics,
    });
  };

  const schedulePublish = (uri: string): void => {
    clearTimeout(pending.get(uri));
    pending.set(
      uri,
      setTimeout(() => {
        pending.delete(uri);
        publish(uri);
      }, DEBOUNCE_MS),
    );
  };

  connection.onInitialize(async (params) => {
    settings = readSettings(params.initializationOptions);
    cache = await AnalysisCache.create(options.wasmPath, settings);

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        completionProvider: {
          // `$` opens a variable reference, `(` an array, `#` a VCS fragment.
          triggerCharacters: ['$', '(', '#', '{', "'", '"'],
          resolveProvider: false,
        },
        documentSymbolProvider: true,
        codeActionProvider: { codeActionKinds: ['quickfix'] },
        semanticTokensProvider: {
          legend: { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [...TOKEN_MODIFIERS] },
          full: true,
        },
      },
      serverInfo: { name: 'pkgbuild-language-server', version: '0.1.0' },
    };
  });

  connection.onInitialized(() => {
    void connection.client.register(DidChangeConfigurationNotification.type, undefined);
  });

  connection.onDidChangeConfiguration((change) => {
    settings = readSettings(change.settings);
    cache?.updateSettings(settings);
    for (const document of documents.all()) publish(document.uri);
  });

  documents.onDidOpen((event) => publish(event.document.uri));
  documents.onDidChangeContent((event) => schedulePublish(event.document.uri));

  documents.onDidClose((event) => {
    clearTimeout(pending.get(event.document.uri));
    pending.delete(event.document.uri);
    cache?.forget(event.document.uri);
    // Clear the editor's stale problems for a file nobody is looking at.
    void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  });

  connection.onHover(({ textDocument, position }) => {
    const found = analysisFor(textDocument.uri);
    return found ? (hover(found.analysis.model, position) ?? null) : null;
  });

  connection.onCompletion(({ textDocument, position }) => {
    const found = analysisFor(textDocument.uri);
    if (!found) return [];
    const textBefore = found.document.getText({
      start: { line: 0, character: 0 },
      end: position,
    });
    return complete(found.analysis.model, textBefore);
  });

  connection.onDocumentSymbol(({ textDocument }) => {
    const found = analysisFor(textDocument.uri);
    return found ? documentSymbols(found.analysis.model) : [];
  });

  connection.languages.semanticTokens.on(({ textDocument }) => {
    const found = analysisFor(textDocument.uri);
    return { data: found ? semanticTokens(found.analysis.model) : [] };
  });

  connection.onCodeAction((params) => {
    const found = analysisFor(params.textDocument.uri);
    if (!found) return [];
    // Only act on our own diagnostics; other extensions own theirs.
    const ours = params.context.diagnostics.filter((d) => d.source === DIAGNOSTIC_SOURCE);
    if (ours.length === 0) return [];
    return codeActions(found.analysis.model, found.analysis.text, params.textDocument.uri, ours);
  });

  documents.listen(connection);
  connection.listen();
}
