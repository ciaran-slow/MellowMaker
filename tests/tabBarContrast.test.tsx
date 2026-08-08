import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { tabBarColors } from '@/app/(tabs)/_layout';
import { CraftTabBarButton } from '@/ui/components/CraftTabBarButton';
import tokens from '@/ui/theme/tokens.json';

import { contrastRatio } from './support/contrast';

describe('tab bar visual contract', () => {
  it('uses a readable active foreground and keeps pink as a selected accent', async () => {
    expect(
      contrastRatio(tabBarColors.activeForeground, tabBarColors.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(tabBarColors.selectedAccent).toBe(tokens.colors.pink);

    await render(
      <CraftTabBarButton
        accessibilityLabel="Patterns"
        accessibilityState={{ selected: false }}
        aria-selected
      >
        <Text>Patterns</Text>
      </CraftTabBarButton>,
    );

    expect(screen.getByRole('tab', { name: 'Patterns' })).toHaveStyle({
      borderTopColor: tabBarColors.selectedAccent,
      borderTopWidth: tokens.spacing[1],
    });
  });
});
