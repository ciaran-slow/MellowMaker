import type { Repositories } from '@/data/contracts/appDatabase';

/**
 * Counts every repository call made through the real router, so a suite can
 * assert that focusing a screen performs **one bounded read** rather than
 * re-subscribing in a loop.
 *
 * Why this exists (issue #51 retro). Every screen here that shows persisted
 * data pairs `useFocusEffect` with a stable `refresh`:
 *
 * ```ts
 * useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
 * ```
 *
 * `expo-router`'s `useFocusEffect` re-runs the callback whenever its identity
 * changes while the screen is focused, so widening that dependency array to
 * anything that changes on each read — the loaded `state`, the per-render view
 * model — turns one read per focus into an unbounded read loop. The #51 build's
 * M13 mutation did exactly that and **every suite stayed green**: the isolated
 * screen suites mock `useFocusEffect` as a capture and fire it themselves, so
 * they cannot observe a re-subscription at all.
 *
 * The re-verify found the shape that does catch it — count the reads on the
 * real router, let the tree settle, and assert the count did not grow. Under
 * M13 the count kept climbing; on the shipped code it stays at one.
 *
 * Usage, in a router suite:
 *
 * ```ts
 * jest.mock('@/data/sqlite/createRepositories', () =>
 *   require('./support/countedRepositories').countedRepositoriesModule(),
 * );
 * ```
 *
 * then `resetRepositoryCallCounts()` before rendering and
 * `repositoryCallCount('guides.getGuideWithSteps')` after.
 */
const callCounts = new Map<string, number>();

/** Calls recorded for `<repository>.<method>` since the last reset. */
export function repositoryCallCount(key: string): number {
  return callCounts.get(key) ?? 0;
}

export function resetRepositoryCallCounts(): void {
  callCounts.clear();
}

/**
 * Lets a focused tree run to quiescence, then reports whether the count moved.
 * A re-subscription loop reads again on every settle, so the count grows; one
 * bounded read per focus leaves it where it was.
 */
export async function settleTimers(milliseconds = 200): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function countingProxy(repositoryName: string, repository: object): object {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== 'function' || typeof property !== 'string') {
        return value;
      }

      return (...args: unknown[]) => {
        const key = `${repositoryName}.${property}`;
        callCounts.set(key, (callCounts.get(key) ?? 0) + 1);

        return (value as (...called: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

/**
 * The module shape `jest.mock('@/data/sqlite/createRepositories', …)` wants:
 * the real factory, with every returned repository wrapped in a call counter.
 */
export function countedRepositoriesModule(): {
  readonly createRepositories: (options: never) => Repositories;
} {
  const actual = jest.requireActual<
    typeof import('@/data/sqlite/createRepositories')
  >('@/data/sqlite/createRepositories');

  return {
    createRepositories: (options: never): Repositories => {
      const repositories = actual.createRepositories(options);

      return Object.fromEntries(
        Object.entries(repositories).map(([name, repository]) => [
          name,
          countingProxy(name, repository as object),
        ]),
      ) as unknown as Repositories;
    },
  };
}
