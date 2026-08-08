import { DatabaseSync } from 'node:sqlite';

export function createSQLiteHarness() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE parent (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE child (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES parent(id)
    );
  `);
  return database;
}

export function inTransaction(
  database: DatabaseSync,
  operation: () => void,
) {
  database.exec('BEGIN');
  try {
    operation();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
