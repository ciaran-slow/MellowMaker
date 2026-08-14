---
name: build
description: Implement one planned MellowMaker GitHub issue with tests and open a PR. Use when the user says "use the build skill", "build this issue", or gives an issue number to implement.
---

# Build

You are the **build** stage. Execute the plan posted on the issue; do not
redesign it from conversation memory.

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

Before any branch, commit, or push, confirm the checkout is a Git repository
whose `origin` resolves to the canonical URL. Never change or push another
repository's remote to make it fit.

## 1. Load the contract

Read, in order:

1. The issue body, acceptance criteria, and complete plan comment.
2. All of `docs/vision.md`.
3. Repository instructions such as `AGENTS.md`, if present.
4. Existing architecture/decision docs named by the plan, if present.
5. Package, Expo, EAS, TypeScript, lint, test, and CI configuration.
6. The source and tests named by the plan, plus direct call sites required to
   make a clean change.

Use installed versions and local conventions, not assumptions from another
project. If no complete plan is posted, return to the plan stage.

## 2. Branch

Update from the repository's default branch, then create one issue branch:

```sh
git checkout -b issue-<n>-<short-slug>
```

Never commit issue work directly to the default branch.

## 3. Implement the plan

Follow the posted outcome, paths, contracts, and tests. Small local judgment
calls are yours; structural changes are not.

If the plan contradicts current source, installed Expo APIs, a repository
gate, or `docs/vision.md`, do not silently substitute another design. Record
the exact conflict on the issue and stop for a corrected plan. A minimal
gate-driven deviation is acceptable only when it preserves the planned
contract; state it in the PR body.

Migrate every affected caller and remove obsolete paths. Do not leave shims,
parallel conventions, TODO implementations, placeholder data, or scope added
“while here.”

## 4. MellowMaker constraints

These constraints come from `docs/vision.md`:

- React Native + TypeScript using Expo managed workflow (SDK 52+) and EAS,
  targeting iOS and Android.
- Core patterns, imported guides, stitch data, counters, and progress are
  offline-first and persisted locally with `expo-sqlite`.
- SQLite schema changes follow the one existing migration/version convention,
  run transactionally where supported, preserve user-created data, and are
  tested from the previous schema.
- Video playback uses `expo-video`.
- UI follows the “Playful Craft” system with NativeWind v4, the documented
  palette, friendly rounded surfaces and typography, and purposeful
  Reanimated interactions.
- A network-dependent YouTube import must expose loading/error states and
  must not make already-saved guides or progress network-dependent.

Stay in Expo managed workflow unless the approved plan explicitly changes
that constraint. Do not introduce browser-only storage, an unplanned server
data layer, or dependencies/configuration inherited from another project. Do
not commit secrets, API keys, signing credentials, or machine-local Expo
configuration.

Use existing navigation, state, SQLite, component, and styling patterns. A
second convention beside an existing one is a defect.

## 5. Build accessible mobile behavior

Interactive controls need meaningful React Native accessibility labels and
roles, adequate touch targets, visible state, and feedback that does not rely
on color alone. Respect safe areas, text scaling, keyboard behavior, and
reduced-motion patterns already present. Check both platforms when behavior
uses platform APIs or differs by layout.

Review from the maker's perspective: one-handed counter taps, progress after
an app restart, empty/error/loading states, and use without connectivity.

## 6. Tests

The builder owns tests for every new observable contract. Use only the test
framework and placement established by the repository; if the issue creates
the first test setup, follow the plan's explicit decision.

Tests should cover, as applicable:

- happy path and observable UI/data transition;
- invalid input and dependency failure;
- offline behavior for core and saved content;
- persistence across close/reopen;
- repeated taps/imports/saves without duplication or drift;
- SQLite migration with realistic existing user data;
- accessibility labels, roles, and dynamic state;
- iOS/Android branches.

Prefer behavior over implementation details. For every test, identify a
plausible source bug that makes it fail. Use independent fixtures for
ordering and numeric/time boundaries.

## 7. Verify after the final edit

Derive the exact gates from `package.json`, the active package manager
lockfile, repository docs, and `.github/workflows/`. Do not invent a fixed
four-command gate from another repository.

Run:

1. dependency installation using the lockfile's package manager;
2. every CI-equivalent lint, formatting, typecheck, unit/integration, and
   coverage command;
3. Expo config/health or EAS checks required by repository scripts/CI;
4. the smallest specific test while iterating, then the complete relevant
   suite after the final edit;
5. a smoke launch of the app and the changed path on an appropriate simulator,
   device, or repository-provided end-to-end target.

For platform-specific code/configuration, exercise both iOS and Android or run
the repository's equivalent platform-specific automated checks. Do not claim
a platform was verified when it was not run.

All configured gates must pass together after the last edit. A PR with a
known failing gate is not built.

## 8. Documentation and decisions

Update existing architecture, schema, setup, or decision documentation only
when the changed contract makes it stale or the plan requires it. Follow the
repository's established decision-record convention; do not create an ADR
system solely because the older skills expected one.

Remove temporary fixtures, generated credentials, scratch files, and debug
logging after the smoke test.

## 9. Commit, push, and open the PR

Use a commit message that states what changed and why. Record the builder
model/tool in the PR body so the verify stage can establish independence.

```sh
git push -u origin issue-<n>-<short-slug>
gh pr create --repo "$REPO" \
  --title "<issue title>" \
  --body-file <pr-body-file>
```

The PR body must include:

- `Closes #<n>`;
- user-visible behavior delivered;
- implementation and persistence notes;
- tests, gates, simulators/devices, and platforms actually run;
- any approved deviation from the plan;
- builder model/tool.

Confirm the PR URL and head branch with `gh pr view --repo "$REPO"`.

Stop after opening the PR. Do not verify your own work. Tell the user to run
the verify skill in a fresh context, preferably with a different model.

This is the build stage of the per-issue workflow: **plan → build → verify →
retro**. After verify passes and the PR merges, the issue closes with a retro;
do not skip it.
