import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { tabBarColors } from '@/app/(tabs)/_layout';
import { CraftTabBarButton } from '@/ui/components/CraftTabBarButton';
import tokens from '@/ui/theme/tokens.json';

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }

  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );

  return (lighter + 0.05) / (darker + 0.05);
}

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
