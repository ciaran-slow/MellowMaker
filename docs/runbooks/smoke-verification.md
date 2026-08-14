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

Append a row to the tracking table below whenever a smoke is deferred. This is
what makes the accumulating on-device debt visible at release time. The
**release-acceptance issue (#16)** must clear every open row — running each
listed flow on a real iOS and Android target — before PRD0 is called releasable.

Clear a row by running its flow on-device, then mark it Done with the date and
target exercised (or delete it once #16 records it).

### Deferred on-device smokes

| Issue | PR | Flow file | Proxy coverage that ran | Still on-device-unverified | Status |
|---|---|---|---|---|---|
| #5 | #23 | `.maestro/patterns.yaml` | Jest repository + library/editor screen + real-router navigation suites (195 tests) | AC "rows/steps retain exact saved order after navigation and **app restart**" — true relaunch never exercised on a device | Open |
| #6 | #25 | `.maestro/pattern-viewer.yaml` | Jest domain + repository (serialization/durability) + `PatternViewerScreen` component + real-router navigation suites (220 tests) | AC "completed/reopened state survives immediate termination and **app restart**" and on-device scroll-to-current-step restoration — true relaunch and real scroll never exercised on a device | Open |
| #7 | (this PR) | `.maestro/counter.yaml` | Jest domain (`counterLabel`) + repository (idempotent accessor, clamp, rename, per-owner isolation, reopen durability) + `CraftCounter` control + `PatternCounter` wired hook/screen (rapid double-tap→2, clamp-at-zero, reset cancel/confirm, two-pattern isolation, remount durability, rename, a11y announcement) suites (245 tests) | AC "every acknowledged change survives navigation and immediate **app restart**" — true relaunch never exercised on a device (Jest reopen/remount is the proxy); real one-handed tap gestures and the reduced-motion pop on-device | Open |
