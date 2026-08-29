import { describe, expect, it } from 'vitest';

import { diagnose, loadFixtures } from './test-support.ts';

const SEVERITY_LABEL: Record<number, string> = { 1: 'error', 2: 'warn', 3: 'info', 4: 'hint' };

/**
 * Regression bed of real, published PKGBUILDs.
 *
 * These are packages people actually build, so the expected state is *near* clean, not
 * clean: every finding recorded in the snapshot has been reviewed and is a genuine issue
 * in the upstream file. A snapshot diff on this file therefore means one of two things,
 * both worth looking at: a rule got broader (possible false positive) or narrower
 * (possible regression).
 */
describe('real PKGBUILD corpus', () => {
  const fixtures = loadFixtures();

  it('has fixtures to test against', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('produces a stable set of findings', async () => {
    const report: string[] = [];

    for (const fixture of fixtures) {
      const diagnostics = await diagnose(fixture.text);
      if (diagnostics.length === 0) {
        report.push(`${fixture.name}: clean`);
        continue;
      }
      report.push(`${fixture.name}:`);
      for (const d of diagnostics) {
        report.push(
          `  L${d.range.start.line + 1} ${SEVERITY_LABEL[d.severity ?? 1]} ${d.code} ${d.message}`,
        );
      }
    }

    await expect(report.join('\n')).toMatchFileSnapshot('./__snapshots__/corpus.md');
  });

  it.each(loadFixtures().map((f) => f.name))('emits well-formed diagnostics for %s', async (name) => {
    const fixture = loadFixtures().find((f) => f.name === name)!;
    for (const d of await diagnose(fixture.text)) {
      expect(typeof d.message).toBe('string');
      expect(d.code).toMatch(/^PKGBUILD\d{3}$/);
      expect(d.source).toBe('pkgbuild');
      // A range that starts after it ends would place the squiggle nowhere.
      expect(d.range.end.line).toBeGreaterThanOrEqual(d.range.start.line);
      if (d.range.end.line === d.range.start.line) {
        expect(d.range.end.character).toBeGreaterThanOrEqual(d.range.start.character);
      }
    }
  });
});
