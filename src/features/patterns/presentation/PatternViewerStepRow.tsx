import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import type { StepView } from '@/domain/patterns/patternProgress';
import { viewerStepAccessibilityLabel } from '@/features/patterns/presentation/patternLabels';
import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type PatternViewerStepRowProps = {
  step: StepView;
  total: number;
  onComplete(): void;
  onReopen(): void;
  onSelect(): void;
};

const STATUS_WORD: Record<StepView['status'], string> = {
  completed: 'Completed',
  current: 'Current step',
  todo: 'To do',
};

const STATUS_PILL_CLASS: Record<StepView['status'], string> = {
  completed: 'bg-teal text-ink',
  current: 'bg-blue text-surface',
  todo: 'bg-yellow text-ink',
};

/**
 * One step in the working viewer. Status is carried in words (a status pill and
 * the step's accessibility label) and in shape (a checked/empty completion box,
 * plus a left accent bar and location marker on the current step) so it never
 * depends on colour alone. The completion control is an accessible checkbox; an
 * incomplete, non-current step also offers "Work on step N" to move the maker's
 * position without completing it.
 */
export function PatternViewerStepRow({
  onComplete,
  onReopen,
  onSelect,
  step,
  total,
}: PatternViewerStepRowProps) {
  const number = step.index + 1;
  const isCompleted = step.status === 'completed';
  const isCurrent = step.status === 'current';

  return (
    <View
      className={`gap-3 rounded-large bg-surface p-4 ${isCurrent ? 'border-l-8 border-blue' : ''}`}
    >
      <View className="flex-row items-start gap-3">
        <CraftPressable
          accessibilityLabel={
            isCompleted ? `Reopen step ${number}` : `Mark step ${number} complete`
          }
          accessibilityRole="checkbox"
          checked={isCompleted}
          className="items-center bg-background px-3"
          onPress={isCompleted ? onReopen : onComplete}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={isCompleted ? tokens.colors.teal : tokens.colors.ink}
            name={isCompleted ? 'check-bold' : 'checkbox-blank-circle-outline'}
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>

        <View className="flex-1 gap-2">
          <Text
            accessibilityLabel={viewerStepAccessibilityLabel(
              step.index,
              total,
              step.instruction,
              step.status,
            )}
            accessibilityState={{ selected: isCurrent }}
            className="text-body text-ink"
          >
            {step.instruction}
          </Text>

          <View className="flex-row items-center gap-2">
            {isCurrent ? (
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={tokens.colors.blue}
                name="map-marker"
                size={tokens.typography.label.fontSize}
              />
            ) : null}
            <Text
              className={`rounded-pill px-3 py-1 text-label ${STATUS_PILL_CLASS[step.status]}`}
            >
              {STATUS_WORD[step.status]}
            </Text>
          </View>

          {step.status === 'todo' ? (
            <CraftPressable
              accessibilityHint="Makes this the step you are working on"
              accessibilityLabel={`Work on step ${number}`}
              className="items-center self-start bg-background px-4 py-2"
              onPress={onSelect}
            >
              <Text className="text-label text-ink">{`Work on step ${number}`}</Text>
            </CraftPressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
