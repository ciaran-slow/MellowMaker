import type { PropsWithChildren } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/ui/motion/usePressScale';
import tokens from '@/ui/theme/tokens.json';

type CraftPressableProps = PropsWithChildren<{
  accessibilityLabel: string;
  accessibilityHint?: string;
  className?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress(): void;
}>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The shared press target: one accessible element with a name, a button role, a
 * minimum touch target, and the reduced-motion-aware press scale. Screens style
 * it with tokens through `className` rather than reimplementing feedback.
 */
export function CraftPressable({
  accessibilityHint,
  accessibilityLabel,
  children,
  className,
  disabled = false,
  onPress,
  style,
}: CraftPressableProps) {
  const pressScale = usePressScale(disabled);

  return (
    <AnimatedPressable
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
