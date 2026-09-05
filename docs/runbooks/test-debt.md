# Runbook — Carried-forward test-coverage debt

When the verify stage rates a coverage gap as a **non-blocking follow-up** — a
missing test that does not block the current merge but leaves a real contract
under-covered — that finding must be recorded here rather than left in a PR
review that disappears from view once the PR merges. Otherwise the same gap is
rediscovered and re-litigated every time the code path is touched.

This is the coverage-debt analogue of `smoke-verification.md`'s deferred-smoke
table. It is intentionally *not* for blockers: a blocker keeps a PR from
merging and is fixed in that PR. This ledger is for gaps that are acceptable to
carry but should be tracked to closure.

## Adding a row

The verify stage appends a row whenever it accepts a coverage gap as a
non-blocking follow-up (see `.claude/skills/verify/SKILL.md` §6). Include the
issue/PR where it surfaced, the exact contract left uncovered, and the file
that would hold the test.

## Clearing a row

Close a row by adding the missing test (in its own change or folded into a
later issue that touches the path), then mark it Done with the PR that closed
it — or delete the row once that PR records it. A planned issue that will
naturally cover the path should reference the relevant open rows.

## Open test-coverage debt

| First seen | Also hit by | Uncovered contract | Where a test belongs | Status |
|---|---|---|---|---|
| #5 (PR #23) | #7 (PR #27) | `CraftConfirmDialog`'s Android hardware-back (`BackHandler` / `hardwareBackPress`) cancel path has no automated coverage anywhere in the repo; the confirmed-reset and confirmed-delete flows both rely on it | `tests/` — a `CraftConfirmDialog` (or dialog-hosting screen) test that simulates `hardwareBackPress` and asserts the dialog cancels without performing the destructive action | Open |
| #13 (PR #39) | — | AC5/NFR-12 logging hygiene is proven only as a proxy: `tests/loggingHygiene.test.ts` asserts no `console.*` in `src/`, but cannot prove a *future* code/context-only logging seam excludes maker content (pattern text, notes, transcript excerpts) from its payload — no such seam exists yet to test against | `tests/` — when a diagnostic-logging seam is introduced, a contract test asserting the seam's log payload never contains injected maker-content fields (pattern text, notes, transcript excerpts) | Open |
| #14 (PR #41) | — | `tests/accessibilityContrast.test.ts` does not see a token background carried on a **non-`CraftPressable` ancestor** paired with text in a **separate string literal**; the pairing rules cover same-literal classes and `CraftPressable` spans only (verify probe: `text-surface` on the white step card — white on white — passed 9/9) | `tests/accessibilityContrast.test.ts` — an ancestor-background span rule, or nearest-ancestor background resolution | Open |
| #14 (PR #41) | — | iOS `useAnnouncement` wiring is untested on `DictionaryScreen`, `StitchDetailScreen`, `PatternsScreen`, `GuidesScreen`, `PatternEditorScreen`, `GuideEditorScreen`, `GuideVideoPlayer`, `DatabaseGate`; typecheck constrains the constants but a wrong hook condition is silent with no test failing (the import screen was proven by an uncommitted review probe) | one `announceForAccessibility` case per surface in that surface's existing suite — the committed `PatternViewerScreen`/`GuideWorkingViewScreen` iOS cases are the template | Open |
| #43 (PR #49) | — | Every #43 test asserted chrome *containment* via `within(list)` but nothing pinned the header's **order** — title → progress → video → counter → steps — which is the whole substance of the recorded UX-06 trade-off ("+" reachable with one flick and without scrolling past the video). A reorder putting the counter above the video, or a header passed as `ListFooterComponent`, passed all seven new cases and the router case | `tests/GuideWorkingViewScreen.test.tsx`, "one scroll surface (issue #43)" block — a relative-position assertion over the walked subtree | **Done** — closed by the #43 retro PR, which added "keeps the chrome in order" and confirmed it goes red (and only it) under a video/counter swap |
| #42 (PR #48) | — | `tests/CraftTextField.test.tsx` T1 did not assert the **single-line** surface keeps `items-center`. The single-line input's own padded box already fills the 48px, so `items-center` is not load-bearing for the text — but it is what centres the leading icon and the clear control against the input, and switching the surface to `items-start` left all eight tests green | `tests/CraftTextField.test.tsx` T1 — a `className` match on the surface, beside the existing `toHaveStyle({ minHeight: 48 })` | **Done** — closed by the #42 retro PR, which added the assertion and confirmed it goes red (and only it) under an `items-start` mutation |
| #46 (PR #55) | — | A future component that renders stroked SVG art **without going through `StitchStepAnimation`**, with its colour **imported from another module**, is seen by neither guard: the file-level raw-hex walk never arms (an import carries no hex into the file that strokes with it) and the literal-palette pin reads only `StitchStepAnimation`'s own rendered output | `tests/accessibilityContrast.test.ts` — a walk asserting every `stroke=`/`fill=` value in `src/` resolves to `STROKE_COLOR[…]`, `tokens.colors.*`, or `"none"` | **Done** — closed by the #46 retro PR, which added "resolves every stroke and fill in src/ through the measured palette" plus its non-tautology, and confirmed it is the only test red under exactly that probe (a `.ts` sibling exporting `#FFD166`, imported onto a `<Path stroke={…}>` in a new `.tsx`); both pre-existing rules stayed green, so the gap was real |
| #46 (PR #55) | — | Verify's first review found two gaps in the same PR — the per-step stagger (`stepIndex × tokens.motion.stepStaggerMs`, with every delay forced to `0` leaving all suites green) and the drawing rendering **below** its instruction sentence | `tests/StitchStepAnimation.test.tsx` and `tests/StitchDetailScreen.test.tsx` | **Done — closed in-cycle**, not carried: the build's fix run added both tests, and the re-verify's probes A and B turned each red. Recorded here so the ledger shows they were closed rather than dropped |
| #44 (PR #54) | — | Plan §6 states the whole seed release is one transaction and that a mid-loop failure leaves no partial pattern; no committed test pinned it. Verify confirmed the behaviour with a scratch probe (record 3 given a `NULL` title after two complete records) that was discarded with its review worktree | `tests/patternSeedLoader.test.ts` — a mid-loop failure case asserting `pattern`, `pattern_step`, and `pattern_seed_state` all roll back, the applied version stays `undefined`, and a retry seeds the full set | **Done** — closed by the #44 retro PR, which added "rolls the whole release back when a record fails part-way through" and confirmed it is the only test red when the `transaction(...)` wrapper is removed from `insertSeededPatterns` |
