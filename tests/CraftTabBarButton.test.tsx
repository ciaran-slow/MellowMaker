import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { CraftTabBarButton } from '@/ui/components/CraftTabBarButton';
import tokens from '@/ui/theme/tokens.json';

describe('CraftTabBarButton', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves the selected tab semantics and minimum touch target', async () => {
    await render(
      <CraftTabBarButton
        accessibilityLabel="Patterns"
        accessibilityRole="tab"
        accessibilityState={{ selected: true }}
      >
        <Text>Patterns</Text>
      </CraftTabBarButton>,
    );

    const tab = screen.getByRole('tab', { name: 'Patterns' });
    expect(tab.props.accessibilityState).toMatchObject({
      selected: true,
      disabled: false,
    });
    expect(tab).toHaveStyle({
      minHeight: tokens.touch.minimum,
      minWidth: tokens.touch.minimum,
    });
  });

  it('reports an unselected enabled state', async () => {
    await render(
      <CraftTabBarButton
        accessibilityLabel="Guides"
        accessibilityRole="tab"
        accessibilityState={{ selected: false }}
      >
        <Text>Guides</Text>
      </CraftTabBarButton>,
    );

    expect(
      screen.getByRole('tab', { name: 'Guides' }).props.accessibilityState,
    ).toMatchObject({
      selected: false,
      disabled: false,
    });
  });

  it('skips press animation and navigates synchronously with reduced motion', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const onPress = jest.fn();
    await render(
      <CraftTabBarButton
        accessibilityLabel="Stitches"
        accessibilityRole="tab"
        accessibilityState={{ selected: false }}
        onPress={onPress}
      >
        <Text>Stitches</Text>
      </CraftTabBarButton>,
    );

    const tab = screen.getByRole('tab', { name: 'Stitches' });
    await fireEvent(tab, 'pressIn');
    expect(withTiming).not.toHaveBeenCalled();

    await fireEvent.press(tab);
    expect(onPress).toHaveBeenCalledTimes(1);

    await fireEvent(tab, 'pressOut');
    expect(withSpring).not.toHaveBeenCalled();
  });

  it('never invokes navigation while disabled', async () => {
    const onPress = jest.fn();
    await render(
      <CraftTabBarButton
        accessibilityLabel="Patterns"
        accessibilityRole="tab"
        accessibilityState={{ disabled: true, selected: false }}
        onPress={onPress}
      >
        <Text>Patterns</Text>
      </CraftTabBarButton>,
    );

    await fireEvent.press(screen.getByRole('tab', { name: 'Patterns' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(
      screen.getByRole('tab', { name: 'Patterns' }).props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });
  });
});
