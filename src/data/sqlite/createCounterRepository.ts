import type {
  Counter,
  CounterOwner,
  CounterOwnerKind,
  CounterRepository,
} from '../contracts/counterRepository';
import type { RepositoryContext } from './repositoryContext';

interface CounterRow {
  readonly id: string;
  readonly owner_kind: CounterOwnerKind;
  readonly pattern_id: string | null;
  readonly guide_id: string | null;
  readonly label: string;
  readonly kind: Counter['kind'];
  readonly value: number;
  readonly position: number;
  readonly created_at: number;
  readonly updated_at: number;
}

const COUNTER_COLUMNS =
  'id, owner_kind, pattern_id, guide_id, label, kind, value, position, created_at, updated_at';

const SELECT_COUNTER = `SELECT ${COUNTER_COLUMNS} FROM counter WHERE id = ?`;

// Static SQL per owner kind: a counter belongs to exactly one pattern or one
// guide, and the unique indexes order each owner's counters independently.
const LIST_BY_OWNER: Record<CounterOwnerKind, string> = {
  pattern: `SELECT ${COUNTER_COLUMNS} FROM counter WHERE pattern_id = ? ORDER BY position ASC, id ASC`,
  guide: `SELECT ${COUNTER_COLUMNS} FROM counter WHERE guide_id = ? ORDER BY position ASC, id ASC`,
};

const NEXT_POSITION_BY_OWNER: Record<CounterOwnerKind, string> = {
  pattern:
    'SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM counter WHERE pattern_id = ?',
  guide:
    'SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM counter WHERE guide_id = ?',
};

const INSERT_COUNTER = `INSERT INTO counter (${COUNTER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * The clamp happens inside SQL rather than as read, compute, write back, so a
 * decrement can never store a negative count and no interleaved caller can lose
 * a tap.
 */
const ADJUST_COUNTER =
  'UPDATE counter SET value = MAX(0, value + ?), updated_at = ? WHERE id = ?';
const RESET_COUNTER =
  'UPDATE counter SET value = 0, updated_at = ? WHERE id = ?';

function toCounter(row: CounterRow): Counter {
  const ownerId = row.owner_kind === 'pattern' ? row.pattern_id : row.guide_id;
  if (ownerId === null) {
    throw new Error(
      `Counter ${row.id} has owner kind ${row.owner_kind} without a matching owner.`,
    );
  }

  return {
    id: row.id,
    owner: { kind: row.owner_kind, id: ownerId },
    label: row.label,
    kind: row.kind,
    value: row.value,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createCounterRepository({
  connection,
  transaction,
  now,
  newId,
}: RepositoryContext): CounterRepository {
  function read(id: string): Counter {
    const row = connection.first<CounterRow>(SELECT_COUNTER, [id]);
    if (row === undefined) {
      throw new Error(`Counter ${id} does not exist.`);
    }

    return toCounter(row);
  }

  return {
    createCounter(input) {
      return transaction(() => {
        const nextPosition = connection.first<{
          readonly next_position: number;
        }>(NEXT_POSITION_BY_OWNER[input.owner.kind], [input.owner.id]);
        const writtenAt = now();
        const id = newId();

        connection.run(INSERT_COUNTER, [
          id,
          input.owner.kind,
          input.owner.kind === 'pattern' ? input.owner.id : null,
          input.owner.kind === 'guide' ? input.owner.id : null,
          input.label,
          input.kind,
          input.initialValue ?? 0,
          nextPosition?.next_position ?? 0,
          writtenAt,
          writtenAt,
        ]);

        return read(id);
      });
    },

    listCounters(owner: CounterOwner) {
      return connection
        .all<CounterRow>(LIST_BY_OWNER[owner.kind], [owner.id])
        .map(toCounter);
    },

    adjustCounter(id, delta) {
      connection.run(ADJUST_COUNTER, [delta, now(), id]);

      return read(id);
    },

    resetCounter(id) {
      connection.run(RESET_COUNTER, [now(), id]);

      return read(id);
    },
  };
}
