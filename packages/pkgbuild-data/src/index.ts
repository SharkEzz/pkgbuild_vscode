import { ARCHITECTURES } from './enums.ts';
import { ENVIRONMENT } from './environment.ts';
import { FUNCTIONS, PACKAGE_FUNCTION_PREFIX } from './functions.ts';
import type { EnvVarDoc, FunctionDoc, VariableDoc } from './types.ts';
import { VARIABLES } from './variables.ts';

export * from './types.ts';
export * from './enums.ts';
export * from './environment.ts';
export * from './functions.ts';
export * from './licenses.ts';
export * from './variables.ts';

const VARIABLES_BY_NAME: ReadonlyMap<string, VariableDoc> = new Map(
  VARIABLES.map((v) => [v.name, v]),
);
const FUNCTIONS_BY_NAME: ReadonlyMap<string, FunctionDoc> = new Map(
  FUNCTIONS.map((f) => [f.name, f]),
);
const ENVIRONMENT_BY_NAME: ReadonlyMap<string, EnvVarDoc> = new Map(
  ENVIRONMENT.map((e) => [e.name, e]),
);

/** Architecture names usable as a variable suffix (`any` cannot be one). */
const ARCH_SUFFIXES: ReadonlySet<string> = new Set(
  ARCHITECTURES.map((a) => a.value).filter((v) => v !== 'any'),
);

export interface ResolvedVariable {
  readonly doc: VariableDoc;
  /** Set when the name carried an architecture suffix, e.g. `source_x86_64`. */
  readonly arch?: string;
}

/**
 * Resolves a written variable name to its documentation, accounting for
 * architecture suffixes (`source_x86_64` resolves to `source`, arch `x86_64`).
 *
 * Returns undefined for names that are not part of the PKGBUILD format.
 */
export function resolveVariableName(name: string): ResolvedVariable | undefined {
  const direct = VARIABLES_BY_NAME.get(name);
  if (direct) return { doc: direct };

  // Architecture names may themselves contain an underscore (`x86_64`), so the suffix
  // cannot be found by splitting on the last `_`; match against known names instead.
  for (const arch of ARCH_SUFFIXES) {
    const suffix = `_${arch}`;
    if (!name.endsWith(suffix)) continue;
    const doc = VARIABLES_BY_NAME.get(name.slice(0, -suffix.length));
    if (doc?.archSuffixable) return { doc, arch };
  }
  return undefined;
}

/** Documentation for a function name, including `package_<name>()` forms. */
export function resolveFunctionName(name: string): FunctionDoc | undefined {
  const direct = FUNCTIONS_BY_NAME.get(name);
  if (direct) return direct;
  return name.startsWith(PACKAGE_FUNCTION_PREFIX) ? FUNCTIONS_BY_NAME.get('package') : undefined;
}

/** Documentation for a makepkg environment variable, without the `$`. */
export function resolveEnvironmentName(name: string): EnvVarDoc | undefined {
  return ENVIRONMENT_BY_NAME.get(name);
}

/** A valid pacman package name. */
export const PKGNAME_PATTERN = /^[a-z0-9@._+][a-z0-9@._+-]*$/;

/** A valid `pkgver`: anything without `-`, `:` or whitespace. */
export const PKGVER_PATTERN = /^[^\s:-]+$/;

/** A valid `pkgrel`: a positive integer with at most one decimal part. */
export const PKGREL_PATTERN = /^[1-9][0-9]*(\.[0-9]+)?$/;

/** A valid `epoch`: a non-negative integer. */
export const EPOCH_PATTERN = /^(0|[1-9][0-9]*)$/;

/** A full 40-character PGP fingerprint, uppercase, no spaces. */
export const PGP_FINGERPRINT_PATTERN = /^[0-9A-F]{40}$/;
