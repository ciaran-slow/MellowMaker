import { act } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import { createAppDatabase } from '@/platform/database/createAppDatabase';

import {
  repositoryCallCount,
  resetRepositoryCallCounts,
} from './support/countedRepositories';

jest.mock('@/data/sqlite/createRepositories', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./support/countedRepositories').countedRepositoriesModule(),
);

const routes = 'src/app';

/**
 * Every screen here that shows persisted data re-reads it on focus:
 *
 * ```ts
 * useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
 * ```
 *
 * The dependency array is load-bearing and was **unfalsified on all five
 * screens** until this suite (issue #51 retro; the #51 build's M13 mutation
 * widened it to `[refresh, state]` and every suite stayed green).
 * `expo-router`'s `useFocusEffect` re-runs the callback whenever its identity
 * changes while the screen is focused, and each read produces a fresh state
 * object — so depending on the state turns "one read per focus" into a read
 * loop that reopens SQLite for as long as the maker looks at the screen.
 *
 * The isolated screen suites cannot see it: they mock `useFocusEffect` as a
 * capture and fire the callback themselves, so no re-subscription ever happens.
 * Only the real router shows it, and only once the tree has settled — which is
 * why each case below reads once, resets the counter, lets the timers run out,
 * and asserts **no further read arrived**.
 *
 * `whileLoading === 1` is the non-vacuity half: without it a screen that never
 * read at all would pass the settle assertion trivially.
 */
async function expectOneBoundedRead(key: string): Promise<void> {
  expect(repositoryCallCount(key)).toBe(1);
  resetRepositoryCallCounts();

  // The harness runs on fake timers, so this drains everything the focused tree
  // has queued rather than waiting on the wall clock.
  await act(async () => {
    jest.advanceTimersByTime(200);
  });

  expect(repositoryCallCount(key)).toBe(0);
}

async function seedGuide(): Promise<string> {
  const database = await createAppDatabase();
  const created = database.repositories.guides.saveImportedGuide({
    guide: {
      videoId: 'dQw4w9WgXcQ',
      sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Amigurumi Basics',
    },
    steps: [
      { instruction: 'Magic ring', origin: 'user' },
      { instruction: 'Chain 12', origin: 'user' },
    ],
  });

  return created.guide.id;
}

describe('focus read budget (issue #51 retro)', () => {
  it('reads the guide library once when the Guides screen is focused', async () => {
    await seedGuide();

    await renderRouter(routes, { initialUrl: '/guides' });
    await screen.findByLabelText('Amigurumi Basics');

    await expectOneBoundedRead('guides.listGuides');
  });

  it('reads the guide once when the working view is focused', async () => {
    const guideId = await seedGuide();

    await renderRouter(routes, { initialUrl: `/guides/${guideId}` });
    await screen.findByRole('header', { name: 'Amigurumi Basics' });

    await expectOneBoundedRead('guides.getGuideWithSteps');
  });

  it('reads the guide once when the save-as-pattern review is focused', async () => {
    const guideId = await seedGuide();

    await renderRouter(routes, {
      initialUrl: `/guides/${guideId}/save-as-pattern`,
    });
    await screen.findByText('2 steps will be copied into your new pattern');

    await expectOneBoundedRead('guides.getGuideWithSteps');
  });

  it('reads the pattern library once when the Patterns screen is focused', async () => {
    await renderRouter(routes, { initialUrl: '/patterns' });
    await screen.findByLabelText(/^Practice Swatch/);

    await expectOneBoundedRead('patterns.listPatterns');
  });

  it('reads the pattern once when the viewer is focused', async () => {
    const database = await createAppDatabase();
    const created = database.repositories.patterns.createPattern({
      title: 'Meadow Wrap',
      steps: ['Chain 20', 'Turn'],
    });

    await renderRouter(routes, {
      initialUrl: `/patterns/${created.pattern.id}`,
    });
    await screen.findByRole('header', { name: 'Meadow Wrap' });

    await expectOneBoundedRead('patterns.getPatternWithSteps');
  });
});
