import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { normalizeStitchQuery } from '@/domain/stitches/stitchQuery';
import { resultSummaryLabel } from '@/features/dictionary/presentation/stitchLabels';
import { StitchListRow } from '@/features/dictionary/presentation/StitchListRow';
import { useStitchCatalog } from '@/features/dictionary/presentation/useStitchCatalog';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import { useScreenContentInsets } from '@/ui/components/screenLayout';
import tokens from '@/ui/theme/tokens.json';

export function DictionaryScreen() {
  const [query, setQuery] = useState('');
  const contentInsets = useScreenContentInsets();
  const { state, loadMore, retry } = useStitchCatalog(query);
  const isSearch = normalizeStitchQuery(query) !== '';

  return (
    <View
      accessibilityLabel="Stitches screen"
      className="flex-1 bg-background"
      style={{
        paddingTop: contentInsets.paddingTop,
        paddingRight: contentInsets.paddingRight,
        paddingLeft: contentInsets.paddingLeft,
      }}
    >
      {/*
        The field lives above the list rather than in `ListHeaderComponent`: it
        stays reachable while scrolling, and a list re-render cannot remount it
        and drop keyboard focus mid-word.
      */}
      <View className="w-full max-w-screen-sm self-center gap-4 pb-4">
        <Text accessibilityRole="header" className="text-display text-ink">
          Stitches
        </Text>
        <CraftTextField
          accessibilityHint="Filters the list as you type"
          accessibilityLabel="Search stitches"
          clear={{
            accessibilityLabel: 'Clear the search field',
            onPress: () => {
              setQuery('');
            },
          }}
          onChangeText={setQuery}
          placeholder="Name or abbreviation"
          value={query}
        />
        {state.status === 'ready' ? (
          <Text accessibilityLiveRegion="polite" className="text-label text-ink">
            {resultSummaryLabel(state.stitches.length, isSearch)}
          </Text>
        ) : null}
      </View>

      {state.status === 'loading' ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your stitch dictionary"
          accessibilityState={{ busy: true }}
          accessibilityLiveRegion="polite"
          className="w-full max-w-screen-sm self-center"
        >
          <ActivityIndicator color={tokens.colors.teal} size="large" />
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <View className="w-full max-w-screen-sm self-center gap-4">
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <CraftCard accent="pink">
              <View className="flex-row items-center gap-3">
                <MaterialCommunityIcons
                  accessibilityElementsHidden
                  color={tokens.colors.pink}
                  name="alert-circle"
                  size={tokens.typography.heading.fontSize}
                />
                <Text
                  accessibilityRole="header"
                  className="flex-1 text-heading text-ink"
                >
                  We couldn&apos;t read your stitch dictionary
                </Text>
              </View>
              <Text className="text-body text-ink">
                Your stitches are saved on this device. Nothing was changed.
              </Text>
            </CraftCard>
          </View>
          <CraftPressable
            accessibilityLabel="Try again"
            className="items-center bg-yellow px-6 py-3"
            onPress={retry}
          >
            <Text className="text-label text-ink">Try again</Text>
          </CraftPressable>
        </View>
      ) : null}

      {state.status === 'ready' ? (
        <FlatList
          accessibilityLabel="Stitch results"
          className="w-full max-w-screen-sm self-center"
          contentContainerStyle={{
            gap: tokens.spacing[3],
            paddingBottom: contentInsets.paddingBottom,
          }}
          data={state.stitches}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(stitch) => stitch.id}
          ListEmptyComponent={
            isSearch ? (
              <View className="gap-4">
                <CraftCard accent="teal">
                  <Text
                    accessibilityRole="header"
                    className="text-heading text-ink"
                  >
                    {`No stitches match “${query.trim()}”`}
                  </Text>
                  <Text className="text-body text-ink">
                    Check the spelling, or try a shorter word or abbreviation.
                  </Text>
                </CraftCard>
                <CraftPressable
                  accessibilityLabel="Clear search"
                  className="items-center bg-yellow px-6 py-3"
                  onPress={() => {
                    setQuery('');
                  }}
                >
                  <Text className="text-label text-ink">Clear search</Text>
                </CraftPressable>
              </View>
            ) : null
          }
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator
                accessibilityLabel="Loading more stitches"
                color={tokens.colors.teal}
              />
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          renderItem={({ item }) => <StitchListRow stitch={item} />}
          testID="stitch-results"
        />
      ) : null}
    </View>
  );
}
