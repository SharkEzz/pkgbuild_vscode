import type { PkgbuildModel } from '@pkgbuild-lsp/parser';

/** How deep to follow `$a` -> `$b` chains before giving up. */
const MAX_DEPTH = 8;

/**
 * Best-effort interpolation of `$var` and `${var}` against the file's own assignments.
 *
 * Deliberately partial: it resolves literal top-level scalars and leaves everything else
 * as written. Guessing at a command substitution would produce a confidently wrong
 * value, which is worse than showing the user the expression they typed.
 */
export function expand(text: string, model: PkgbuildModel, depth = 0): string {
  if (depth >= MAX_DEPTH) return text;

  return text.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (match, braced, bare) => {
      const name = braced ?? bare;
      const assignment = model.globals.get(name);
      const scalar = assignment?.scalar;
      if (!assignment || assignment.kind !== 'scalar' || !scalar) return match;
      return scalar.hasExpansion ? expand(scalar.text, model, depth + 1) : scalar.text;
    },
  );
}
