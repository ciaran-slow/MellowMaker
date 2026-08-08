import { DatabaseSync } from 'node:sqlite';

/**
 * Backs the Jest `expo-sqlite` mock with a real in-memory `node:sqlite`
 * database, so component and router tests run the production migrations and
 * repositories instead of a stub.
 *
 * Only the methods the Expo adapter actually calls exist. Anything else throws,
 * so adapter drift is caught here rather than silently mocked away.
 */
const SUPPORTED_METHODS = [
  'execSync',
  'runSync',
  'getAllSync',
  'getFirstSync',
  'closeSync',
] as const;

const openDatabases = new Map<string, MockDatabase>();
let openFailure: Error | undefined;

type MockDatabase = Record<(typeof SUPPORTED_METHODS)[number], unknown>;

/** Makes the next and every later `openDatabaseSync` throw until reset. */
export function failDatabaseOpen(
  error: Error = new Error('mock native open failure'),
): void {
  openFailure = error;
}

export function resetExpoSqliteMock(): void {
  openFailure = undefined;
  for (const database of openDatabases.values()) {
    (database.closeSync as () => void)();
  }
  openDatabases.clear();
}

function bind(params: unknown): unknown[] {
  if (params === undefined) {
    return [];
  }

  if (!Array.isArray(params)) {
    throw new TypeError(
      'The expo-sqlite mock only accepts a single array of bind parameters.',
    );
  }

  return params;
}

function createMockDatabase(name: string): MockDatabase {
  // Foreign keys start disabled so the initializer's own enabling step is what
  // makes enforcement work, exactly as on a real device.
  const database = new DatabaseSync(':memory:', {
    enableForeignKeyConstraints: false,
  });

  const implementation: MockDatabase = {
    execSync: (sql: string) => {
      database.exec(sql);
    },
    runSync: (sql: string, params?: unknown) => {
      const result = database.prepare(sql).run(...(bind(params) as never[]));

      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    getAllSync: (sql: string, params?: unknown) =>
      database.prepare(sql).all(...(bind(params) as never[])),
    // The native API reports a miss as `null`, not `undefined`.
    getFirstSync: (sql: string, params?: unknown) =>
      database.prepare(sql).get(...(bind(params) as never[])) ?? null,
    closeSync: () => {
      database.close();
      openDatabases.delete(name);
    },
  };

  return new Proxy(implementation, {
    get(target, property) {
      if (typeof property !== 'string' || property in target) {
        return target[property as keyof MockDatabase];
      }

      throw new Error(
        `The expo-sqlite mock does not implement ${property}; the adapter must only use ${SUPPORTED_METHODS.join(', ')}.`,
      );
    },
  });
}

export function createExpoSqliteModuleMock() {
  return {
    __esModule: true,
    openDatabaseSync: (databaseName: string) => {
      if (openFailure !== undefined) {
        throw openFailure;
      }

      const existing = openDatabases.get(databaseName);
      if (existing !== undefined) {
        return existing;
      }

      const created = createMockDatabase(databaseName);
      openDatabases.set(databaseName, created);

      return created;
    },
  };
}
