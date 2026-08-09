import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { TextStyle } from 'react-native';
import { Tabs } from 'expo-router';

import { CraftTabBarButton } from '@/ui/components/CraftTabBarButton';
import tokens from '@/ui/theme/tokens.json';

export const tabBarColors = {
  activeForeground: tokens.colors.ink,
  selectedAccent: tokens.colors.pink,
  surface: tokens.colors.surface,
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="dictionary/index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBarColors.activeForeground,
        tabBarInactiveTintColor: tokens.colors.ink,
        tabBarButton: (props) => <CraftTabBarButton {...props} />,
        tabBarLabelStyle: {
          fontSize: tokens.typography.label.fontSize,
          fontWeight: tokens.typography.label.fontWeight as TextStyle['fontWeight'],
        },
        tabBarStyle: {
          minHeight: tokens.touch.minimum + tokens.spacing[4],
          backgroundColor: tokens.colors.surface,
          borderTopColor: tokens.colors.yellow,
        },
      }}
    >
      <Tabs.Screen
        name="dictionary/index"
        options={{
          title: 'Stitches',
          tabBarAccessibilityLabel: 'Stitches',
          tabBarIcon: ({ color, focused, size }) => (
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={color}
              name={focused ? 'heart' : 'heart-outline'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="patterns/index"
        options={{
          title: 'Patterns',
          tabBarAccessibilityLabel: 'Patterns',
          tabBarIcon: ({ color, focused, size }) => (
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={color}
              name={focused ? 'book-open-page-variant' : 'book-open-outline'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="guides/index"
        options={{
          title: 'Guides',
          tabBarAccessibilityLabel: 'Guides',
          tabBarIcon: ({ color, focused, size }) => (
            <MaterialCommunityIcons
              accessibilityElementsHidden
              color={color}
              name={focused ? 'play-box' : 'play-box-outline'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="dictionary/[stitchId]"
        options={{ href: null }}
      />
    </Tabs>
  );
}
