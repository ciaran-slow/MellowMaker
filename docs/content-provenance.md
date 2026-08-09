# Bundled Content Provenance

**Status:** Approved for PRD0
**Applies to:** every stitch instruction, summary, and visual reference shipped inside the iOS and Android builds
**Traceability:** FR-ST-01, FR-ST-05; PRD0 decision 1; [`architecture.md`](./architecture.md) §6
**Content artifact:** [`src/data/seed/stitchSeed.json`](../src/data/seed/stitchSeed.json)
**Format and validator:** [`src/data/seed/stitchSeedDocument.ts`](../src/data/seed/stitchSeedDocument.ts)

## 1. Decision

PRD0 ships original crochet instruction text authored for this repository and
owned by the project. No third-party instruction text is included, and no
third-party imagery is bundled.

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
| 1 | PRD0 initial content set | `d50f2a122ea3729878babf620db528c5817de7aae3ee9c03d55962554c8aed6d` |

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
