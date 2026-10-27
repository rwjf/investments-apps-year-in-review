# Coffee by the Bathtub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved, visibly estimated coffee-equivalent comparison without changing recorded data.

**Architecture:** A pure helper computes calendar-day consumption assumptions from approved snapshot dates. One Astro component renders the comparison near the code/coffee story; existing data, approval, and static build pipelines remain untouched.

**Tech Stack:** Existing Astro, TypeScript, Luxon, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-caffeine-estimate-design.md`

## Global Constraints

- Four developers × 150 mg each per calendar day; 150 mg per 250 ml coffee; 200 litres per bathtub.
- Current snapshot: 300 days, 180,000 mg, 300 litres, 1.5 bathtubs; use snapshot timezone/cutoff, not now.
- Headline “A bathtub and a half of coffee.” and supporting “About 300 litres. Please continue using mugs.” for that result.
- Visible Estimated coffee equivalent label and accessible assumption note; no tracked-consumption claim.
- Preserve Investments Apps Team Year in Review, current production wording, source filters, all recorded metrics, no-JS/static/private-data boundaries, and mobile fit.
- No schema/approved-data/receipt modifications, source collection, new dependencies, or publication.

## Review Focus

- DST must not turn calendar days into elapsed 24-hour blocks (unit date fixture).
- An exclusive midnight cutoff must not count the following day (unit boundary fixture).
- A later machine date must not grow a frozen snapshot estimate (fixed-date unit/browser assertions).
- Per-person daily intake and per-cup caffeine are separate assumptions; multiply by four exactly once (literal 300-day arithmetic).
- Zero/tiny/future quantities and the estimated-versus-recorded distinction must stay honest (unit/targeted browser checks).

---

## Task 1: Estimated coffee helper and compact presentation

**Files:** Create `src/data/caffeine.ts`, `src/components/CoffeeScale.astro`, `tests/recap/caffeine.test.ts`; minimally modify `src/pages/index.astro` (or its existing code-story component) and `tests/browser/recap.spec.ts`. Use component-scoped CSS or narrowly scoped existing style additions; no redesign.

**Interfaces:** Export `estimateCaffeine(input: {periodStart: string; cutoffExclusive: string; timezone: 'America/New_York'}): {calendarDays: number; totalCaffeineMg: number; totalCaffeineGrams: number; coffeeLitres: number; bathtubEquivalents: number}`. Export named assumption constants for component method text. Component consumes only these approved snapshot date fields; keep it within the existing v2 story and preserve v1 fallback.

- [ ] Write failing tests for the actual cutoff result (300 / 180000 / 180 / 300 / 1.5), an exact next-midnight one-day interval (1 / 600 / 0.6 / 1 / 0.005), equal start/cutoff (all zero), DST-spanning dates, completed calendar 2026 (365 / 219000 / 219 / 365 / 1.825), and invalid/offsetless timestamps. An inverted interval fails explicitly. Do not read current time inside the helper.
- [ ] Run `npx vitest run tests/recap/caffeine.test.ts` and confirm RED before implementation.
- [ ] Implement the minimal Luxon calendar calculation and private-free derived values. Add the designer-owned compact bathtub/coffee presentation with the approved humor, visible Estimated label, and native-accessible method note. Adapt zero/tiny/changed quantities without inventing a filled bathtub; keep illustrations self-contained HTML/CSS and no runtime JS or external assets. Do not add a new header navigation item.
- [ ] Run focused unit GREEN and a targeted browser check asserting the estimate label, 300 litres/1.5 equivalent, assumptions, and unchanged recorded totals. Verify 320/375/1440 fit, no-JS access, and current team title/production wording. Use the existing approved snapshot; never rewrite it.
- [ ] Parent reads artifacts/copy, runs one combined full unit pass plus real static build/output guard after the writer finishes, and checks the actual served preview. Commit only scoped source/tests/docs; leave private scratch files ignored. Designer runs focused checks only and does not stage/commit. No whole-app review loop is required for this bounded add-on unless a concrete risk is found.

## Self-review and handoff

- [x] Inputs, units, day boundaries, static/privacy constraints, and zero/changed quantities mapped to tests.
- [x] One bounded designer lane can own the helper/component and focused checks without parallel shared-file writes.
- [x] No changes to the previously approved data or collection architecture; existing specialist-led method retained.

Plan pending user confirmation; implementation has not started.
