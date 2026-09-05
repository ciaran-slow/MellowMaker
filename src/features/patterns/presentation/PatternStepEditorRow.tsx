import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { validateStepInstruction } from '@/domain/patterns/patternDraft';
import { stepAccessibilityLabel } from '@/features/patterns/presentation/patternLabels';
import { CraftInlineError } from '@/ui/accessibility/CraftInlineError';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import tokens from '@/ui/theme/tokens.json';

type PatternStepEditorRowProps = {
  index: number;
  total: number;
  instruction: string;
  onEdit(instruction: string): void;
  onDelete(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

/**
 * One editable step: its ordinal, its instruction, an inline edit field, and the
 * accessible reorder / delete controls. Reorder is button-driven (Move up / Move
 * down) rather than a drag gesture, so it needs no third-party list dependency
 * and works with a screen reader. The row is used unchanged for in-memory draft
 * steps and for persisted steps.
 */
export function PatternStepEditorRow({
  canMoveDown,
  canMoveUp,
  index,
  instruction,
  onDelete,
  onEdit,
  onMoveDown,
  onMoveUp,
  total,
}: PatternStepEditorRowProps) {
  const number = index + 1;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(instruction);
  const [error, setError] = useState<string | undefined>(undefined);
  // Bumped once per maker-initiated save, whatever the outcome, so a repeat of
  // the same rejection is spoken again (issue #66). `beginEdit` never bumps —
  // it clears the error.
  const [attempt, setAttempt] = useState(0);

  function beginEdit() {
    setDraft(instruction);
    setError(undefined);
    setEditing(true);
  }

  function saveEdit() {
    setAttempt((n) => n + 1);
    const result = validateStepInstruction(draft);
    if (!result.ok) {
      setError(result.message);

      return;
    }

    onEdit(result.value);
    setEditing(false);
  }

  return (
    <View className="gap-3 rounded-large bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <Text className="rounded-pill bg-yellow px-3 py-1 text-label text-ink">
          {number}
        </Text>
        <Text
          accessibilityLabel={stepAccessibilityLabel(index, total, instruction)}
          className="flex-1 text-body text-ink"
        >
          {instruction}
        </Text>
      </View>

      {editing ? (
        <View className="gap-3">
          <CraftTextField
            accessibilityLabel={`Edit step ${number}`}
            autoCapitalize="sentences"
            autoCorrect
            icon="pencil"
            multiline
            onChangeText={setDraft}
            placeholder="What does this step do?"
            returnKeyType="done"
            value={draft}
          />
          <CraftInlineError attempt={attempt} message={error} />
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
