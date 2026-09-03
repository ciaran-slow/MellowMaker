import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';

import {
  normalizeGuideCreator,
  validateGuideTitle,
} from '@/domain/guides/guideDraft';
import type { YoutubeUrlRejection } from '@/domain/guides/youtubeUrl';
import {
  metadataUnavailableMessage,
  urlRejectionMessage,
} from '@/features/guides/presentation/guideImportLabels';
import {
  useGuideImport,
  type GuideImport,
  type ImportPhase,
} from '@/features/guides/presentation/useGuideImport';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

const DUPLICATE_TITLE = 'You already imported this guide';

export function GuideImportScreen() {
  const router = useRouter();
  const guideImport = useGuideImport();
  const { phase } = guideImport;

  // Import outcomes are spoken on iOS through the announcement seam (A11Y-07):
  // a rejected link, an already-imported video, and metadata that could not be
  // fetched. Announced here, over the phase, rather than inside the child forms
  // — those mount already showing the text, which the seam's first-render rule
  // would skip. The alert regions in the children remain Android's path.
  useAnnouncement(
    phase.kind === 'input' && phase.urlError !== undefined
      ? urlRejectionMessage(phase.urlError)
      : undefined,
  );
  useAnnouncement(phase.kind === 'duplicate' ? DUPLICATE_TITLE : undefined);
  useAnnouncement(
    phase.kind === 'review' && phase.metadata !== 'ok'
      ? metadataUnavailableMessage(phase.metadata.unavailable)
      : undefined,
  );

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/guides');
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Screen accessibilityLabel="Import guide screen">
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

        <Text accessibilityRole="header" className="text-display text-ink">
          Import from YouTube
        </Text>

        {phase.kind === 'input' ? (
          <UrlEntryForm
            onSubmit={guideImport.submitUrl}
            {...(phase.urlError === undefined
              ? {}
              : { urlError: phase.urlError })}
          />
        ) : null}

        {phase.kind === 'fetching' ? (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Looking up this video"
            accessibilityState={{ busy: true }}
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={tokens.colors.teal} size="large" />
          </View>
        ) : null}

        {phase.kind === 'duplicate' ? (
          <DuplicateNotice
            guideId={phase.guideId}
            onImportAnother={guideImport.resetToInput}
            title={phase.title}
          />
        ) : null}

        {phase.kind === 'review' ? (
          <GuideReviewForm
            key={phase.videoId}
            onCreate={guideImport.createGuide}
            onRetryFetch={guideImport.retryFetch}
            phase={phase}
          />
        ) : null}
      </Screen>
    </View>
  );
}

type UrlEntryFormProps = {
  onSubmit(raw: string): void;
  urlError?: YoutubeUrlRejection;
};

function UrlEntryForm({ onSubmit, urlError }: UrlEntryFormProps) {
  const [url, setUrl] = useState('');

  function submit() {
    onSubmit(url);
  }

  return (
    <View className="gap-3">
      <Text className="text-label text-ink">YouTube link</Text>
      <CraftTextField
        accessibilityLabel="YouTube link"
        autoCapitalize="none"
        icon="link-variant"
        keyboardType="url"
        onChangeText={setUrl}
        onSubmitEditing={submit}
        placeholder="Paste a YouTube video link"
        returnKeyType="go"
        testID="guide-url-field"
        value={url}
      />
      {urlError === undefined ? null : (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text className="text-label text-pinkStrong">
            {urlRejectionMessage(urlError)}
          </Text>
        </View>
      )}
      <CraftPressable
        accessibilityLabel="Look up video"
        className="items-center bg-tealStrong px-6 py-3"
        onPress={submit}
      >
        <Text className="text-label text-surface">Look up video</Text>
      </CraftPressable>
    </View>
  );
}

type DuplicateNoticeProps = {
  guideId: string;
  title: string;
  onImportAnother(): void;
};

function DuplicateNotice({
  guideId,
  onImportAnother,
  title,
}: DuplicateNoticeProps) {
  const router = useRouter();

  return (
    <View className="gap-4">
      <View accessible accessibilityRole="alert" accessibilityLiveRegion="polite">
        <CraftCard accent="blue">
          <Text accessibilityRole="header" className="text-heading text-ink">
            {DUPLICATE_TITLE}
          </Text>
          <Text className="text-body text-ink">
            “{title}” is already in your guides. Open it to keep making.
          </Text>
        </CraftCard>
      </View>
      <CraftPressable
        accessibilityLabel="Open guide"
        className="items-center bg-pinkStrong px-6 py-3"
        onPress={() => {
          router.replace({
            pathname: '/guides/[guideId]',
            params: { guideId },
          });
        }}
      >
        <Text className="text-label text-surface">Open guide</Text>
      </CraftPressable>
      <CraftPressable
        accessibilityLabel="Import another guide"
        className="items-center bg-surface px-6 py-3"
        onPress={onImportAnother}
      >
        <Text className="text-label text-ink">Import another</Text>
      </CraftPressable>
    </View>
  );
}

type GuideReviewFormProps = {
  phase: Extract<ImportPhase, { kind: 'review' }>;
  onCreate: GuideImport['createGuide'];
  onRetryFetch(): void;
};

function GuideReviewForm({ onCreate, onRetryFetch, phase }: GuideReviewFormProps) {
  const [title, setTitle] = useState(phase.prefillTitle);
  const [creator, setCreator] = useState(phase.prefillCreator);

  const titleResult = validateGuideTitle(title);
  const unavailable = phase.metadata !== 'ok' ? phase.metadata.unavailable : undefined;

  function create() {
    if (!titleResult.ok) {
      return;
    }

    onCreate({
      title: titleResult.value,
      creator: normalizeGuideCreator(creator),
    });
  }

  return (
    <View className="gap-6">
      {phase.thumbnailUrl === undefined ? null : (
        <Image
          accessibilityElementsHidden
          className="w-full rounded-large bg-surface"
          importantForAccessibility="no-hide-descendants"
          resizeMode="cover"
          source={{ uri: phase.thumbnailUrl }}
          style={{ aspectRatio: 16 / 9 }}
        />
      )}

      {unavailable === undefined ? null : (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <CraftCard accent="yellow">
            <Text className="text-body text-ink">
              {metadataUnavailableMessage(unavailable)}
            </Text>
          </CraftCard>
        </View>
      )}

      <View className="gap-3">
        <Text className="text-label text-ink">Title</Text>
        <CraftTextField
          accessibilityLabel="Guide title"
          autoCapitalize="sentences"
          autoCorrect
          icon="format-title"
          onChangeText={setTitle}
          placeholder="Name this guide"
          returnKeyType="done"
          testID="guide-title-field"
          value={title}
        />
        {titleResult.ok ? null : (
          <Text className="text-label text-pinkStrong">{titleResult.message}</Text>
        )}
      </View>

      <View className="gap-3">
        <Text className="text-label text-ink">Creator (optional)</Text>
        <CraftTextField
          accessibilityLabel="Guide creator"
          autoCapitalize="words"
          autoCorrect
          icon="account-outline"
          onChangeText={setCreator}
          placeholder="Who made this tutorial?"
          returnKeyType="done"
          testID="guide-creator-field"
          value={creator}
        />
      </View>

      {unavailable === undefined ? null : (
        <CraftPressable
          accessibilityLabel="Try fetching details again"
          className="items-center bg-yellow px-6 py-3"
          onPress={onRetryFetch}
        >
          <Text className="text-label text-ink">Try again</Text>
        </CraftPressable>
      )}

      <CraftPressable
        accessibilityLabel="Create guide"
        className="items-center bg-pinkStrong px-6 py-3"
        disabled={!titleResult.ok}
        onPress={create}
      >
        <Text className="text-label text-surface">Create guide</Text>
      </CraftPressable>
    </View>
  );
}
