import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { CodeAction, Diagnostic } from 'vscode-languageserver-types';

import { RULES, RULES_BY_CODE } from './rules/index.ts';
import type { RuleContext } from './types.ts';

/** Identifies our diagnostics in the editor's Problems panel. */
export const DIAGNOSTIC_SOURCE = 'pkgbuild';

export interface AnalyzeOptions {
  /** Rule codes (`PKGBUILD008`) or names (`unquoted-path-variable`) to skip. */
  readonly disabledRules?: readonly string[];
}

function buildContext(model: PkgbuildModel, text: string): RuleContext {
  return { model, text, lines: text.split('\n') };
}

/**
 * Runs every enabled rule over a parsed PKGBUILD.
 *
 * Rules are pure and independent, so one throwing must not lose the others' findings —
 * a rule that fails is skipped rather than taking the whole analysis down.
 */
export function analyze(
  model: PkgbuildModel,
  text: string,
  options: AnalyzeOptions = {},
): Diagnostic[] {
  const disabled = new Set(options.disabledRules ?? []);
  const context = buildContext(model, text);
  const diagnostics: Diagnostic[] = [];

  for (const rule of RULES) {
    if (disabled.has(rule.code) || disabled.has(rule.name)) continue;

    let found;
    try {
      found = rule.check(context);
    } catch (error) {
      console.error(`[pkgbuild] rule ${rule.code} threw:`, error);
      continue;
    }

    for (const d of found) {
      diagnostics.push({
        range: d.range,
        message: d.message,
        severity: d.severity,
        code: rule.code,
        source: DIAGNOSTIC_SOURCE,
        ...(d.deprecated ? { tags: [2] } : {}),
        ...(d.related
          ? {
              relatedInformation: d.related.map((r) => ({
                location: { uri: '', range: r.range },
                message: r.message,
              })),
            }
          : {}),
        ...(d.fixData !== undefined ? { data: d.fixData } : {}),
      });
    }
  }

  return diagnostics;
}

/** Builds the quick fixes offered for the given diagnostics. */
export function codeActions(
  model: PkgbuildModel,
  text: string,
  uri: string,
  diagnostics: readonly Diagnostic[],
): CodeAction[] {
  const context = buildContext(model, text);
  const actions: CodeAction[] = [];

  for (const diagnostic of diagnostics) {
    if (diagnostic.source !== DIAGNOSTIC_SOURCE || typeof diagnostic.code !== 'string') continue;
    const rule = RULES_BY_CODE.get(diagnostic.code);
    if (!rule?.fix) continue;

    try {
      actions.push(...rule.fix(diagnostic, context, uri));
    } catch (error) {
      console.error(`[pkgbuild] fix for ${rule.code} threw:`, error);
    }
  }

  return actions;
}
