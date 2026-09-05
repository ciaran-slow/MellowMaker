import { useLocalSearchParams } from 'expo-router';

import { SaveGuideAsPatternScreen } from '@/features/guides/presentation/SaveGuideAsPatternScreen';

export default function SaveGuideAsPatternRoute() {
  const { guideId } = useLocalSearchParams<{ guideId: string }>();

  return <SaveGuideAsPatternScreen guideId={guideId} />;
}
