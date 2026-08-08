import { createContext } from 'react';

import type { Repositories } from '@/data/contracts/appDatabase';

/**
 * Narrow context for one stable dependency. It never becomes a second durable
 * store: every record still comes from SQLite through these repositories.
 */
export const RepositoriesContext = createContext<Repositories | undefined>(
  undefined,
);
