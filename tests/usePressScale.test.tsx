import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { CraftPressable } from '@/ui/components/CraftPressable';
import { usePressScale } from '@/ui/motion/usePressScale';

/**
 * Issue #14 (A11Y-06 / UX-04): the reduced-motion gate at the layer where it is
 * implemented. Three component suites already flip `useReducedMotion`; none
 * pinned the hook's own branches. Values are literals, not read back from
 * `tokens.motion`, so a token drift is caught rather than mirrored.
 */
describe('usePressScale', () => {
  let set: jest.Mock;

  beforeEach(() => {
    set = jest.fn();
    jest
      .spyOn(Reanimated, 'useSharedValue')
      .mockReturnValue({ value: 1, get: () => 1, set } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('with motion allowed, press-in animates toward 0.96 and press-out springs to 1', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const { result } = await renderHook(() => usePressScale());

    result.current.onPressIn();
    expect(withTiming).toHaveBeenCalledWith(0.96, { duration: 100 });
    expect(set).toHaveBeenLastCalledWith(0.96);

    result.current.onPressOut();
    expect(withSpring).toHaveBeenCalledWith(1, expect.any(Object));
    expect(set).toHaveBeenLastCalledWith(1);
  });

  it('negative branch: under reduced motion nothing animates and press-out sets a literal 1', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const { result } = await renderHook(() => usePressScale());

    result.current.onPressIn();
    expect(withTiming).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();

    result.current.onPressOut();
    expect(withSpring).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(1);
  });

  it('negative branch: a disabled target never animates press-in even with motion allowed', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');
    const { result } = await renderHook(() => usePressScale(true));

    result.current.onPressIn();

    expect(withTiming).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('CraftPressable press handling never waits on motion (UX-04)', () => {
  afterEach(() => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it.each([
    ['reduced motion off', false],
    ['reduced motion on', true],
  ])('calls onPress synchronously with %s', async (_label, reduceMotion) => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(reduceMotion);
    const onPress = jest.fn();
    await render(
      <CraftPressable accessibilityLabel="Increase Rows" onPress={onPress}>
        <Text>+</Text>
      </CraftPressable>,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Increase Rows' }));

    // Asserted immediately after the synchronous dispatch — no awaited
    // animation frame sits between the tap and the caller's handler.
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
