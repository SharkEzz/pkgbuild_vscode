/** How a PKGBUILD variable may be written. */
export type VariableShape = 'scalar' | 'array';

/** Where a variable is meaningful. */
export type VariableScope =
  /** Only valid at the top level of the file. */
  | 'global'
  /** Valid globally and overridable inside a `package_*()` function. */
  | 'overridable';

export interface VariableDoc {
  readonly name: string;
  readonly shape: VariableShape;
  readonly scope: VariableScope;
  /** makepkg refuses to build without it. */
  readonly required: boolean;
  /** Accepts an architecture suffix, e.g. `source_x86_64`. */
  readonly archSuffixable: boolean;
  /** One-line summary, used as completion detail. */
  readonly summary: string;
  /** Markdown body, used as hover content. */
  readonly documentation: string;
  /** Shown in hover as a worked example. */
  readonly example?: string;
  /** Present when the variable should no longer be used. */
  readonly deprecated?: { readonly reason: string; readonly replacement?: string };
}

export interface FunctionDoc {
  readonly name: string;
  /** Order makepkg invokes them in; lower runs first. */
  readonly order: number;
  readonly summary: string;
  readonly documentation: string;
  /** True for `package()` and `package_<name>()`, the only place `$pkgdir` is valid. */
  readonly writesPkgdir: boolean;
}

export interface EnvVarDoc {
  readonly name: string;
  readonly summary: string;
  readonly documentation: string;
  readonly deprecated?: { readonly reason: string; readonly replacement?: string };
}

export interface EnumValueDoc {
  readonly value: string;
  readonly documentation: string;
}
