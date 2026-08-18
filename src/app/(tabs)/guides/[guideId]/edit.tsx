import { useLocalSearchParams } from 'expo-router';

import { GuideEditorScreen } from '@/features/guides/presentation/GuideEditorScreen';

export default function GuideEditorRoute() {
  const { guideId } = useLocalSearchParams<{ guideId: string }>();

  return <GuideEditorScreen guideId={guideId} />;
}
