import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { PatternStepEditorRow } from '@/features/patterns/presentation/PatternStepEditorRow';

/**
 * Verify finding B1 on PR #41 (issue #14, A11Y-07): an inline validation error
 * the maker repeats after cancelling must be spoken on iOS every time, exactly
 * as Android's remounting `alert` region speaks it. The first build silenced
 * the repeat because the announcement seam kept its memory across the clear.
 */
function renderRow() {
  return render(
    <PatternStepEditorRow
      canMoveDown={false}
      canMoveUp={false}
      index={0}
      instruction="Chain 20"
      onDelete={jest.fn()}
      onEdit={jest.fn()}
      onMoveDown={jest.fn()}
      onMoveUp={jest.fn()}
      total={1}
    />,
  );
}

describe('PatternStepEditorRow inline error announcement', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('speaks the same validation error again after it was cleared and repeated (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    await renderRow();

    // First mistake: save a blank instruction.
    await fireEvent.press(screen.getByLabelText('Edit step 1'));
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '   ');
    await fireEvent.press(screen.getByLabelText('Save step 1'));
    const message = screen.getByRole('alert').props.children;
    expect(typeof message).toBe('string');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(message);

    // Cancel unmounts the alert and re-entering edit clears the error; the
    // same mistake must be spoken again, not swallowed as "unchanged".
    await fireEvent.press(screen.getByLabelText('Cancel editing step 1'));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Edit step 1'));
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '   ');
    await fireEvent.press(screen.getByLabelText('Save step 1'));

    expect(screen.getByRole('alert').props.children).toBe(message);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('negative branch: the Android path never calls the iOS announcer', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    await renderRow();

    await fireEvent.press(screen.getByLabelText('Edit step 1'));
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '   ');
    await fireEvent.press(screen.getByLabelText('Save step 1'));

    // The assertive alert region is Android's whole announcement path.
    expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe('assertive');
    expect(announce).not.toHaveBeenCalled();
  });
});
