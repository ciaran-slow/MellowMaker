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

  it('falsifier: saving the same blank instruction twice announces twice (iOS)', async () => {
    // Issue #66 migrated the repeat contract to six surfaces; PR #69 tested it
    // at two. Verify's M-F deleted this row's `setAttempt` bump and every suite
    // stayed green — the case above cancels between attempts, so the message
    // clears and the seam re-speaks on the *message* rather than the attempt.
    // This one never leaves the editor, which is the maker's real dead tap.
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    await renderRow();

    await fireEvent.press(screen.getByLabelText('Edit step 1'));
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '   ');
    await fireEvent.press(screen.getByLabelText('Save step 1'));
    const message = screen.getByRole('alert').props.children;
    expect(announce).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Save step 1'));

    expect(announce.mock.calls.map(([text]) => text)).toStrictEqual([
      message,
      message,
    ]);
  });

  it('negative branch: an uncaused re-render of the row stays silent (iOS)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
    await renderRow();

    await fireEvent.press(screen.getByLabelText('Edit step 1'));
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '   ');
    await fireEvent.press(screen.getByLabelText('Save step 1'));
    expect(announce).toHaveBeenCalledTimes(1);

    // A keystroke the maker made, but not a submit: the message stands, the
    // attempt does not move, and VoiceOver must not chatter over the typing.
    await fireEvent.changeText(screen.getByLabelText('Edit step 1'), '    ');

    expect(announce).toHaveBeenCalledTimes(1);
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

    // …and a repeat gives it a new identity, which is what remounts the region
    // for TalkBack (the `key` itself is invisible to RNTL — architecture §14).
    const first = screen.getByRole('alert').props.nativeID;
    await fireEvent.press(screen.getByLabelText('Save step 1'));

    expect(screen.getByRole('alert').props.nativeID).not.toBe(first);
    expect(announce).not.toHaveBeenCalled();
  });
});
