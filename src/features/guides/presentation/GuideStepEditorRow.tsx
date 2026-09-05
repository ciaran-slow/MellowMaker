import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { GuideStepAuthoringInput } from '@/data/contracts/guideRepository';
import {
  formatStepTimestamp,
  normalizeMakerNote,
  normalizeTranscriptExcerpt,
  parseStepTimestamp,
  validateGuideStepInstruction,
} from '@/domain/guides/guideStepDraft';
import {
  editorStepAccessibilityLabel,
  timestampBadgeLabel,
} from '@/features/guides/presentation/guideStepLabels';
import { CraftInlineError } from '@/ui/accessibility/CraftInlineError';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import tokens from '@/ui/theme/tokens.json';

type GuideStepEditorRowProps = {
  index: number;
  total: number;
  instruction: string;
  videoOffsetMs: number | undefined;
  transcriptExcerpt: string | undefined;
  note: string | undefined;
  onEdit(input: GuideStepAuthoringInput): void;
  onDelete(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/**
 * One editable guide step: its ordinal, its instruction, an optional timestamp
 * badge, and the accessible reorder / delete controls. The inline editor adds
 * three optional fields — timestamp (parsed by `parseStepTimestamp`), transcript
 * excerpt, and maker note — collected with the instruction into one
 * `GuideStepAuthoringInput`. Reorder is button-driven (Move up / Move down),
 * disabled at the ends via `accessibilityState`, so it needs no drag dependency
 * and works with a screen reader (mirrors `PatternStepEditorRow`).
 */
export function GuideStepEditorRow({
  canMoveDown,
  canMoveUp,
  index,
  instruction,
  note,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
  total,
  transcriptExcerpt,
  videoOffsetMs,
}: GuideStepEditorRowProps) {
  const number = index + 1;
  const [editing, setEditing] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState(instruction);
  const [draftTimestamp, setDraftTimestamp] = useState(
    videoOffsetMs === undefined ? '' : formatStepTimestamp(videoOffsetMs),
  );
  const [draftTranscript, setDraftTranscript] = useState(
    transcriptExcerpt ?? '',
  );
  const [draftNote, setDraftNote] = useState(note ?? '');
  const [instructionError, setInstructionError] = useState<string | undefined>(
    undefined,
  );
  const [timestampError, setTimestampError] = useState<string | undefined>(
    undefined,
  );
  // Bumped once per maker-initiated save, whatever the outcome, so a repeat of
  // the same rejection is spoken again (issue #66). `beginEdit` never bumps —
  // it clears both errors.
  const [attempt, setAttempt] = useState(0);

  function beginEdit() {
    setDraftInstruction(instruction);
    setDraftTimestamp(
      videoOffsetMs === undefined ? '' : formatStepTimestamp(videoOffsetMs),
    );
    setDraftTranscript(transcriptExcerpt ?? '');
    setDraftNote(note ?? '');
    setInstructionError(undefined);
    setTimestampError(undefined);
    setEditing(true);
  }

  function saveEdit() {
    setAttempt((n) => n + 1);
    const instructionResult = validateGuideStepInstruction(draftInstruction);
    const timestampResult = parseStepTimestamp(draftTimestamp);
    setInstructionError(
      instructionResult.ok ? undefined : instructionResult.message,
    );
    setTimestampError(timestampResult.ok ? undefined : timestampResult.message);
    if (!instructionResult.ok || !timestampResult.ok) {
      return;
    }

    const transcript = normalizeTranscriptExcerpt(draftTranscript);
    const makerNote = normalizeMakerNote(draftNote);
    onEdit({
      instruction: instructionResult.value,
      ...(timestampResult.value === undefined
        ? {}
        : { videoOffsetMs: timestampResult.value }),
      ...(transcript === undefined ? {} : { transcriptExcerpt: transcript }),
      ...(makerNote === undefined ? {} : { note: makerNote }),
    });
    setEditing(false);
  }

  return (
    <View className="gap-3 rounded-large bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <Text className="rounded-pill bg-yellow px-3 py-1 text-label text-ink">
          {number}
        </Text>
        <View className="flex-1 gap-2">
          <Text
            accessibilityLabel={editorStepAccessibilityLabel(
              index,
              total,
              instruction,
              videoOffsetMs,
            )}
            className="text-body text-ink"
          >
            {instruction}
          </Text>
          {videoOffsetMs === undefined ? null : (
            <View
              accessibilityLabel={timestampBadgeLabel(videoOffsetMs)}
              className="flex-row items-center gap-1 self-start rounded-pill bg-background px-3 py-1"
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={tokens.colors.ink}
                name="clock-outline"
                size={tokens.typography.label.fontSize}
              />
              <Text className="text-label text-ink">
                {formatStepTimestamp(videoOffsetMs)}
              </Text>
            </View>
          )}
          {transcriptExcerpt === undefined ? null : (
            <Text className="text-label text-ink opacity-70">
              Transcript: {transcriptExcerpt}
            </Text>
          )}
          {note === undefined ? null : (
            <Text className="text-label text-ink opacity-70">
              Note: {note}
            </Text>
          )}
        </View>
      </View>

      {editing ? (
        <View className="gap-3">
          <CraftTextField
            accessibilityLabel={`Edit step ${number} instruction`}
            autoCapitalize="sentences"
            autoCorrect
            icon="pencil"
            multiline
            onChangeText={setDraftInstruction}
            placeholder="What does this step do?"
            returnKeyType="done"
            value={draftInstruction}
          />
          <CraftInlineError attempt={attempt} message={instructionError} />
          <CraftTextField
            accessibilityHint="Optional, like 0:45 or 1:05:20"
            accessibilityLabel={`Edit step ${number} timestamp`}
            icon="clock-outline"
            keyboardType="numbers-and-punctuation"
            onChangeText={setDraftTimestamp}
            placeholder="Timestamp (optional)"
            returnKeyType="done"
            value={draftTimestamp}
          />
          <CraftInlineError attempt={attempt} message={timestampError} />
          <CraftTextField
            accessibilityLabel={`Edit step ${number} transcript excerpt`}
            autoCapitalize="sentences"
            autoCorrect
            icon="text-box-outline"
            multiline
            onChangeText={setDraftTranscript}
            placeholder="Transcript excerpt (optional)"
            returnKeyType="default"
            value={draftTranscript}
          />
          <CraftTextField
            accessibilityLabel={`Edit step ${number} note`}
            autoCapitalize="sentences"
            autoCorrect
            icon="note-text-outline"
            multiline
            onChangeText={setDraftNote}
            placeholder="Maker note (optional)"
            returnKeyType="default"
            value={draftNote}
          />
          <View className="flex-row gap-3">
            <CraftPressable
              accessibilityLabel={`Save step ${number}`}
              className="flex-1 items-center bg-tealStrong px-6 py-3"
              onPress={saveEdit}
            >
              <Text className="text-label text-surface">Save</Text>
            </CraftPressable>
            <CraftPressable
              accessibilityLabel={`Cancel editing step ${number}`}
              className="flex-1 items-center bg-surface px-6 py-3"
              onPress={() => {
                setEditing(false);
              }}
            >
              <Text className="text-label text-ink">Cancel</Text>
            </CraftPressable>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <CraftPressable
            accessibilityLabel={`Move step ${number} up`}
            className="items-center bg-background px-4 py-2"
            disabled={!canMoveUp}
            onPress={onMoveUp}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={tokens.colors.ink}
              name="arrow-up"
              size={tokens.typography.body.fontSize}
            />
          </CraftPressable>
          <CraftPressable
            accessibilityLabel={`Move step ${number} down`}
            className="items-center bg-background px-4 py-2"
            disabled={!canMoveDown}
            onPress={onMoveDown}
          >
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={tokens.colors.ink}
              name="arrow-down"
              size={tokens.typography.body.fontSize}
            />
          </CraftPressable>
          <CraftPressable
            accessibilityLabel={`Edit step ${number}`}
            className="items-center bg-background px-4 py-2"
            onPress={beginEdit}
          >
            <Text className="text-label text-ink">Edit</Text>
          </CraftPressable>
          <CraftPressable
            accessibilityLabel={`Delete step ${number}`}
            className="items-center bg-background px-4 py-2"
            onPress={onDelete}
          >
            <Text className="text-label text-ink">Delete</Text>
          </CraftPressable>
        </View>
      )}
    </View>
  );
}
