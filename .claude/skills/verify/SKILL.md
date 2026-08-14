---
name: verify
description: Independently review a built MellowMaker issue against its plan, acceptance criteria, and product vision before merge. Use when the user says "use the verify skill", "verify this work", or asks for review of a built issue.
---

# Verify

You are the **verify** stage: an independent review, not a continuation of the
build. Assess before changing anything. If the PR records its builder
model/tool, confirm this pass is independent; if it does not, report that the
independence check is unverifiable rather than pretending otherwise.

## Canonical project

- Repository: `ciaran-slow/MellowMaker`
- URL: `https://github.com/ciaran-slow/MellowMaker.git`
- Product source of truth: `docs/vision.md`

Set and use the explicit repository for every GitHub CLI command:

```sh
REPO=ciaran-slow/MellowMaker
```

Before local review, confirm the checkout's `origin` resolves to the canonical
URL. Never review a similarly named or inherited repository by accident.

## 1. Gather the issue, plan, PR, and exact head

Read the issue body and comments separately so acceptance criteria and the
posted plan are both captured:

```sh
gh issue view <issue> --repo "$REPO" \
  --json number,title,body,labels
gh issue view <issue> --repo "$REPO" --comments
gh pr view <pr> --repo "$REPO" \
  --json number,title,body,baseRefName,headRefName,headRefOid,files,commits
```

Fetch the PR head by its named remote branch. If the branch is already checked
out in another worktree, use a unique local review branch based on
`origin/<head-branch>`; do not use shared `FETCH_HEAD`. Do not move the primary
checkout away from its default branch—create a separate worktree instead.

Confirm local `HEAD` exactly equals the PR's `headRefOid` before reviewing.
Install dependencies using the package manager identified by the committed
lockfile.

Then read:

1. The complete acceptance criteria and plan comment.
2. All of `docs/vision.md`.
3. Repository instructions such as `AGENTS.md`, if present.
4. Architecture/decision docs relevant to the diff, if present.
5. Package, Expo, EAS, TypeScript, lint, test, and CI configuration.
6. The whole diff from the PR's base to its exact head, including tests,
   generated config, lockfiles, and documentation.

Use the diff stat to detect lockfile or generated-file churn, but never let it
replace reading the substantive diff.

## 2. Run repository and PR gates

Check the complete GitHub status rollup first:

```sh
gh pr checks <pr> --repo "$REPO"
```

Derive local commands from `package.json`, the active lockfile, repository
docs, and every relevant workflow under `.github/workflows/`. Do not assume
the old project's `npm run typecheck`, `lint`, `test:coverage`, and `build`
scripts exist or represent MellowMaker's full CI.

Run the same configured lint/format, TypeScript, unit/integration, coverage,
Expo health/config, and build checks that gate the PR. Reproduce any failed
CI-only job locally where practical. A red or pending required check is not
merge-ready unless its irrelevance is proven against the same commit.

Exercise the changed user path by launching the app with the repository's
documented Expo command or end-to-end target. UI behavior requires a simulator,
device, or existing automated device test—not a web-only substitute. Check
both iOS and Android for platform-specific code/configuration. State exactly
which targets were and were not exercised.

When no simulator/`APP_ID`/installed build is available, follow
`docs/runbooks/smoke-verification.md`: accept the Jest/router suites as the
logic proxy, but treat acceptance criteria whose wording requires on-device
behavior (app restart/relaunch, hardware back, real gestures) as only
**provisionally met**, and confirm the build logged a "Deferred on-device
smokes" row for the flow. A deferral the build did not log is a finding.

## 3. Check every acceptance criterion

For each criterion, record:

- the file and line or runtime behavior that satisfies it;
- the test or manual scenario that proves it;
- whether it works on the required platforms and offline state.

“Code exists” and “tests pass” are not criterion-level evidence. Any unmet
criterion makes the verdict **not ready to merge**.

## 4. Interrogate the tests

For each changed contract, ask what plausible defect makes its test fail.
Require concrete coverage, where applicable, for:

- happy path and observable state transition;
- invalid input, unavailable metadata/transcript, and dependency failure —
  checked per surface: every screen or hook with its own failed/retry state
  must prove its own failure path; coverage on one screen does not vouch for
  another with the same state shape;
- offline launch and network loss for core or saved content;
- close/reopen persistence for counters, steps, patterns, and imported guides;
- repeated taps/imports/saves without duplication or drift;
- SQLite migration from realistic existing data;
- accessibility labels, roles, and dynamic state;
- iOS/Android-specific branches.

Fixtures must falsify the mechanism they claim to test. Ordering fixtures
cannot already be in desired order; a boundary fixture cannot be calculated
from the constant it is intended to pin.

Use a narrowly targeted temporary mutation or scratch test when it materially
reduces uncertainty about high-risk coverage. Restore it immediately and
confirm the worktree matches the PR head before reporting. Never leave review
probes in the branch.

## 5. Review MellowMaker-specific risks

Check the diff specifically for:

- **Vision drift:** behavior or styling that conflicts with `docs/vision.md`,
  including replacement of Expo managed workflow, `expo-video`, NativeWind
  v4, Reanimated, or the “Playful Craft” visual system.
- **Offline regression:** core content, saved guides, counters, or progress
  unexpectedly requiring a network.
- **Data loss:** SQLite migrations or writes dropping user-created patterns,
  notes, steps, progress, or imported guide data; non-transactional partial
  updates; migration version drift.
- **Restart correctness:** in-memory state shown as saved but absent or stale
  after app relaunch.
- **Counter integrity:** lost/duplicated taps, negative values where forbidden,
  stale active-pattern association, or rapid-tap races.
- **Importer resilience:** malformed/non-YouTube URLs, supported URL forms,
  unavailable/private videos, missing transcript/metadata, network failure,
  duplicate imports, timestamp correctness, and safe rendering of remote text.
- **Video lifecycle:** `expo-video` resources surviving navigation, playback
  state attached to the wrong guide, or saved steps depending on playback.
- **Expo compatibility:** packages incompatible with the installed SDK,
  unplanned native code/prebuild changes, missing permissions, secrets in the
  bundle, or EAS profiles that do not cover both stores.
- **Cross-platform UI:** safe areas, keyboard overlap, Android back behavior,
  text scaling, layout at small sizes, and platform-only APIs.
- **Accessibility:** missing React Native labels/roles/state, undersized touch
  targets, color-only meaning, inadequate contrast, or motion that ignores
  the repository's reduced-motion convention.
- **Performance:** avoidable copies/re-renders on counters and long step lists,
  unbounded SQLite reads, or media/list resources not released.
- **Plan divergence and scope creep:** unapproved design changes, missing
  planned files/tests, unrelated work, or a dependency on an unmerged PR.
- **Repository residue:** unrelated frameworks, data layers, localization,
  paths, names, URLs, or test assumptions introduced from legacy skills.

When deciding whether a defect is pre-existing, compare with the PR's base
without overwriting the review worktree.

## 6. Report a binary verdict

Lead with exactly one outcome:

- **Ready to merge**
- **Not ready to merge — <blocking reason>**

List findings in severity order. Each finding needs a file/line, the broken
contract, and a concrete failing input or runtime scenario. Separate blockers
from optional follow-up. Do not manufacture findings when the work is sound.

Include:

- acceptance-criterion evidence;
- commands and CI checks run with outcomes;
- simulator/device/platform and offline scenarios exercised;
- any unverified area or independence limitation.

Post the report as a PR review and confirm it appears:

```sh
gh pr review <pr> --repo "$REPO" --comment --body-file <report-file>
gh pr view <pr> --repo "$REPO" \
  --json reviews --jq '.reviews[-1].body'
```

Do not treat the pass as complete until the posted body matches the report.

## 7. Fix only after reporting

Review first. Only fix findings after the user asks. After a fix, rerun every
affected repository gate and smoke scenario and post an updated review.

## 8. Close the issue loop with a retro

Verify is the last **quality** gate, not the last stage. Every issue runs the
full workflow: **plan → build → verify → retro**.

Once the verdict is posted — and, if it was **ready to merge**, once the PR is
merged — stop and tell the user to run the `retro` skill in a fresh context on
this issue. Do not run the retro in the verify context; it must review the
whole cycle from the outside.

Name the inputs the retro should pull for this issue: the issue number, its
plan comment, the PR and its diff, this verify review, and any build/verify
gate failures or back-and-forth. The retro's job is to convert what this cycle
revealed into durable changes to the `plan`, `build`, or `verify` skills, a
repo doc, or a script — never to memory.
