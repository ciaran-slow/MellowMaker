import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { AppDatabase, Repositories } from '@/data/contracts/appDatabase';
import { DatabaseError } from '@/data/contracts/databaseError';

const mockCreateAppDatabase = jest.fn<Promise<AppDatabase>, []>();

jest.mock('@/platform/database/createAppDatabase', () => ({
  createAppDatabase: mockCreateAppDatabase,
}));

const appDatabase: AppDatabase = {
  repositories: {} as Repositories,
  schemaVersion: 1,
  close: () => {},
};

describe('route-level database gating', () => {
  beforeEach(() => {
    mockCreateAppDatabase.mockReset();
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
    expect(
      screen.queryByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Stitches' })).not.toBeOnTheScreen();

    release(appDatabase);

    expect(
      await screen.findByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Patterns' })).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
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
    expect(
      screen.queryByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Stitches' })).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).toBeOnTheScreen();
  });
});
