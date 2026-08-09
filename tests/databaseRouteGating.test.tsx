import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { AppDatabase } from '@/data/contracts/appDatabase';
import { DatabaseError } from '@/data/contracts/databaseError';
import type * as CreateAppDatabaseModule from '@/platform/database/createAppDatabase';

const mockCreateAppDatabase = jest.fn<Promise<AppDatabase>, []>();

jest.mock('@/platform/database/createAppDatabase', () => ({
  createAppDatabase: mockCreateAppDatabase,
}));

// The gated screens read on mount, so the gate must publish working
// repositories rather than a placeholder object. The mocked `expo-sqlite`
// engine already backs the real composition, so this is the production stack.
const { createAppDatabase: openRealAppDatabase } =
  jest.requireActual<typeof CreateAppDatabaseModule>(
    '@/platform/database/createAppDatabase',
  );

describe('route-level database gating', () => {
  let appDatabase: AppDatabase;

  beforeEach(async () => {
    mockCreateAppDatabase.mockReset();
    appDatabase = await openRealAppDatabase();
  });

  afterEach(() => {
    appDatabase.close();
  });

  it('shows no tab content until initialization succeeds', async () => {
    let release: (database: AppDatabase) => void = () => {};
    mockCreateAppDatabase.mockImplementation(
      () =>
        new Promise<AppDatabase>((resolve) => {
          release = resolve;
        }),
    );

    await renderRouter('src/app', { initialUrl: '/' });

    expect(
      screen.getByRole('progressbar', {
        name: 'Preparing your saved making data',
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Search stitches')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Stitches' })).not.toBeOnTheScreen();

    release(appDatabase);

    expect(await screen.findByLabelText('Search stitches')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Patterns' })).toBeOnTheScreen();
    expect(
      screen.queryByLabelText('Preparing your saved making data'),
    ).not.toBeOnTheScreen();
  });

  it('offers a retry instead of tab content when initialization fails', async () => {
    mockCreateAppDatabase
      .mockRejectedValueOnce(
        new DatabaseError('migration-failed', {
          schemaVersion: 1,
          failedVersion: 2,
        }),
      )
      .mockResolvedValueOnce(appDatabase);

    await renderRouter('src/app', { initialUrl: '/' });

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', {
        name: "We couldn't open your saved making data",
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Error code: migration-failed')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Search stitches')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Stitches' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByLabelText('Search stitches')).toBeOnTheScreen();
  });
});
