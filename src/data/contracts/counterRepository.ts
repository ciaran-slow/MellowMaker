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
  /** Clamps at zero inside SQL, so a decrement can never go negative. */
  adjustCounter(id: string, delta: number): Counter;
  resetCounter(id: string): Counter;
}
