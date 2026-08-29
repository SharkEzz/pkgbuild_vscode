import { archAnyWithBuild } from './arch-any-with-build.ts';
import { checksumCountMismatch } from './checksum-count-mismatch.ts';
import { deprecatedStartdir } from './deprecated-startdir.ts';
import { invalidDependency } from './invalid-dependency.ts';
import {
  invalidPkgname,
  invalidPkgver,
  invalidVersionField,
  missingPackageFunction,
} from './invalid-field-value.ts';
import { missingRequiredField } from './missing-required-field.ts';
import { nonSpdxLicense } from './non-spdx-license.ts';
import { pkgdirOutsidePackage } from './pkgdir-outside-package.ts';
import { skipChecksumNonVcs } from './skip-checksum-non-vcs.ts';
import { splitPackageFunction } from './split-package-function.ts';
import { unquotedPathVariable } from './unquoted-path-variable.ts';
import { weakChecksum } from './weak-checksum.ts';
import type { Rule } from '../types.ts';

/** Every rule, ordered by code. */
export const RULES: readonly Rule[] = [
  missingRequiredField, //     PKGBUILD001
  checksumCountMismatch, //    PKGBUILD002
  pkgdirOutsidePackage, //     PKGBUILD003
  skipChecksumNonVcs, //       PKGBUILD004
  splitPackageFunction, //     PKGBUILD005
  invalidPkgver, //            PKGBUILD006
  invalidVersionField, //      PKGBUILD007
  unquotedPathVariable, //     PKGBUILD008
  weakChecksum, //             PKGBUILD009
  invalidPkgname, //           PKGBUILD010
  nonSpdxLicense, //           PKGBUILD011
  missingPackageFunction, //   PKGBUILD012
  deprecatedStartdir, //       PKGBUILD013
  archAnyWithBuild, //         PKGBUILD014
  invalidDependency, //        PKGBUILD015
];

export const RULES_BY_CODE: ReadonlyMap<string, Rule> = new Map(RULES.map((r) => [r.code, r]));
