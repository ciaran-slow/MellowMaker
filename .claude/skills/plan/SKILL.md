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

### An owner gate in the issue body stops the plan — on the issue, not in chat

Some issues carry their own gate. #63's body had an **Owner gate** section
reading "This is not yet approved for build", naming the device evidence that
would open it. The first plan attempt read that section and refused to plan past
it. **That judgement is right and must not be softened**: a plan written past a
gate hands the owner a fait accompli, and #63's gate was in the end opened on a
*different* basis than the one the issue had named.

What went wrong is where the refusal landed. It was reported in the orchestrating
chat session, so the issue recorded nothing — no trace that a plan stage had
started, what it read, or what the gate was waiting on. A later reader sees an
unplanned issue and cannot tell it from one nobody has picked up.

**Post the stop as a comment on the issue before you stop.** One short comment:
the gate's own wording quoted, the plain statement that **no plan was written**,
what must happen for the gate to open (who decides, on what evidence, and where
that evidence lands), and the `Stage-Provenance` block with `stage: plan`. Do not
write a partial plan, a recommendation, or an argument for opening the gate —
that is the escalation the gate exists to compel and it belongs to the owner.
`docs/runbooks/decision-issues.md` §2's rule applies here in the same shape: a
stage must never author the evidence that authorizes it. Then tell the user the
gate is closed and stop.

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

### 4.2 Prescribing a schema change: run the probe, do not read the docs

A migration plan must contain an **executed probe** of its own statements
against the harness engine, and paste the results in as evidence. Not a citation
of SQLite's documentation, not "this should be safe" — the measured table. #67
is the case that fixes this rule: both of its load-bearing findings came from
running the rebuild during planning, and both would have been missed by a plan
that read the documentation carefully.

- The issue prescribed `CHECK (trim(instruction) <> '')`. Measured, SQLite's
  one-argument `trim(X)` strips **only U+0020**, so that predicate accepts a
  tab-only, newline-only, or NBSP-only instruction — a floor strictly weaker
  than `String.prototype.trim()`, in the one place the defect actually lives
  (text pasted out of a web page). The documentation says this; nobody notices
  until a row prints `accepts`.
- The rebuild had to run with `PRAGMA foreign_keys = OFF`. With enforcement on,
  `DROP TABLE` performs an implicit `DELETE` that fires `ON DELETE` actions:
  measured on a populated database, the rebuild **emptied** the maker's progress
  table, nulled the active-step pointer, **committed**, set `user_version`, and
  reported success. Nothing was raised. A plan that had only reasoned about it
  would have described the pragma as best practice rather than as the difference
  between a working migration and silent data destruction.

The reusable shape is recorded as `docs/architecture.md` §7 rule 10 and is the
same every time: migrate a `tests/support/sqliteHarness.ts` connection to the
**previous** version with `MIGRATIONS.filter(...)`, populate it with
`insertPopulatedBaseline` (never an empty database — an empty database cannot
show a cascade fire), run the candidate statements, and record before/after row
counts and column values for **every referencing table**.

Two steps are named rather than left to judgement:

- **The destructive-cascade check.** For each table the change `DROP`s or
  rewrites, list what references it and with what `ON DELETE` action, then run
  the change **twice** — once with `PRAGMA foreign_keys = ON`, once with it
  `OFF` — and put both columns in the plan. A probe that only asks "did it
  throw?" reports a clean pass over the destruction above.
- **The rejected alternative is probed too**, and recorded by its measured
  failure rather than by a reason it would not work. `PRAGMA defer_foreign_keys
  = ON` is the tempting one here — it can be set inside a transaction, which
  would avoid touching the runner at all — and the progress rows still go to
  zero, because it defers violation *checking*, not the *actions*.

Where the change is a predicate, sweep its **inputs** rather than its examples:
one row per candidate value against the issue's predicate and the chosen one,
including values that must stay **accepted**, so the plan shows the predicate is
not a reject-all. If a probe cannot be run at all, say so and mark the claim
unverified — the same honesty §4.1 demands of an un-reproduced diagnosis.

### 4.3 A mechanism that depends on one event seeing another's result

#63 restored the pattern viewer's open-at-current-step with a `scrollToIndex`
driven by the step list's `onContentSizeChange`. The plan read the JS consumer
properly — `VirtualizedList.js` and `ListMetricsAggregator.js`, quoted by line —
and derived that an unmeasured index fails softly and "waits for the next
content-size change, which the list itself provokes". Every line of that was
true. What none of those files states is **when `onContentSizeChange` fires
relative to the cell layouts it is being asked to read**, and the answer inverted
the design: `onContentSizeChange` is the JS `onLayout` of the ScrollView's
*content container* (`ScrollView.js` `_handleContentOnLayout`), Fabric emits
`onLayout` in **pre-order**
(`node_modules/react-native/ReactCommon/react/renderer/components/view/YogaLayoutableShadowNode.cpp`,
`ShadowTree.cpp`'s `emitLayoutEvents`, `BaseViewEventEmitter.cpp`), and the
content container is the parent of every cell — so the handler always read the
*previous* fill batch. A pattern of ten steps or fewer, which is every bundled
starter, never restored at all. Verify derived it from those same files; the fix
was one line and cost a whole review cycle.

Four rules make that cheap next time:

- **The JS consumer proves the seam exists; only the emitter proves when it
  fires.** Whenever a planned mechanism reads state that a *different* event
  writes, cite the **emitter's** source, not only the consumer's. For layout and
  touch in this app the emitter is native Fabric under
  `node_modules/react-native/ReactCommon/**` — installed, greppable, and readable
  by the plan stage exactly as the JS is.
- **Write the ordering claim as one falsifiable sentence** — "the content
  container's `onLayout` reaches JS before its cells', because …" — so a reviewer
  checks it against the file instead of re-deriving the whole design. A mechanism
  whose ordering sentence cannot be written is not yet planned.
- **Name a test that fires the events in the emitter's order**, per §6. A harness
  lets a test choose any order it likes, so a case that fires only the seam the
  mechanism listens to encodes the assumption rather than checking it.
- **Say which properties depend on the ordering and which do not.** #63's safety
  half — an unmeasured index cannot land anywhere wrong — came through the finding
  untouched, because it rests on `VirtualizedList`'s own branch and on no ordering
  at all. That separation is what made a wrong ordering a degradation instead of a
  defect, and it is worth stating deliberately rather than discovering afterwards.

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

### 5.1 Any new screen on a persisted-data route: the mounted-tab checklist

**Every route in this app is a flat, hidden (`href: null`) bottom-tab screen with
no nested Stack and no `unmountOnBlur`, so a screen the maker has visited once
stays mounted for the rest of the session.** A mount-time read therefore runs
*once, ever*. This repository has now learned that three times — #11 (the guide
WebView stayed alive after blur), #43 (the working view needed a `useFocusEffect`
reload), and #51 (the save-as-pattern review showed the previous visit's draft and
would have written it) — and each time it was found after the build, twice by
verify. It is cheaper to write into the plan.

So when a plan adds **any** screen that shows, or derives anything from,
persisted data — a list, a single aggregate, or a draft seeded from a row — state
all three of these explicitly, each with the file that will carry it:

1. **Re-read on focus.** `useFocusEffect` paired with the hook's **stable**
   `refresh`/`reload`, exactly as `GuidesScreen`, `PatternsScreen`,
   `GuideWorkingViewScreen`, `PatternViewerScreen`, and
   `SaveGuideAsPatternScreen` do. The dependency array is `[refresh]` and nothing
   else: it must not carry the state or the view model, or each read re-arms the
   effect and the screen reads in a loop (`docs/architecture.md` §10).
2. **Reset local drafts on the loaded data's identity, not on the focus event.**
   The re-read resolves a microtask *after* focus, so a focus-time reset re-seeds
   from the stale value. Say which way the product call goes for each seeded
   field — reset to what the data now says, or preserve the maker's in-progress
   edit — and name the falsifier for **both** directions, because the identity
   comparison decides both.
3. **Prove the revisit on the real router.** Name a `renderRouter` case that
   visits the screen, leaves, changes the underlying row, returns, and asserts
   the screen shows the **new** value — and, where the screen writes, that
   confirming writes the new value. An isolated screen suite cannot discharge
   this: it mounts once and mocks `useFocusEffect` as a capture, so the staleness
   is invisible there by construction.

Skipping any of the three is a plan defect, not a build detail: none of them is
reachable by inspecting the diff, and no mutation of the shipped code finds them
(see the build skill's note on missing mechanisms).

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

**Trace every negative fixture to the branch it claims to exercise, and name
that branch in the plan.** A fixture written to pin a *narrowing* rule — "this
input must **not** be read as X" — proves nothing unless the input actually
reaches the code that would read it as X. #50's plan pinned D2 ("only
colon-separated time codes are recognized as a line-leading timestamp, so a
description line reading `6 double crochets` stays prose") with the fixture
`"Chain 6 stitches\nThen turn"`. The recognizer is **line-leading**, and neither
of those lines starts with a digit, so the fixture never reached the colon-only
rule at all: it was rejected as `no-timestamps` for an entirely unrelated reason
and would have been rejected identically under any recognizer whatsoever. The
build widened the regex to accept bare seconds and every suite stayed green,
while a real description line reading `6 double crochets` would have become a
step at 0:06. The build's mutation pass caught it and strengthened the fixture to
lead with the number; the plan is where it was cheap to catch.

So for each negative fixture, write **the branch it must reach and the wrong
output it produces once that branch is removed** — "this input reaches the
line-leading recognizer, and without the colon-only rule it yields a step at
0:06". If you cannot name the wrong output, the fixture is approaching the guard
from outside and some earlier rule rejects it first; choose an input that gets
past that earlier rule. This is the negative-space twin of "do not derive a
boundary fixture from the constant it pins": that rule stops a fixture being
unfalsifiable by construction, this one stops it being unfalsifiable by never
arriving.

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

**A harness that never emits the second event cannot fail on the ordering between
them.** That trap has an ordering twin. #63's seven planned cases each fired
`contentSizeChange` on the step list and asserted what the hook did with it; RNTL
fires **no** cell `onLayout` at all, so `getHighestMeasuredCellIndex()` was `0` in
every one of them and all seven were equally green under the mechanism that worked
and the mechanism that missed every pattern of ten steps or fewer. The cases that
could tell the two apart had to synthesise the cell layout events by hand, in the
emitter's order — content size, then the cells, then the deferred attempt — and
assert the offset that came out. So when a planned mechanism reads state some
other event writes (§4.3), name a case that **writes that state through the same
code path, in the emitter's order**, and say plainly what the cases that do not
are still worth: they pin the intent — right index, right moment, right number of
times — and nothing whatever about the ordering.

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

When the plan adds an **opt-in capability to a shared runner** — a new optional
field on a migration, a flag on a transaction helper, a mode on a repository
context — name a falsifier for the **opting-out** half as well as the opting-in
half. The expression `migration.foreignKeys === 'off'` decides two contracts:
*does the flagged migration run with enforcement off* (which is the acceptance
criterion, so it gets a test) and *does an unflagged migration keep enforcement
on for its own statements and skip the whole-database check* (which the plan
states as a consequence, so it gets none). #67's plan described the second
precisely and pinned only the first; widening the condition to a constant `true`
left all 744 tests green, and every fresh install would have run migrations 1
and 2 with foreign keys disabled while paying a full `foreign_key_check` scan on
each. The build's mutation pass caught it and shipped the two cases as a second
commit — the plan is where it was cheap. So for every optional capability, write
the case that exercises the runner with the option **absent**, asserting what it
does *not* do (which pragmas it issues, which work it skips), at the layer that
decides it. The same shape covers a default-off feature flag, an opt-in cache,
and any "callers who do not ask for X are unaffected" claim.

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
