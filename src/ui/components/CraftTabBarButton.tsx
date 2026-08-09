import type { BottomTabBarButtonProps } from 'expo-router/tabs';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/ui/motion/usePressScale';
import tokens from '@/ui/theme/tokens.json';

type CraftTabBarButtonProps = Omit<BottomTabBarButtonProps, 'ref'>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CraftTabBarButton({
  accessibilityRole,
  accessibilityState,
  children,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: CraftTabBarButtonProps) {
  const isDisabled = disabled || accessibilityState?.disabled === true;
  const isSelected =
    accessibilityState?.selected === true || rest['aria-selected'] === true;
  const pressScale = usePressScale(isDisabled);

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole={accessibilityRole ?? 'tab'}
      role="tab"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={(event) => {
        if (!isDisabled) {
          onPress?.(event);
        }
      }}
      onPressIn={(event) => {
        onPressIn?.(event);
        pressScale.onPressIn();
      }}
      onPressOut={(event) => {
        onPressOut?.(event);
        pressScale.onPressOut();
      }}
      style={[
        style,
        {
          minHeight: tokens.touch.minimum,
          minWidth: tokens.touch.minimum,
          borderTopColor: isSelected ? tokens.colors.pink : 'transparent',
          borderTopWidth: isSelected ? tokens.spacing[1] : 0,
          borderRadius: isSelected ? tokens.radii.medium : 0,
        },
        pressScale.animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
