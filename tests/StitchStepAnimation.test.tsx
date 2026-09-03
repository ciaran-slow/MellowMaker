import { render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { StitchStepAnimation } from '@/features/dictionary/presentation/StitchStepAnimation';
import { stitchStepArt } from '@/features/dictionary/presentation/stitchStepArt';

import {
  animatedStrokes,
  dashOffsets,
  renderedNodes,
  type RenderedNode,
} from './support/renderedArt';

/**
 * Issue #46: the decorative drawing itself. `react-native-svg` is stubbed for
 * every suite, so this proves the plumbing — path data, palette, dash geometry,
 * and the accessibility stance — never the native rendering. The on-device half
 * is the owner-run Expo Go pass logged in `docs/runbooks/smoke-verification.md`.
 */

function artFor(position: number) {
  const art = stitchStepArt('single-crochet', position);
  if (art === undefined) {
    throw new Error(`No authored art for single-crochet step ${position}.`);
  }

  return art;
}

/** The rendered drawing, found through the hidden-inclusive query. */
function drawing(): RenderedNode {
  return screen.getByTestId('stitch-step-art-2', {
    includeHiddenElements: true,
  }) as unknown as RenderedNode;
}

describe('StitchStepAnimation', () => {
  afterEach(() => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('renders the drawing but hides it from assistive technology', async () => {
    await render(<StitchStepAnimation art={artFor(2)} stepIndex={2} />);

    // Resolved through RNTL's own `isHiddenFromAccessibility`, not by reading
    // the props back: the default query cannot see the drawing at all, which is
    // exactly what a screen reader does. The step sentence is the content.
    expect(screen.queryByTestId('stitch-step-art-2')).toBeNull();

    const art = screen.getByTestId('stitch-step-art-2', {
      includeHiddenElements: true,
    });
    expect(art).toBeOnTheScreen();
    expect(art.props.accessibilityElementsHidden).toBe(true);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    // Decorative, so it must not claim the image role the dictionary asserts is
    // absent for a text-only stitch.
    expect(screen.queryByRole('image')).not.toBeOnTheScreen();
  });

  it('draws exactly one animated stroke per step, dashed to its authored length', async () => {
    const art = artFor(2);
    await render(<StitchStepAnimation art={art} stepIndex={2} />);

    const animated = animatedStrokes(drawing());

    expect(animated).toHaveLength(1);
    expect(animated[0]!.props.d).toBe(art.draw.d);
    expect(animated[0]!.props.strokeDasharray).toStrictEqual([
      art.draw.length,
      art.draw.length,
    ]);
    expect(animated[0]!.props.fill).toBe('none');
  });

  it('strokes every role with its documented, measured colour', async () => {
    await render(<StitchStepAnimation art={artFor(2)} stepIndex={2} />);

    const strokes = new Set(
      renderedNodes(drawing())
        .map((node) => node.props.stroke)
        .filter((stroke): stroke is string => typeof stroke === 'string'),
    );

    // Literal hexes, written out rather than read from `tokens`, so a token
    // drift is caught here instead of mirrored. Step 3 renders all three roles.
    expect([...strokes].sort()).toStrictEqual([
      '#1080A6',
      '#26547C',
      '#C15169',
    ]);
  });

  it('renders with the network stubbed to throw', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = jest.fn(() => {
      throw new Error('airplane mode: no network');
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      await render(<StitchStepAnimation art={artFor(2)} stepIndex={2} />);

      // The path strings are constants in the bundle: nothing is fetched, and
      // nothing is required from a file, so offline changes nothing.
      expect(
        screen.getByTestId('stitch-step-art-2', {
          includeHiddenElements: true,
        }),
      ).toBeOnTheScreen();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('negative branch: under reduced motion the drawing paints finished and nothing animates', async () => {
    (Reanimated.useReducedMotion as jest.Mock).mockReturnValue(true);
    const withTiming = jest.spyOn(Reanimated, 'withTiming');

    try {
      await render(<StitchStepAnimation art={artFor(2)} stepIndex={2} />);

      // The first painted frame is already the finished drawing.
      expect(dashOffsets(drawing())).toStrictEqual([0]);
      expect(withTiming).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('the shared react-native-svg mock throws on an export the spike never stubbed', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svg = require('react-native-svg') as Record<string, unknown>;

    expect(svg.Path).toBeDefined();
    expect(() => svg.Circle).toThrow(
      'react-native-svg mock: Circle is not stubbed',
    );
  });
});
