import { randomUUID } from 'node:crypto';

import {
  createExpoSqliteModuleMock,
  resetExpoSqliteMock,
} from './support/expoSqliteMock';
import {
  resetYoutubeIframeMock,
  youtubeIframeMockModule,
} from './support/youtubeIframeMock';

// Jest hoists `jest.mock` above these imports, so the factories may only close
// over `mock`-prefixed bindings. The factory bodies themselves run later, once a
// test first requires the mocked module.
const mockExpoSqliteModule = createExpoSqliteModuleMock;
const mockRandomUUID = randomUUID;
const mockYoutubeIframeModule = youtubeIframeMockModule;

// Component and router tests run the real migrations and repositories against an
// in-memory database, so gating and initialization failures are observable.
jest.mock('expo-sqlite', () => mockExpoSqliteModule());

// `expo-crypto` bridges to native; Node supplies the same RFC 4122 v4 contract.
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: () => mockRandomUUID(),
}));

// The compliant YouTube player renders a WebView-hosted IFrame that cannot run
// in Jest. Every suite gets the shared stub; the guide playback/working-view
// suites import its handles to drive readiness/errors and assert the seek unit.
jest.mock('react-native-youtube-iframe', () => mockYoutubeIframeModule);

afterEach(() => {
  resetExpoSqliteMock();
  resetYoutubeIframeMock();
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
