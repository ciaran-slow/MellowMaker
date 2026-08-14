export type CounterOwnerKind = 'pattern' | 'guide';

/** One free-labelled counter kind supports either outcome of the open counter decision. */
export type CounterKind = 'row' | 'stitch' | 'custom';

export interface CounterOwner {
  readonly kind: CounterOwnerKind;
  readonly id: string;
}

export interface Counter {
  readonly id: string;
  readonly owner: CounterOwner;
  readonly label: string;
  readonly kind: CounterKind;
  readonly value: number;
  readonly position: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CounterInput {
  readonly owner: CounterOwner;
  readonly label: string;
  readonly kind: CounterKind;
  readonly initialValue?: number;
}

export interface CounterRepository {
  createCounter(input: CounterInput): Counter;
  listCounters(owner: CounterOwner): Counter[];
  /**
   * The owner's single maker-labelled counter (PRD0 decision 3). Returns the
   * existing counter when the owner already has one, otherwise creates one at
   * position 0 with `DEFAULT_COUNTER_LABEL`, kind `'custom'`, value 0. Idempotent
   * per owner: a second call (a mount refresh or a reopen) returns the same row
   * rather than creating a second counter.
   */
  getOrCreatePrimaryCounter(owner: CounterOwner): Counter;
  /** Clamps at zero inside SQL, so a decrement can never go negative. */
  adjustCounter(id: string, delta: number): Counter;
  /** Rewrites the maker label; the caller passes an already-normalized, non-empty label. */
  renameCounter(id: string, label: string): Counter;
  resetCounter(id: string): Counter;
}
