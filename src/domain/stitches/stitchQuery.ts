/**
 * The single definition of what a maker typed, shared by the repository and the
 * dictionary screen. A divergence here would let the UI decide a query is blank
 * while the repository still filtered, or the reverse.
 *
 * Normalization is deliberately limited to case and whitespace: `%`, `_`, and
 * `\` survive, because they are meaningful characters a maker may type and the
 * SQL boundary escapes them. Stripping them here would turn a search for a
 * literal `%` into a search for everything.
 */
export function normalizeStitchQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/gu, ' ');
}
