/**
 * Walks a rendered subtree by element, so the stitch step drawings can be
 * inspected by the props they actually render (`d`, `stroke`, `strokeDasharray`,
 * `animatedProps`) rather than by adding testIDs to the artwork purely for tests.
 *
 * Shared by the component and the screen suite so both read the drawings the
 * same way.
 */

export interface RenderedNode {
  readonly props: Record<string, unknown>;
  readonly children: readonly (RenderedNode | string)[];
}

/** The element itself and every element beneath it, text nodes excluded. */
export function renderedNodes(root: RenderedNode): readonly RenderedNode[] {
  const found: RenderedNode[] = [root];

  for (const child of root.children) {
    if (typeof child !== 'string') {
      found.push(...renderedNodes(child));
    }
  }

  return found;
}

/**
 * The strokes carrying Reanimated's animated props. Exactly one stroke draws on
 * per step, so this is also how "one animated stroke, no more" is asserted.
 */
export function animatedStrokes(root: RenderedNode): readonly RenderedNode[] {
  return renderedNodes(root).filter(
    (node) => node.props.animatedProps !== undefined,
  );
}

/** The `strokeDashoffset` each animated stroke is rendering at this instant. */
export function dashOffsets(root: RenderedNode): readonly unknown[] {
  return animatedStrokes(root).map(
    (node) =>
      (node.props.animatedProps as { strokeDashoffset?: unknown })
        .strokeDashoffset,
  );
}
