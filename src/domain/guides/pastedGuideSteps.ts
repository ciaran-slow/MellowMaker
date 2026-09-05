/**
 * Pure classification of text a maker pasted out of YouTube into an ordered
 * draft of guide steps (issue #50; architecture §9.2). The app fetches nothing:
 * this module only ever sees a string the maker selected in YouTube's own UI and
 * pasted into their guide, and it turns that string into drafts that presentation
 * shows for review before anything is written.
 *
 * It imports nothing from React, Expo, `src/ui`, or `src/data` (lint enforces the
 * boundary) and reaches for no network, so it stays trivially testable offline.
 * It reuses `parseStepTimestamp` from `guideStepDraft.ts` as the app's only time
 * grammar — no second parser for `M:SS`/`H:MM:SS` is introduced here.
 *
 * Two shapes of paste collapse onto one intermediate `TimedEntry[]`:
 *
 * - **Chapters (primary).** A description's creator-authored chapter list, whose
 *   labels are already instructions. Recognized by the ten-second-minimum gap
 *   rule rather than by YouTube's full chapter rule — see the classifier below.
 * - **Transcript cues (fallback).** Caption cues run 2–6 seconds and a long
 *   tutorial yields hundreds of them, so consecutive cues are merged into
 *   `CUE_MERGE_WINDOW_MS` blocks that carry the **first** cue's offset.
 */

import {
  parseStepTimestamp,
  validateGuideStepInstruction,
} from '@/domain/guides/guideStepDraft';

/** One reviewable draft step. Never persisted directly; the maker confirms first. */
export interface PastedStepDraft {
  readonly instruction: string;
  readonly videoOffsetMs?: number;
  readonly transcriptExcerpt?: string;
}

export type PastedStepsRejection =
  /** Nothing pasted, or whitespace only. */
  | 'empty'
  /** Over the character cap; refused BEFORE any scanning. */
  | 'too-long'
  /** No line carried a parseable time code. */
  | 'no-timestamps'
  /** Time codes were found, but no text to make an instruction from. */
  | 'no-step-text'
  /** The parse exceeded the step cap; refused, never silently truncated. */
  | 'too-many-steps';

/** Which of the two accepted shapes the paste was classified as. */
export type PastedStepsSource = 'chapters' | 'cues';

export type ParsePastedStepsResult =
  | {
      readonly ok: true;
      readonly source: PastedStepsSource;
      readonly steps: readonly PastedStepDraft[];
    }
  | { readonly ok: false; readonly reason: PastedStepsRejection };

/*
 * These four bounds are deliberately module-private: a test that pinned them by
 * importing them could not fail when the value moved, so every fixture writes
 * the number it expects literally instead.
 */

/** NFR-09 input bound: refused before parsing, so a huge blob is never scanned. */
const MAX_PASTE_CHARACTERS = 100_000;
/** NFR-09 output bound: a parse yielding more is refused, never truncated. */
const MAX_DERIVED_STEPS = 200;
/** YouTube's ten-second chapter minimum — the classifier's discriminator. */
const CHAPTER_MIN_GAP_MS = 10_000;
/** Cue merge window: consecutive cues accumulate until the span reaches this. */
const CUE_MERGE_WINDOW_MS = 30_000;

/**
 * A line-leading time code, optionally wrapped in `[…]` or `(…)`.
 *
 * Only colon-separated forms are recognized, even though `parseStepTimestamp`
 * also accepts bare seconds: a description line reading `6 double crochets` is
 * prose, and reading it as a step at 0:06 would fabricate a step out of a stitch
 * count. This narrows the *recognizer*, not the grammar — the matched token is
 * still handed to `parseStepTimestamp`, which stays the one converter.
 */
const TIME_CODE_LINE = /^\s*[[(]?\s*(\d{1,3}(?::\d{1,2}){1,2})\s*[\])]?/;

/** Leading punctuation between a time code and its label: `0:00 - Materials`. */
const LEADING_SEPARATORS = /^[\s\-–—:|]+/;

interface TimedEntry {
  readonly offsetMs: number;
  text: string;
  /** A blank line preceded this entry, so a cue run must break before it. */
  readonly blockBreak: boolean;
  /** A blank line closed this entry: later prose belongs to no entry. */
  closed: boolean;
}

/**
 * Scans the paste into ordered entries. Both clipboard shapes collapse here —
 * a time code alone on its line with the text following, and a time code inline
 * with its text — which is what makes "identical output for the same content"
 * structural rather than incidental.
 *
 * Three rules keep maker text from being attributed to the wrong timestamp:
 * a line whose time code will not parse is skipped **whole**, text before the
 * first time code is discarded (a `Chapters:` header, a sponsor blurb), and a
 * blank line closes the open entry.
 */
function scanEntries(raw: string): TimedEntry[] {
  const entries: TimedEntry[] = [];
  let pendingBreak = false;

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') {
      const open = entries[entries.length - 1];
      if (open !== undefined) {
        open.closed = true;
      }
      pendingBreak = true;
      continue;
    }

    const match = TIME_CODE_LINE.exec(line);
    const token = match?.[1];
    if (match !== null && token !== undefined) {
      const parsed = parseStepTimestamp(token);
      if (!parsed.ok || parsed.value === undefined) {
        // Skip the whole line, token and trailing text: text on an unparseable
        // line cannot be safely attributed to a neighbouring entry, and
        // inventing an attribution would move maker text under a wrong time.
        continue;
      }

      entries.push({
        offsetMs: parsed.value,
        text: line
          .slice(match[0]?.length ?? 0)
          .replace(LEADING_SEPARATORS, '')
          .trim(),
        blockBreak: pendingBreak,
        closed: false,
      });
      pendingBreak = false;
      continue;
    }

    const open = entries[entries.length - 1];
    if (open === undefined || open.closed) {
      continue;
    }
    open.text = open.text === '' ? line.trim() : `${open.text} ${line.trim()}`;
  }

  return entries;
}

/**
 * `chapters` iff there are at least two labelled entries, strictly ascending,
 * with every consecutive gap at least ten seconds.
 *
 * The other two halves of YouTube's chapter rule — first timestamp `00:00`, at
 * least three timestamps — are deliberately **not** conditions. They govern
 * whether YouTube *renders* chapters, not what text a maker may select, and the
 * realistic phone gesture is a partial selection of the description. Requiring
 * `00:00` would push a clean chapter list grabbed from the middle into the cue
 * path, where its labels come back merged and duplicated into an excerpt.
 */
function classify(entries: readonly TimedEntry[]): PastedStepsSource {
  if (entries.length < 2) {
    return 'cues';
  }

  return entries.every((entry, index) => {
    if (!validateGuideStepInstruction(entry.text).ok) {
      return false;
    }
    if (index === 0) {
      return true;
    }

    const previous = entries[index - 1];

    return (
      previous !== undefined &&
      entry.offsetMs - previous.offsetMs >= CHAPTER_MIN_GAP_MS
    );
  })
    ? 'chapters'
    : 'cues';
}

/** One step per chapter entry. A creator's label is an instruction, not a transcript. */
function toChapterSteps(entries: readonly TimedEntry[]): PastedStepDraft[] {
  return entries.map((entry) => ({
    instruction: entry.text,
    videoOffsetMs: entry.offsetMs,
  }));
}

interface CueBlock {
  readonly firstOffsetMs: number;
  lastOffsetMs: number;
  readonly texts: string[];
}

/**
 * Merges consecutive cues into blocks carrying the **first** cue's offset, so a
 * merged step seeks to where its words start rather than where they end. A run
 * breaks on a blank line, on a non-ascending offset (the maker's paste order is
 * never repaired), or once the accumulated span reaches the merge window.
 */
function toCueSteps(entries: readonly TimedEntry[]): PastedStepDraft[] {
  const blocks: CueBlock[] = [];

  for (const entry of entries) {
    const open = blocks[blocks.length - 1];
    const startsBlock =
      open === undefined ||
      entry.blockBreak ||
      entry.offsetMs <= open.lastOffsetMs ||
      entry.offsetMs - open.firstOffsetMs >= CUE_MERGE_WINDOW_MS;

    if (startsBlock) {
      blocks.push({
        firstOffsetMs: entry.offsetMs,
        lastOffsetMs: entry.offsetMs,
        texts: entry.text === '' ? [] : [entry.text],
      });
      continue;
    }

    open.lastOffsetMs = entry.offsetMs;
    if (entry.text !== '') {
      open.texts.push(entry.text);
    }
  }

  return blocks.flatMap((block) => {
    const joined = block.texts.join(' ').trim();
    // `instruction` is NOT NULL and must be non-empty, so a wordless block
    // (time codes with their text toggled off) contributes no step at all.
    if (joined === '') {
      return [];
    }

    return [
      {
        instruction: joined,
        videoOffsetMs: block.firstOffsetMs,
        transcriptExcerpt: joined,
      },
    ];
  });
}

/**
 * Turns one pasted block into an ordered step draft, or an actionable reason
 * code. Copy for each reason lives in presentation, and no reason carries any of
 * the maker's own text (NFR-12).
 */
export function parsePastedGuideSteps(raw: string): ParsePastedStepsResult {
  if (raw.trim() === '') {
    return { ok: false, reason: 'empty' };
  }
  if (raw.length > MAX_PASTE_CHARACTERS) {
    // Checked before any scanning, so an oversized blob is never walked.
    return { ok: false, reason: 'too-long' };
  }

  const entries = scanEntries(raw);
  if (entries.length === 0) {
    return { ok: false, reason: 'no-timestamps' };
  }

  const source = classify(entries);
  const steps =
    source === 'chapters' ? toChapterSteps(entries) : toCueSteps(entries);

  if (steps.length === 0) {
    return { ok: false, reason: 'no-step-text' };
  }
  if (steps.length > MAX_DERIVED_STEPS) {
    // Refused, never truncated: silently dropping the tail of a maker's paste
    // would look like a successful import that lost their content.
    return { ok: false, reason: 'too-many-steps' };
  }

  return { ok: true, source, steps };
}
