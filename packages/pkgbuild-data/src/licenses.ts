import { SPDX_DEPRECATED, SPDX_EXCEPTIONS, SPDX_LICENSES } from './spdx.generated.ts';

/**
 * Legacy Arch license identifiers and the SPDX expression that replaces each.
 *
 * Arch RFC 0016 moved `license=()` to SPDX; these short names are still widespread in
 * older PKGBUILDs and in the AUR. Where the legacy name was genuinely ambiguous about
 * version or variant, the mapping picks the reading Arch itself documented.
 */
export const LEGACY_LICENSE_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ['GPL', 'GPL-2.0-or-later'],
  ['GPL2', 'GPL-2.0-only'],
  ['GPL3', 'GPL-3.0-or-later'],
  ['LGPL', 'LGPL-2.1-or-later'],
  ['LGPL2.1', 'LGPL-2.1-only'],
  ['LGPL3', 'LGPL-3.0-or-later'],
  ['AGPL3', 'AGPL-3.0-or-later'],
  ['BSD', 'BSD-3-Clause'],
  ['Apache', 'Apache-2.0'],
  ['MPL', 'MPL-1.1'],
  ['MPL2', 'MPL-2.0'],
  ['CDDL', 'CDDL-1.0'],
  ['EPL', 'EPL-1.0'],
  ['FDL', 'GFDL-1.3-or-later'],
  ['FDL1.2', 'GFDL-1.2-only'],
  ['FDL1.3', 'GFDL-1.3-only'],
  ['PHP', 'PHP-3.01'],
  ['PSF', 'Python-2.0'],
  ['PerlArtistic', 'Artistic-1.0-Perl'],
  ['Artistic2.0', 'Artistic-2.0'],
  ['RUBY', 'Ruby'],
  ['ZLIB', 'Zlib'],
  ['W3C', 'W3C'],
  ['LPPL', 'LPPL-1.3c'],
]);

/** SPDX prefix for a license that has no SPDX identifier. */
export const LICENSE_REF_PREFIX = 'LicenseRef-';

/** SPDX expression operators, which may join several identifiers in one entry. */
const SPDX_OPERATORS = new Set(['AND', 'OR', 'WITH']);

/** One atom of an SPDX expression, tagged with what it is allowed to be. */
export interface SpdxAtom {
  readonly id: string;
  /**
   * `exception` for the operand of a `WITH`, which must come from the SPDX exceptions
   * list rather than the license list -- `Apache-2.0 WITH LLVM-exception` is valid even
   * though `LLVM-exception` is not a license.
   */
  readonly kind: 'license' | 'exception';
}

/** Splits an SPDX expression into its atoms, dropping operators and parentheses. */
export function spdxAtoms(expression: string): SpdxAtom[] {
  const tokens = expression
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const atoms: SpdxAtom[] = [];
  let expectException = false;
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (SPDX_OPERATORS.has(upper)) {
      expectException = upper === 'WITH';
      continue;
    }
    atoms.push({ id: token, kind: expectException ? 'exception' : 'license' });
    expectException = false;
  }
  return atoms;
}

/** Splits an SPDX expression into its identifier atoms, dropping operators and parens. */
export function spdxIdentifiers(expression: string): string[] {
  return spdxAtoms(expression).map((a) => a.id);
}

/** True if `id` is a current SPDX license exception identifier. */
export function isKnownExceptionId(id: string): boolean {
  return SPDX_EXCEPTIONS.has(id);
}

/** True if the atom is valid for the position it occupies in the expression. */
export function isValidAtom(atom: SpdxAtom): boolean {
  return atom.kind === 'exception' ? isKnownExceptionId(atom.id) : isKnownLicenseId(atom.id);
}

/** True if `id` is a current SPDX identifier, a `+` form, or a `LicenseRef-`. */
export function isKnownLicenseId(id: string): boolean {
  if (id.startsWith(LICENSE_REF_PREFIX)) return id.length > LICENSE_REF_PREFIX.length;
  // A trailing `+` ("or later") is valid SPDX shorthand: `GPL-2.0+`.
  const bare = id.endsWith('+') ? id.slice(0, -1) : id;
  return SPDX_LICENSES.has(bare) || SPDX_DEPRECATED.has(bare);
}

/** True if `id` exists in SPDX but has been deprecated by SPDX itself. */
export function isDeprecatedLicenseId(id: string): boolean {
  const bare = id.endsWith('+') ? id.slice(0, -1) : id;
  return SPDX_DEPRECATED.has(bare) && !SPDX_LICENSES.has(bare);
}

/**
 * Best-effort SPDX replacement for an identifier we do not recognise.
 *
 * Tries, in order: the legacy Arch mapping, a case-insensitive match against the SPDX
 * list, and finally a single-edit-distance neighbour. Returns undefined rather than
 * guessing when none of those apply — a wrong license suggestion is worse than none.
 */
export function suggestLicenseId(id: string): string | undefined {
  const legacy = LEGACY_LICENSE_REPLACEMENTS.get(id);
  if (legacy) return legacy;

  const lower = id.toLowerCase();
  for (const known of SPDX_LICENSES.keys()) {
    if (known.toLowerCase() === lower) return known;
  }

  let best: string | undefined;
  for (const known of SPDX_LICENSES.keys()) {
    if (Math.abs(known.length - id.length) > 1) continue;
    if (withinOneEdit(known.toLowerCase(), lower)) {
      // Ambiguous neighbours are worse than no suggestion.
      if (best) return undefined;
      best = known;
    }
  }
  return best;
}

/** True when `a` and `b` differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (short.length === long.length) i++;
    j++;
  }
  return true;
}

export { SPDX_LICENSES, SPDX_DEPRECATED, SPDX_EXCEPTIONS } from './spdx.generated.ts';
export { SPDX_LIST_VERSION } from './spdx.generated.ts';
