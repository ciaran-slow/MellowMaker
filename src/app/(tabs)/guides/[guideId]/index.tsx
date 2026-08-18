import { useLocalSearchParams } from 'expo-router';

import { GuideWorkingViewScreen } from '@/features/guides/presentation/GuideWorkingViewScreen';

export default function GuideWorkingViewRoute() {
  const { guideId } = useLocalSearchParams<{ guideId: string }>();

  return <GuideWorkingViewScreen guideId={guideId} />;
}
