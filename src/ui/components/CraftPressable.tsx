import type { PropsWithChildren } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/ui/motion/usePressScale';
import tokens from '@/ui/theme/tokens.json';

type CraftPressableProps = PropsWithChildren<{
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Defaults to `button`; a completion control passes `checkbox`. */
  accessibilityRole?: 'button' | 'checkbox';
  /** Merged into `accessibilityState.checked` when defined. */
  checked?: boolean;
  /** Merged into `accessibilityState.selected` when true. */
  selected?: boolean;
  className?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress(): void;
}>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The shared press target: one accessible element with a name, a role, a minimum
 * touch target, and the reduced-motion-aware press scale. Screens style it with
 * tokens through `className` rather than reimplementing feedback. It also owns
 * the one accessible completion control: pass `accessibilityRole="checkbox"`
 * with `checked` so a step's completion is exposed as a checkbox to assistive
 * technology rather than hand-rolling a raw `Pressable`.
 */
export function CraftPressable({
  accessibilityHint,
  accessibilityLabel,
  accessibilityRole = 'button',
  checked,
  children,
  className,
  disabled = false,
  onPress,
  selected = false,
  style,
}: CraftPressableProps) {
  const pressScale = usePressScale(disabled);

  return (
    <AnimatedPressable
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{
        disabled,
        ...(checked === undefined ? {} : { checked }),
        ...(selected ? { selected: true } : {}),
      }}
      className={`justify-center rounded-large ${className ?? ''}`}
      disabled={disabled}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        style,
        {
          minHeight: tokens.touch.minimum,
          minWidth: tokens.touch.minimum,
        },
        pressScale.animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
