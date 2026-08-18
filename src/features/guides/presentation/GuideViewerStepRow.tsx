import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { formatStepTimestamp } from '@/domain/guides/guideStepDraft';
import type { StepView } from '@/domain/patterns/patternProgress';
import {
  timestampBadgeLabel,
  viewerStepAccessibilityLabel,
} from '@/features/guides/presentation/guideStepLabels';
import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type GuideViewerStepRowProps = {
  step: StepView;
  total: number;
  videoOffsetMs: number | undefined;
  transcriptExcerpt: string | undefined;
  note: string | undefined;
  onComplete(): void;
  onReopen(): void;
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
 * One step in the guide working view. Status is carried in words (a status pill
 * and the step's accessibility label) and in shape (a checked/empty completion
 * box, plus a left accent bar and marker on the current step), so it never
 * depends on colour alone. The completion control is an accessible checkbox. A
 * saved timestamp renders as a badge, and the optional transcript excerpt and
 * maker note render as labelled lines. Unlike the pattern viewer there is **no
 * "Work on step N"** control (guides persist no active pointer) and tapping the
 * row or badge never seeks — the player is #11.
 */
export function GuideViewerStepRow({
  note,
  onComplete,
  onReopen,
  step,
  total,
  transcriptExcerpt,
  videoOffsetMs,
}: GuideViewerStepRowProps) {
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
              videoOffsetMs,
            )}
            accessibilityState={{ selected: isCurrent }}
            className="text-body text-ink"
          >
            {step.instruction}
          </Text>

          <View className="flex-row flex-wrap items-center gap-2">
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
            {videoOffsetMs === undefined ? null : (
              <View
                accessibilityLabel={timestampBadgeLabel(videoOffsetMs)}
                className="flex-row items-center gap-1 rounded-pill bg-background px-3 py-1"
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
          </View>

          {transcriptExcerpt === undefined ? null : (
            <View className="gap-1">
              <Text className="text-label text-ink opacity-70">Transcript</Text>
              <Text className="text-body text-ink">{transcriptExcerpt}</Text>
            </View>
          )}

          {note === undefined ? null : (
            <View className="gap-1">
              <Text className="text-label text-ink opacity-70">Note</Text>
              <Text className="text-body text-ink">{note}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
