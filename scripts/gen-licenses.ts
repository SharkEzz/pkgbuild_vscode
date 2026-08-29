import 'node';

/**
 * Regenerates packages/pkgbuild-data/src/spdx.generated.ts from the official SPDX list.
 * Run with: pnpm run gen:licenses
 */
import { writeFileSync } from 'node:fs';

const LICENSES_SOURCE =
  'https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json';
const EXCEPTIONS_SOURCE =
  'https://raw.githubusercontent.com/spdx/license-list-data/main/json/exceptions.json';
const TARGET = new URL('../packages/pkgbuild-data/src/spdx.generated.ts', import.meta.url);

interface SpdxEntry {
  licenseId: string;
  name: string;
  isDeprecatedLicenseId?: boolean;
}

interface SpdxException {
  licenseExceptionId: string;
  name: string;
  isDeprecatedLicenseId?: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SPDX fetch failed: ${res.status} ${res.statusText} (${url})`);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (await res.json()) as T;
}

const data = await fetchJson<{ licenseListVersion: string; licenses: SpdxEntry[] }>(
  LICENSES_SOURCE,
);
// The operand of a `WITH` is an exception id, which lives in its own SPDX list.
const exceptionData = await fetchJson<{ exceptions: SpdxException[] }>(EXCEPTIONS_SOURCE);

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const active = data.licenses
  .filter((l) => !l.isDeprecatedLicenseId)
  .sort((a, b) => a.licenseId.localeCompare(b.licenseId));
const deprecated = data.licenses
  .filter((l) => l.isDeprecatedLicenseId)
  .map((l) => l.licenseId)
  .sort();
const exceptions = exceptionData.exceptions
  .filter((e) => !e.isDeprecatedLicenseId)
  .sort((a, b) => a.licenseExceptionId.localeCompare(b.licenseExceptionId));

writeFileSync(
  TARGET,
  `// GENERATED FILE - do not edit by hand.
// Source: SPDX license list ${data.licenseListVersion} (https://github.com/spdx/license-list-data)
// Regenerate with: pnpm run gen:licenses

/** SPDX license list version this table was generated from. */
export const SPDX_LIST_VERSION = '${data.licenseListVersion}';

/** Current, non-deprecated SPDX identifiers mapped to their full names. */
export const SPDX_LICENSES: ReadonlyMap<string, string> = new Map([
${active.map((l) => `  ['${esc(l.licenseId)}', '${esc(l.name)}'],`).join('\n')}
]);

/** SPDX identifiers that exist but have been deprecated by SPDX itself. */
export const SPDX_DEPRECATED: ReadonlySet<string> = new Set([
${deprecated.map((i) => `  '${esc(i)}',`).join('\n')}
]);

/** SPDX license exceptions, the valid right-hand operand of a \`WITH\`. */
export const SPDX_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
${exceptions.map((e) => `  ['${esc(e.licenseExceptionId)}', '${esc(e.name)}'],`).join('\n')}
]);
`,
);

console.log(
  `wrote spdx.generated.ts: ${active.length} active, ${deprecated.length} deprecated, ` +
    `${exceptions.length} exceptions`,
);
