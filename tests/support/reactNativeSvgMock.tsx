import { View, type ViewProps } from 'react-native';

/**
 * Shared Jest stub for `react-native-svg`, so no suite loads its native views.
 *
 * Each stubbed primitive renders a plain `View` with every prop spread through,
 * which is what makes `getByTestId(...).props.d`, `.props.stroke`,
 * `.props.strokeDasharray`, and `.props.animatedProps` inspectable from a test.
 *
 * Following the `expoSqliteMock` stance, the module **throws on drift**: any
 * export the spike did not stub raises rather than resolving to `undefined`, so
 * reaching for a new primitive is a red test instead of a silent no-op that
 * renders nothing. The mock holds no mutable state, so it needs no reset.
 */

type SvgProps = ViewProps & Record<string, unknown>;

function svgPrimitive(name: string) {
  const Primitive = (props: SvgProps) => <View {...props} />;
  Primitive.displayName = `MockSvg${name}`;

  return Primitive;
}

const stubs: Record<string, unknown> = {
  __esModule: true,
  default: svgPrimitive('Svg'),
  Svg: svgPrimitive('Svg'),
  Path: svgPrimitive('Path'),
  G: svgPrimitive('G'),
};

/**
 * Property names a module namespace is probed with by the module system and the
 * test runner rather than by application code. They must answer `undefined`
 * instead of throwing, or requiring the module would fail before any suite runs.
 */
const INTEROP_KEYS = new Set([
  'then',
  '$$typeof',
  'nodeType',
  'toJSON',
  'asymmetricMatch',
  '_isMockFunction',
]);

export const reactNativeSvgMockModule: Record<string, unknown> = new Proxy(
  stubs,
  {
    get(target, property, receiver) {
      if (typeof property === 'symbol' || INTEROP_KEYS.has(property)) {
        return Reflect.get(target, property, receiver) as unknown;
      }

      if (!(property in target)) {
        throw new Error(
          `react-native-svg mock: ${property} is not stubbed`,
        );
      }

      return Reflect.get(target, property, receiver) as unknown;
    },
  },
);
