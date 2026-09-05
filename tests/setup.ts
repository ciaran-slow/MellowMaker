import { randomUUID } from 'node:crypto';

import {
  createExpoSqliteModuleMock,
  resetExpoSqliteMock,
} from './support/expoSqliteMock';
import { reactNativeSvgMockModule } from './support/reactNativeSvgMock';
import {
  resetYoutubeIframeMock,
  youtubeIframeMockModule,
} from './support/youtubeIframeMock';

// Jest hoists `jest.mock` above these imports, so the factories may only close
// over `mock`-prefixed bindings. The factory bodies themselves run later, once a
// test first requires the mocked module.
const mockExpoSqliteModule = createExpoSqliteModuleMock;
const mockRandomUUID = randomUUID;
const mockReactNativeSvgModule = reactNativeSvgMockModule;
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

// `react-native-svg` renders native views that cannot mount in Jest. Every suite
// gets the shared stub, which spreads props through plain `View`s so the stitch
// step art's path data and animated props stay inspectable, and throws on any
// export the spike did not stub.
jest.mock('react-native-svg', () => mockReactNativeSvgModule);

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
    useAnimatedProps: (updater: () => unknown) => updater(),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useReducedMotion,
    useSharedValue: <Value,>(value: Value) => ({
      value,
      get: () => value,
      set: jest.fn(),
    }),
    withDelay: <Value,>(_delay: number, animation: Value) => animation,
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
    useAnimatedProps: (updater: () => unknown) => updater(),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useReducedMotion,
    useSharedValue: <Value,>(value: Value) => ({
      value,
      get: () => value,
      set: jest.fn(),
    }),
    withDelay: <Value,>(_delay: number, animation: Value) => animation,
    withSpring: <Value,>(value: Value) => value,
    withTiming: <Value,>(value: Value) => value,
  };
});
