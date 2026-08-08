import { render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DictionaryScreen } from '@/features/dictionary/presentation/DictionaryScreen';

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('DictionaryScreen', () => {
  it('keeps its labelled heading and card discoverable at enlarged text size', async () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);

    await render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <DictionaryScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByRole('header', { name: 'Stitches' })).toBeOnTheScreen();
    expect(
      screen.getByRole('header', {
        name: 'Your stitch dictionary starts here',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Stitches foundation card')).toBeOnTheScreen();
  });
});
