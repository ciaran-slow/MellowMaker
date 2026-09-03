import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type PropsWithChildren, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import type { AppDatabase } from '@/data/contracts/appDatabase';
import { DatabaseError } from '@/data/contracts/databaseError';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { Screen } from '@/ui/components/Screen';
import { RepositoriesContext } from '@/ui/database/repositoriesContext';
import tokens from '@/ui/theme/tokens.json';

const OPEN_FAILED_TITLE = "We couldn't open your saved making data";

/** Token pairs the accessibility contrast test asserts against. */
export const databaseGateColors = {
  retryBackground: tokens.colors.yellow,
  retryForeground: tokens.colors.ink,
  progressAccent: tokens.colors.teal,
  failureAccent: tokens.colors.pink,
} as const;

type DatabaseGateProps = PropsWithChildren<{
  /**
   * Opens and migrates the database. Must be a stable reference: the gate
   * re-runs it whenever the prop identity changes.
   */
  initialize: () => Promise<AppDatabase>;
}>;

type GateState =
  | { readonly status: 'initializing' }
  | { readonly status: 'ready'; readonly database: AppDatabase }
  | { readonly status: 'failed'; readonly code: string };

/**
 * Holds every data-dependent screen back until the local database is open and
 * migrated, and turns an initialization failure into a retryable state instead
 * of a crash or an empty database. There is deliberately no reset control: the
 * database file is never recreated to get past an error.
 */
export function DatabaseGate({ children, initialize }: DatabaseGateProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GateState>({ status: 'initializing' });
  const reduceMotion = useReducedMotion();
  // VoiceOver never reads a live region, so the failure title is spoken through
  // the iOS announcement seam as well (A11Y-07).
  useAnnouncement(state.status === 'failed' ? OPEN_FAILED_TITLE : undefined);

  useEffect(() => {
    let cancelled = false;

    // Running in an effect lets the preparing state paint before any
    // synchronous SQL work begins.
    initialize().then(
      (database) => {
        if (!cancelled) {
          setState({ status: 'ready', database });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'failed',
            code:
              error instanceof DatabaseError ? error.code : 'unexpected-error',
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attempt, initialize]);

  const retry = useCallback(() => {
    setState({ status: 'initializing' });
    setAttempt((previous) => previous + 1);
  }, []);

  if (state.status === 'ready') {
    return (
      <RepositoriesContext.Provider value={state.database.repositories}>
        {children}
      </RepositoriesContext.Provider>
    );
  }

  if (state.status === 'failed') {
    return (
      <Screen accessibilityLabel="Saved making data unavailable screen">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <CraftCard accent="pink">
            <View className="flex-row items-center gap-3">
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={databaseGateColors.failureAccent}
                name="alert-circle"
                size={tokens.typography.heading.fontSize}
              />
              <Text
                accessibilityRole="header"
                className="flex-1 text-heading text-ink"
              >
                {OPEN_FAILED_TITLE}
              </Text>
            </View>
            <Text className="text-body text-ink">
              Your saved work is still on this device. Try again — nothing has
              been deleted.
            </Text>
            <Text className="text-label text-ink">Error code: {state.code}</Text>
          </CraftCard>
        </View>
        <Pressable
          accessibilityLabel="Try again"
          accessibilityRole="button"
          className="items-center justify-center rounded-large px-6 py-3"
          onPress={retry}
          style={{
            backgroundColor: databaseGateColors.retryBackground,
            minHeight: tokens.touch.minimum,
            minWidth: tokens.touch.minimum,
          }}
        >
          <Text
            className="text-label"
            style={{ color: databaseGateColors.retryForeground }}
          >
            Try again
          </Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen accessibilityLabel="Preparing saved making data screen">
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Preparing your saved making data"
        accessibilityState={{ busy: true }}
        accessibilityLiveRegion="polite"
      >
        <CraftCard accent="blue">
          <Text accessibilityRole="header" className="text-heading text-ink">
            Getting your making space ready
          </Text>
          {reduceMotion ? null : (
            <ActivityIndicator
              color={databaseGateColors.progressAccent}
              size="large"
              testID="databaseGateSpinner"
            />
          )}
        </CraftCard>
      </View>
    </Screen>
  );
}
