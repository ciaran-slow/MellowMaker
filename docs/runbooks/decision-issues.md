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
| _(human)_ | **Escalate** — the product owner makes the call, and it is **posted on the issue before the record starts** (§2) |
| build | **Record** — write the approved decision into the docs, docs-only |
| verify | **Adapted verify** — check the record, not code |
| retro | same |

Each of frame, record, and adapted verify is a workflow stage and posts a
stage-provenance block; see `docs/runbooks/stage-independence.md` §4 for the
`frame`/`record` stage names and for why the owner-decision comment of §2 does
**not** carry one.

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

### The frame stage may reshape the option list — and must mark what it changed

The options listed in the issue body were written before the research. A framing
that can only rank the options it was given is worth little: the most valuable
thing this stage produces is often an option the issue never considered, or a
finding that the mechanism the issue proposed does not work. **Adding, splitting,
or rejecting options is in scope. Silently renumbering them is not** — the owner
must be able to see which options came from the issue and which came from the
research, or they cannot tell what they are being asked to approve.

Rules for a reshaped list:

- **Keep the issue's numbering as the spine.** Split an issue option into `1a` /
  `1b` rather than inventing a `5`, so every row still traces to the issue text.
- **Mark every added or split row** and name the finding that motivated it, in
  the row itself — not only in prose above the table.
- **Say plainly when research contradicts a mechanism the issue proposed.** A
  framing that quietly drops the issue's own suggested heuristic reads as an
  oversight; one that states the contradiction and cites its evidence is a
  finding, and it is usually the load-bearing one.
- **Reject an option outright only when it is mechanically barred** by a recorded
  constraint (a credential in the client bundle, a scraped endpoint), and show the
  mechanism. Anything rejected on product taste is an owner call, not yours.

Worked example — issue #45. The issue proposed pasting the **transcript** panel,
with "one step per transcript block" as the suggested heuristic. The research
found caption cues run 2–6 seconds (300–600 per tutorial, so that heuristic
yields hundreds of fragments, worse than the empty list it replaces), and that
the transcript panel does not exist in the YouTube **mobile** app at all. So the
framing split option 1 into `1a` (transcript, kept as the fallback) and **`1b`
(description chapter list — added by the framing, from Finding 2)**, which is
creator-authored, floored at 10 seconds by YouTube's own chapter rules, and
copyable on the platform the app actually ships on. Option 3 was split into
`3a`/`3b`/`3c` with `3a` rejected mechanically. **The option the owner adopted as
primary was the one the issue did not list.**

### Number the owner's questions

End the framing with the unresolved calls as a **numbered list**, one decision per
number, each with its recommendation. The owner can then answer "1 yes, 2 as
recommended, 3 notes-only", and the escalation record of §2 writes itself. An
unnumbered wall of prose forces the owner to compose the structure themselves and
makes it impossible to tell afterwards which points were actually approved.

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

### The decision must exist on the issue before the record stage starts

The escalation happens in a chat session, which is not an artifact anyone can
read afterwards. On #45 the owner approved every starred recommendation in chat
and the record PR merged with that approval asserted **only in the PR body** — the
issue itself carried nothing but the framing comment. Verify caught it and
correctly rated it non-blocking, but for the length of that cycle the audit trail
for *which* choices were approved rested on the record stage's own claim about a
conversation nobody else could inspect. A record stage that misread the chat, or a
decision the owner later remembered differently, would leave no evidence either
way. The orchestrator posted a decision comment afterwards; this gate makes that
comment routine, and prior to the record rather than a repair after it.

**Gate: an owner-decision comment must be posted on the issue before the record
stage begins.** It is a precondition of the record, not a formality after it.

- **Who posts it:** whoever conducted the escalation. If the owner answered inside
  the framing session, the frame stage posts it before handing off. If the owner
  answered in a separate or orchestrating session, **that session posts it**. The
  record stage must never be the author of the evidence that authorizes it.
- **What it says:** one line per numbered question from §1, each carrying the
  owner's actual answer — not a paraphrase that upgrades a hedge into a yes —
  plus who decided, the date, and where ("decided 2026-09-04 in the orchestrating
  chat session, relayed here"). Mark it as a relay when it is one. Where an answer
  is simply the framing's starred recommendation, say so explicitly.
- **What it is not:** an **owner artifact, not a workflow stage**, so it carries
  **no** stage-provenance block (`docs/runbooks/stage-independence.md` §4).
- **If it is missing, the record stage stops.** Do not begin the docs edit, and do
  not infer the decision from the framing's recommendations however confident the
  handoff prompt sounds. Ask for the comment — or post it yourself if you ran the
  escalation and the owner's answers are in *your* session. The record's PR body
  then links that comment by URL as its authorization.

**A gate written into a non-decision issue's own body works the same way.** #63
was a plain `enhancement` whose body carried an "Owner gate" section reading
"This is not yet approved for build". The plan stage refused to plan past it,
which was correct — and reported the refusal only in the orchestrating chat, so
the issue itself held no record of it. The `plan` skill (§1, "An owner gate in the
issue body stops the plan") now requires that stop to be posted on the issue, for
exactly the reason this section requires the owner-decision comment: a stop, like
an approval, that exists only in a chat session is not evidence anyone can read.

## 3. Record (in place of build)

Write the **approved** decision into the docs. **Cite the §2 owner-decision
comment by URL in the PR body as this stage's authorization**, and record only
what that comment answered — a point the owner did not answer is not recorded, it
goes back to them.

**Branch from a freshly fetched `origin/main`, not from whatever the worktree
already has.** A decision-issue worktree is often created early and then sits idle
through the framing research and the escalation, so its refs are stale by the time
the record starts:

```sh
git fetch origin main
git checkout -b issue-<n>-<short-slug> origin/main
```

#52 branched from `7705827` moments before #49 merged, so its first diff showed
#49's changes **inverted**; the branch had to be rebased mid-record and every gate
re-run. A stale base is worse here than in a feature build, because two of this
stage's gates are *comparisons against `main`* — `git diff origin/main --
package.json` and the cross-doc consistency grep both silently measure against the
wrong tree. Re-run `git fetch origin main` before the final gate pass; if `main`
moved, rebase and run the gates again. A green gate over a stale base proves
nothing.

This is a **docs-only** change:

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
- **Carry findings into the issues this decision blocks.** A decision commonly
  surfaces a concrete design input for a downstream issue (a URL form the parser
  must handle, a spike a playback issue must run, a constraint an importer must
  honor). Those findings otherwise live only in this PR's review, which the
  downstream builder will not read. Post each as a comment on the specific
  blocked issue, naming the exact input, and note the back-reference in the PR
  body. Example (issue #8 → #9): "URL parser must also accept legacy
  `youtube.com/v/ID` and `youtube-nocookie.com/embed/ID`, which the §9.1 matrix
  omitted." (For findings that are coverage gaps rather than design inputs, use
  `docs/runbooks/test-debt.md` instead.)

Gates for a docs-only record: `npm run lint`, `npm run typecheck`, and
`npm run test:ci` all green, **plus** `package.json`/`package-lock.json`
byte-identical to the **freshly fetched** `origin/main` (proves no deps crept in),
**plus** cross-doc consistency. There is no new code contract, so do not invent a test, and no
Maestro/smoke row is needed — state both facts honestly in the PR body.

## 4. Adapted verify

Verify checks the record, not code. Drop the mutation self-check and on-device
smoke (nothing to mutate or run) and substitute:

- **the §2 owner-decision comment exists on the issue and predates the record's
  first commit** — compare the comment timestamp against `git log` on the branch.
  An approval that exists only in the PR body is a **blocker**: the record stage
  would be its own authorization. (A comment posted *after* the record, to repair
  a missed gate, is not a blocker, but say it was retro-fitted and give both
  timestamps.)
- **every recorded point traces to an answer in that comment** — a doc statement
  the owner never approved is a blocker even when it matches the framing's own
  starred recommendation;
- every acceptance criterion satisfied with cited doc evidence;
- cross-doc consistency (grep the revised term across all docs — no leftover
  stale statement; resolved-decision markers consistent). Include the sections the
  decision now contradicts but did **not** edit: prose written before the decision
  can go stale without ever appearing in the diff, and the record stage's own grep
  is scoped to the terms it knows it changed. #45's verify found exactly this in
  architecture §9 responsibility 2 and it is fixed by this retro;
- `package.json`/`package-lock.json` byte-identical to `main`;
- lint/typecheck/`test:ci` green;
- each design finding for a blocked issue was carried to that issue as a comment
  (an un-routed finding that only lives in this PR is a follow-up finding);
- no new code contract, so no test-debt entry is warranted.

Post the usual binary verdict as a PR review.

## 5. What made #8 and #45 work (preserve)

Keep the compliance/vision decision in human hands while automating every
mechanical sub-decision; keep the record faithfully scoped (docs-only, no deps,
decision not re-opened); let verify flex to the issue shape. This runbook exists
to reproduce that, not to add ceremony — a `type: decision` issue that is small
and unambiguous still just frames, gets a quick human yes, and records.

#45 added three habits worth keeping. **Research that changes the question, not
just the answer**: the finding that caption cues are 2–6-second fragments, and
that the transcript panel is absent from the YouTube mobile app, moved the whole
decision onto an option the issue never listed — framing is research, not a
survey of the issue body. **A record that states what it did not do**: #52's PR
body said outright that there was no test, no mutation self-check, and no smoke
row, and why, instead of inventing ceremony to look thorough. **Findings routed to
the issue that needs them**: the two contract gaps (`addGuideStep` hard-codes
`origin: 'user'`; `normalizeYoutubeUrl`'s `startSeconds` is dropped on the floor)
were posted on #50, where the builder will actually read them, rather than being
left in a merged PR body.
