# Runbook — Smoke verification and headless deferral

Both the `build` and `verify` stages mandate a smoke launch of the changed path
on a real target (simulator, device, or the repository's Maestro/e2e flow). Many
stage runs happen in a **headless environment** with no booted simulator, no
`APP_ID`, and no installed app build, so that smoke cannot run there. This
runbook defines what to do in that case so the gap is handled consistently and,
critically, **tracked** rather than re-improvised and forgotten each PR.

## 1. Establish whether an on-device smoke is possible

Before claiming or deferring the smoke, check for a booted target:

```sh
xcrun simctl list devices booted    # iOS: is any simulator booted?
```

If a booted simulator (or device/e2e target) and an installed build with an
`APP_ID` are available, run the repository's smoke flow for the changed path and
report it normally, for example:

```sh
npm run test:smoke:patterns         # or the relevant .maestro/<flow>.yaml script
```

Do not claim a platform or flow was exercised when it was not run.

### Environment facts for this machine (as of #14, 2026-09-03)

Re-established from scratch each cycle so far; recorded here so a stage stops
re-discovering them. Re-check rather than assume — an SDK or runtime can be
installed at any time — but expect these:

- **No Android SDK and no `adb` on `PATH`.** No Android emulator or device can
  be reached, so every Android smoke and TalkBack pass is deferred (currently to
  #16).
- **Maestro cannot launch at all: no Java runtime is installed.** This is the
  binding constraint — *no* `test:smoke:*` script can run on this machine,
  regardless of platform, because they all shell out to `maestro`. Do not report
  a Maestro flow as "not run because no simulator"; it is not runnable at all.
- **No iOS simulator runtimes are installed**, so `xcrun simctl list devices
  booted` is empty and cannot be made non-empty by booting one.
- **The only device surface is a physical iPhone (iOS 26.6.1) running Expo Go
  57.0.9**, reachable with `npx expo start --clear` because the project has no
  custom native code. A build stage cannot drive it, and cannot operate
  VoiceOver/Dynamic Type on it; those passes are **product-owner-run**, scripted
  as an issue comment (see #14's "iOS VoiceOver pass — product-owner run"), or
  deferred to #16 by an explicit owner decision and logged in the per-issue file
  described in §2.1 and §3.
- A flow needing a **new native module** additionally needs a fresh dev/EAS
  build, which the physical-device Expo Go surface cannot supply (see the #11
  row).

## 2. When the smoke cannot run headlessly

The automated Jest/integration/router suites (which run the real SQLite
migrations, repositories, and expo-router) are the **accepted proxy for logic
and navigation wiring**. They are *not* a substitute for on-device behavior.

Treat these acceptance-criterion wordings as **only provisionally met** when the
smoke is deferred, because the proxy cannot exercise them:

- app **restart / relaunch** persistence ("after app restart", "reopen");
- Android **hardware back** behavior;
- real **gestures**, scroll/virtualization on a device, and safe-area/keyboard
  layout;
- anything whose contract is a native/platform surface rather than JS logic.

Required disclosure wording (use in the PR body for build, and in the review for
verify):

> On-device/Maestro smoke not run: no booted simulator / `APP_ID` / installed
> build in this environment (`xcrun simctl list devices booted` empty). Logic and
> navigation covered by the Jest/router suites; criteria requiring on-device
> behavior (list them) are provisionally verified pending an on-device smoke,
> logged in `docs/runbooks/deferred-smokes/NNN-issue-<n>.md`.

Name the per-issue file, not this runbook: the ledger stopped being a table here
in #57 (§3), and a disclosure that points at `smoke-verification.md` sends a
reader to a file that no longer holds the entry.

## 2.1 When a provisional acceptance criterion may merge

"Provisionally met" is a real merge state in this repository, not a hedge, and it
has been used deliberately — #14's iOS VoiceOver pass, #46's fps cascade,
Reduce-Motion relaunch, and airplane-mode render. Because it lets an unmet half of
an AC through a merge gate, the conditions are fixed. **All five must hold:**

1. **The half that ran is named and green** — the specific Jest/router suites
   accepted as the logic proxy, listed by name, not "the suite passes".
2. **The half that did not run is logged** as a `Status: Open` per-issue file
   under `docs/runbooks/deferred-smokes/` (§3), carrying the **exact steps and the
   exact threshold** the device run must clear, so #16 can execute it without
   reconstructing them from a merged PR.
3. **The product owner has posted the deferral as a comment on the issue**, in
   the form `docs/runbooks/decision-issues.md` §2 defines, before the stage that
   relies on it acts. Neither the build nor the verify stage may grant itself the
   deferral: the build must not assert it, and verify must not invent it. Verify
   links that comment by URL in the AC row.
4. **Nothing is upgraded in the wording.** The AC reads "provisionally met —
   `<the deferred half>` deferred to #16 by owner decision `<link>`", in the PR
   body, in the review, and in any doc that records the outcome. Never plain
   "met". A recommendation resting on a deferred input is likewise **provisional**
   and says what it is contingent on. **Quote the phrase; a paraphrase is a
   finding even when it is honest.** #66's PR body wrote "provisionally verified
   pending an on-device smoke" — accurate, linked, nothing upgraded — and verify
   still had to re-derive the whole condition against the other five records to
   establish that, because a reworded provisional cannot be checked by reading
   it. Fill in the two placeholders and change nothing else.
5. **No number is invented for the deferred measurement.** An unmeasured
   threshold is recorded as **UNMEASURED**, never "roughly met", "expected to
   pass", or a figure carried over from a similar change.

### Condition 3 stays per-issue, even when the owner's reason is standing

**Resolved by the #51 retro.** The owner's deferral on #51 said it "extended this
same deferral to the remaining issues in the current loop", which raises the
obvious question: could one standing comment on the tracking issue (#16) cover
every issue in a loop and save the owner from repeating themselves? **No.**
Condition 3 requires a comment **on the issue being merged**, and a blanket
comment posted somewhere else does not satisfy it. Three reasons, in order of
weight:

1. **The deferral is a judgement about *this* issue's unverified behaviour, not
   about the machine.** The environment (no JDK, no Android SDK, no simulator
   runtime — §1) is constant and needs no per-issue decision. What is decided per
   issue is whether *these particular* device-only behaviours may ship unproven:
   #14's VoiceOver utterance, #46's fps cascade, #51's relaunch and cross-tab
   navigation legs. A standing comment approves a list nobody has read.
2. **It is the only evidence a stage actually checks.** Every verify runs
   `gh issue view <n> --comments`. Evidence living on another issue is not in that
   output, so accepting it would turn a checked condition into an unverifiable
   claim, and the runbook would be back to "verify must invent it".
3. **The stage must not author the evidence that authorizes it.**
   (`docs/runbooks/decision-issues.md` §2.) If a standing deferral were allowed,
   the practical effect would be a stage quoting the blanket comment onto the
   issue itself — which is the build granting itself the deferral with an extra
   step.

A standing decision is still a perfectly good **reason**; it just has to arrive
on the issue. The owner may restate it in one line that links the standing
comment, and that restatement is what satisfies condition 3. A stage that finds
only an off-issue standing deferral does what #51's build did: record the
criterion as **unmet**, say so in the PR body and the deferred-smokes entry, and
ask the owner to post it — then update the wording once it exists. That cost one
follow-up commit on #51 and is the whole mechanism working.

If any of the five is missing, the criterion is **unmet**, and the PR does not
merge on it. Two things this state is explicitly *not*: it is not a way to defer a
measurement the environment **could** have taken (§1 — measure it), and it is not
a way to retire a criterion. Retiring one is an owner decision in its own right,
posted on the issue with its reason, as #46's threshold (3) was.

## 3. Log the deferred smoke (mandatory)

Whenever a smoke is deferred, add **one new file** to
`docs/runbooks/deferred-smokes/` named `NNN-issue-<n>.md` (the issue number,
zero-padded to three digits so the directory sorts numerically). This is what
makes the accumulating on-device debt visible at release time. The
**release-acceptance issue (#16)** must clear every open entry — running each
listed flow on a real iOS and Android target — before PRD0 is called releasable.

### Why a file per issue, not a row in a shared table

This ledger used to be a single Markdown table that every build stage appended
to. That made it a **serial merge-conflict magnet**: every parallel PR adds its
row at the same place, at the end of the same table, so any two PRs in flight at
once conflict on it even though they touch nothing else in common. #48 and #49
hit exactly this — both appended a row, and #49's branch had to be rebased by
the orchestrator purely to resolve a ledger append that had no semantic
disagreement in it (the resolution kept both rows). The cost is paid by whoever
merges second, every time, and it scales with how much parallelism the workflow
runs.

A new file per issue cannot conflict: two PRs adding
`043-issue-43.md` and `044-issue-44.md` touch disjoint paths, so git merges them
without a decision. **The directory listing is the ledger.** Do not reintroduce
an index, summary table, or count anywhere in this runbook — an index is the
shared append point again, and it would have to be edited by every PR that adds
a file.

### Entry format

Copy this shape (see any existing file for a worked example):

```md
# Deferred on-device smoke — issue #<n>

- **Issue:** #<n>
- **PR:** #<pr>
- **Flow file:** `.maestro/<flow>.yaml`
- **Status:** Open

## Proxy coverage that ran

<the Jest/router suites accepted as the logic proxy, named specifically>

## Still on-device-unverified

<the exact acceptance-criterion wording that stays provisional, and why this
environment cannot exercise it>
```

An entry may carry additional `###` sub-sections when the deferral has a
specific scenario attached — for example a named platform scenario a reviewer
derived but could not run (see `043-issue-43.md`'s Android
`removeClippedSubviews` scenario). Put such a scenario in the deferred entry
rather than in a PR review, which disappears from view once the PR merges.

### One fixture is evidence for one position, not for the mechanism

When the deferred behaviour turns on a **discrete** parameter — which fill batch a
row lands in, which page a record is on, which migration step ran — a device
script that exercises a single value proves that value and says nothing about the
others. #63's owner script used a 24-step pattern at step 20, which lands under
both the mechanism that shipped and the broken one it replaced; the case that
separates them (a current step in the pattern's **final** fill batch, which has no
later batch to be rescued by) was not in the script at all, so #16 would have
cleared AC1 while a mainstream input failed it silently. Verify derived that and
the entry gained two named scenarios: the discriminating one, and a **positive
control** one region below it, so a failure tells the owner *which* reading is
wrong rather than only that something is.

So when an entry's behaviour has such a parameter, name the regions and cover at
least the boundary region plus one control. And say plainly where an existing flow
leg passes either way — `063-issue-63.md` records that the 3-step Maestro fixture's
legs cannot report the difference, which is why the flow is not evidence for AC1.
A leg that cannot fail on the thing is not evidence for it.

### Clearing an entry

Run the flow on-device, then set `**Status:**` to `Done — <date>, <targets
exercised>` in that file (or delete the file once #16 records it). Editing or
deleting a single-issue file is likewise conflict-free.

### Deferred on-device smokes

See [`deferred-smokes/`](./deferred-smokes/) — one file per issue, sorted by
issue number. Everything open is a file in that directory; there is deliberately
no summary here to keep it out of every PR's diff.

## 4. Selector discipline for flows that have never been run

Every `.maestro` flow in this repository was written blind and has never been
executed: no JDK, no simulator runtime, no Android SDK (§1). The first real run
is issue #16. That makes selector correctness a **review** problem, not a debug
problem — nobody gets a red flow to fix, so a wrong selector sits in the tree
looking exactly like a right one.

Three facts decide it:

1. **A row is one accessible element, and its label is the merged string.**
   `CraftPressable` sets `accessible`, so React Native groups the row's children
   into a single element. The only text a row exposes is the label the row's
   label helper builds — `"Single crochet, sc, Beginner"`,
   `"Practice Swatch. Hook 5.0 mm · Worsted (medium 4) cotton or acrylic · …"` —
   not the title `<Text>` nested inside it. On iOS especially, the inner text is
   not a separate element to find.
2. **A Maestro text selector is a regular expression matched against the whole
   string.** A bare title is therefore not a prefix search; under whole-string
   semantics it matches nothing at all.
3. **Regex metacharacters in the label are live.** `patternSeed.json` notes carry
   `(medium 4)` and `5.0 mm`, so pasting the full label in as a selector makes
   the parentheses a capture group and stops it matching the literal text.

The rule that follows from all three: **select a row by its full accessible
label when the label is metacharacter-free, and otherwise by its
metacharacter-free prefix closed with `.*`.** `"Single crochet, sc, Beginner"`
and `"Practice Swatch.*"` are both correct whether Maestro matches whole strings
or substrings, which is the property that matters on a machine that cannot run
Maestro to settle the question.

**`assertNotVisible` is where a bad selector does real damage.** A selector that
can never match *passes* — so `assertNotVisible: "Practice Swatch"` reports
success whether or not the deleted starter came back, which is exactly the
acceptance criterion (#44 AC3) that leg exists to prove. Check every
`assertNotVisible` against this rule first; a vacuous negative assertion is
worse than no assertion, because it is counted as evidence.

**When a first on-device run fails at a selector, it is a selector defect until
proved otherwise.** Read the label helper and the seeded content before opening
a product bug: a `tapOn` that cannot find a row and a resurrected pattern look
identical from the flow's exit code.
