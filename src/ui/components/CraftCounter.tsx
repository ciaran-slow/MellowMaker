import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { CraftAnnouncement } from '@/ui/accessibility/CraftAnnouncement';
import { CraftCard } from '@/ui/components/CraftCard';
import { CraftConfirmDialog } from '@/ui/components/CraftConfirmDialog';
import { CraftPressable } from '@/ui/components/CraftPressable';
import { CraftTextField } from '@/ui/components/CraftTextField';
import tokens from '@/ui/theme/tokens.json';

// The one animated wrapper, built the same way `CraftPressable` builds its
// animated target, so the value display can pulse without depending on a
// pre-wrapped `Animated.View`.
const AnimatedView = Animated.createAnimatedComponent(View);

type CraftCounterProps = {
  label: string;
  value: number;
  /** Spoken by the internal polite live region after each acknowledged change. */
  announcement: string;
  onIncrement(): void;
  onDecrement(): void;
  /** Called only after in-dialog confirmation of a nonzero reset. */
  onReset(): void;
  /** The caller normalizes; this control passes the raw draft. */
  onRename(label: string): void;
};

/**
 * The reusable prominent project counter (PRD0 decision 3): a big one-handed
 * increment, a clamping decrement, a confirmed reset, and an inline rename,
 * rendered on a Playful Craft card. It is presentational only — it holds no
 * repository, no SQL, and no durable state; every acknowledged action calls an
 * `on*` prop synchronously, so persistence never waits on the value-change
 * animation (NFR-08). The value-change "pop" is gated on `useReducedMotion()`,
 * matching `usePressScale`, so it is silent under the platform reduced-motion
 * preference (FR-CO-08). Written owner-generic so guide working views (#10/#11)
 * reuse it unchanged; it formats its own accessible value name so it needs no
 * feature import.
 */
export function CraftCounter({
  announcement,
  label,
  onDecrement,
  onIncrement,
  onRename,
  onReset,
  value,
}: CraftCounterProps) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);

  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  // Skip the pop on the first render; only a genuine value change should pulse.
  const settled = useRef(false);

  useEffect(() => {
    if (!settled.current) {
      settled.current = true;

      return;
    }

    if (reduceMotion) {
      return;
    }

    // A brief pulse using the existing press-scale token, then a spring back to
    // rest. No caller waits on it: the durable write already happened.
    scale.set(tokens.motion.pressScale);
    scale.set(
      withSpring(1, {
        damping: tokens.motion.spring.damping,
        stiffness: tokens.motion.spring.stiffness,
      }),
    );
  }, [value, reduceMotion, scale]);

  function openReset() {
    // The control is disabled at zero, so a confirmation only ever opens for a
    // nonzero count (FR-CO-04); guard defensively regardless.
    if (value > 0) {
      setConfirmingReset(true);
    }
  }

  function confirmReset() {
    setConfirmingReset(false);
    onReset();
  }

  function openEditor() {
    setDraftLabel(label);
    setEditingLabel(true);
  }

  function commitRename() {
    setEditingLabel(false);
    onRename(draftLabel);
  }

  return (
    <CraftCard accent="teal">
      <View className="flex-row items-center justify-between gap-3">
        {editingLabel ? (
          <View className="flex-1 gap-2">
            <CraftTextField
              accessibilityLabel="Counter name"
              autoCapitalize="sentences"
              icon="pencil"
              onChangeText={setDraftLabel}
              onSubmitEditing={commitRename}
              returnKeyType="done"
              testID="counter-label-field"
              value={draftLabel}
            />
            <CraftPressable
              accessibilityLabel="Save name"
              className="items-center self-start bg-yellow px-4 py-2"
              onPress={commitRename}
            >
              <Text className="text-label text-ink">Save name</Text>
            </CraftPressable>
          </View>
        ) : (
          <>
            <Text
              accessibilityRole="header"
              className="flex-1 text-heading text-ink"
            >
              {label}
            </Text>
            <CraftPressable
              accessibilityLabel="Rename counter"
              className="flex-row items-center gap-2 bg-surface px-4 py-2"
              onPress={openEditor}
            >
              <MaterialCommunityIcons
                accessibilityElementsHidden
                color={tokens.colors.ink}
                name="pencil"
                size={tokens.typography.body.fontSize}
              />
              <Text className="text-label text-ink">Rename</Text>
            </CraftPressable>
          </>
        )}
      </View>

      <AnimatedView style={animatedStyle}>
        <Text
          accessibilityLabel={`${label}: ${value}`}
          className="text-display text-ink"
        >
          {value}
        </Text>
      </AnimatedView>

      <View className="flex-row items-stretch gap-3">
        <CraftPressable
          accessibilityLabel={`Increase ${label}`}
          className="flex-[2] items-center bg-yellow px-6 py-6"
          onPress={onIncrement}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="plus"
            size={tokens.typography.display.fontSize}
          />
        </CraftPressable>
        <CraftPressable
          accessibilityLabel={`Decrease ${label}`}
          className="flex-1 items-center bg-surface px-4 py-6"
          onPress={onDecrement}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="minus"
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>
      </View>

      <CraftPressable
        accessibilityHint="Sets the count back to zero after confirmation"
        accessibilityLabel={`Reset ${label}`}
        className="items-center self-start bg-surface px-6 py-3"
        disabled={value === 0}
        onPress={openReset}
      >
        <Text className="text-label text-ink">Reset</Text>
      </CraftPressable>

      <CraftAnnouncement
        className="text-label text-ink opacity-70"
        message={announcement}
      />

      <CraftConfirmDialog
        body={`This sets ${label} back to 0. Your pattern and progress are not affected.`}
        cancelLabel="Keep count"
        confirmLabel="Reset"
        onCancel={() => {
          setConfirmingReset(false);
        }}
        onConfirm={confirmReset}
        title="Reset this counter?"
        visible={confirmingReset}
      />
    </CraftCard>
  );
}
