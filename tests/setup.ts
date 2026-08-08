import { randomUUID } from 'node:crypto';

import {
  createExpoSqliteModuleMock,
  resetExpoSqliteMock,
} from './support/expoSqliteMock';

// Jest hoists `jest.mock` above these imports, so the factories may only close
// over `mock`-prefixed bindings. The factory bodies themselves run later, once a
// test first requires the mocked module.
const mockExpoSqliteModule = createExpoSqliteModuleMock;
const mockRandomUUID = randomUUID;

// Component and router tests run the real migrations and repositories against an
// in-memory database, so gating and initialization failures are observable.
jest.mock('expo-sqlite', () => mockExpoSqliteModule());

// `expo-crypto` bridges to native; Node supplies the same RFC 4122 v4 contract.
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: () => mockRandomUUID(),
}));

afterEach(() => {
  resetExpoSqliteMock();
});

jest.mock('react-native-reanimated', () => {
  const useReducedMotion = jest.fn(() => false);
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: <Component,>(component: Component) => component,
    },
    setUpTests: jest.fn(),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useReducedMotion,
    useSharedValue: <Value,>(value: Value) => ({
      value,
      get: () => value,
      set: jest.fn(),
    }),
    withSpring: <Value,>(value: Value) => value,
    withTiming: <Value,>(value: Value) => value,
  };
});

jest.mock('react-native-reanimated/mock', () => {
  const useReducedMotion = jest.fn(() => false);
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: <Component,>(component: Component) => component,
    },
    setUpTests: jest.fn(),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useReducedMotion,
    useSharedValue: <Value,>(value: Value) => ({
      value,
      get: () => value,
      set: jest.fn(),
    }),
    withSpring: <Value,>(value: Value) => value,
    withTiming: <Value,>(value: Value) => value,
  };
});
