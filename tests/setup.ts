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
