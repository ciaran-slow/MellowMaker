import { useLocalSearchParams } from 'expo-router';

import { PatternEditorScreen } from '@/features/patterns/presentation/PatternEditorScreen';

export default function PatternEditorRoute() {
  const { patternId } = useLocalSearchParams<{ patternId: string }>();

  return <PatternEditorScreen patternId={patternId} />;
}
