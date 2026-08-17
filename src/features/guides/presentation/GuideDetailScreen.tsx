import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';

import { useGuideDetail } from '@/features/guides/presentation/useGuideDetail';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftConfirmDialog } from '@/ui/components/CraftConfirmDialog';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

type GuideDetailScreenProps = {
  guideId: string;
};

export function GuideDetailScreen({ guideId }: GuideDetailScreenProps) {
  const router = useRouter();
  const detail = useGuideDetail(guideId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/guides');
    }
  }

  const { status, refresh } = detail;

  return (
    <View className="flex-1 bg-background">
      <Screen accessibilityLabel="Guide screen">
        <CraftPressable
          accessibilityLabel="Back to guides"
          className="items-center self-start bg-surface px-4"
          onPress={goBack}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="arrow-left"
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>

        {status.kind === 'loading' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading this guide"
            accessibilityState={{ busy: true }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={tokens.colors.teal} size="large" />
          </View>
        ) : null}

        {status.kind === 'not-found' ? (
          <CraftCard accent="teal">
            <Text accessibilityRole="header" className="text-heading text-ink">
              This guide is no longer here
            </Text>
            <Text className="text-body text-ink">
              It may have been deleted. Go back to your guides to keep making.
            </Text>
          </CraftCard>
        ) : null}

        {status.kind === 'failed' ? (
          <>
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
                    We couldn&apos;t open this guide
                  </Text>
                </View>
                <Text className="text-body text-ink">
                  Your guide is saved on this device. Try again — nothing was
                  lost.
                </Text>
              </CraftCard>
            </View>
            <CraftPressable
              accessibilityLabel="Try again"
              className="items-center bg-yellow px-6 py-3"
              onPress={detail.retry}
            >
              <Text className="text-label text-ink">Try again</Text>
            </CraftPressable>
          </>
        ) : null}

        {status.kind === 'ready' ? (
          <View className="gap-6">
            <Text accessibilityRole="header" className="text-display text-ink">
              {status.guide.title}
            </Text>

            <CraftCard accent="blue">
              {status.guide.thumbnailUrl === undefined ? null : (
                <Image
                  accessibilityElementsHidden
                  className="w-full rounded-medium bg-background"
                  importantForAccessibility="no-hide-descendants"
                  resizeMode="cover"
                  source={{ uri: status.guide.thumbnailUrl }}
                  style={{ aspectRatio: 16 / 9 }}
                />
              )}
              <Text className="text-body text-ink">
                {status.guide.creator === undefined
                  ? 'Imported from YouTube'
                  : `By ${status.guide.creator}`}
              </Text>
              <Text className="text-label text-ink opacity-70">
                Imported from YouTube
              </Text>
            </CraftCard>

            <View accessibilityLiveRegion="polite">
              {refresh.kind === 'updated' ? (
                <Text className="text-label text-ink">
                  Guide details updated from YouTube.
                </Text>
              ) : null}
              {refresh.kind === 'unavailable' ? (
                <Text className="text-label text-ink">
                  Couldn&apos;t refresh — your saved guide is unchanged.
                </Text>
              ) : null}
            </View>

            <CraftPressable
              accessibilityLabel="Refresh metadata from YouTube"
              className="flex-row items-center justify-center gap-2 bg-teal px-6 py-3"
              disabled={refresh.kind === 'refreshing'}
              onPress={detail.refreshMetadata}
            >
              {refresh.kind === 'refreshing' ? (
                <ActivityIndicator color={tokens.colors.ink} />
              ) : null}
              <Text className="text-label text-ink">
                Refresh metadata from YouTube
              </Text>
            </CraftPressable>

            <CraftPressable
              accessibilityHint="Removes this guide from this device"
              accessibilityLabel="Delete guide"
              className="items-center bg-surface px-6 py-3"
              onPress={() => {
                setConfirmingDelete(true);
              }}
            >
              <Text className="text-label text-pink">Delete guide</Text>
            </CraftPressable>
          </View>
        ) : null}
      </Screen>

      <CraftConfirmDialog
        body="Delete this guide? Your saved guide details will be removed from this device. This can't be undone."
        cancelLabel="Keep guide"
        confirmLabel="Yes, delete guide"
        onCancel={() => {
          setConfirmingDelete(false);
        }}
        onConfirm={() => {
          setConfirmingDelete(false);
          detail.remove();
        }}
        title="Delete this guide?"
        visible={confirmingDelete}
      />
    </View>
  );
}
