/** @jest-environment node */

import type { DatabaseSync } from 'node:sqlite';

import {
  createSQLiteHarness,
  inTransaction,
} from './support/sqliteHarness';

describe('SQLite integration harness', () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = createSQLiteHarness();
  });

  afterEach(() => {
    database.close();
  });

  it('enforces foreign keys for distinct parent and child identities', () => {
    database.prepare('INSERT INTO parent (id) VALUES (?)').run('parent-one');

    expect(() =>
      database
        .prepare('INSERT INTO child (id, parent_id) VALUES (?, ?)')
        .run('child-one', 'missing-parent'),
    ).toThrow();

    const childCount = database
      .prepare('SELECT COUNT(*) AS count FROM child')
      .get() as { count: number };
    expect(childCount.count).toBe(0);
  });

  it('rolls back every write when a transaction operation fails', () => {
    expect(() =>
      inTransaction(database, () => {
        database.prepare('INSERT INTO parent (id) VALUES (?)').run('parent-two');
        throw new Error('deliberate transaction failure');
      }),
    ).toThrow('deliberate transaction failure');

    const parent = database
      .prepare('SELECT id FROM parent WHERE id = ?')
      .get('parent-two');
    expect(parent).toBeUndefined();
  });
});
