import { useEffect } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { CraftCard } from '@/ui/components/CraftCard';
import { CraftPressable } from '@/ui/components/CraftPressable';

type CraftConfirmDialogProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm(): void;
  onCancel(): void;
  /** Tints the confirm action for a destructive choice. Defaults to true. */
  destructive?: boolean;
};

/**
 * The one accessible destructive-confirmation surface. It is an in-tree overlay
 * rather than a React Native `Modal` so it stays fully testable under RNTL and
 * matches the codebase's no-portal habit; the only platform difference is that
 * Android's hardware back button cancels it, which iOS has no equivalent for.
 *
 * Meaning never rests on colour alone: the body spells out the consequence in
 * words and is announced as an assertive `alert`.
 */
export function CraftConfirmDialog({
  body,
  cancelLabel,
  confirmLabel,
  destructive = true,
  onCancel,
  onConfirm,
  title,
  visible,
}: CraftConfirmDialogProps) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    // The hardware back button on Android cancels the dialog instead of leaving
    // the screen behind it; returning true consumes the event.
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();

        return true;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [visible, onCancel]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityViewIsModal
      className="absolute inset-0 items-center justify-center bg-ink/40 p-6"
      style={{ zIndex: 1 }}
    >
      <View className="w-full max-w-screen-sm gap-4">
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <CraftCard accent={destructive ? 'pink' : 'blue'}>
            <Text accessibilityRole="header" className="text-heading text-ink">
              {title}
            </Text>
            <Text className="text-body text-ink">{body}</Text>
          </CraftCard>
        </View>
        <View className="flex-row gap-3">
          <CraftPressable
            accessibilityLabel={cancelLabel}
            className="flex-1 items-center bg-surface px-6 py-3"
            onPress={onCancel}
          >
            <Text className="text-label text-ink">{cancelLabel}</Text>
          </CraftPressable>
          <CraftPressable
            accessibilityLabel={confirmLabel}
            className={`flex-1 items-center px-6 py-3 ${
              destructive ? 'bg-pinkStrong' : 'bg-yellow'
            }`}
            onPress={onConfirm}
          >
            <Text
              className={`text-label ${destructive ? 'text-surface' : 'text-ink'}`}
            >
              {confirmLabel}
            </Text>
          </CraftPressable>
        </View>
      </View>
    </View>
  );
}
