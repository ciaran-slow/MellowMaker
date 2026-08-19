import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue #13 (AC4 / PRD0 decision 7): analytics, crash reporting, and telemetry
 * are ABSENT in PRD0 — nothing leaves the device. This guard enforces that
 * resolved decision at the dependency and Expo-plugin level: no known
 * analytics/telemetry/crash SDK may be declared. The no-egress arm is discharged
 * by the #12 offline suite and the oEmbed pure-request-URL test (only the
 * key-free oEmbed call exists); this file does not re-walk it.
 */

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(repoRoot, relativePath), 'utf8'),
  ) as Record<string, unknown>;
}

// Substrings that identify an analytics/telemetry/crash-reporting SDK by package
// name or Expo plugin id. Documented denylist (issue #13 plan §3.4).
const ANALYTICS_DENYLIST: readonly string[] = [
  '@sentry',
  'sentry-expo',
  'bugsnag',
  'mixpanel',
  'amplitude',
  'segment',
  'analytics-react-native',
  'posthog',
  '@datadog',
  'dd-',
  'firebase',
  'expo-analytics',
  'expo-insights',
  'expo-firebase-analytics',
  'appcenter',
  'newrelic',
  'instabug',
  'countly',
  'heap',
  'smartlook',
  'logrocket',
  'crashlytics',
];

function matchedDenylist(names: readonly string[]): string[] {
  return names.filter((name) =>
    ANALYTICS_DENYLIST.some((needle) => name.toLowerCase().includes(needle)),
  );
}

const packageJson = readJson('package.json');
const dependencyNames = [
  ...Object.keys((packageJson.dependencies as object) ?? {}),
  ...Object.keys((packageJson.devDependencies as object) ?? {}),
];

const appJson = readJson('app.json');
const expo = (appJson.expo as Record<string, unknown>) ?? {};
const pluginNames = ((expo.plugins as unknown[]) ?? []).map((plugin) =>
  Array.isArray(plugin) ? String(plugin[0]) : String(plugin),
);

describe('analytics / crash reporting absent (PRD0 decision 7)', () => {
  it('reads a real, non-empty dependency set (guard is not vacuous)', () => {
    // A guard that read an empty object would pass no matter what; anchor on a
    // package we know must be present.
    expect(dependencyNames.length).toBeGreaterThan(5);
    expect(dependencyNames).toContain('expo');
  });

  it('declares no analytics/telemetry/crash dependency', () => {
    expect(matchedDenylist(dependencyNames)).toStrictEqual([]);
  });

  it('declares no analytics/telemetry Expo config plugin', () => {
    expect(matchedDenylist(pluginNames)).toStrictEqual([]);
  });

  it('non-tautology: the matcher flags a planted analytics dependency', () => {
    // A synthetic dependency set proves the denylist is live — if a real SDK
    // were ever added, the dependency arm above would fail exactly like this.
    expect(matchedDenylist(['expo', '@sentry/react-native'])).toStrictEqual([
      '@sentry/react-native',
    ]);
    expect(matchedDenylist(['react', 'posthog-react-native'])).toStrictEqual([
      'posthog-react-native',
    ]);
  });
});
