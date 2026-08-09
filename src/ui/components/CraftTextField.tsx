import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TextInput, View } from 'react-native';

import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type CraftTextFieldProps = {
  accessibilityLabel: string;
  accessibilityHint?: string;
  placeholder?: string;
  /**
   * Native identifier for the input itself. The installed-app smoke flows
   * select the field by identifier, because an accessibility name is not a
   * Maestro `id`.
   */
  testID?: string;
  value: string;
  onChangeText(value: string): void;
  /** Trailing clear control, rendered only while the field holds text. */
  clear?: {
    readonly accessibilityLabel: string;
    onPress(): void;
  };
};

/**
 * The one text input in the design system: a controlled field with an
 * accessible name, a token surface, and a full-height touch target. Search
 * fields pass `clear` so a maker can empty the field with one tap instead of
 * holding backspace.
 */
export function CraftTextField({
  accessibilityHint,
  accessibilityLabel,
  clear,
  onChangeText,
  placeholder,
  testID,
  value,
}: CraftTextFieldProps) {
  return (
    <View className="flex-row items-center gap-2 rounded-large bg-surface px-4">
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={tokens.colors.ink}
        name="magnify"
        size={tokens.typography.heading.fontSize}
      />
      <TextInput
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-touch flex-1 text-body text-ink"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.ink}
        returnKeyType="search"
        testID={testID}
        value={value}
      />
      {clear !== undefined && value !== '' ? (
        <CraftPressable
          accessibilityLabel={clear.accessibilityLabel}
          className="items-center px-2"
          onPress={clear.onPress}
        >
          <MaterialCommunityIcons
            accessibilityElementsHidden
            color={tokens.colors.ink}
            name="close-circle"
            size={tokens.typography.heading.fontSize}
          />
        </CraftPressable>
      ) : null}
    </View>
  );
}
