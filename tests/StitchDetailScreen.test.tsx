import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { StitchDetail } from '@/data/contracts/stitchRepository';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { StitchDetailScreen } from '@/features/dictionary/presentation/StitchDetailScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import {
  dashOffsets,
  renderedNodes,
  type RenderedNode,
} from './support/renderedArt';
import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

/**
 * The bundled chain instructions, in the order the seed document authors them.
 * Asserting them literally means a sort, a reverse, or a dropped step fails.
 */
const CHAIN_STEPS = [
  'Make a slip knot — cross the yarn into a loop, draw the working end through it, slide it onto the hook, and pull the tail to close it.',
  'Hold the tail below the hook and wrap the working yarn over the hook from back to front.',
  'Draw that wrap through the loop already on the hook to finish one chain.',
  'Repeat the wrap and the draw through for every chain the pattern asks for, keeping each loop the same size.',
  'Count the V shapes along the front of the chain and never count the loop still on the hook.',
];

/**
 * Single crochet's five sentences, written out here rather than read from the
 * seed. Issue #46 adds a drawing under each one; these literals are what proves
 * it altered no character of the text (and no step's position) while doing so.
 */
const SINGLE_CROCHET_STEPS = [
  'Insert the hook front to back under both top loops of the next stitch.',
  'Yarn over and draw a loop back through the stitch, leaving two loops on the hook.',
  'Yarn over again and draw through both loops on the hook.',
  'One loop remains, and the finished stitch stands a single loop tall.',
  'At the end of a row, chain one and turn before working the next row.',
];

function stepLabels() {
  return screen
    .getAllByLabelText(/^Step \d+ of \d+: /u)
    .map((step) => step.props.accessibilityLabel);
}

/** The step drawings, which are hidden from assistive technology by design. */
function artNodes() {
  return screen.queryAllByTestId(/^stitch-step-art-/u, {
    includeHiddenElements: true,
  });
}

/** Every character rendered beneath one node, in order. */
function textOf(node: RenderedNode): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

/**
 * Where the sentence and the drawing sit inside one step card. `renderedNodes`
 * walks pre-order, so a smaller index is rendered — and so laid out — above.
 */
function stepCardOrder(index: number) {
  const card = screen.getAllByLabelText(/^Step \d+ of \d+: /u, {
    includeHiddenElements: true,
  })[index] as unknown as RenderedNode;
  const nodes = renderedNodes(card);

  return {
    sentence: nodes.findIndex(
      (node) => textOf(node) === SINGLE_CROCHET_STEPS[index],
    ),
    art: nodes.findIndex(
      (node) => node.props.testID === `stitch-step-art-${index}`,
    ),
  };
}

function tree(repositories: Repositories, stitchId: string) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <StitchDetailScreen stitchId={stitchId} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('StitchDetailScreen', () => {
  let database: TestDatabase;
  let seeded: Repositories;
  let chainId: string;
  let singleCrochetId: string;

  beforeEach(() => {
    database = createTestDatabase();
    applyBundledStitchSeed(database.repositories.stitches);
    seeded = database.repositories;
    const bundled = seeded.stitches.listStitches();
    chainId = bundled.find((stitch) => stitch.slug === 'chain')?.id ?? '';
    singleCrochetId =
      bundled.find((stitch) => stitch.slug === 'single-crochet')?.id ?? '';
  });

  afterEach(() => {
    database.close();
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('renders the stitch identity and every instruction in authored order', async () => {
    await render(tree(seeded, chainId));

    expect(screen.getByRole('header', { name: 'Chain' })).toBeOnTheScreen();
    expect(screen.getByText('Abbreviation ch')).toBeOnTheScreen();
    expect(screen.getByText('Difficulty Beginner')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Steps' })).toBeOnTheScreen();

    expect(
      screen
        .getAllByLabelText(/^Step \d+ of \d+: /u)
        .map((step) => step.props.accessibilityLabel),
    ).toStrictEqual(
      CHAIN_STEPS.map(
        (instruction, index) =>
          `Step ${index + 1} of ${CHAIN_STEPS.length}: ${instruction}`,
      ),
    );
  });

  it('draws single crochet with one animation per step and its text untouched', async () => {
    await render(tree(seeded, singleCrochetId));

    expect(stepLabels()).toStrictEqual(
      SINGLE_CROCHET_STEPS.map(
        (instruction, index) =>
          `Step ${index + 1} of ${SINGLE_CROCHET_STEPS.length}: ${instruction}`,
      ),
    );
    // Five sentences, five drawings — and the accessibility tree above still
    // exposes exactly the five step labels, so the art added nothing to read.
    expect(artNodes()).toHaveLength(5);
  });

  it('renders every drawing below its instruction sentence, never above it', async () => {
    await render(tree(seeded, singleCrochetId));

    // The sentence keeps the top of the card at every text size: art placed
    // above the row would push the instruction column down and, on a large
    // system font, squeeze it. Order is the only part of that Jest can see.
    for (let index = 0; index < SINGLE_CROCHET_STEPS.length; index += 1) {
      const { sentence, art } = stepCardOrder(index);

      expect(sentence).toBeGreaterThanOrEqual(0);
      expect(art).toBeGreaterThan(sentence);
    }
  });

  it('negative branch: under reduced motion every drawing paints finished, with no delay to the text', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');

    try {
      await render(tree(seeded, singleCrochetId));

      // The sentences are present in this same first render: nothing about the
      // text waits on an animation that, here, never runs at all.
      expect(stepLabels()).toStrictEqual(
        SINGLE_CROCHET_STEPS.map(
          (instruction, index) =>
            `Step ${index + 1} of ${SINGLE_CROCHET_STEPS.length}: ${instruction}`,
        ),
      );
      expect(
        artNodes().flatMap((node) =>
          dashOffsets(node as unknown as RenderedNode),
        ),
      ).toStrictEqual([0, 0, 0, 0, 0]);
      expect(withTiming).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('negative branch: a bundled stitch with no authored art renders none', async () => {
    await render(tree(seeded, chainId));

    expect(screen.getAllByLabelText(/^Step \d+ of \d+: /u)).toHaveLength(5);
    expect(artNodes()).toStrictEqual([]);
  });

  it('negative branch: a maker-owned stitch has no slug, so it renders no art', async () => {
    // Inserted through the connection because the repository's only write path
    // is the seed upsert; ownership 'user' is exactly the row shape a maker's
    // own stitch takes, with slug and seed_version NULL.
    database.connection.run(
      `INSERT INTO stitch (id, slug, name, abbreviation, difficulty, summary, ownership, seed_version, user_modified_at, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'user', NULL, NULL, ?, ?)`,
      ['maker-stitch', 'My puff', 'puff', 'beginner', 'A stitch I made up.', 1, 1],
    );
    database.connection.run(
      `INSERT INTO stitch_instruction (id, stitch_id, position, instruction, image_asset_key, created_at, updated_at)
       VALUES (?, ?, 0, ?, NULL, ?, ?)`,
      ['maker-step-0', 'maker-stitch', 'Yarn over four times and pull through.', 1, 1],
    );

    await render(tree(seeded, 'maker-stitch'));

    expect(
      screen.getByLabelText(
        'Step 1 of 1: Yarn over four times and pull through.',
      ),
    ).toBeOnTheScreen();
    expect(artNodes()).toStrictEqual([]);
  });

  it('renders no imagery for a text-only bundled stitch', async () => {
    await render(tree(seeded, chainId));

    // The approved PRD0 content set carries no `imageAssetKey`, so a
    // placeholder illustration must never appear in its place.
    expect(screen.queryByRole('image')).not.toBeOnTheScreen();
  });

  it('tells the maker a stale identifier is not in their dictionary', async () => {
    await render(tree(seeded, 'not-a-stitch'));

    expect(
      screen.getByRole('header', {
        name: "That stitch isn't in your dictionary",
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Back to stitches' }),
    ).toBeOnTheScreen();
  });

  it('offers a retry when the local read fails, and recovers', async () => {
    const getStitchDetail = jest
      .fn<StitchDetail | undefined, [string]>()
      .mockImplementationOnce(() => {
        throw new Error('simulated read failure');
      })
      .mockImplementation((id) => seeded.stitches.getStitchDetail(id));
    const repositories: Repositories = {
      ...seeded,
      stitches: { ...seeded.stitches, getStitchDetail },
    };

    await render(tree(repositories, chainId));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', {
        name: "We couldn't read your stitch dictionary",
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Chain' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Chain' })).toBeOnTheScreen();
  });
});
