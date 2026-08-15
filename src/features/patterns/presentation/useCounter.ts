import { useCallback, useEffect, useRef, useState } from 'react';

import type { Counter, CounterOwner } from '@/data/contracts/counterRepository';
import { normalizeCounterLabel } from '@/domain/counters/counterLabel';
import {
  counterChangeAnnouncement,
  counterRenamedAnnouncement,
} from '@/features/patterns/presentation/counterLabels';
import { useRepositories } from '@/ui/database/useRepositories';

export type CounterState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | {
      readonly status: 'ready';
      readonly label: string;
      readonly value: number;
      /** Spoken by the counter's polite live region after a command. */
      readonly announcement: string;
    };

export interface CounterController {
  readonly state: CounterState;
  retry(): void;
  increment(): void;
  decrement(): void;
  reset(): void;
  rename(rawLabel: string): void;
}

/**
 * Drives the owning project's single maker-labelled counter (PRD0 decision 3).
 * It resolves the counter through the idempotent `getOrCreatePrimaryCounter`, so
 * a mount, refresh, or reopen never creates a second counter, and applies each
 * durable command through a synchronous serialized runner that writes then
 * re-reads — never a read-modify-write and never a value computed from a
 * rendered count. Each command issues one absolute-delta SQL statement
 * (`adjustCounter`/`resetCounter`/`renameCounter`); because `expo-sqlite` is
 * synchronous over one shared connection and each write autocommits, rapid or
 * interleaved taps commit in issue order and the stored value equals the sum of
 * acknowledged deltas — no lost or duplicated update (FR-CO-07, NFR-08). This is
 * the working-view command convention issue #6 established. Persistence is
 * independent of any animation.
 */
export function useCounter(owner: CounterOwner): CounterController {
  const { counters } = useRepositories();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CounterState>({ status: 'loading' });
  // The resolved counter id, read by commands rather than from a React closure,
  // so a command always targets the committed counter, not a stale render.
  const counterIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let current = true;

    queueMicrotask(() => {
      if (!current) {
        return;
      }

      try {
        const counter = counters.getOrCreatePrimaryCounter(owner);
        counterIdRef.current = counter.id;
        setState({
          status: 'ready',
          label: counter.label,
          value: counter.value,
          announcement: '',
        });
      } catch {
        counterIdRef.current = undefined;
        setState({ status: 'failed' });
      }
    });

    return () => {
      current = false;
    };
  }, [attempt, counters, owner]);

  // Applies one command, then re-reads the returned counter and announces it. A
  // failure is screen-local and retryable, mirroring the viewer's `runCommand`.
  const run = useCallback(
    (work: (id: string) => Counter, announce: (counter: Counter) => string) => {
      const id = counterIdRef.current;
      if (id === undefined) {
        return;
      }

      try {
        const next = work(id);
        setState({
          status: 'ready',
          label: next.label,
          value: next.value,
          announcement: announce(next),
        });
      } catch {
        setState({ status: 'failed' });
      }
    },
    [],
  );

  const increment = useCallback(() => {
    run(
      (id) => counters.adjustCounter(id, 1),
      (counter) => counterChangeAnnouncement(counter.label, counter.value),
    );
  }, [counters, run]);

  const decrement = useCallback(() => {
    run(
      (id) => counters.adjustCounter(id, -1),
      (counter) => counterChangeAnnouncement(counter.label, counter.value),
    );
  }, [counters, run]);

  const reset = useCallback(() => {
    run(
      (id) => counters.resetCounter(id),
      (counter) => counterChangeAnnouncement(counter.label, counter.value),
    );
  }, [counters, run]);

  const rename = useCallback(
    (rawLabel: string) => {
      run(
        (id) => counters.renameCounter(id, normalizeCounterLabel(rawLabel)),
        (counter) => counterRenamedAnnouncement(counter.label),
      );
    },
    [counters, run],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  return { state, retry, increment, decrement, reset, rename };
}
