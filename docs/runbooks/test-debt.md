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
