import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { CodeAction, Diagnostic, Range } from 'vscode-languageserver-types';

/** Everything a rule is allowed to look at. */
export interface RuleContext {
  readonly model: PkgbuildModel;
  readonly text: string;
  /** `text` split on newlines, for rules that need raw line content. */
  readonly lines: readonly string[];
}

/**
 * A diagnostic before the engine stamps on the rule's code and source.
 *
 * `fixData` is whatever the rule's `fix()` needs to build an edit; keeping it on the
 * diagnostic means the code-action pass never has to re-derive the analysis.
 */
export interface RuleDiagnostic {
  readonly range: Range;
  readonly message: string;
  readonly severity: DiagnosticSeverityValue;
  readonly fixData?: unknown;
  /** Extra locations that explain the diagnostic, e.g. the conflicting array. */
  readonly related?: readonly { readonly range: Range; readonly message: string }[];
  /** Renders the symbol with a strikethrough in the editor. */
  readonly deprecated?: boolean;
}

export type DiagnosticSeverityValue = 1 | 2 | 3 | 4;

export interface Rule {
  /** Stable identifier, e.g. `PKGBUILD002`. Users disable rules by this code. */
  readonly code: string;
  /** Kebab-case name shown in documentation and settings. */
  readonly name: string;
  /** One line describing what the rule catches. */
  readonly summary: string;
  check(context: RuleContext): RuleDiagnostic[];
  /** Builds quick fixes for a diagnostic this rule produced. */
  fix?(diagnostic: Diagnostic, context: RuleContext, uri: string): CodeAction[];
}
