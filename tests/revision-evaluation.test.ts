import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { reviewSuggestions } from '../src/revision/suggestions';

// Opt-in postprocessing of recorded engines, never part of the regular suite.
it.skipIf(!process.env.ARIANE_REVISION_REPORT)(
  'measures the actual displayed corrections on paired native outputs',
  () => {
    const path = process.env.ARIANE_REVISION_REPORT!;
    const report = JSON.parse(readFileSync(path, 'utf8'));
    const summary = [false, true].map((context) => {
      let safe = 0,
        harmful = 0,
        missed = 0,
        cleanCases = 0,
        falseDisplays = 0;
      const firstUsefulMs: number[] = [];
      for (const row of report.rows) {
        const variant = row.variants.find((v: { context: boolean }) => v.context === context);
        const suggestions = reviewSuggestions(
          row.case.text,
          variant.language.issues,
          variant.model.model,
        );
        const language = reviewSuggestions(row.case.text, variant.language.issues, null);
        const same = (a: { from: number; to: number; replacement: string }, b: typeof a) =>
          row.case.text.slice(0, a.from) + a.replacement + row.case.text.slice(a.to) ===
          row.case.text.slice(0, b.from) + b.replacement + row.case.text.slice(b.to);
        safe += row.case.allowed.filter((g: (typeof suggestions)[number]) =>
          suggestions.some((s) => same(s, g)),
        ).length;
        harmful += suggestions.filter(
          (s) => !row.case.allowed.some((g: typeof s) => same(s, g)),
        ).length;
        missed += row.case.allowed.filter(
          (g: (typeof suggestions)[number]) => !suggestions.some((s) => same(s, g)),
        ).length;
        if (!row.case.allowed.length) {
          cleanCases++;
          if (suggestions.length) falseDisplays++;
        }
        if (suggestions.length)
          firstUsefulMs.push(variant.languageMs + (language.length ? 0 : variant.modelMs));
        variant.displayed = suggestions;
        for (const suggestion of suggestions) {
          expect(suggestion.from).toBeGreaterThanOrEqual(0);
          expect(suggestion.to).toBeLessThanOrEqual(row.case.text.length);
          expect(row.case.text.slice(suggestion.from, suggestion.to)).toBe(suggestion.original);
        }
      }
      firstUsefulMs.sort((a, b) => a - b);
      return {
        context,
        safe,
        harmful,
        missed,
        cleanCases,
        falseDisplays,
        firstUsefulP95Ms: firstUsefulMs[Math.ceil(firstUsefulMs.length * 0.95) - 1] ?? null,
      };
    });
    report.displayMetrics = summary;
    report.displayBudgetsPassed = summary[1].harmful <= summary[0].harmful;
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    expect(report.displayBudgetsPassed).toBe(true);
  },
);
