import { DatabaseError } from '../contracts/databaseError';

/**
 * Turns the schema's non-empty step-instruction refusal into a typed error.
 *
 * There is deliberately **no** JavaScript pre-check here. One would re-create
 * the "every caller remembers" pattern issue #67 exists to remove, and it would
 * make the `CHECK` unreachable in production — so a regression in the `CHECK`
 * itself would be invisible. The floor is the schema; this module only names
 * what it refused.
 */
const EMPTY_INSTRUCTION_CONSTRAINTS = [
  'pattern_step_instruction_not_empty',
  'guide_step_instruction_not_empty',
] as const;

/**
 * Runs a write and re-throws an empty-instruction `CHECK` failure as
 * `DatabaseError('empty-step-instruction')`.
 *
 * SQLite itself formats a named `CHECK` failure as
 * `CHECK constraint failed: <constraint name>`, so the token matched below comes
 * from the engine rather than from a binding: the same string reaches us through
 * `node:sqlite` and through `expo-sqlite`, which may wrap it in a native-call
 * prefix. Hence `includes`, never equality. Naming the constraints in the DDL is
 * what makes this a stable token rather than the whole predicate's text.
 *
 * Wrap this **outside** the transaction runner so the rollback happens first and
 * the typed error is what escapes.
 */
export function withStepInstructionGuard<Result>(work: () => Result): Result {
  try {
    return work();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (EMPTY_INSTRUCTION_CONSTRAINTS.some((name) => message.includes(name))) {
      throw new DatabaseError('empty-step-instruction', { cause });
    }

    throw cause;
  }
}
