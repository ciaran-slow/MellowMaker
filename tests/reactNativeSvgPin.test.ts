/** @jest-environment node */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Issue #46 (AC1): the Expo Go contract. The spike runs on the product owner's
 * physical iPhone through Expo Go with **no dev build**, which holds only while
 * `react-native-svg` stays pinned to the exact version the installed SDK bundles
 * and stays autolinked — no config plugin, no prebuild, no metro transformer.
 */

const repoRoot = join(__dirname, '..');

function readJson(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, ...segments), 'utf8')) as Record<
    string,
    unknown
  >;
}

const packageJson = readJson('package.json');
const dependencies = packageJson.dependencies as Record<string, string>;
const bundledNativeModules = readJson(
  'node_modules',
  'expo',
  'bundledNativeModules.json',
) as Record<string, string>;

describe('react-native-svg stays an Expo Go dependency', () => {
  it('pins the exact version, with no range operator', () => {
    // `~` or `^` would let an install drift off the bundled version and break
    // Expo Go on the device with no local signal at all.
    expect(dependencies['react-native-svg']).toBe('15.15.4');
  });

  it('matches the version this Expo SDK bundles', () => {
    // A future SDK bump that moves the bundled version fails here and forces a
    // deliberate re-pin rather than a silent Expo Go break.
    expect(bundledNativeModules['react-native-svg']).toBe('15.15.4');
  });

  it('non-vacuity: the bundled-modules map is the real one', () => {
    expect(Object.keys(bundledNativeModules).length).toBeGreaterThan(20);
    expect(bundledNativeModules['react-native-reanimated']).toBe('4.5.1');
  });

  it('adds no config plugin, no prebuild, and no custom transformer', () => {
    const expoConfig = (readJson('app.json') as { expo: { plugins: string[] } })
      .expo;
    const metro = readFileSync(join(repoRoot, 'metro.config.js'), 'utf8');

    expect(expoConfig.plugins).not.toContain('react-native-svg');
    expect(expoConfig.plugins.join(' ')).not.toMatch(/svg/i);
    // No `.svg` file is imported anywhere, so no transformer is needed; adding
    // one would also put third-party artwork inside the bundle.
    expect(metro).not.toMatch(/svg/i);
  });
});
