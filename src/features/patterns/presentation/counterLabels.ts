/**
 * Announcement strings spoken by the counter's polite live region after a
 * command. Kept beside the pattern viewer's other label helpers
 * (`patternLabels.ts`) so the hook composes what a screen reader hears from one
 * definition. The reusable `CraftCounter` control formats the value display's
 * own accessible name inline so it stays free of any feature import.
 */

/** Spoken by the polite live region after an increment, decrement, or reset. */
export function counterChangeAnnouncement(label: string, value: number): string {
  return `${label}: ${value}`;
}

/** Spoken after a rename commits, e.g. `"Counter renamed to Stitches"`. */
export function counterRenamedAnnouncement(label: string): string {
  return `Counter renamed to ${label}`;
}
