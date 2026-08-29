import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_DIR = new URL('../../../fixtures/aur/', import.meta.url).pathname;

export interface Fixture {
  readonly name: string;
  readonly text: string;
}

/** Every real PKGBUILD in the regression corpus. Test-only. */
export function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.PKGBUILD'))
    .sort()
    .map((f) => ({ name: f.replace(/\.PKGBUILD$/, ''), text: readFileSync(join(FIXTURE_DIR, f), 'utf8') }));
}
