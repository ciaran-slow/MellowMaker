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
| #9 | (this PR) | `.maestro/guides.yaml` | Jest domain (`youtubeUrl` supported-forms/rejections/id-boundary, `guideImportLabels`) + `youtubeOembedGateway` (injected-`fetch` mapping + every failure reason + html/transcript boundary) + `guideRepository` (dedup UNIQUE, refresh title/step preservation + COALESCE, `listGuides` recency) + `GuideImportScreen`/`GuideDetailScreen`/`GuidesScreen` component + real-router `guidesNavigation` suites | AC "created guide survives **app restart**, offline" (relaunch step 6), the **Android airplane-mode** metadata-unavailable manual path (step 3), and Android **hardware-back** — true relaunch and the native airplane toggle never exercised on a device (Jest reopen + fake gateway are the proxy) | Open |
| #10 | (this PR) | `.maestro/guide-authoring.yaml` | Jest domain (`guideStepDraft` timestamp parse/format/optional-fields) + `guideRepository` (append-at-count, reorder [C,A,B]/membership-throw, delete compaction A=0/C=1, absolute completion + durability, order/timestamp/note/transcript/completion persistence across reopen, guide↔guide↔pattern counter isolation + idempotent + durable) + `GuideWorkingViewScreen` (placeholder-doesn't-disable-list, out-of-order completion keeps current=first-incomplete, counter isolation across mounts, counter-failure keeps steps, missing/failed) + `GuideEditorScreen` (manual timestamped authoring 0:42→42000/1:05→65000, invalid-timestamp rejects, reorder/delete offline, first-row Move-up disabled+no-op, title validation, refresh title-preserve + no-write-on-failure, delete-confirm) + real-router `guidesNavigation` (working view → editor → delete → /guides) suites | AC "guide steps preserve order/timestamps/notes/completion after **app restart**" (relaunch step), **Android airplane-mode** authoring of a saved guide, and Android **hardware-back** — true relaunch and the native airplane toggle never exercised on a device (Jest reopen + fake gateway are the proxy) | Open |
| #12 | (this PR) | `.maestro/offline-cold-start.yaml` | `tests/offlineColdStart.test.tsx` (behavioural no-`fetch` cold start over the real migrations + populated baseline across dictionary/pattern/progress/counter/saved-guide + static import guard) + existing durability/reopen suites (`repositories` progress/counter reopen, `guideRepository` absolute-completion durability, `PatternCounter` remount) + the `DatabaseGate`/`databaseRouteGating`/`databaseInitialization` migration-failure suites | Real airplane-mode cold start across dictionary+patterns+guide-text+progress+counters, real immediate-termination process-kill relaunch of acknowledged counter/checklist writes (NFR-02), and a real on-device migration-failure surface (FR-DA-03) — the Jest reopen + `node:sqlite` proxy cannot exercise native relaunch or the airplane toggle | Open |
| #11 | (this PR) | `.maestro/guide-playback.yaml` | Jest `guidePlayback` pure (`videoOffsetMsToSeconds` 42000→42 / 65000→65 / 0→0 / negative-clamp / absolute-not-accumulated + error-reason→text mapping) + `GuideVideoPlayer` (seek-when-ready→`seekTo(42,true)`, seek-before-ready/after-error no-op, repeated-same-value idempotency, error-text + Try again + Open in YouTube, unmount seek-release no-op) + `GuideWorkingViewScreen` (badge seek when ready, playback-failure keeps instructions/completion/counter usable, retry calls zero guides-repo methods, list never gated in loading/error) + real-router `guidesNavigation` (player released on navigate-away, stale callback no-op) suites, all with `react-native-youtube-iframe` mocked | AC#1 real **seek landing on the playing video** across **iOS + Android**; AC#2 real **offline/airplane** WebView load-failure→text fallback (Android-airplane asserted in-flow, iOS airplane manual); AC#4 native **WebView/subscription teardown** on navigation — and the flow needs a **fresh dev/EAS build** because the two new deps (`react-native-webview` `13.16.1`, `react-native-youtube-iframe` `2.4.1`) add a native module absent from any prior installed binary. No booted-sim `APP_ID`/matching build in this environment | Open |
| #14 | (this PR) | `.maestro/accessibility.yaml` | Jest `useAnnouncement` (iOS announce-once, Android never, first-render silent, repeated-same-value once, return-to-value, cleared-then-repeated spoken again, independent hooks) + `usePressScale` (both reduced-motion branches, disabled, synchronous `onPress`) + walk-based `accessibilityContrast` and `textScaling` guards + `nonColorStatus` (both step rows × 3 statuses by role/state/word) + `CraftCounter`/`PatternViewerScreen`/`GuideWorkingViewScreen` iOS announcement cases + `tabBarContrast` 3:1 indicator | **iOS VoiceOver** pass on the physical iPhone (iOS 26.6.1, Expo Go 57.0.9 via `npx expo start`; script posted on #14) — **deferred to #16 by product-owner decision, 2026-09-03**, so AC2 is provisionally met only; judge verify finding F3 (two back-to-back completion announcements may clip) in the same run; **Android TalkBack** pass over dictionary → stitch detail, viewer completion + counter, import failure/success, editor save, playback seek — no Android SDK/`adb` on the build machine, and Maestro cannot launch at all (no Java runtime), so `test:smoke:accessibility` itself is also unexecuted on both platforms; real Dynamic Type / font-scale clipping and one-handed reachability on Android | Open |
| #42 | (this PR) | `.maestro/dictionary.yaml` | Jest `CraftTextField` layout/interaction suite (single-line surface `minHeight: 48` + input `paddingVertical: 12` + no input minimum, by style *and* `className`, `textAlignVertical: center`; multiline negative branch keeps `min-h-touch`/`items-start`/`top` and takes no padding; 12+24+12=48 token arithmetic; controlled change/submit; clear control present-and-48px / absent-when-empty; walk-based "only `CraftTextField` renders a `TextInput`" ownership guard) plus the unchanged `DictionaryScreen`/`PatternEditorScreen`/`GuideImportScreen`/`GuideEditorScreen`/`CraftCounter`/`textScaling`/`accessibilityContrast` suites | AC1 **visible** vertical centring of value *and* placeholder in every single-line field, and that a tap near the top and bottom edge of a field still focuses it — Jest pins who owns the 48px and which alignment each branch sets, but cannot render pixels or dispatch a real touch. Product-owner iPhone pass (iOS 26.6.1, Expo Go 57.0.9 via `npx expo start`) covers iOS: stitch search, pattern title, YouTube link, counter rename centred; notes and step instructions still top-aligned. **Android is unexercised on both counts** (no SDK/`adb`; `textAlignVertical` is the Android-only half of the fix and has never run), deferred to #16 | Open |
| #43 | (this PR) | `.maestro/guide-playback.yaml` (extended: three steps, `scrollUntilVisible` down to a below-the-fold step, back up to the video, then the counter tap) | Jest `GuideWorkingViewScreen` (chrome inside `guide-steps` with the back control outside; the same containment in the player's loading / ready / error states, error placeholder included; `flex-1` on the list; cumulative `youtubePlayerMountCount()` staying at 1 across a completion and two counter taps; header rendered above `ListEmptyComponent` with zero steps; `keyboardShouldPersistTaps="handled"` and no `getItemLayout`/`initialScrollIndex`) + real-router `guidesNavigation` (`/guides/<id>` renders the counter and title inside the list) suites | AC1 the **real scroll gesture** through all steps on the physical iPhone with the player loading, ready, and errored; AC2 **one-handed counter reach** after scrolling; the one-tap rename with the keyboard up; and the residual "a swipe starting on the WebView is consumed by YouTube" behaviour — Jest has no layout engine, so it can prove containment but never that a gesture moves the content. AC4 **Android**: no Android SDK/`adb` on this machine and Maestro cannot launch at all (no JDK), so `test:smoke:guides:playback` is unexecuted on both platforms | Open |
