import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import type { StitchDetail } from '@/data/contracts/stitchRepository';
import { applyBundledStitchSeed } from '@/data/seed/stitchSeed';
import { StitchDetailScreen } from '@/features/dictionary/presentation/StitchDetailScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

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

  beforeEach(() => {
    database = createTestDatabase();
    applyBundledStitchSeed(database.repositories.stitches);
    seeded = database.repositories;
    chainId =
      seeded.stitches.listStitches().find((stitch) => stitch.slug === 'chain')
        ?.id ?? '';
  });

  afterEach(() => {
    database.close();
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
