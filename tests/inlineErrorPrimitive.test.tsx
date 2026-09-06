import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue #66: one primitive owns the inline validation error line. Eight
 * hand-rolled copies of the same `<Text accessibilityLiveRegion="assertive"
 * accessibilityRole="alert">` idiom had drifted across six surfaces, and each
 * one carried the same silent-repeat defect. `CraftInlineError` now owns the
 * shape, and this guard stops a seventh surface from hand-rolling a ninth copy
 * (architecture §10: one shared primitive, never a second copy of the same
 * behaviour).
 *
 * Walk-based (the #12 idiom): every `.ts`/`.tsx` under `src/` is scanned by
 * default, so a *new* file cannot introduce an unowned alert line that escapes
 * the guard. The only exemption is the primitive itself.
 *
 * Deliberately out of scope: the persistent state alert, a
 * `<View accessible accessibilityRole="alert" accessibilityLiveRegion="…">`
 * wrapping a card (`DatabaseGate`, `CraftConfirmDialog`, the screen-level
 * read/save-failure cards, the counter failure card). Those are announced by
 * their owning screen over a state transition and are not repeated by a tap.
 */

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');
const PRIMITIVE = path.join(srcDir, 'ui', 'accessibility', 'CraftInlineError.tsx');

/** Every `<Text …>` opening tag, including ones split across lines. */
const TEXT_OPENING_TAG = /<Text\b[^>]*>/gs;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** A `<Text>` that is both an alert and a live region — the banned shape. */
function hasHandRolledAlertText(source: string): boolean {
  return (source.match(TEXT_OPENING_TAG) ?? []).some(
    (tag) =>
      tag.includes('accessibilityRole="alert"') &&
      tag.includes('accessibilityLiveRegion'),
  );
}

/**
 * The same shape reached indirectly. PR #69's verify found the literal matcher
 * above evadable: `CraftAnnouncement` spread `accessibilityRole` onto its
 * live-region `Text`, so `<CraftAnnouncement accessibilityRole="alert"
 * politeness="assertive">` rendered the banned element at runtime — with no
 * `attempt`, so the repeat was silent again — while this file saw only
 * `{...(accessibilityRole === undefined ? {} : { accessibilityRole })}`.
 *
 * A live-region `<Text>` outside the primitive may therefore not *become* an
 * alert either: no props spread, and no non-literal `accessibilityRole`. Both
 * carriers are cheap to state and neither is used anywhere in `src/` today
 * (the prop that motivated it was deleted with this guard), so the rule costs
 * nothing and closes the route.
 */
function hidesAlertBehindIndirection(source: string): boolean {
  return (source.match(TEXT_OPENING_TAG) ?? []).some(
    (tag) =>
      tag.includes('accessibilityLiveRegion') &&
      (tag.includes('{...') || tag.includes('accessibilityRole={')),
  );
}

const sourceFiles = walk(srcDir);

describe('inline validation errors: one primitive owns the alert line', () => {
  it('walks a non-trivial set of source files (guard is not vacuous)', () => {
    expect(sourceFiles.length).toBeGreaterThan(30);
  });

  it('finds no hand-rolled inline alert Text outside CraftInlineError', () => {
    const offenders = sourceFiles
      .filter((file) => file !== PRIMITIVE)
      .filter((file) => hasHandRolledAlertText(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toStrictEqual([]);
  });

  it('finds no live-region Text that could become an alert indirectly', () => {
    // The spread/dynamic-role carriers, banned everywhere including the
    // primitive: `CraftInlineError` writes both props as literals.
    const offenders = sourceFiles
      .filter((file) => hidesAlertBehindIndirection(readFileSync(file, 'utf8')))
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toStrictEqual([]);
  });

  it('non-tautology: the indirection matcher trips on a spread and on a dynamic role', () => {
    // The exact shape `CraftAnnouncement` carried before PR #69's verify
    // finding 3, in both of its forms.
    expect(
      hidesAlertBehindIndirection(
        [
          '<Text',
          '  accessibilityLiveRegion={politeness}',
          '  className={className}',
          '  {...(accessibilityRole === undefined ? {} : { accessibilityRole })}',
          '>',
          '  {message}',
          '</Text>',
        ].join('\n'),
      ),
    ).toBe(true);
    expect(
      hidesAlertBehindIndirection(
        '<Text accessibilityLiveRegion="assertive" accessibilityRole={role}>{m}</Text>',
      ),
    ).toBe(true);
    // Negative branches: a spread on a Text that is not a live region is none
    // of this guard's business, and a literal role is the other matcher's job.
    expect(
      hidesAlertBehindIndirection('<Text {...rest} className={c}>{m}</Text>'),
    ).toBe(false);
    expect(
      hidesAlertBehindIndirection(
        '<Text accessibilityLiveRegion="assertive" accessibilityRole="alert">{m}</Text>',
      ),
    ).toBe(false);
  });

  it('positive arm: the primitive itself matches, so the exemption is live', () => {
    // Without this the regex could quietly stop matching anything and the
    // offender list above would stay empty for the wrong reason.
    expect(hasHandRolledAlertText(readFileSync(PRIMITIVE, 'utf8'))).toBe(true);
  });

  it('non-tautology: the matcher trips on synthetic offenders in either order and across lines', () => {
    expect(
      hasHandRolledAlertText(
        '<Text accessibilityLiveRegion="assertive" accessibilityRole="alert">{e}</Text>',
      ),
    ).toBe(true);
    expect(
      hasHandRolledAlertText(
        '<Text accessibilityRole="alert" accessibilityLiveRegion="assertive">{e}</Text>',
      ),
    ).toBe(true);
    expect(
      hasHandRolledAlertText(
        [
          '<Text',
          '  accessibilityLiveRegion="assertive"',
          '  accessibilityRole="alert"',
          '  className="text-label text-pinkStrong"',
          '>',
          '  {error}',
          '</Text>',
        ].join('\n'),
      ),
    ).toBe(true);
  });

  it('negative branch: the persistent state-alert View shape is not banned', () => {
    expect(
      hasHandRolledAlertText(
        [
          '<View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive">',
          '  <Text className="text-heading text-ink">{title}</Text>',
          '</View>',
        ].join('\n'),
      ),
    ).toBe(false);
    // A live-region Text that is not an alert (the polite status line
    // `CraftAnnouncement` renders) is untouched too.
    expect(
      hasHandRolledAlertText('<Text accessibilityLiveRegion="polite">{m}</Text>'),
    ).toBe(false);
  });

  it('every converted surface imports the primitive (partial-revert guard)', () => {
    // A fixed list: it cannot catch a *new* surface — the shape ban above is the
    // part that generalises — but it stops half of this change being reverted.
    const converted = [
      'features/guides/presentation/GuidePasteSection.tsx',
      'features/guides/presentation/GuideEditorScreen.tsx',
      'features/guides/presentation/GuideStepEditorRow.tsx',
      'features/guides/presentation/GuideImportScreen.tsx',
      'features/patterns/presentation/PatternEditorScreen.tsx',
      'features/patterns/presentation/PatternStepEditorRow.tsx',
    ];

    const missing = converted.filter(
      (relative) =>
        !readFileSync(path.join(srcDir, relative), 'utf8').includes(
          "from '@/ui/accessibility/CraftInlineError'",
        ),
    );

    expect(missing).toStrictEqual([]);
  });
});
