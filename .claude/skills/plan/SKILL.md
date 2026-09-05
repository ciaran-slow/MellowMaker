---
name: plan
description: Write the implementation plan for one MellowMaker GitHub issue and post it on the issue. Use when the user says "use the plan skill", "plan this issue", or gives an issue number to plan before building.
---

# Plan

You are the **plan** stage. A fresh context will build the work and another
will verify it. They will not inherit this conversation, so the issue comment
must contain the complete contract.

## Canonical project

- Repository: `ciaran-slow/MellowMaker`
- URL: `https://github.com/ciaran-slow/MellowMaker.git`
- Product source of truth: `docs/vision.md`

Use the explicit repository on every GitHub CLI command:

```sh
REPO=ciaran-slow/MellowMaker
gh issue view <n> --repo "$REPO" \
  --json number,title,body,labels,comments
```

Never plan against a similarly named repository or assumptions copied from
another project. If working from a local checkout, confirm its `origin` is the
canonical URL before using local source or history.

## 0. Confirm this is a fresh context

Before reading the issue, check whether **this same conversation already ran a
prior stage of this same issue** — an earlier `/plan`, `/build`, or `/verify`
for this issue number, a plan comment this context already posted, an issue
branch it already committed to, or a review it already published. A fresh git
worktree is not a fresh context: the worktree isolates files, only a new
conversation isolates judgment.

If any of those hold, stop and tell the user to start this stage in a fresh
context. If the user directs you to continue anyway, follow
`docs/runbooks/stage-independence.md`: lead the posted plan with an
`Independence: COMPROMISED` line naming the stages that shared the context.

Either way, end the posted plan comment with the `Stage-Provenance` block that
runbook defines (`stage: plan`, the context, and the model — recording
`unverifiable` rather than a guess if the session model was switched at any
point).

## 1. Load the issue and project reality

Read:

1. The complete issue body, acceptance criteria, and comments.
2. All of `docs/vision.md`.
3. Repository instructions such as `AGENTS.md`, if present.
4. Existing architecture, ADR, and contribution docs, if present.
5. `package.json`, the active lockfile, Expo app config, `eas.json`,
   TypeScript/lint/test config, and CI workflows that exist.
6. The source and tests the issue will change or build upon.

The repository may still be early in its setup. Do not invent files,
commands, test frameworks, architectural rules, or conventions that are not
present. When the issue introduces the first convention, make that decision
explicit in the plan.

**If the issue carries the `type: decision` label**, it resolves a product or
architecture decision and produces a recorded decision plus doc edits — not a
feature PR. Follow `docs/runbooks/decision-issues.md` instead of the code-plan
flow below (research and frame the options, escalate the product/compliance
call to the user, then record the approved decision docs-only). The `labels`
field is already in the `gh issue view` call above; read it.

Three points that decide whether the framing is any use, all from that runbook:
**you may add, split, or reject options the issue did not list** — research that
only ranks the given options is the weakest possible framing — provided each
added or split row is marked as yours and names the finding behind it; **end with
the owner's open calls as a numbered list**, one decision per number; and **if the
owner answers you in this same session, post their answers as an owner-decision
comment on the issue before handing off**, because the record stage is required to
refuse to start without one. Write `stage: frame` in the provenance block.

## 2. Check feasibility before prescribing

Ground every planned API and command in the installed versions and repository
configuration. MellowMaker is a TypeScript React Native app using Expo managed
workflow (SDK 52+), EAS, `expo-sqlite`, `expo-video`, NativeWind v4, and React
Native Reanimated.

For the affected area, establish:

- whether the behavior must work offline and what is persisted locally;
- the current SQLite schema and migration/versioning convention;
- navigation, state, styling, animation, and component patterns already used;
- Expo SDK compatibility for any proposed package or native capability;
- iOS and Android differences, permissions, and EAS configuration impact;
- actual package scripts and CI gates;
- related issues, migrations, comments, or decision records that already
  assign work to this issue.

Prefer Expo-supported packages compatible with the installed SDK. A new
dependency, persisted data shape, native permission, or build-profile change
is a real design decision: resolve it in planning and document it using the
repository's existing decision-record convention, if one exists.

## 3. Preserve the vision

Every plan must remain consistent with these product constraints:

- Core patterns, imported guides, progress, counters, and stitch-dictionary
  data are local and usable without a network connection via `expo-sqlite`.
- The app targets both iOS and Android through Expo managed workflow and EAS.
- UI work follows the bright “Playful Craft” system in `docs/vision.md`:
  NativeWind v4, chunky rounded surfaces, clear typography, the specified
  palette, and purposeful Reanimated feedback.
- Video/media playback follows the current media-rendering decision in
  `docs/vision.md` and `docs/architecture.md` (do not assume a specific player;
  a `type: decision` issue may have revised it — treat the docs as authoritative
  rather than any player name remembered here).
- YouTube importing may require a network, but saved guide content and the
  maker's place/progress must remain available offline.

Do not introduce platforms, services, testing assumptions, localization
requirements, or decision-record processes copied from another project unless
this repository has deliberately adopted them.

## 4. Decide rather than defer

Resolve structural choices before posting the plan: exact data shapes,
ownership boundaries, migration behavior, error states, and platform
differences. Ask the user only for a genuine product or destructive-data
choice that the issue, vision, and repository cannot answer.

If acceptance criteria conflict with `docs/vision.md` or current repository
constraints, call out the conflict on the issue instead of handing ambiguity
to the builder.

**An issue's Cause/Scope prose is a hypothesis about mechanism; its acceptance
criteria are the contract.** When the mechanism the issue prescribes would break
one of the issue's *own* criteria, do not implement the prose, and do not stop
for a product call — the criteria already settle it. Pick the mechanism that
satisfies every criterion and record the divergence as an explicit numbered
decision in §7 that quotes the superseded wording, names the criterion a literal
reading would break, and states the rejected alternative and why. #42's issue
said "the input sizes to its line and the container centres it"; taken literally
that left the top and bottom 12px of every field focusing nothing, breaking the
same issue's "tappable height remains >= 48px" criterion, so the plan kept a
48px padded box and said exactly that — the build, the review, and the commit
message all inherited the reasoning instead of re-litigating it, and verify
checked the divergence rather than flagging it. Escalate to the user only when
the criteria conflict with **each other**, with `docs/vision.md`, or with a
repository constraint — not when they merely outrank the issue's own guess at
how to satisfy them.

### 4.1 Diagnosing a defect this environment cannot reproduce

Most bug issues here are reported from the product owner's physical iPhone, and
the plan stage has no device, no simulator runtime, and no Maestro (see
`docs/runbooks/smoke-verification.md`). "Reproduce it first" is not available,
and a plan that shrugs and lists both hypotheses hands the builder the
diagnosis — the one job the plan exists to do.

For **layout, sizing, and viewport** defects, derive the mechanism by
**arithmetic over the committed constants** instead. This is not a guess: every
input is a value in the tree, so the reasoning is reviewable and the builder can
re-check it. The method, as #43 ran it:

1. **Fix the frame from the repository's own fixture, not from a remembered
   device.** #43 used 390 × 844 with a 47pt top inset and 34pt bottom — the
   `SafeAreaProvider` frame `tests/GuideWorkingViewScreen.test.tsx` already
   renders at — so the number is one a test can reproduce.
2. **Enumerate every contributor as a table of `region | height | source`**,
   and make each source a file the reviewer can open: a `tokens.json` value, a
   component's `minHeight`, a class's spacing scale, a component's own
   aspect-ratio maths. No row may be an estimate; if a height genuinely cannot
   be derived, say so and treat the total as a bound, not a value.
3. **Sum it and compare against the frame.** #43's chrome came to 897pt above
   the list on an 844pt screen, which does not merely crowd the list — it places
   it entirely off-screen, and that is why *nothing at all* responded to a swipe
   rather than the list simply being short.
4. **Name a control case already in the codebase** — a screen that shares the
   structure but not the symptom — and run the same arithmetic on it.
   `PatternViewerScreen` has the identical shape minus the video card (639pt,
   leaving ~205pt of list), and it does not freeze. A diagnosis that cannot
   explain why the near-identical screen is fine is not yet a diagnosis.
5. **Say plainly that the number is the evidence and the device is not**, so
   the builder, the reviewer, and the retro all know what was and was not
   observed.

Two rules keep this honest:

- **If the arithmetic does not clear the threshold, the diagnosis failed.** Do
  not round it up, and do not present a near-miss as confirmation. Say the
  hypothesis is unconfirmed and either escalate for an owner-run device probe
  (scripted as issue steps) or plan the structural fix below on its own merits.
- **Prefer a fix that is correct whichever hypothesis holds.** An un-reproduced
  diagnosis can still be wrong, so the plan's value is highest when the fix does
  not depend on it. #43's `flex-1` on the list is the example: it makes the list
  height independent of the header's content, so the freeze is structurally
  impossible rather than merely arithmetically unlikely, at any text size on any
  device — and it would have been the right change even if the 897 had been 850.
  State that property explicitly when a fix has it.

The secondary hypothesis is still owed an answer. #43's §1 said why the WebView
gesture capture is **real but no longer a bug** after the restructure, and why
no `pointerEvents`/responder hack would be added (untestable in Jest, breaks
play/pause) — and then put the residual behaviour in the owner's device script
as "expected, not a defect", step 10. Do not silently drop a hypothesis the
issue raised; convert it into a recorded decision or an observation to confirm.

## 5. Write a buildable one-PR plan

Use this structure:

1. **Outcome and scope** — user-visible result and explicit non-goals.
2. **Current state** — relevant existing files, symbols, and behavior.
3. **Implementation** — ordered changes with exact paths, symbols, data
   shapes, state transitions, errors, and iOS/Android behavior.
4. **Persistence and offline behavior** — schema/migration work, transaction
   boundaries, restart behavior, and network-loss behavior when applicable.
5. **UI and accessibility** — screens/components, loading/empty/error states,
   accessibility labels/roles, touch behavior, motion, and vision tokens.
6. **Tests and verification** — concrete automated cases and an end-to-end
   smoke scenario using commands that actually exist in the repository.
7. **Decisions and risks** — resolved trade-offs, dependency/EAS impact, and
   any decision-record files required by repository convention.

Plans must name exact paths and observable behavior without dictating
incidental implementation details. Keep the issue to one reviewable PR; if
the acceptance criteria cannot fit, propose an explicit issue split instead
of silently dropping scope.

When the plan names a specific display value or directs reuse of an existing
component, confirm the cited data contract/query and the component's props
actually supply it — especially when the same plan freezes that contract as
unchanged. If they do not, either widen the contract in scope or state the
substitute explicitly. Do not hand the builder a presentation detail its own
named source cannot produce.

## 6. Specify falsifiable verification

Use the repository's existing test tools. Do not assume Vitest, Jest,
React Native Testing Library, Maestro, or Detox until configuration proves it.

For each changed contract, name cases that would fail under a plausible bug:

- happy path and user-observable state transition;
- invalid/missing input and dependency failure;
- offline launch or network loss for core and saved content;
- app restart/reopen for persisted counters, progress, or guide data;
- repetition for operations susceptible to duplication or drift;
- SQLite migration from the previous schema with existing user data;
- both iOS and Android behavior where platform APIs or layout differ;
- accessibility state and labels for interactive controls.

Fixtures for ordering, deduplication, boundaries, and migrations must differ
under the wrong implementation. Do not derive boundary fixtures from the
constant they are intended to pin.

**Confirm a contract is assertable in this harness before pinning it, and name
the carrier the value lives in.** NativeWind classes are not resolved into
styles under `jest-expo` (`docs/architecture.md` §14): a `className` arrives as
a raw prop with no `style` produced from it, so `toHaveStyle` can neither see a
class-expressed value nor fail on one — "the input carries no minimum height"
passes vacuously while `min-h-touch` sits on it. Before naming a style
assertion, decide which carrier holds the value — an inline `tokens.*` style,
which `toHaveStyle` pins, or a class, which only an explicit `className` match
pins — and state that choice in the plan. When a load-bearing value is
currently class-expressed, move it to an inline token style as part of the
change rather than specifying an assertion that can never fail. #42's plan
proved this by rendering the component during planning; that check is cheap and
belongs in planning, because a plan that hands the builder an unfalsifiable
assertion produces a green suite over the exact bug it was written to prevent.

The same trap has an end-to-end form. A Maestro `assertNotVisible` whose selector
can never match **passes**, so a flow can report success over the exact defect the
leg exists to catch. `.maestro` flows are written blind here (no JDK, no simulator
runtime), so this is a planning and review problem, not a debugging one: when the
plan names a flow selector, name the **accessible label the element actually
exposes** — `docs/runbooks/smoke-verification.md` §4 — not the title text nested
inside an `accessible` row.

Whenever the plan states a conditional behavioral contract — "X only when Y",
"never W", "does not move/advance/change Z" — name a falsifying test of its
**negative branch** (the not-Y or would-W case), **at the layer where the
condition is actually implemented**, with a concrete expected value pinned by
the fixture rather than derived from the code under test. A category-level test
("we have an out-of-order case") at a different layer does not discharge this: a
guard living in a hook is not covered by a domain-module test that never
exercises the guard. If a stated contract cannot be pinned this way, it is not
yet buildable — resolve it before posting.

A pinned **negative clause is a product decision, not a free assertion**. The
falsifier rules above make a clause *testable*; they do not make it *right*. A
plan that pins a wrong suppression gets it implemented faithfully, tested
faithfully, and shipped: #14 pinned "`undefined` between two identical messages
does not unlock a re-announce", the build implemented and tested exactly that,
every gate went green — and the app silently stopped speaking a validation error
the maker repeats after cancelling. For every "only when", "never", "does not
re-announce / re-fire / advance" clause, name **both** scenarios it stands
between:

- the **scenario it serves** — the concrete maker sequence that goes wrong
  without the clause (who does what, and what they would otherwise see or hear);
- the **scenario it must not break** — the nearest neighbouring sequence that
  reaches the same code and must still produce the suppressed behaviour.

Name a falsifying test for each. If the second scenario cannot be named, the
clause is a guess: drop it and make the behaviour unconditional, or escalate it
to the user as a product call. When the clause makes iOS and Android diverge,
name the scenario on **both** platforms — a suppression that is correct on one
platform and silences the other is a parity defect, not a design.

When the contract is instead that a write is **absolute / a pure function of its
argument** (an idempotent "set", not a toggle or an accumulate), the falsifier
is a **repeated same-value application** — name a test that applies the identical
input twice (or reaches the same target from two different prior states) and
pins the result to the argument, not to prior state. Alternating-value sequences
(true→false→true) do **not** discharge this: a read-modify-write toggle passes
them while diverging on a repeated tap.

When the contract is that a guard **must not be derived from data the maker can
destroy**, the falsifier must include the case that drives the derivation to its
degenerate value — usually "the maker deleted **every** row the derivation
reads". A single-row case never reaches it. #44's plan diagnosed the trap
exactly right in prose: a `MAX(seed_version)` taken over the *seeded rows* goes
`NULL` once a maker deletes them all, and the next launch re-seeds everything. It
then pinned the contract with cases that deleted **one** starter and that bumped
the version — both of which pass under a guard still reading live pattern rows,
because five surviving rows keep the aggregate non-null. The build's own mutation
pass found the hole and closed it with the missing test. The rule: **if the
plan's own reasoning says "once the maker deletes them all", the test that
deletes them all is the falsifier**, and anything milder is a warm-up. The same
shape covers every `MAX`/`MIN`/`COUNT` guard over rows another feature can
remove, and every cache, high-water mark, or "have we done this yet" flag stored
beside the data it describes.

When the contract is a **resource release / teardown / lifecycle** guarantee
("releases the player/subscription on navigating away", "no stale callbacks
after unmount"), the falsifier must assert the release **observably occurred** —
a teardown spy fired, or a live-instance/mount count returned to zero — **not**
that a post-teardown call throws nothing or is a no-op, both of which pass
whether or not the release ran. Name the test at the layer where release is
actually driven: in this app, blur/focus cleanup only fires under a real
navigator, so a release tied to navigation must be pinned by a router-level
test, not a component-in-isolation unmount.

When the plan specifies a **walk-based guard** (the #12 idiom: walk the
source-of-truth directory so a newly added file cannot escape the check), also
specify the **carriers** it must scan, not only the files. The value a guard
hunts for rarely lives in one syntactic form — a Tailwind class appears in a
`className` attribute, in a status/variant map's object literal, in a ternary,
in a shared constant, and on an ancestor element with the text in a separate
literal. #14's contrast guard was framed around `className` attributes and
therefore missed a status-pill class map, which held one of the four failures
the issue existed to fix. State the rule at the widest carrier the value can
occupy ("every string literal in the file"), or enumerate the carriers
explicitly, and name a falsifier fixture **per carrier** rather than one for the
attribute form.

### 6.1 Pre-registering a spike's go/no-go thresholds

A spike exists to produce numbers, and pre-registering its thresholds before any
number exists is what stops the recommendation being fitted to the result. #46
did pre-register all four, which is why the two defects below were visible at all
rather than silently absorbed. Both are planning defects, and both are cheap to
avoid.

**A threshold must name its measurement, not only its number.** "The one-time
`react-native-svg` bundle delta ≤ 150 KB" pins a budget and pins nothing else: it
never said *raw or compressed*, and #46's measured delta was **180,981 B raw**
(missed by ~31 kB) and **65,145 B gzip** (met at 43% of budget). The verdict
flipped on a word the plan never wrote, so the reading had to be chosen with the
answer already on screen — exactly the reverse-fitting the pre-registration
existed to prevent. The build refused to pick and escalated, the owner chose gzip
with a stated reason, and the record says plainly that the reading was post-hoc;
that is the correct recovery, but the plan should never have needed it. Every
registered threshold names, before any number exists:

- the **quantity and its unit** — raw bytes or gzip bytes, minimum fps or mean
  fps, wall-clock minutes or something else;
- **exactly which artifact is measured** — which files, which directory, which
  build output (`_expo/static/js/ios/*`, not "the bundle");
- the **command that produces it**, runnable as written;
- the **comparison direction** and what a miss routes to.

If both readings are genuinely interesting, register **both with their own
budgets**, or register one as the criterion and say the other is reported as
context. What is not allowed is one number with two possible units.

**Do not register a threshold nobody in the pipeline can honestly measure.**
#46's threshold (3) was "median authoring time ≤ 30 minutes per step", and plan
§6.8 asked the **build agent** to log wall-clock minutes per step. The build kept
no clock, correctly declined to fabricate one, and argued that an agent's
wall-clock does not predict a human's anyway; the owner then retired the
threshold outright, on the grounds that paths are authored by agents in practice
so a human authoring clock never described the real cost. The threshold was
unmeasurable from the day it was written. Before registering one, name **which
stage measures it with which command**:

- a stage-run agent has **no human authoring clock**, no device frame counter, no
  simulator, and no Maestro (`docs/runbooks/smoke-verification.md` §1);
- a measurement whose only answer is "the owner, on the phone" is an **owner-run
  measurement**: register it with its exact steps and threshold so it lands in
  the deferred-smokes entry, not as a build deliverable;
- if no stage and no owner run can produce it, **delete the threshold** rather
  than shipping a criterion that can only be fabricated or retired.

Self-effort estimates are the recurring case here. An agent asked to time its own
work either invents a number or reports one that predicts nothing about the human
cost the threshold was written to bound; neither is evidence. Estimate authoring
or rollout cost from an artifact instead — bytes of authored source per stitch,
count of distinct path strings, diff size — which a later stage can re-measure.

## 7. Post and confirm

Write the plan to a temporary file, compare it once against every acceptance
criterion and `docs/vision.md`, then post it:

```sh
gh issue comment <n> --repo "$REPO" --body-file <plan-file>
gh issue view <n> --repo "$REPO" --comments
```

Confirm the full plan appears on the issue. Then stop: do not build in the
planning context. Tell the user to start the build skill in a fresh context.

This is the first stage of the per-issue workflow: **plan → build → verify →
retro**. Every issue runs all four stages, each in its own fresh context.
