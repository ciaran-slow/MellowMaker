/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Cap workers so a default `npm test` does not oversubscribe CPU. The
  // router-heavy suites poll with `findBy`, and under full-core contention
  // that polling times out — a flake that only reproduces in parallel and
  // vanishes under --runInBand. Half the cores keeps runs reliable without
  // serializing the whole suite. CI passes --runInBand, which overrides this.
  maxWorkers: '50%',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/tests/styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // `<rootDir>/.claude/` keeps agent worktrees out of the primary checkout's
  // run. Every stage works in a worktree under `.claude/worktrees/`, which is
  // gitignored but not invisible to Jest: it walks `rootDir` itself, so a
  // leftover worktree's `tests/*.test.tsx` is collected here and a whole second
  // copy of the suite — on someone else's branch, mid-edit — is swept into
  // `npm test`. It must be anchored to `<rootDir>`: a bare `/.claude/` matches
  // the *worktree's own* absolute path, so running the gates from inside a
  // worktree would silently collect zero tests and exit green
  // (issue #46 retro; `tests/jestConfig.test.ts` pins both halves).
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '<rootDir>/.claude/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/app/**/*.tsx',
    '!src/**/*.d.ts',
  ],
};
