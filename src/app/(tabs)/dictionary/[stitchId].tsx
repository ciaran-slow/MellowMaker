import { useLocalSearchParams } from 'expo-router';

import { StitchDetailScreen } from '@/features/dictionary/presentation/StitchDetailScreen';

export default function StitchDetailRoute() {
  const { stitchId } = useLocalSearchParams<{ stitchId: string }>();

  return <StitchDetailScreen stitchId={stitchId} />;
}
