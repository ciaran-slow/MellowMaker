# Runbook — `type: decision` issues

Most MellowMaker issues produce a feature PR: code, tests, a smoke flow. Issues
labelled **`type: decision`** are different. They resolve an open product or
architecture decision (for example a PRD0 §13 decision) and produce a **recorded
decision plus documentation edits** — often no code at all. The plan/build/verify
skills are written for the feature-PR shape; this runbook is the shape to follow
instead when the `type: decision` label is present.

The workflow is still `plan → build → verify → retro`, but the first two stages
change role:

| Normal stage | Decision-issue role |
|---|---|
| plan | **Frame** — research options, recommend, do not decide |
| _(human)_ | **Escalate** — the product owner makes the call |
| build | **Record** — write the approved decision into the docs, docs-only |
| verify | **Adapted verify** — check the record, not code |
| retro | same |

## 1. Frame (in place of plan)

Research the real constraints and options with **cited sources** (official SDK
docs, provider terms of service, specs). Then post a decision-framing comment on
the issue that:

- states the problem and the hard constraints (compliance, offline-first, "no
  client secret", etc.);
- resolves the clear-cut, mechanical sub-parts directly (e.g. supported URL
  forms, keyless-vs-keyed API) with a recommendation;
- lays out the genuinely open choice as **explicit options with trade-offs**,
  each assessed against the vision, compliance, and both platforms, with one
  recommended — but **does not decide** anything that is a product/vision/
  compliance call;
- includes an acceptance-criterion checklist showing how each will be met.

Issue #8's framing comment is the worked example to imitate: an options table, a
starred recommendation, an explicit "this is a product-owner call, left
unresolved," an AC checklist, and a full sources list. **Do the research legwork
so the human's job is a clean choice — never pre-empt their authority.**

## 2. Escalate (the key judgment)

**Stop and ask the user** when the decision:

- revises `docs/vision.md` or `docs/prd0.md`;
- carries compliance, legal, or privacy weight;
- changes a user-visible product commitment; or
- is otherwise a genuine product choice the issue, vision, PRD, and repo cannot
  answer on their own.

**Decide autonomously** for mechanical or clear-cut sub-parts the docs and
research fully determine (URL shapes, key-free vs keyed API, an obviously
non-compliant option). When in doubt, frame it and escalate — the cost of asking
is low; the cost of silently revising the product vision is high.

## 3. Record (in place of build)

Write the **approved** decision into the docs. This is a **docs-only** change:

- Edit only the docs that the decision changes — typically `docs/vision.md`,
  `docs/prd0.md` (mark the resolved §13 decisions struck-through, as decisions
  1/3 were), and `docs/architecture.md` (record the resolved decision in its
  existing decision-record convention; do not invent a separate ADR system).
- **Add no code and no dependencies.** If the decision implies new packages,
  record them as *intended for the implementing issue* (e.g. "#11 will add
  `react-native-webview`"), do not install them.
- Do **not** re-open or re-litigate the approved decision — record it as decided.
- Reconcile the change across the **whole** of each doc: grep the revised term
  across every section (including pre-existing tables and lists you did not
  primarily edit) so no stale statement survives.

Gates for a docs-only record: `npm run lint`, `npm run typecheck`, and
`npm run test:ci` all green, **plus** `package.json`/`package-lock.json`
byte-identical to `main` (proves no deps crept in), **plus** cross-doc
consistency. There is no new code contract, so do not invent a test, and no
Maestro/smoke row is needed — state both facts honestly in the PR body.

## 4. Adapted verify

Verify checks the record, not code. Drop the mutation self-check and on-device
smoke (nothing to mutate or run) and substitute:

- every acceptance criterion satisfied with cited doc evidence;
- cross-doc consistency (grep the revised term across all docs — no leftover
  stale statement; resolved-decision markers consistent);
- `package.json`/`package-lock.json` byte-identical to `main`;
- lint/typecheck/`test:ci` green;
- no new code contract, so no test-debt entry is warranted.

Post the usual binary verdict as a PR review.

## 5. What made #8 work (preserve)

Keep the compliance/vision decision in human hands while automating every
mechanical sub-decision; keep the record faithfully scoped (docs-only, no deps,
decision not re-opened); let verify flex to the issue shape. This runbook exists
to reproduce that, not to add ceremony — a `type: decision` issue that is small
and unambiguous still just frames, gets a quick human yes, and records.
