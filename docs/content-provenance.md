# Bundled Content Provenance

**Status:** Approved for PRD0
**Applies to:** every stitch instruction, summary, pattern title, pattern note,
pattern step, and visual reference shipped inside the iOS and Android builds
**Traceability:** FR-ST-01, FR-ST-05; PRD0 decision 1; issue #44;
[`architecture.md`](./architecture.md) §6, §6.1
**Content artifacts:**
[`src/data/seed/stitchSeed.json`](../src/data/seed/stitchSeed.json) (stitch
dictionary) and
[`src/data/seed/patternSeed.json`](../src/data/seed/patternSeed.json) (starter
patterns)
**Formats and validators:**
[`src/data/seed/stitchSeedDocument.ts`](../src/data/seed/stitchSeedDocument.ts)
and
[`src/data/seed/patternSeedDocument.ts`](../src/data/seed/patternSeedDocument.ts)

## 1. Decision

MellowMaker ships **two** bundled content sets — the stitch dictionary and the
starter pattern library — and both are original text authored for this repository
and owned by the project. No third-party instruction text, pattern text, or
imagery is included in either.

Sections 2 to 7 record the stitch dictionary. Sections 8 to 11 record the starter
patterns, which follow the same authorship and review discipline but a
deliberately different update policy (§10).

Visual references stay optional and schema-supported.
`stitch_instruction.image_asset_key` exists, the content format permits
`imageAssetKey`, and PRD0 sets it on zero records. FR-ST-05 requires *available*
local visual references, so a text-only PRD0 set satisfies it, and a later
licensed or self-produced asset set can be added without a schema or format
change.

## 2. Approved minimum set

Twelve records. The selection principle is the smallest catalog that lets a
beginner work a beginner pattern end to end and lets an intermediate maker decode
the abbreviations a real pattern line uses: start, the basic heights,
travel/join, both shaping directions, one placement modifier, one round start,
and a finish. Every entry is a term patterns write by abbreviation, which is what
makes abbreviation search worth having.

Document order is pedagogical rather than alphabetical and is part of the pinned
contract. Browse order is separate: the catalog reads in `search_text` order.

| # | slug | Name | Abbreviation | Difficulty | Steps | Why it earns its place |
|---|---|---|---|---|---|---|
| 1 | `chain` | Chain | `ch` | beginner | 5 | Every flat project starts here, and turning chains appear in every row-based pattern. |
| 2 | `slip-stitch` | Slip stitch | `sl st` | beginner | 5 | The only way to join a round or travel across stitches without adding height. |
| 3 | `single-crochet` | Single crochet | `sc` | beginner | 5 | The densest basic stitch and the backbone of amigurumi; the first stitch most beginners learn. |
| 4 | `half-double-crochet` | Half double crochet | `hdc` | beginner | 6 | The middle height; teaches that the starting yarn over changes the stitch. |
| 5 | `double-crochet` | Double crochet | `dc` | beginner | 5 | The most common blanket and garment stitch; named in `vision.md`. |
| 6 | `treble-crochet` | Treble crochet | `tr` | intermediate | 6 | Named in `vision.md`; generalizes the yarn-over count so taller stitches become readable. |
| 7 | `single-crochet-increase` | Single crochet increase | `inc` | intermediate | 5 | Shaping outward; `inc` is unreadable without a dictionary entry and appears in nearly every amigurumi round. |
| 8 | `single-crochet-two-together` | Single crochet two together | `sc2tog` | intermediate | 5 | Shaping inward; the paired decrease for `inc`. |
| 9 | `double-crochet-two-together` | Double crochet two together | `dc2tog` | intermediate | 5 | Proves the decrease pattern generalizes across heights, which is the intermediate step up. |
| 10 | `back-loop-only` | Back loop only | `BLO` | intermediate | 5 | Placement modifier behind ribbing and defined edges; a maker cannot guess it from the basic stitches. |
| 11 | `magic-ring` | Magic ring | `MR` | intermediate | 5 | The closed-center start every in-the-round project needs; the alternative to a chain start. |
| 12 | `fasten-off` | Fasten off | `FO` | beginner | 5 | Finishing. Without it a beginner has no documented way to end work securely. |

Sixty-two instruction steps in total.

### Difficulty rubric

PRD0 uses only two of the schema's three values. A record is rated by what the
maker must already understand before the first step makes sense:

- **beginner** — one self-contained action needing only the slip knot, the yarn
  over, and the top loops of a stitch. Height varies with the starting yarn
  overs, but nothing is worked twice into one place and the hook always enters
  under both top loops. Covers `ch`, `sl st`, `sc`, `hdc`, `dc`, and `FO`.
- **intermediate** — needs a beginner stitch already understood, because the
  record either extends its yarn-over and closing count further (`tr`), works
  more than one stitch into or out of a single place (`inc`, `sc2tog`,
  `dc2tog`), changes where the hook enters (`BLO`), or starts a round instead of
  a row (`MR`).

Nothing is `advanced`, because PRD0 targets beginner-to-intermediate makers
(`prd0.md` §3.1). The schema keeps `advanced` available for maker-owned stitches.

## 3. Origin and authorship

Every bundled instruction and summary was written for MellowMaker. No text was
copied from, paraphrased from, or adapted from any book, website, pattern PDF,
video transcript, or other application.

Stitch names and abbreviations are standard US craft terminology — facts of the
craft rather than authored expression — and are used as such.

Terminology is US, declared in band as `"terminology": "US"` so the choice cannot
be violated silently. UK terms name different stitches with the same words, so
mixing them would corrupt abbreviation search. A UK or otherwise localized set is
a separate product decision and is not opened here.

## 4. Imagery

PRD0 bundles zero stitch images. `assets/` holds only the app icons, the Android
adaptive-icon layers, the favicon, and the splash asset. `imageAssetKey` is unset
on every instruction of every record.

Adding an image set requires, in the same change:

- the asset licence, or a statement that the project produced the asset;
- one row per asset in this document;
- updating the imagery gate in `tests/stitchSeedContent.test.ts`, which currently
  fails on the first `imageAssetKey` and on any bundled stitch artwork.

**Motion geometry is not imagery (issue #46).** The stitch step animation spike
bundles **no** imagery and sets `imageAssetKey` on zero records — both unchanged.
Its project-authored vector *motion geometry* for single crochet lives as inline
path data in `src/features/dictionary/presentation/stitchStepArt.ts`. It is
presentation, not content: drawn for this repository from the authored
instruction sentences, with no tracing of third-party diagrams, photographs, or
video frames, so it carries no third-party derivation, needs no attribution
surface, and adds no file under `assets/` — which is why the imagery gate above
stays green **untouched**, and is the spike's own evidence that it bundled none.
`imageAssetKey` is deliberately not used for it: that field means an available
local *visual reference* in content, with its own licence and attribution
obligations. No field of `stitchSeed.json` changed, so the §7 content-change
checklist is untriggered and `seedVersion` stays 1.

## 5. Attribution and redistribution

The project authored and owns the bundled text, so redistributing it inside the
iOS and Android builds carries no third-party obligation and no attribution
string must be displayed for any bundled record. That is why `stitch` carries no
attribution or licence column and why the dictionary UI needs no credits surface.

Introducing third-party content later would require both a schema field and an
in-app attribution surface; both are outside PRD0 scope.

The repository currently ships no `LICENSE` file. The bundled content is covered
by whichever licence the project adopts for the repository, and this record is
the statement of ownership that lets that happen cleanly.

## 6. Seed identity, version, and update policy

**Identity.**

- `slug` is the stable seed identity. It is derived from the English name once, at
  authoring time, and then frozen: renaming a display name never changes its
  slug, because a seed release is matched by slug and a changed slug would insert
  a duplicate stitch.
- `stitch.id` stays a repository-generated v4 UUID, assigned on first insert and
  never rewritten by an update, so a later reference to a stitch survives content
  revisions.
- `ownership = 'seed'` with a non-null `slug` and `seed_version` distinguishes
  bundled rows; maker rows have `slug IS NULL`.
- `name`, `abbreviation`, `difficulty`, `summary`, and instructions are revisable
  content, not identity.

**Version and update policy.**

1. PRD0 ships `seedVersion: 1`.
2. `seedVersion` is one monotonically increasing integer for the whole document,
   not a per-record value. A release stamps every row it touches with it.
3. Any change to bundled content — adding a stitch, revising prose, correcting an
   abbreviation, adding an `imageAssetKey` — requires, in the same commit: bump
   `seedVersion`, update the set table in §2, add a fingerprint row in §6, and
   re-confirm §3. The committed gates fail otherwise.

   The bump is owed from the first shipped release onward, because its purpose is
   to move installed databases forward. While a version has never shipped —
   MellowMaker has published no build, and EAS artifacts are still owed by issue
   #15 — content may be amended in place under that same version: no installed
   database can hold it, so there is nothing to migrate and a bump would
   misrepresent the first release as the second. An in-place amendment still owes
   every other obligation: the §2 table, the replaced §6 fingerprint, and §3.

   This is the one rule in this document with no automated gate: whether a version
   has shipped is checked by a reviewer, not a test. That asymmetry must not
   outlive the first release. Issue #15 owns the first EAS artifacts, so the
   change that produces one also owes this gate — assert `seedVersion > 1` for any
   content edit once a release exists, or record a shipped-version high-water mark
   the test can read. Until then the precondition is externally checkable: the
   repository has no release and no tag.
4. A release with unchanged content keeps its version. The launch guard then
   performs one bounded `MAX(seed_version)` read and no writes.
5. Maker edits are never overwritten. The repository rule — a release may insert
   or update only rows where `ownership = 'seed'` and `user_modified_at IS NULL` —
   is the only write filter, and no path exists around it.
6. Bundled content is never deleted by a seed release. The `StitchRepository`
   contract has no seed delete path: retiring a bundled stitch would strand a
   maker who relies on it, so retirement needs its own decision and is outside
   PRD0. Revision in place, under the frozen slug, is the supported mechanism.
7. A lower `seedVersion` than the database already holds is refused, so an older
   build can never rewrite newer content.

**Fingerprints.** SHA-256 of the normalized document — the value
`parseStitchSeedDocument` rebuilds, so the digest is independent of key order and
whitespace in the committed file.

| Seed version | Released in | SHA-256 of the normalized document |
|---|---|---|
| 1 | PRD0 initial content set, amended in place before any release | `098475347abc4662c4b592f10d4efee1aafa2e5f8b8ed9ed5af678a5af1a0fc3` |

The fingerprint does not pin correctness; the literal identity table in
`tests/stitchSeedContent.test.ts` does that. Its job is to make unreviewed
content drift impossible: any prose revision fails the gate until the author
records the new digest here, and — once a version has shipped — bumps
`seedVersion` as well.

## 7. Review checklist for a content change

1. Bump `seedVersion` in `src/data/seed/stitchSeed.json`, unless the version being
   amended has never shipped (§6, rule 3).
2. Update the set table in §2, including step counts and the total.
3. Record the new digest in §6 — a new row for a bumped version, or the replaced
   row for an in-place amendment.
4. Re-confirm §3: no copied or paraphrased text entered the set.
5. Record any asset licence or statement of self-production in §4.
6. Confirm the maker-edit rule and the absence of a delete path are untouched.
7. Run `npm run lint`, `npm run typecheck`, and `npm test`.

## 8. Approved bundled pattern set

Six records. The selection principle is the smallest set that lets a beginner
practise every beginner entry in the bundled dictionary on something they would
actually want to finish: one flat swatch to learn tension, one useful flat
object, one worked in the round, one motif, one shaped and ribbed band, and one
long repeated row. Every pattern ends in a fasten-off step, so a beginner always
has a documented way to stop.

Document order is the fresh-install library order, and it is part of the pinned
contract: the seed anchors the six instants strictly descending from the oldest
pattern already in the database, so the set reads top to bottom exactly as listed
here and always sits *below* whatever the maker is already working on.

| # | slug | Title | Steps | Why it earns its place |
|---|---|---|---|---|
| 1 | `practice-swatch` | Practice Swatch | 6 | The first thing to make: flat rows that teach even tension, counting, and checking gauge before a real project. |
| 2 | `cotton-dishcloth` | Cotton Dishcloth | 7 | The same single-crochet row at a useful size, so the first finished object is something a maker keeps. |
| 3 | `ridged-coaster` | Ridged Coaster | 6 | The first project worked in the round, started from a chain ring, and the first use of back loop only. |
| 4 | `granny-square` | Granny Square | 7 | The classic motif; introduces double-crochet clusters, chain corners, and building a square outward. |
| 5 | `ribbed-headband` | Ribbed Headband | 6 | Back-loop-only ribbing worked lengthwise, then seamed — the first pattern that becomes a wearable shape. |
| 6 | `simple-scarf` | Simple Scarf | 6 | One repeated half-double-crochet row taken long; the endurance project that proves a row can be trusted. |

Thirty-eight instruction steps in total.

Every abbreviation the six patterns use — `sl st`, `sc`, `hdc`, `dc`, `BLO`, and
`FO` — is defined in the bundled dictionary, so a beginner can look up every
short form a starter pattern writes. That set is asserted to match exactly, in
both directions, by `tests/patternSeedContent.test.ts`: a starter that stopped
using `BLO`, or one that started writing `inc`, fails the gate.

## 9. Pattern origin and authorship

Every bundled pattern title, note, and step was written for MellowMaker. No text
was copied from, paraphrased from, or adapted from any book, website, pattern
PDF, video transcript, or other application. The projects themselves are
generic beginner exercises — a swatch, a dishcloth, a coaster, a granny square, a
headband, a scarf — that no one owns; the wording of the instructions is this
project's own.

Stitch names, abbreviations, hook sizes in millimetres, and yarn-weight names
(worsted/medium 4, bulky/chunky 5) are standard US craft terminology — facts of
the craft rather than authored expression — and are used as such.

Terminology is US, declared in band as `"terminology": "US"` so the choice cannot
be violated silently. UK terms name different stitches with the same words, so a
mixed set would make the starter patterns contradict the bundled dictionary.

PRD0 bundles zero pattern imagery. The pattern content format has no asset key at
all, and `assets/` holds no `patterns` directory and no `pattern-*` entry.

## 10. Pattern seed identity, version, and update policy

**Identity.**

- `slug` is the stable seed identity and is frozen at authoring time. It is the
  key of the durable ledger, so a changed slug would insert a duplicate pattern.
- `pattern.id` stays a repository-generated v4 UUID, assigned on insert and never
  rewritten.
- `pattern.origin` (`bundled`/`user`) records provenance only. It grants the seed
  no write authority: a bundled pattern is fully maker-owned from the instant it
  lands, so there is no `user_modified_at` companion and nothing ever asks
  whether the maker has edited it.
- `pattern_seed_state` is the durable ledger of what the seed has done. Its
  `pattern_id` is `ON DELETE SET NULL`, so deleting a bundled pattern nulls the
  reference and **leaves the row standing** as a tombstone.

**Version and update policy.**

1. PRD0 ships `seedVersion: 1`.
2. `seedVersion` is one monotonically increasing integer for the whole document,
   not a per-record value.
3. **The pattern seed inserts only. It never updates, never deletes, and never
   resurrects.** A slug the ledger already records is skipped, whether the maker
   still has the pattern, has retitled and reordered it, or has deleted it
   outright. This is a deliberate divergence from the stitch seed, which revises
   in place under a frozen slug: a bundled pattern becomes the maker's property
   on insert, and they may be mid-project on it with completion rows, an
   active-step pointer, and a counter. A later release that rewrote its text
   would destroy live work and could orphan `pattern_progress.active_step_id`.
4. Consequently a bumped `seedVersion` may add **new slugs only**. Existing slugs
   are always skipped, edited or not.
5. The launch guard reads `MAX(seed_version)` over the **ledger**, never over the
   pattern rows. Reading it from the pattern rows the way the stitch guard reads
   `stitch` would be the resurrection bug: a maker who deleted every bundled
   pattern would drive the aggregate to `NULL` and get all six back on the next
   launch.
6. A lower `seedVersion` than the ledger already holds is refused, so an older
   build can never rewrite newer content.
7. Any change to bundled pattern content requires, in the same commit: bump
   `seedVersion` (or amend in place while no version has shipped), update the §8
   table and its total, record the digest below, and re-confirm §9. The committed
   gates fail otherwise.

   As in §6 rule 3, the bump is owed from the first shipped release onward. While
   a version has never shipped — MellowMaker has published no build, and EAS
   artifacts are still owed by issue #15 — content may be amended in place under
   that same version. **This one rule has no automated gate** until issue #15
   produces a release; whether a version has shipped is checked by a reviewer,
   not a test, and the precondition is externally checkable: the repository has
   no release and no tag.

**Fingerprints.** SHA-256 of the normalized document — the value
`parsePatternSeedDocument` rebuilds, so the digest is independent of key order
and whitespace in the committed file.

| Seed version | Released in | SHA-256 of the normalized document |
|---|---|---|
| 1 | Issue #44 initial starter pattern set, amended in place by the #44 retro | `fdf32948783e1c6dd5cabd0c2b3c3b0f9a7b74842f18fd3901841fce3d35dac1` |

### Amendment log

Seed version 1 has been amended once, in place, under rule 7 (no MellowMaker
release and no tag exists yet, so the precondition holds and is externally
checkable). The #44 retro rewrote `granny-square` step 5: it directed the maker
to work "3 dc into each side space" in round 2, but round 1 as written leaves
four chain-2 corner spaces and no side spaces, so there was nothing to work
there until round 3. The clause was removed; the step count, the set table, the
abbreviation set, and the total are unchanged, and the digest above was
re-recorded in the same commit. Recorded here rather than left in a merged PR
review, because "why does this digest differ from the one in the #44 PR body"
is the question the next content reviewer will ask.

## 11. Review checklist for a pattern content change

1. Bump `seedVersion` in `src/data/seed/patternSeed.json`, unless the version
   being amended has never shipped (§10, rule 7).
2. Update the set table in §8, including step counts and the total.
3. Record the new digest in §10 — a new row for a bumped version, or the replaced
   row for an in-place amendment.
4. Re-confirm §9: no copied or paraphrased text entered the set, and no imagery.
5. Confirm every abbreviation the new text uses is defined in the bundled
   dictionary.
6. **Read the set through as a maker would work it, step by step.** Every step
   must be workable from the state the previous steps actually leave: the
   stitches, spaces, loops, and edges it tells the maker to work into must exist
   by then. No committed gate can check this — the parser pins shape, the
   identity table pins the set, the fingerprint pins review, and all three pass
   over an instruction that cannot be crocheted. #44 shipped one such step (see
   the amendment log in §10), which the verify stage caught by reading the
   rounds in order rather than by running anything.
7. Confirm the insert-only rule and the absent update and delete paths are
   untouched, and that the launch guard still reads the ledger rather than the
   pattern rows.
8. Run `npm run lint`, `npm run typecheck`, and `npm run test:ci`.
