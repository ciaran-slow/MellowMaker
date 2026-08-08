import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import { PixelRatio, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';

import type { AppDatabase, Repositories } from '@/data/contracts/appDatabase';
import { DatabaseError } from '@/data/contracts/databaseError';
import {
  DatabaseGate,
  databaseGateColors,
} from '@/ui/database/DatabaseGate';
import { useRepositories } from '@/ui/database/useRepositories';

import { contrastRatio } from './support/contrast';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const repositories = {
  stitches: {},
  patterns: {},
  progress: {},
  counters: {},
  guides: {},
} as unknown as Repositories;

const appDatabase: AppDatabase = {
  repositories,
  schemaVersion: 1,
  close: () => {},
};

function ReadyProbe() {
  return (
    <Text>
      {useRepositories() === repositories
        ? 'repositories ready'
        : 'wrong repositories'}
    </Text>
  );
}

function renderGate(initialize: () => Promise<AppDatabase>) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <DatabaseGate initialize={initialize}>
        <ReadyProbe />
      </DatabaseGate>
    </SafeAreaProvider>,
  );
}

describe('DatabaseGate', () => {
  it('holds children back until initialization resolves', async () => {
    let release: (database: AppDatabase) => void = () => {};
    const initialize = jest.fn(
      () =>
        new Promise<AppDatabase>((resolve) => {
          release = resolve;
        }),
    );

    await renderGate(initialize);

    const preparing = screen.getByRole('progressbar', {
      name: 'Preparing your saved making data',
    });
    expect(preparing).toBeOnTheScreen();
    expect(preparing.props.accessibilityState).toEqual({ busy: true });
    expect(preparing.props.accessibilityLiveRegion).toBe('polite');
    expect(
      screen.getByRole('header', { name: 'Getting your making space ready' }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('databaseGateSpinner')).toBeOnTheScreen();
    expect(screen.queryByText('repositories ready')).not.toBeOnTheScreen();
    expect(initialize).toHaveBeenCalledTimes(1);

    release(appDatabase);

    expect(await screen.findByText('repositories ready')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });

  it('drops the spinner but keeps the message when motion is reduced', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);

    try {
      await renderGate(jest.fn(() => new Promise<AppDatabase>(() => {})));

      expect(
        screen.getByRole('progressbar', {
          name: 'Preparing your saved making data',
        }),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('header', { name: 'Getting your making space ready' }),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('databaseGateSpinner')).not.toBeOnTheScreen();
    } finally {
      jest.mocked(useReducedMotion).mockReturnValue(false);
    }
  });

  it('reports a recoverable failure and recovers on retry', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    const initialize = jest
      .fn<Promise<AppDatabase>, []>()
      .mockRejectedValueOnce(
        new DatabaseError('migration-failed', {
          schemaVersion: 1,
          failedVersion: 2,
        }),
      )
      .mockResolvedValueOnce(appDatabase);

    await renderGate(initialize);

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', {
        name: "We couldn't open your saved making data",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Your saved work is still on this device/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Error code: migration-failed')).toBeOnTheScreen();
    expect(screen.queryByText('repositories ready')).not.toBeOnTheScreen();

    // Recovery never offers to discard the maker's database.
    expect(
      screen.queryByRole('button', { name: /reset|erase|delete|start fresh/i }),
    ).not.toBeOnTheScreen();

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveStyle({
      backgroundColor: databaseGateColors.retryBackground,
      minHeight: 48,
    });

    await fireEvent.press(retry);

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('repositories ready')).toBeOnTheScreen();
  });

  it('names an unexpected failure without leaking its detail', async () => {
    const initialize = jest
      .fn<Promise<AppDatabase>, []>()
      .mockRejectedValue(new Error('EACCES: /private/var/mobile/Sunrise.db'));

    await renderGate(initialize);

    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('Error code: unexpected-error')).toBeOnTheScreen();
    expect(screen.queryByText(/Sunrise\.db/)).not.toBeOnTheScreen();
  });

  it('keeps the retry control legible against the documented palette', () => {
    expect(
      contrastRatio(
        databaseGateColors.retryForeground,
        databaseGateColors.retryBackground,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('refuses to hand out repositories outside a ready gate', async () => {
    function OrphanProbe() {
      useRepositories();

      return null;
    }

    await expect(render(<OrphanProbe />)).rejects.toThrow(
      'useRepositories must be called inside a ready DatabaseGate.',
    );
  });
});
