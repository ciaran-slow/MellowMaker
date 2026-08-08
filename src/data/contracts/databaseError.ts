export type DatabaseErrorCode =
  | 'open-failed'
  | 'foreign-keys-unavailable'
  | 'migration-failed'
  | 'unsupported-schema-version';

export interface DatabaseErrorDetails {
  /** Schema version the database was at when the failure happened. */
  readonly schemaVersion?: number;
  /** Migration version that failed, when one was being applied. */
  readonly failedVersion?: number;
  readonly cause?: unknown;
}

function describe(
  code: DatabaseErrorCode,
  { schemaVersion, failedVersion }: DatabaseErrorDetails,
): string {
  switch (code) {
    case 'open-failed':
      return 'The local making database could not be opened.';
    case 'foreign-keys-unavailable':
      return 'SQLite foreign-key enforcement could not be enabled.';
    case 'migration-failed':
      return `Migration to schema version ${failedVersion ?? 'unknown'} failed; the database is still at version ${schemaVersion ?? 'unknown'}.`;
    case 'unsupported-schema-version':
      return `The database is at schema version ${schemaVersion ?? 'unknown'}, which is newer than this app supports.`;
  }
}

/**
 * The only error type the database lifecycle raises.
 *
 * Messages carry codes and version numbers only. Pattern titles, notes,
 * transcript text, and any other maker-created content stay out of them.
 */
export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  readonly schemaVersion: number | undefined;
  readonly failedVersion: number | undefined;

  constructor(code: DatabaseErrorCode, details: DatabaseErrorDetails = {}) {
    super(describe(code, details), { cause: details.cause });
    this.name = 'DatabaseError';
    this.code = code;
    this.schemaVersion = details.schemaVersion;
    this.failedVersion = details.failedVersion;
  }
}
