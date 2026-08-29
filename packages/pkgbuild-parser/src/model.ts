import type { Range } from 'vscode-languageserver-types';

/** A single value: a scalar's right-hand side, or one element of an array. */
export interface PkgValue {
  /** Exactly as written, including any quotes. */
  readonly raw: string;
  /** With one layer of surrounding quotes removed. */
  readonly text: string;
  readonly range: Range;
  /** True when the value contains `$var`, `${var}` or `$(...)`. */
  readonly hasExpansion: boolean;
}

export type AssignmentKind = 'scalar' | 'array';

/** A `name=value` or `name=(a b c)` assignment. */
export interface PkgAssignment {
  /** The name as written, e.g. `source_x86_64`. */
  readonly name: string;
  /** The name with any architecture suffix removed, e.g. `source`. */
  readonly base: string;
  /** Set when the name carried an architecture suffix. */
  readonly arch?: string;
  readonly kind: AssignmentKind;
  /** Range of the whole statement. */
  readonly range: Range;
  /** Range of just the name. */
  readonly nameRange: Range;
  /** Range of the right-hand side. */
  readonly valueRange: Range;
  /** Present when `kind === 'scalar'`. */
  readonly scalar?: PkgValue;
  /** Elements, when `kind === 'array'`. Empty for scalars. */
  readonly items: readonly PkgValue[];
  /** Name of the enclosing function, or undefined at the top level. */
  readonly container?: string;
}

/** A function definition. */
export interface PkgFunction {
  readonly name: string;
  readonly range: Range;
  readonly nameRange: Range;
  readonly bodyRange: Range;
}

/** A `$name` / `${name}` reference somewhere in the file. */
export interface PkgVarRef {
  readonly name: string;
  readonly range: Range;
  /** Name of the enclosing function, or undefined at the top level. */
  readonly container?: string;
  /** True when the reference sits inside a double-quoted string. */
  readonly quoted: boolean;
}

/** One member of a split package, joined to the function that builds it. */
export interface SplitPackage {
  readonly name: string;
  /** Range of the name within the `pkgname` array. */
  readonly nameRange: Range;
  /** The `package_<name>()` that builds it, when present. */
  readonly fn?: PkgFunction;
}

export interface PkgbuildModel {
  /** Top-level assignments, keyed by the name as written. Last assignment wins. */
  readonly globals: ReadonlyMap<string, PkgAssignment>;
  readonly functions: ReadonlyMap<string, PkgFunction>;
  /** Assignments made inside a function, keyed by that function's name. */
  readonly overrides: ReadonlyMap<string, readonly PkgAssignment[]>;
  readonly references: readonly PkgVarRef[];
  /** Ranges of ERROR and MISSING nodes, for reporting unparseable regions. */
  readonly errors: readonly Range[];
  /** Members of a split package. Empty when `pkgname` is a plain scalar. */
  readonly packages: readonly SplitPackage[];
  /** True when the file contains at least one syntax error. */
  readonly hasError: boolean;
}
