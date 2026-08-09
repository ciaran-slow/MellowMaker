import { useSafeAreaInsets } from 'react-native-safe-area-context';

import tokens from '@/ui/theme/tokens.json';

export interface ScreenContentInsets {
  readonly paddingTop: number;
  readonly paddingRight: number;
  readonly paddingBottom: number;
  readonly paddingLeft: number;
}

/**
 * The one definition of a screen's safe-area + token padding. `Screen` applies
 * it to its scroll content; a screen that owns a virtualized list applies it
 * itself, so both stay identical without a second copy of the token maths or a
 * `FlatList` nested inside a `ScrollView`.
 */
export function useScreenContentInsets(): ScreenContentInsets {
  const insets = useSafeAreaInsets();

  return {
    paddingTop: insets.top + tokens.spacing[6],
    paddingRight: tokens.spacing[4],
    paddingBottom: insets.bottom + tokens.spacing[8],
    paddingLeft: tokens.spacing[4],
  };
}
