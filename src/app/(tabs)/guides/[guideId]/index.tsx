import { useLocalSearchParams } from 'expo-router';

import { GuideDetailScreen } from '@/features/guides/presentation/GuideDetailScreen';

export default function GuideDetailRoute() {
  const { guideId } = useLocalSearchParams<{ guideId: string }>();

  return <GuideDetailScreen guideId={guideId} />;
}
