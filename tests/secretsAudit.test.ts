import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Issue #13 (AC2 / NFR-11): a WALK-BASED credential/secret audit. No key exists
 * to leak by design — metadata uses the key-free YouTube oEmbed endpoint
 * (architecture §9.1) — so this guard proves that no provider credential,
 * signing secret, or machine-local value was ever committed, and stays true as
 * files are added.
 *
 * It applies the #12 walk-with-documented-exclude-list principle (see
 * offlineColdStart.test.tsx): scan every committed text file, defaulting to
 * INCLUDED, so a newly-added committed file is audited by default and can only be
 * skipped by an explicit, asserted exclusion. A hand-list of files to scan would
 * silently shrink as the tree grows; a walk cannot.
 */

const repoRoot = path.resolve(__dirname, '..');

// Entry names excluded from the walk (directory or, in a git worktree, the
// `.git` pointer file), each with a documented reason. Build, install, and
// native-project output are not committed source; the audit test's own file
// embeds pattern literals and is scanned separately by the non-tautology arm.
const EXCLUDED_DIRS: readonly string[] = [
  'node_modules', // installed deps (symlinked shared install; not our source)
  '.git', // VCS internals
  '.expo', // local Expo cache
  'ios', // generated native project (not committed source)
  'android', // generated native project (not committed source)
  'dist', // build output
  'build', // build output
  'coverage', // test-coverage output
];

// Directories we expect to exist under the repo root; asserted present so a
// rename turns a silent no-op exclusion into a loud failure here.
const EXPECTED_DIRS: readonly string[] = ['src', 'tests', 'docs', 'scripts'];

// Binary/asset extensions skipped by extension (nothing text-scannable, and
// signing artifacts here would be caught by .gitignore + review, not text scan).
const BINARY_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.aab',
  '.ipa',
  '.keystore',
  '.jks',
  '.p12',
  '.mobileprovision',
];

// This test file embeds pattern literals; exclude it from the walk so it cannot
// trip its own detector. Its detector is instead proven live by the
// planted-fake-secret non-tautology arm.
const EXCLUDED_FILES: readonly string[] = [path.join(__dirname, 'secretsAudit.test.ts')];

interface SecretPattern {
  readonly name: string;
  readonly re: RegExp;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/ },
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'pem-private-key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: 'assigned-secret',
    re: /(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|EXPO_TOKEN)\s*[:=]\s*["'][^"'\n]{8,}["']/i,
  },
  // Developer-machine absolute paths (NFR-11): committed machine-local config.
  { name: 'macos-home-path', re: /\/Users\/[A-Za-z0-9._-]+\// },
  { name: 'linux-home-path', re: /\/home\/[A-Za-z0-9._-]+\// },
];

function matchedPatterns(content: string): string[] {
  return SECRET_PATTERNS.filter((pattern) => pattern.re.test(content)).map(
    (pattern) => pattern.name,
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // Excluded names are skipped whether directory or file: in a git worktree
    // `.git` is a pointer FILE (not a directory) that embeds a machine-local
    // path, so a dir-only check would scan it.
    if (EXCLUDED_DIRS.includes(entry.name)) {
      return [];
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    if (BINARY_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      return [];
    }

    return [full];
  });
}

const scannedFiles = walk(repoRoot).filter(
  (file) => !EXCLUDED_FILES.includes(file),
);

describe('committed secret audit', () => {
  it('walks a non-trivial set of committed files (guard is not vacuous)', () => {
    expect(scannedFiles.length).toBeGreaterThan(80);
    // Known-committed anchors must be in the scan, proving the walk reaches the
    // trees that would carry a leaked secret or machine-local config.
    expect(scannedFiles).toContain(path.join(repoRoot, 'package.json'));
    expect(scannedFiles).toContain(path.join(repoRoot, 'app.json'));
    expect(scannedFiles).toContain(path.join(repoRoot, 'package-lock.json'));
  });

  it('keeps the excluded directories live (no stale/renamed source tree)', () => {
    const present = new Set(
      readdirSync(repoRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
    // Every source tree we rely on being scanned must still exist; a rename
    // surfaces here rather than silently dropping a tree from coverage.
    expect(EXPECTED_DIRS.filter((dir) => !present.has(dir))).toStrictEqual([]);
  });

  it('finds no committed credential, signing secret, or machine-local value', () => {
    const offenders = scannedFiles.flatMap((file) => {
      const names = matchedPatterns(readFileSync(file, 'utf8'));

      return names.map((name) => ({
        file: path.relative(repoRoot, file),
        pattern: name,
      }));
    });

    expect(offenders).toStrictEqual([]);
  });

  it('non-tautology: the detector flags each planted fake secret', () => {
    // Synthetic secrets built at runtime (concatenated), never present as a
    // single literal in any scanned file. Each must trip its pattern, proving
    // the detector is live and would catch a real planted secret.
    const planted: Record<string, string> = {
      'google-api-key': `AIza${'A'.repeat(35)}`,
      'aws-access-key-id': `AKIA${'B'.repeat(16)}`,
      'pem-private-key': '-----BEGIN PRIVATE KEY-----',
      'github-token': `ghp_${'c'.repeat(36)}`,
      'slack-token': 'xoxb-0123456789abcdef',
      'assigned-secret': "api_key = 'super-secret-value'",
      'macos-home-path': `/Users/${'maker'}/app/`,
      'linux-home-path': `/home/${'maker'}/app/`,
    };

    for (const [name, value] of Object.entries(planted)) {
      expect(matchedPatterns(value)).toContain(name);
    }

    // And a benign string trips nothing, so the detector is not matching all.
    expect(matchedPatterns('const title = "Granny Square";')).toStrictEqual([]);
  });
});
