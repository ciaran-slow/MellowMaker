import { fireEvent, render, screen } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { CraftCounter } from '@/ui/components/CraftCounter';

type Handlers = {
  onIncrement: jest.Mock;
  onDecrement: jest.Mock;
  onReset: jest.Mock;
  onRename: jest.Mock;
};

async function renderCounter(
  overrides: { label?: string; value?: number; announcement?: string } = {},
): Promise<Handlers> {
  const handlers: Handlers = {
    onIncrement: jest.fn(),
    onDecrement: jest.fn(),
    onReset: jest.fn(),
    onRename: jest.fn(),
  };

  await render(
    <CraftCounter
      announcement={overrides.announcement ?? ''}
      label={overrides.label ?? 'Rows'}
      onDecrement={handlers.onDecrement}
      onIncrement={handlers.onIncrement}
      onRename={handlers.onRename}
      onReset={handlers.onReset}
      value={overrides.value ?? 0}
    />,
  );

  return handlers;
}

describe('CraftCounter', () => {
  afterEach(() => {
    // The shared reanimated mock returns a jest.fn; reset it between tests so a
    // reduced-motion override never leaks.
    (useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('shows the label and value and exposes each control by accessible name', async () => {
    await renderCounter({ label: 'Rows', value: 4 });

    expect(screen.getByLabelText('Rows: 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('Increase Rows')).toBeOnTheScreen();
    expect(screen.getByLabelText('Decrease Rows')).toBeOnTheScreen();
    expect(screen.getByLabelText('Reset Rows')).toBeOnTheScreen();
    expect(screen.getByLabelText('Rename counter')).toBeOnTheScreen();
  });

  it('forwards increment and decrement presses to the caller', async () => {
    const handlers = await renderCounter({ value: 2 });

    await fireEvent.press(screen.getByLabelText('Increase Rows'));
    await fireEvent.press(screen.getByLabelText('Decrease Rows'));

    expect(handlers.onIncrement).toHaveBeenCalledTimes(1);
    expect(handlers.onDecrement).toHaveBeenCalledTimes(1);
  });

  it('disables reset at zero and opens no confirmation dialog', async () => {
    const handlers = await renderCounter({ value: 0 });

    const reset = screen.getByLabelText('Reset Rows');
    expect(reset.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(reset);

    // No dialog appears and no reset is requested at zero (FR-CO-04 scopes the
    // confirmation to a nonzero count).
    expect(screen.queryByText('Reset this counter?')).not.toBeOnTheScreen();
    expect(handlers.onReset).not.toHaveBeenCalled();
  });

  it('keeps a nonzero count when the maker cancels the reset', async () => {
    const handlers = await renderCounter({ value: 3 });

    await fireEvent.press(screen.getByLabelText('Reset Rows'));
    expect(screen.getByText('Reset this counter?')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Keep count'));

    expect(handlers.onReset).toHaveBeenCalledTimes(0);
    expect(screen.queryByText('Reset this counter?')).not.toBeOnTheScreen();
  });

  it('resets only after the maker confirms a nonzero count', async () => {
    const handlers = await renderCounter({ value: 3 });

    await fireEvent.press(screen.getByLabelText('Reset Rows'));
    await fireEvent.press(screen.getByLabelText('Reset'));

    expect(handlers.onReset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Reset this counter?')).not.toBeOnTheScreen();
  });

  it('renames through the inline editor', async () => {
    const handlers = await renderCounter({ label: 'Rows', value: 1 });

    await fireEvent.press(screen.getByLabelText('Rename counter'));
    await fireEvent.changeText(
      screen.getByTestId('counter-label-field'),
      'Stitches',
    );
    await fireEvent.press(screen.getByLabelText('Save name'));

    expect(handlers.onRename).toHaveBeenCalledTimes(1);
    expect(handlers.onRename).toHaveBeenCalledWith('Stitches');
  });

  it('still renders and forwards presses under reduced motion', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    const handlers = await renderCounter({ label: 'Rows', value: 5 });

    expect(screen.getByLabelText('Rows: 5')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Increase Rows'));

    expect(handlers.onIncrement).toHaveBeenCalledTimes(1);
  });

  it('announces through a polite live region', async () => {
    await renderCounter({ label: 'Rows', value: 1, announcement: 'Rows: 1' });

    const region = screen.getByText('Rows: 1');
    expect(region.props.accessibilityLiveRegion).toBe('polite');
  });
});
