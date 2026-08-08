import { useContext } from 'react';

import type { Repositories } from '@/data/contracts/appDatabase';

import { RepositoriesContext } from './repositoriesContext';

/**
 * Reads the repositories published by a ready `DatabaseGate`. Throwing outside
 * one keeps a screen from silently reading from nothing.
 */
export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);

  if (repositories === undefined) {
    throw new Error(
      'useRepositories must be called inside a ready DatabaseGate.',
    );
  }

  return repositories;
}
