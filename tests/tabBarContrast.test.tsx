import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { tabBarColors } from '@/app/(tabs)/_layout';
import { CraftTabBarButton } from '@/ui/components/CraftTabBarButton';
import tokens from '@/ui/theme/tokens.json';

import { contrastRatio } from './support/contrast';

describe('tab bar visual contract', () => {
  it('uses a readable active foreground and a strong-pink selected indicator', async () => {
    expect(
      contrastRatio(tabBarColors.activeForeground, tabBarColors.surface),
    ).toBeGreaterThanOrEqual(4.5);
    // The selected-tab bar is a non-text UI indicator (WCAG 1.4.11, 3:1). The
    // bright pink measured 2.64:1 against the white tab surface (issue #14);
    // the strong companion clears it.
    expect(tabBarColors.selectedAccent).toBe(tokens.colors.pinkStrong);
    expect(
      contrastRatio(tabBarColors.selectedAccent, tabBarColors.surface),
    ).toBeGreaterThanOrEqual(3);

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
