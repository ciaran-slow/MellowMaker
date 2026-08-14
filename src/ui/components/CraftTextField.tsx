import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { CraftPressable } from '@/ui/components/CraftPressable';
import tokens from '@/ui/theme/tokens.json';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

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
  onSubmitEditing?: () => void;
  /**
   * The leading glyph. Defaults to the search magnifier so existing search
   * fields render unchanged; editor fields pass a fitting icon instead.
   */
  icon?: IconName;
  /**
   * Grows to several lines for longer prose such as pattern notes. Defaults to a
   * single-line field.
   */
  multiline?: boolean;
  /** Defaults match the search field; editor fields opt into sentence casing. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  returnKeyType?: TextInputProps['returnKeyType'];
  /** Trailing clear control, rendered only while the field holds text. */
  clear?: {
    readonly accessibilityLabel: string;
    onPress(): void;
  };
};

/**
 * The one text input in the design system: a controlled field with an
 * accessible name, a token surface, and a full-height touch target. Search
 * fields pass `clear` so a maker can empty the field with one tap; editor fields
 * pass a fitting `icon` and sentence casing. There is deliberately no second
 * input component.
 */
export function CraftTextField({
  accessibilityHint,
  accessibilityLabel,
  autoCapitalize = 'none',
  autoCorrect = false,
  clear,
  icon = 'magnify',
  multiline = false,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType = 'search',
  testID,
  value,
}: CraftTextFieldProps) {
  return (
    <View
      className={`flex-row gap-2 rounded-large bg-surface px-4 ${
        multiline ? 'items-start py-3' : 'items-center'
      }`}
    >
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={tokens.colors.ink}
        name={icon}
        size={tokens.typography.heading.fontSize}
        style={multiline ? { marginTop: tokens.spacing[3] } : undefined}
      />
      <TextInput
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        className="min-h-touch flex-1 text-body text-ink"
        multiline={multiline}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={tokens.colors.ink}
        returnKeyType={returnKeyType}
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
