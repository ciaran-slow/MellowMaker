import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';

import type { GuideStepAuthoringInput } from '@/data/contracts/guideRepository';
import { formatStepTimestamp } from '@/domain/guides/guideStepDraft';
import {
  pasteConfirmLabel,
  pasteRejectionMessage,
  pasteReviewStepLabel,
  pasteReviewSummaryLabel,
} from '@/features/guides/presentation/guidePasteLabels';
import { timestampBadgeLabel } from '@/features/guides/presentation/guideStepLabels';
import { useGuideStepPaste } from '@/features/guides/presentation/useGuideStepPaste';
import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { CraftInlineError } from '@/ui/accessibility/CraftInlineError';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import tokens from '@/ui/theme/tokens.json';

type GuidePasteSectionProps = {
  onAppend(steps: readonly GuideStepAuthoringInput[]): void;
};

/**
 * The draft-then-commit paste surface (issue #50; architecture §9.2). A maker
 * pastes the chapter list from a video description — or, on the web, the
 * transcript panel — with the OS paste menu, reviews the derived steps, and only
 * then confirms them onto the guide. Reaching review writes nothing; discarding
 * writes nothing.
 *
 * The raw paste lives in this component's own state and is cleared on confirm and
 * on discard. It never reaches SQLite, a log, or an error body (NFR-12/13). The
 * app performs no lookup of its own here — the provenance line below says so, so
 * derived steps are never presented as something MellowMaker obtained (FR-YT-08).
 *
 * It sits beside the hand-typed "Add a step" field rather than replacing it:
 * manual authoring stays the required fallback (FR-GU-08).
 */
export function GuidePasteSection({ onAppend }: GuidePasteSectionProps) {
  const [raw, setRaw] = useState('');
  // Bumped once per maker-initiated review, whatever the outcome, so a repeat
  // of the same rejection is spoken again (issue #66).
  const [attempt, setAttempt] = useState(0);
  const paste = useGuideStepPaste(onAppend);
  const { phase } = paste;
  const errorMessage =
    phase.kind === 'input' && phase.error !== undefined
      ? pasteRejectionMessage(phase.error)
      : undefined;

  function review() {
    setAttempt((n) => n + 1);
    paste.review(raw);
  }

  function confirm() {
    paste.confirm();
    setRaw('');
  }

  function discard() {
    paste.discard();
    setRaw('');
  }

  return (
    <View className="gap-3 rounded-large bg-surface p-4">
      <Text accessibilityRole="header" className="text-heading text-ink">
        Paste steps from YouTube
      </Text>
      <Text className="text-label text-ink opacity-70">
        MellowMaker doesn&apos;t take this text from YouTube — you paste it, you
        review it, and you choose what to keep.
      </Text>

      {phase.kind === 'input' ? (
        <>
          <CraftTextField
            accessibilityHint="Copy the chapter list from the video description, or the transcript panel, and paste it here"
            accessibilityLabel="Pasted YouTube chapters or transcript"
            autoCapitalize="none"
            autoCorrect={false}
            icon="content-paste"
            multiline
            onChangeText={setRaw}
            placeholder="Paste chapters or transcript…"
            returnKeyType="default"
            testID="guide-paste-field"
            value={raw}
          />
          <CraftInlineError attempt={attempt} message={errorMessage} />
          <CraftPressable
            accessibilityLabel="Review pasted steps"
            className="items-center bg-tealStrong px-6 py-3"
            disabled={raw.trim() === ''}
            onPress={review}
          >
            <Text className="text-label text-surface">Review pasted steps</Text>
          </CraftPressable>
        </>
      ) : (
        <>
          <CraftAnnouncement
            className="text-label text-ink"
            message={pasteReviewSummaryLabel(phase.steps.length)}
          />
          {phase.steps.map((step, index) => (
            <View
              className="flex-row items-start gap-3 rounded-large bg-background p-3"
              key={`${index}-${step.instruction}`}
            >
              <Text className="rounded-pill bg-yellow px-3 py-1 text-label text-ink">
                {index + 1}
              </Text>
              <View className="flex-1 gap-2">
                <Text
                  accessibilityLabel={pasteReviewStepLabel(
                    index,
                    phase.steps.length,
                    step.instruction,
                    step.videoOffsetMs,
                  )}
                  className="text-body text-ink"
                >
                  {step.instruction}
                </Text>
                {step.videoOffsetMs === undefined ? null : (
                  // Deliberately not a button: there is no player on the editor,
                  // so this badge names the time without promising a seek. The
                  // seek control lives on the working view's step row.
                  <View
                    accessibilityLabel={timestampBadgeLabel(step.videoOffsetMs)}
                    className="flex-row items-center gap-1 self-start rounded-pill bg-surface px-3 py-1"
                  >
                    <MaterialCommunityIcons
                      accessibilityElementsHidden
                      color={tokens.colors.ink}
                      name="clock-outline"
                      size={tokens.typography.label.fontSize}
                    />
                    <Text className="text-label text-ink">
                      {formatStepTimestamp(step.videoOffsetMs)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
          <CraftPressable
            accessibilityLabel={pasteConfirmLabel(phase.steps.length)}
            className="items-center bg-tealStrong px-6 py-3"
            onPress={confirm}
          >
            <Text className="text-label text-surface">
              {pasteConfirmLabel(phase.steps.length)}
            </Text>
          </CraftPressable>
          <CraftPressable
            accessibilityLabel="Discard pasted steps"
            className="items-center bg-surface px-6 py-3"
            onPress={discard}
          >
            <Text className="text-label text-pinkStrong">
              Discard pasted steps
            </Text>
          </CraftPressable>
        </>
      )}
    </View>
  );
}
