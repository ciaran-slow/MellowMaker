import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { useAnnouncement } from '@/ui/accessibility/useAnnouncement';

/**
 * The iOS announcement seam (issue #14, A11Y-07). Each clause of the contract
 * has a falsifier at the hook layer, where the conditions actually live:
 * platform gate, first-render silence, change-only announcing, and the
 * undefined/empty no-op.
 */
describe('useAnnouncement', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    // React Native's jest setup already mocks `announceForAccessibility` as a
    // shared `jest.fn()`; `spyOn` returns that same mock, so clear its history
    // here or calls from an earlier test leak into this one's counts.
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('announces a changed message exactly once on iOS, with the new text', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: 'Rows: 1' as string | undefined,
    });

    await rerender('Rows: 2');

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Rows: 2');
  });

  it('negative branch (platform): never calls the iOS announcer on Android', async () => {
    // Android already speaks the accessibilityLiveRegion; calling both would
    // double-speak under TalkBack.
    jest.replaceProperty(Platform, 'OS', 'android');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: 'Rows: 1' as string | undefined,
    });

    await rerender('Rows: 2');
    await rerender('Rows: 3');

    expect(announce).not.toHaveBeenCalled();
  });

  it('negative branch (first render): mounting with a message is silent', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await renderHook(useAnnouncement, { initialProps: 'Rows: 5' as string | undefined });

    expect(announce).not.toHaveBeenCalled();
  });

  it('repeated same value: three renders of an unchanged message announce once', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: 'Rows: 1' as string | undefined,
    });

    await rerender('Rows: 2');
    await rerender('Rows: 2');
    await rerender('Rows: 2');

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('returning to a previously announced value announces again', async () => {
    // The guard compares against the immediately previous message, not a set
    // of everything ever said — a count going 2 → 3 → 2 is three real changes.
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: 'Rows: 1' as string | undefined,
    });

    await rerender('Rows: 2');
    await rerender('Rows: 3');
    await rerender('Rows: 2');

    expect(announce.mock.calls.map(([text]) => text)).toStrictEqual([
      'Rows: 2',
      'Rows: 3',
      'Rows: 2',
    ]);
  });

  it('undefined between two identical messages does not unlock a re-announce', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: 'Rows: 1' as string | undefined,
    });

    await rerender('Rows: 2');
    await rerender(undefined);
    await rerender('Rows: 2');

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('treats an empty string as nothing to say', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await renderHook(useAnnouncement, {
      initialProps: '' as string | undefined,
    });

    await rerender('');
    await rerender('');

    expect(announce).not.toHaveBeenCalled();

    // A first real message after an empty start is a genuine change.
    await rerender('3 patterns');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('3 patterns');
  });
});
