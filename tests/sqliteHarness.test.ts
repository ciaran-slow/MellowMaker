/** @jest-environment node */

import { createTransactionRunner } from '@/data/sqlite/transaction';

import { createTestDatabase, type TestDatabase } from './support/sqliteHarness';

const INSERT_PATTERN =
  'INSERT INTO pattern (id, title, created_at, updated_at) VALUES (?, ?, 1, 1)';
const INSERT_STEP =
  'INSERT INTO pattern_step (id, pattern_id, position, instruction, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)';
const COUNT_PATTERNS = 'SELECT COUNT(*) AS total FROM pattern';

describe('production SQLite harness', () => {
  let database: TestDatabase;

  beforeEach(() => {
    database = createTestDatabase();
  });

  afterEach(() => {
    database.close();
  });

  it('enforces foreign keys on the production schema', () => {
    database.connection.run(INSERT_PATTERN, ['pattern-one', 'Sunrise Blanket']);

    expect(() =>
      database.connection.run(INSERT_STEP, [
        'step-one',
        'missing-pattern',
        0,
        'Chain 41',
      ]),
    ).toThrow();
    expect(
      database.connection.first<{ readonly total: number }>(
        'SELECT COUNT(*) AS total FROM pattern_step',
      )?.total,
    ).toBe(0);
  });

  it('rolls back every write when transactional work fails', () => {
    const inTransaction = createTransactionRunner(database.connection);

    expect(() =>
      inTransaction(() => {
        database.connection.run(INSERT_PATTERN, ['pattern-two', 'Doomed']);
        throw new Error('deliberate transaction failure');
      }),
    ).toThrow('deliberate transaction failure');

    expect(
      database.connection.first<{ readonly total: number }>(COUNT_PATTERNS)
        ?.total,
    ).toBe(0);
  });

  it('commits an outer transaction whose nested failure was handled', () => {
    const inTransaction = createTransactionRunner(database.connection);

    inTransaction(() => {
      database.connection.run(INSERT_PATTERN, ['pattern-kept', 'Kept']);

      expect(() =>
        inTransaction(() => {
          database.connection.run(INSERT_PATTERN, ['pattern-inner', 'Inner']);
          throw new Error('nested failure');
        }),
      ).toThrow('nested failure');
    });

    expect(
      database.connection
        .all<{ readonly id: string }>('SELECT id FROM pattern ORDER BY id ASC')
        .map((row) => row.id),
    ).toStrictEqual(['pattern-kept']);
  });

  it('discards the outer transaction when a nested failure escapes', () => {
    const inTransaction = createTransactionRunner(database.connection);

    expect(() =>
      inTransaction(() => {
        database.connection.run(INSERT_PATTERN, ['pattern-outer', 'Outer']);
        inTransaction(() => {
          database.connection.run(INSERT_PATTERN, ['pattern-inner', 'Inner']);
          throw new Error('nested failure');
        });
      }),
    ).toThrow('nested failure');

    expect(
      database.connection.first<{ readonly total: number }>(COUNT_PATTERNS)
        ?.total,
    ).toBe(0);
  });

  it('starts a new transaction after a nested rollback', () => {
    const inTransaction = createTransactionRunner(database.connection);

    expect(() =>
      inTransaction(() => {
        inTransaction(() => {
          throw new Error('nested failure');
        });
      }),
    ).toThrow('nested failure');

    inTransaction(() => {
      database.connection.run(INSERT_PATTERN, ['pattern-after', 'After']);
    });

    expect(
      database.connection.first<{ readonly total: number }>(COUNT_PATTERNS)
        ?.total,
    ).toBe(1);
  });
});
