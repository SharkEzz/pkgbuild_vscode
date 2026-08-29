/**
 * Refreshes fixtures/aur/ from a machine that has real PKGBUILDs on disk.
 *
 * The corpus is the regression bed for the parser and the analyzer: every fixture must
 * parse cleanly, and published packages should produce no diagnostics. Run with:
 *
 *   pnpm run fixtures:sync [user@host]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';

const host = process.argv[2] ?? 'tristan@192.168.0.20';
const target = new URL('../fixtures/aur/', import.meta.url).pathname;

// Where PKGBUILDs tend to accumulate on an Arch machine.
const REMOTE_GLOBS = ['~/.cache/paru/clone/*/PKGBUILD', '~/.cache/yay/*/PKGBUILD'];

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const script = `for g in ${REMOTE_GLOBS.join(' ')}; do ls $g; done 2>/dev/null | sed 's|/PKGBUILD$||' | while read -r d; do tar cf - -C "$(dirname "$d")" "$(basename "$d")/PKGBUILD"; done`;
execFileSync('sh', ['-c', `ssh -n -o BatchMode=yes ${host} '${script}' | tar xf - -C ${target}`], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

// Flatten `<pkg>/PKGBUILD` to `<pkg>.PKGBUILD` so fixture names read as package names.
for (const entry of readdirSync(target)) {
  const dir = `${target}${entry}`;
  if (!statSync(dir).isDirectory()) continue;
  renameSync(`${dir}/PKGBUILD`, `${target}${entry}.PKGBUILD`);
  rmSync(dir, { recursive: true, force: true });
}

const count = readdirSync(target).filter((f) => f.endsWith('.PKGBUILD')).length;
console.log(`synced ${count} PKGBUILD fixtures from ${host}`);
