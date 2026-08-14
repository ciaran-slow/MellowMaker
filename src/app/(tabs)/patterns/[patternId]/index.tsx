import { useLocalSearchParams } from 'expo-router';

import { PatternViewerScreen } from '@/features/patterns/presentation/PatternViewerScreen';

export default function PatternViewerRoute() {
  const { patternId } = useLocalSearchParams<{ patternId: string }>();

  return <PatternViewerScreen patternId={patternId} />;
}
