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
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/app/**/*.tsx',
    '!src/**/*.d.ts',
  ],
};
