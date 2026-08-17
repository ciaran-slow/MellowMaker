import { useContext } from 'react';

import type { GuideMetadataGateway } from '@/data/contracts/guideMetadataGateway';

import { GuideMetadataContext } from './guideMetadataContext';

/**
 * Reads the metadata gateway published by the composition root. Throwing outside
 * a provider keeps an import or refresh from silently doing nothing.
 */
export function useGuideMetadataGateway(): GuideMetadataGateway {
  const gateway = useContext(GuideMetadataContext);

  if (gateway === undefined) {
    throw new Error(
      'useGuideMetadataGateway must be called inside a GuideMetadataContext provider.',
    );
  }

  return gateway;
}
