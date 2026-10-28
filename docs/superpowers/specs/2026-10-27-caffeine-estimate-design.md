# Coffee by the bathtub — approved small add-on

Approved in conversation: the user chose every calendar day, then the bathtub comparison, then “Approve and add it.”

## Intent and approach

Add a playful estimated caffeine comparison near the existing code-and-coffee story. The alternatives were roughly 2,800 espresso shots (fewer conversion assumptions) and a bathtub and a half of coffee (more visual); the user selected the bathtub.

## Calculation and copy

- Assume **4 developers**, **150 mg caffeine each per calendar day**.
- Count calendar dates intersecting the approved snapshot interval, in its reporting timezone, including a partial final day but excluding an exact next-day midnight. Never use wall-clock today or forecast the full year.
- Assume **150 mg per 250 ml strong coffee** and a **200-litre bathtub**.
- Current January 1–October 27 snapshot: **300 days → 180,000 mg / 180 g → 300 litres → 1.5 bathtubs**.
- Headline: **“A bathtub and a half of coffee.”** Supporting line: **“About 300 litres. Please continue using mugs.”** Adapt the quantity/copy if a future snapshot changes the date range.
- A visible **Estimated coffee equivalent** label distinguishes assumptions from measured Jira/GitHub data. Keep the assumptions available in a small method note; do not imply actual consumption was tracked.

## Constraints and ownership

One compact addition within the current story, not a new dashboard or navigation overhaul. Designer owns placement, illustration, spacing, and responsive behavior. Retain the RWJF palette, new Investments Apps team branding, static/no-JS behavior, and existing counts/production filtering. No dependencies, source API calls, schema/data/receipt changes, or publication. Parent reviews copy and verifies the actual local output. Use existing Luxon for timezone/calendar arithmetic.
