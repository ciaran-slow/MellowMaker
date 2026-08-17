import { createContext } from 'react';

import type { GuideMetadataGateway } from '@/data/contracts/guideMetadataGateway';

/**
 * Narrow context for the one stable metadata gateway. Like `RepositoriesContext`
 * it never becomes a durable store: it only carries the injected best-effort
 * network dependency the composition root builds, so features stay decoupled from
 * `src/platform`.
 */
export const GuideMetadataContext = createContext<
  GuideMetadataGateway | undefined
>(undefined);
