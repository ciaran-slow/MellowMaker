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
  deferred to #16 by an explicit owner decision and logged in the table below.
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
> logged in `docs/runbooks/smoke-verification.md`.

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

### Clearing an entry

Run the flow on-device, then set `**Status:**` to `Done — <date>, <targets
exercised>` in that file (or delete the file once #16 records it). Editing or
deleting a single-issue file is likewise conflict-free.

### Deferred on-device smokes

See [`deferred-smokes/`](./deferred-smokes/) — one file per issue, sorted by
issue number. Everything open is a file in that directory; there is deliberately
no summary here to keep it out of every PR's diff.
