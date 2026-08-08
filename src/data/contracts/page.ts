/**
 * Bounded reads (NFR-09): repository list methods never copy a whole table.
 */
export interface Page {
  readonly limit: number;
  readonly offset: number;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/**
 * Clamps a requested page into the supported window. A caller cannot widen a
 * query past {@link MAX_PAGE_LIMIT} or ask for a negative offset.
 */
export function resolvePage(page?: Page): Page {
  if (page === undefined) {
    return { limit: DEFAULT_PAGE_LIMIT, offset: 0 };
  }

  const limit = Number.isFinite(page.limit)
    ? Math.min(Math.max(Math.trunc(page.limit), 1), MAX_PAGE_LIMIT)
    : DEFAULT_PAGE_LIMIT;
  const offset = Number.isFinite(page.offset)
    ? Math.max(Math.trunc(page.offset), 0)
    : 0;

  return { limit, offset };
}
