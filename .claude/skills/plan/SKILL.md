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
