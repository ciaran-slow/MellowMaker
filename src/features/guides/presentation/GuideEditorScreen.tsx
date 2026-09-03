import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import type {
  GuideStep,
  GuideStepAuthoringInput,
  ImportedGuide,
} from '@/data/contracts/guideRepository';
import { normalizeGuideNotes, validateGuideTitle } from '@/domain/guides/guideDraft';
import {
  normalizeMakerNote,
  normalizeTranscriptExcerpt,
  parseStepTimestamp,
  validateGuideStepInstruction,
} from '@/domain/guides/guideStepDraft';
import { GuideStepEditorRow } from '@/features/guides/presentation/GuideStepEditorRow';
import {
  useGuideEditor,
  type GuideEditor,
} from '@/features/guides/presentation/useGuideEditor';
import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftConfirmDialog } from '@/ui/components/CraftConfirmDialog';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import { Screen } from '@/ui/components/Screen';
import tokens from '@/ui/theme/tokens.json';

const SAVE_FAILED_TITLE = "We couldn't save that change";

type GuideEditorScreenProps = {
  guideId: string;
};

export function GuideEditorScreen({ guideId }: GuideEditorScreenProps) {
  const router = useRouter();
  const editor = useGuideEditor(guideId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/guides');
    }
  }

  function confirmDelete() {
    setConfirmingDelete(false);
    editor.remove();
  }

  const { state } = editor;
  useAnnouncement(state.status === 'failed' ? SAVE_FAILED_TITLE : undefined);

  return (
    <View className="flex-1 bg-background">
      <Screen accessibilityLabel="Guide editor screen">
        <CraftPressable
          accessibilityLabel="Back to guide"
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

        {state.status === 'loading' ? (
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

        {state.status === 'missing' ? (
          <CraftCard accent="teal">
            <Text accessibilityRole="header" className="text-heading text-ink">
              This guide is no longer here
            </Text>
            <Text className="text-body text-ink">
              It may have been deleted. Go back to your guides to keep making.
            </Text>
          </CraftCard>
        ) : null}

        {state.status === 'failed' ? (
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
                    {SAVE_FAILED_TITLE}
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
              onPress={editor.retry}
            >
              <Text className="text-label text-ink">Try again</Text>
            </CraftPressable>
          </>
        ) : null}

        {state.status === 'ready' ? (
          <EditGuideForm
            editor={editor}
            guide={state.guide}
            steps={state.steps}
            onRequestDelete={() => {
              setConfirmingDelete(true);
            }}
          />
        ) : null}
      </Screen>

      <CraftConfirmDialog
        body="Delete this guide? Your saved guide details, steps, and progress will be removed from this device. This can't be undone."
        cancelLabel="Keep guide"
        confirmLabel="Yes, delete guide"
        onCancel={() => {
          setConfirmingDelete(false);
        }}
        onConfirm={confirmDelete}
        title="Delete this guide?"
        visible={confirmingDelete}
      />
    </View>
  );
}

type EditGuideFormProps = {
  editor: GuideEditor;
  guide: ImportedGuide;
  steps: readonly GuideStep[];
  onRequestDelete(): void;
};

function EditGuideForm({
  editor,
  guide,
  steps,
  onRequestDelete,
}: EditGuideFormProps) {
  // Seeded once on entering edit mode; a step mutation re-reads the guide but
  // must not clobber an in-progress title or notes edit.
  const [title, setTitle] = useState(guide.title);
  const [notes, setNotes] = useState(guide.notes ?? '');

  const titleResult = validateGuideTitle(title);
  const { refresh } = editor;

  function saveDetails() {
    if (!titleResult.ok) {
      return;
    }

    editor.saveDetails({
      title: titleResult.value,
      notes: normalizeGuideNotes(notes),
    });
  }

  return (
    <View className="gap-6">
      <Text accessibilityRole="header" className="text-display text-ink">
        Edit guide
      </Text>

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
        <Text className="text-label text-ink">Notes (optional)</Text>
        <CraftTextField
          accessibilityLabel="Guide notes"
          autoCapitalize="sentences"
          autoCorrect
          icon="note-text-outline"
          multiline
          onChangeText={setNotes}
          placeholder="Hook size, yarn, reminders…"
          returnKeyType="default"
          testID="guide-notes-field"
          value={notes}
        />
      </View>

      <CraftPressable
        accessibilityLabel="Save details"
        className="items-center bg-tealStrong px-6 py-3"
        disabled={!titleResult.ok}
        onPress={saveDetails}
      >
        <Text className="text-label text-surface">Save details</Text>
      </CraftPressable>

      <GuideStepsSection editor={editor} steps={steps} />

      <CraftAnnouncement
        className="text-label text-ink"
        message={
          refresh.kind === 'updated'
            ? 'Guide details updated from YouTube.'
            : refresh.kind === 'unavailable'
              ? "Couldn't refresh — your saved guide is unchanged."
              : ''
        }
      />

      <CraftPressable
        accessibilityLabel="Refresh metadata from YouTube"
        className="flex-row items-center justify-center gap-2 bg-blueStrong px-6 py-3"
        disabled={refresh.kind === 'refreshing'}
        onPress={editor.refreshMetadata}
      >
        {refresh.kind === 'refreshing' ? (
          <ActivityIndicator color={tokens.colors.surface} />
        ) : null}
        <Text className="text-label text-surface">Refresh metadata from YouTube</Text>
      </CraftPressable>

      <CraftPressable
        accessibilityHint="Removes this guide, its steps, and its progress"
        accessibilityLabel="Delete guide"
        className="items-center bg-surface px-6 py-3"
        onPress={onRequestDelete}
      >
        <Text className="text-label text-pinkStrong">Delete guide</Text>
      </CraftPressable>
    </View>
  );
}

type GuideStepsSectionProps = {
  editor: GuideEditor;
  steps: readonly GuideStep[];
};

function GuideStepsSection({ editor, steps }: GuideStepsSectionProps) {
  return (
    <View className="gap-3">
      <Text accessibilityRole="header" className="text-heading text-ink">
        Steps
      </Text>
      {steps.length === 0 ? (
        <Text className="text-body text-ink opacity-70">
          No steps yet. Add the first one below.
        </Text>
      ) : (
        steps.map((step, index) => (
          <GuideStepEditorRow
            canMoveDown={index < steps.length - 1}
            canMoveUp={index > 0}
            index={index}
            instruction={step.instruction}
            key={step.id}
            note={step.note}
            onDelete={() => {
              editor.deleteStep(step.id);
            }}
            onEdit={(input) => {
              editor.editStep(step.id, input);
            }}
            onMoveDown={() => {
              editor.moveStepDown(step.id);
            }}
            onMoveUp={() => {
              editor.moveStepUp(step.id);
            }}
            total={steps.length}
            transcriptExcerpt={step.transcriptExcerpt}
            videoOffsetMs={step.videoOffsetMs}
          />
        ))
      )}
      <AddGuideStepField onAdd={editor.addStep} />
    </View>
  );
}

type AddGuideStepFieldProps = {
  onAdd(input: GuideStepAuthoringInput): void;
};

function AddGuideStepField({ onAdd }: AddGuideStepFieldProps) {
  const [instruction, setInstruction] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState('');
  const [instructionError, setInstructionError] = useState<string | undefined>(
    undefined,
  );
  const [timestampError, setTimestampError] = useState<string | undefined>(
    undefined,
  );
  // The inline alerts below are Android's path; iOS hears the same text here.
  useAnnouncement(instructionError);
  useAnnouncement(timestampError);

  function submit() {
    const instructionResult = validateGuideStepInstruction(instruction);
    const timestampResult = parseStepTimestamp(timestamp);
    setInstructionError(
      instructionResult.ok ? undefined : instructionResult.message,
    );
    setTimestampError(timestampResult.ok ? undefined : timestampResult.message);
    if (!instructionResult.ok || !timestampResult.ok) {
      return;
    }

    const transcriptValue = normalizeTranscriptExcerpt(transcript);
    const noteValue = normalizeMakerNote(note);
    onAdd({
      instruction: instructionResult.value,
      ...(timestampResult.value === undefined
        ? {}
        : { videoOffsetMs: timestampResult.value }),
      ...(transcriptValue === undefined
        ? {}
        : { transcriptExcerpt: transcriptValue }),
      ...(noteValue === undefined ? {} : { note: noteValue }),
    });
    setInstruction('');
    setTimestamp('');
    setTranscript('');
    setNote('');
    setInstructionError(undefined);
    setTimestampError(undefined);
  }

  return (
    <View className="gap-3 rounded-large bg-surface p-4">
      <Text className="text-label text-ink">Add a step</Text>
      <CraftTextField
        accessibilityLabel="New step instruction"
        autoCapitalize="sentences"
        autoCorrect
        icon="format-list-numbered"
        multiline
        onChangeText={setInstruction}
        placeholder="What does the next step do?"
        returnKeyType="default"
        testID="guide-step-field"
        value={instruction}
      />
      {instructionError === undefined ? null : (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          className="text-label text-pinkStrong"
        >
          {instructionError}
        </Text>
      )}
      <CraftTextField
        accessibilityHint="Optional, like 0:45 or 1:05:20"
        accessibilityLabel="New step timestamp"
        icon="clock-outline"
        keyboardType="numbers-and-punctuation"
        onChangeText={setTimestamp}
        placeholder="Timestamp (optional)"
        returnKeyType="done"
        testID="guide-step-timestamp-field"
        value={timestamp}
      />
      {timestampError === undefined ? null : (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          className="text-label text-pinkStrong"
        >
          {timestampError}
        </Text>
      )}
      <CraftTextField
        accessibilityLabel="New step transcript excerpt"
        autoCapitalize="sentences"
        autoCorrect
        icon="text-box-outline"
        multiline
        onChangeText={setTranscript}
        placeholder="Transcript excerpt (optional)"
        returnKeyType="default"
        value={transcript}
      />
      <CraftTextField
        accessibilityLabel="New step note"
        autoCapitalize="sentences"
        autoCorrect
        icon="note-text-outline"
        multiline
        onChangeText={setNote}
        placeholder="Maker note (optional)"
        returnKeyType="default"
        value={note}
      />
      <CraftPressable
        accessibilityLabel="Add step"
        className="items-center bg-tealStrong px-6 py-3"
        onPress={submit}
      >
        <Text className="text-label text-surface">Add step</Text>
      </CraftPressable>
    </View>
  );
}
