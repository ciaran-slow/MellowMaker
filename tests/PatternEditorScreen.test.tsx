import { fireEvent, render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Repositories } from '@/data/contracts/appDatabase';
import { PatternEditorScreen } from '@/features/patterns/presentation/PatternEditorScreen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

// The editor is rendered outside a navigator here, so navigation is captured
// rather than performed; the navigation suite drives the real router.
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function tree(repositories: Repositories, patternId?: string) {
  return (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <RepositoriesContext.Provider value={repositories}>
        <PatternEditorScreen {...(patternId === undefined ? {} : { patternId })} />
      </RepositoriesContext.Provider>
    </SafeAreaProvider>
  );
}

describe('PatternEditorScreen', () => {
  let database: TestDatabase;
  let repositories: Repositories;

  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockBack.mockClear();
    database = createTestDatabase();
    repositories = database.repositories;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    database.close();
  });

  it('creates a pattern with ordered steps and navigates into edit mode', async () => {
    await render(tree(repositories));

    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Sunrise Blanket',
    );
    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'Chain 41',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'Single crochet across',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));

    expect(
      screen.getByLabelText('Step 1 of 2: Chain 41'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Step 2 of 2: Single crochet across'),
    ).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Create pattern' }),
    );

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const target = mockReplace.mock.calls[0]?.[0] as {
      pathname: string;
      params: { patternId: string };
    };
    expect(target.pathname).toBe('/patterns/[patternId]');

    const persisted = repositories.patterns.getPatternWithSteps(
      target.params.patternId,
    );
    expect(persisted?.pattern.title).toBe('Sunrise Blanket');
    expect(persisted?.steps.map((step) => step.instruction)).toStrictEqual([
      'Chain 41',
      'Single crochet across',
    ]);
  });

  it('keeps Create pattern disabled and shows the field error for a blank title', async () => {
    await render(tree(repositories));

    expect(
      screen.getByRole('button', { name: 'Create pattern' }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByText('Give your pattern a name to save it.'),
    ).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renames a pattern and persists it offline', async () => {
    const created = repositories.patterns.createPattern({
      title: 'Draft title',
      steps: ['One'],
    });

    await render(tree(repositories, created.pattern.id));
    await screen.findByRole('header', { name: 'Edit pattern' });

    await fireEvent.changeText(
      screen.getByLabelText('Pattern title'),
      'Final title',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save details' }));

    // A fresh read from SQLite proves the rename is durable, not just in state.
    expect(
      repositories.patterns.getPatternWithSteps(created.pattern.id)?.pattern
        .title,
    ).toBe('Final title');
  });

  it('adds, edits, reorders, and deletes steps, persisting the exact order', async () => {
    const created = repositories.patterns.createPattern({
      title: 'Steps',
      steps: ['A', 'B'],
    });

    await render(tree(repositories, created.pattern.id));
    await screen.findByLabelText('Step 1 of 2: A');

    // Add a step.
    await fireEvent.changeText(
      screen.getByLabelText('New step instruction'),
      'C',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add step' }));
    await screen.findByLabelText('Step 3 of 3: C');

    // Move the first step down: A, B, C -> B, A, C.
    await fireEvent.press(
      screen.getByRole('button', { name: 'Move step 1 down' }),
    );
    await screen.findByLabelText('Step 1 of 3: B');
    expect(
      repositories.patterns
        .getPatternWithSteps(created.pattern.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['B', 'A', 'C']);

    // Edit the second step (A) inline.
    await fireEvent.press(screen.getByRole('button', { name: 'Edit step 2' }));
    await fireEvent.changeText(
      screen.getByLabelText('Edit step 2'),
      'A edited',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save step 2' }));
    await screen.findByLabelText('Step 2 of 3: A edited');

    // Delete the first step (B) -> A edited, C, renumbered.
    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete step 1' }),
    );
    await screen.findByLabelText('Step 1 of 2: A edited');
    expect(
      repositories.patterns
        .getPatternWithSteps(created.pattern.id)
        ?.steps.map((step) => step.instruction),
    ).toStrictEqual(['A edited', 'C']);
  });

  it('deletes a pattern only after the progress-warning confirmation', async () => {
    const created = repositories.patterns.createPattern({
      title: 'Doomed',
      steps: ['One'],
    });

    await render(tree(repositories, created.pattern.id));
    await screen.findByRole('header', { name: 'Edit pattern' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete pattern' }),
    );

    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText(/saved progress/i)).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, delete pattern' }),
    );

    expect(
      repositories.patterns.getPatternWithSteps(created.pattern.id),
    ).toBeUndefined();
    expect(mockReplace).toHaveBeenCalledWith('/patterns');
  });

  it('changes nothing when a deletion is cancelled', async () => {
    const created = repositories.patterns.createPattern({
      title: 'Survivor',
      steps: ['One', 'Two'],
    });

    await render(tree(repositories, created.pattern.id));
    await screen.findByRole('header', { name: 'Edit pattern' });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete pattern' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Keep pattern' }));

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    const survivor = repositories.patterns.getPatternWithSteps(
      created.pattern.id,
    );
    expect(survivor?.pattern.title).toBe('Survivor');
    expect(survivor?.steps.map((step) => step.instruction)).toStrictEqual([
      'One',
      'Two',
    ]);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('keeps the editor controls usable at double text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);

    await render(tree(repositories));

    expect(
      screen.getByRole('header', { name: 'New pattern' }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Pattern title')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Create pattern' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add step' })).toBeOnTheScreen();
  });
});
