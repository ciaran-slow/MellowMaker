import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { CraftInlineError } from '@/ui/accessibility/CraftInlineError';

/**
 * The inline-validation error primitive (issue #66). It owns both halves of the
 * repeat: the iOS announcement through `useAnnouncement`, and the keyed remount
 * TalkBack speaks on Android. The remount itself is invisible to RNTL, so the
 * `nativeID` the key is derived from is the carrier asserted here — the utterance
 * itself is on-device work, deferred in
 * `docs/runbooks/deferred-smokes/066-issue-66.md`.
 */
describe('CraftInlineError', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    // React Native's jest setup mocks `announceForAccessibility` as a shared
    // `jest.fn()`; clear its history or calls leak between tests.
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    announce.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing at all while the field is valid', async () => {
    await render(<CraftInlineError attempt={0} message={undefined} />);

    expect(screen.queryByRole('alert')).toBeNull();
    // Not an empty Text: an always-mounted alert would occupy a `gap-3` slot in
    // every column layout that renders it, and expose an empty alert element.
    expect(screen.toJSON()).toBeNull();
  });

  it('renders the rejection as an assertive alert region', async () => {
    await render(
      <CraftInlineError attempt={1} message="Add an instruction for this step." />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Add an instruction for this step.');
    expect(alert.props.accessibilityLiveRegion).toBe('assertive');
  });

  it('carries the token classes as a literal className', async () => {
    // NativeWind resolves to no style under `jest-expo` (architecture §14), so
    // `toHaveStyle` here would pass vacuously — the class string is the carrier.
    await render(<CraftInlineError attempt={1} message="Nope." />);

    expect(screen.getByRole('alert').props.className).toBe(
      'text-label text-pinkStrong',
    );
  });

  it("Android's carrier: an advanced attempt gives the alert a new identity", async () => {
    // The identity the `key` is derived from. A changed key remounts the alert
    // `Text`, which is the repository's documented Android re-speak path.
    const { rerender } = await render(
      <CraftInlineError attempt={1} message="Nope." />,
    );
    const first = screen.getByRole('alert').props.nativeID;

    await rerender(<CraftInlineError attempt={2} message="Nope." />);
    const second = screen.getByRole('alert').props.nativeID;

    expect(second).not.toBe(first);

    // Negative branch: a re-render the maker did not cause leaves the identity
    // alone, so nothing remounts and TalkBack does not chatter.
    await rerender(<CraftInlineError attempt={2} message="Nope." />);

    expect(screen.getByRole('alert').props.nativeID).toBe(second);
  });

  it('keeps the hook alive across the alert remount, so iOS speaks every repeat', async () => {
    // The falsifier for the one structural mistake this design can make: if the
    // hook sat inside the keyed subtree, each remount would re-arm the
    // first-render rule and the count would be zero.
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { rerender } = await render(
      <CraftInlineError attempt={0} message={undefined} />,
    );

    await rerender(<CraftInlineError attempt={1} message="Nope." />);
    await rerender(<CraftInlineError attempt={2} message="Nope." />);
    await rerender(<CraftInlineError attempt={3} message="Nope." />);

    expect(announce.mock.calls.map(([text]) => text)).toStrictEqual([
      'Nope.',
      'Nope.',
      'Nope.',
    ]);
  });
});
