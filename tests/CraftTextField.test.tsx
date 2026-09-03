import { fireEvent, render, screen } from '@testing-library/react-native';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { CraftTextField } from '@/ui/components/CraftTextField';
import tokens from '@/ui/theme/tokens.json';

/**
 * Issue #42: every single-line field rendered its text high in the surface,
 * because the 48px touch minimum sat on the `TextInput` (a 24px line inside a
 * 48px box, which iOS top-aligns) rather than on the field surface. The fix
 * moves the minimum to the container and pads the single-line input
 * symmetrically so its own box is still 48px with the line centred in it.
 *
 * Two facts about this repo make the assertions below the shape they are:
 *
 * 1. NativeWind classes are NOT resolved into styles under `jest-expo`
 *    (`global.css` is mapped to `tests/styleMock.js`), so `className` arrives as
 *    a raw prop and `toHaveStyle` can neither see a class-expressed minimum nor
 *    fail when one is present. The `className` assertions are therefore
 *    load-bearing: without them a leftover `min-h-touch` on the input would be
 *    invisible and this suite would pass under the exact bug it prevents.
 * 2. Touch minimums in this repo are already inline token styles
 *    (`CraftPressable`, `CraftTabBarButton`), so an inline minimum is the
 *    existing convention rather than a second one.
 *
 * The layout numbers are pinned as literals (48, 24, 12), never read from
 * `tokens.json`, so a token edit that breaks the arithmetic fails loudly here
 * instead of moving the expectation along with it.
 */

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }

    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = walk(srcDir);
const rel = (file: string) => path.relative(repoRoot, file);

describe('CraftTextField layout contract (issue #42)', () => {
  it('gives the field surface the 48px minimum and centres a single line inside it', async () => {
    await render(
      <CraftTextField
        accessibilityLabel="Pattern title"
        onChangeText={jest.fn()}
        testID="title-field"
        value="Sunrise scarf"
      />,
    );

    const input = screen.getByTestId('title-field');
    const surface = input.parent;

    expect(surface).toHaveStyle({ minHeight: 48 });
    // The single-line surface must stay cross-axis centred: the input's own
    // padded box already fills the 48px, but `items-center` is what centres the
    // leading icon and the clear control against it. Without this the surface
    // could be switched to `items-start` with every other assertion still green
    // (verify's non-blocking coverage gap on PR #48).
    expect(surface?.props.className).toMatch(/\bitems-center\b/);
    expect(input).toHaveStyle({ paddingVertical: 12 });
    expect(
      StyleSheet.flatten(input.props.style as StyleProp<TextStyle>)?.minHeight,
    ).toBeUndefined();
    // Load-bearing: a class-expressed minimum is invisible to `toHaveStyle`
    // here, so only this assertion can catch `min-h-touch` coming back.
    expect(input.props.className).not.toMatch(/\bmin-h-/);
    expect(input.props.textAlignVertical).toBe('center');
  });

  it('leaves a multiline field top-aligned with its own minimum', async () => {
    await render(
      <CraftTextField
        accessibilityLabel="Pattern notes"
        multiline
        onChangeText={jest.fn()}
        testID="notes-field"
        value="Hook size 4mm"
      />,
    );

    const input = screen.getByTestId('notes-field');
    const surface = input.parent;

    expect(input.props.textAlignVertical).toBe('top');
    expect(input.props.className).toMatch(/\bmin-h-touch\b/);
    expect(
      StyleSheet.flatten(input.props.style as StyleProp<TextStyle>)?.paddingVertical,
    ).toBeUndefined();
    expect(surface?.props.className).toMatch(/\bitems-start\b/);
    expect(surface).toHaveStyle({ minHeight: 48 });
  });

  it('pads the single line to exactly the touch minimum', () => {
    expect(tokens.touch.minimum).toBe(48);
    expect(tokens.typography.body.lineHeight).toBe(24);
    expect(tokens.spacing[3]).toBe(12);
    expect(tokens.spacing[3] * 2 + tokens.typography.body.lineHeight).toBe(
      tokens.touch.minimum,
    );
  });

  it('still edits and submits as a controlled input', async () => {
    const onChangeText = jest.fn();
    const onSubmitEditing = jest.fn();
    await render(
      <CraftTextField
        accessibilityLabel="Search stitches"
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        testID="search-field"
        value=""
      />,
    );

    const input = screen.getByTestId('search-field');
    await fireEvent.changeText(input, 'Sunrise scarf');
    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith('Sunrise scarf');

    await fireEvent(input, 'submitEditing');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it('keeps the accessible name and the full-height clear control', async () => {
    const onPress = jest.fn();
    await render(
      <CraftTextField
        accessibilityLabel="Search stitches"
        clear={{ accessibilityLabel: 'Clear search', onPress }}
        onChangeText={jest.fn()}
        testID="search-field"
        value="double"
      />,
    );

    expect(screen.getByLabelText('Search stitches')).toBe(
      screen.getByTestId('search-field'),
    );

    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(clear);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('hides the clear control while the field is empty', async () => {
    await render(
      <CraftTextField
        accessibilityLabel="Search stitches"
        clear={{ accessibilityLabel: 'Clear search', onPress: jest.fn() }}
        onChangeText={jest.fn()}
        testID="search-field"
        value=""
      />,
    );

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});

/**
 * Walk-based ownership guard (the #12/#14 idiom): the layout fix only holds
 * app-wide while every field goes through this one primitive. A screen that
 * hand-rolls a `TextInput` would reintroduce the misalignment and escape the
 * contract above, so the walk defaults every source file to "included" and
 * names the single permitted owner.
 */
describe('CraftTextField owns the one controlled input (architecture §10)', () => {
  it('walks a non-trivial set of source files (guard is not vacuous)', () => {
    expect(sourceFiles.length).toBeGreaterThan(60);
  });

  it('is the only file in src/ that renders a TextInput', () => {
    const owners = sourceFiles
      .filter((file) => /\bTextInput\b/.test(readFileSync(file, 'utf8')))
      .map(rel);

    expect(owners).toStrictEqual(['src/ui/components/CraftTextField.tsx']);
  });
});
