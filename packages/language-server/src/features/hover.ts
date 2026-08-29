import {
  ARCHITECTURES,
  isKnownExceptionId,
  OPTIONS,
  resolveEnvironmentName,
  resolveFunctionName,
  resolveVariableName,
  SPDX_EXCEPTIONS,
  SPDX_LICENSES,
  splitPackageTarget,
} from '@pkgbuild-lsp/data';
import type { PkgbuildModel } from '@pkgbuild-lsp/parser';
import type { Hover, Position } from 'vscode-languageserver-types';

import { locate } from '../locate.ts';
import { expand } from '../expand.ts';

function markdown(range: Hover['range'], lines: string[]): Hover {
  return { contents: { kind: 'markdown', value: lines.join('\n\n') }, ...(range ? { range } : {}) };
}

/** Documentation for whatever the cursor is on. */
export function hover(model: PkgbuildModel, position: Position): Hover | undefined {
  const found = locate(model, position);
  if (!found) return undefined;

  switch (found.kind) {
    case 'reference': {
      const { reference } = found;
      const env = resolveEnvironmentName(reference.name);
      if (env) {
        const lines = [`**$${env.name}** — ${env.summary}`, env.documentation];
        if (env.deprecated) {
          lines.push(`**Deprecated.** ${env.deprecated.reason}`);
          if (env.deprecated.replacement) lines.push(`Use \`${env.deprecated.replacement}\`.`);
        }
        return markdown(reference.range, lines);
      }

      // A reference to a variable the file itself sets: show its resolved value.
      const assignment = model.globals.get(reference.name);
      if (assignment) {
        const value =
          assignment.kind === 'array'
            ? assignment.items.map((i) => i.text).join(' ')
            : (assignment.scalar?.text ?? '');
        const doc = resolveVariableName(assignment.base);
        return markdown(reference.range, [
          `**$${reference.name}** = \`${value}\``,
          ...(doc ? [doc.doc.summary] : []),
        ]);
      }
      return undefined;
    }

    case 'variable-name': {
      const resolved = resolveVariableName(found.assignment.name);
      if (!resolved) return undefined;
      const { doc, arch } = resolved;

      const lines = [
        `**${doc.name}**${arch ? ` *(${arch} only)*` : ''} — ${doc.summary}`,
        doc.documentation,
      ];
      if (doc.deprecated) {
        lines.push(`**Deprecated.** ${doc.deprecated.reason}`);
        if (doc.deprecated.replacement) lines.push(`Use \`${doc.deprecated.replacement}\`.`);
      }
      if (doc.example) lines.push('```bash\n' + doc.example + '\n```');
      return markdown(found.assignment.nameRange, lines);
    }

    case 'function-name': {
      const doc = resolveFunctionName(found.fn.name);
      if (!doc) return undefined;
      const target = splitPackageTarget(found.fn.name);
      return markdown(found.fn.nameRange, [
        `**${found.fn.name}()** — ${doc.summary}`,
        ...(target ? [`Builds the \`${target}\` member of this split package.`] : []),
        doc.documentation,
      ]);
    }

    case 'array-item':
      return hoverArrayItem(model, found.assignment.base, found.item);

    case 'scalar-value':
      return hoverScalar(model, found.value);

    default:
      return undefined;
  }
}

function hoverArrayItem(
  model: PkgbuildModel,
  base: string,
  item: { text: string; raw: string; range: Hover['range'] & object; hasExpansion: boolean },
): Hover | undefined {
  if (base === 'arch') {
    const arch = ARCHITECTURES.find((a) => a.value === item.text);
    return arch ? markdown(item.range, [`**${arch.value}**`, arch.documentation]) : undefined;
  }

  if (base === 'options') {
    const negated = item.text.startsWith('!');
    const value = negated ? item.text.slice(1) : item.text;
    const option = OPTIONS.find((o) => o.value === value);
    if (!option) return undefined;
    return markdown(item.range, [
      `**${item.text}** — ${negated ? 'disabled' : 'enabled'}`,
      option.documentation,
    ]);
  }

  if (base === 'license') {
    const name = SPDX_LICENSES.get(item.text);
    if (name) return markdown(item.range, [`**${item.text}**`, name]);
    if (isKnownExceptionId(item.text)) {
      return markdown(item.range, [
        `**${item.text}** *(SPDX exception)*`,
        SPDX_EXCEPTIONS.get(item.text)!,
      ]);
    }
    return undefined;
  }

  if (base === 'source' && item.hasExpansion) {
    return markdown(item.range, [
      '**Resolved source**',
      '```\n' + expand(item.text, model) + '\n```',
    ]);
  }

  return undefined;
}

function hoverScalar(
  model: PkgbuildModel,
  value: { text: string; hasExpansion: boolean; range: Hover['range'] & object },
): Hover | undefined {
  if (!value.hasExpansion) return undefined;
  return markdown(value.range, [
    '**Resolved value**',
    '```\n' + expand(value.text, model) + '\n```',
  ]);
}
