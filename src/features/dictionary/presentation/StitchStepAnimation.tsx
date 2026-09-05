import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import {
  BASE_STROKE_WIDTH,
  DRAW_STROKE_WIDTH,
  STITCH_ART_MAX_WIDTH,
  STITCH_ART_VIEWBOX,
  STROKE_COLOR,
  type StitchStepArt,
} from '@/features/dictionary/presentation/stitchStepArt';
import { useStrokeDraw } from '@/ui/motion/useStrokeDraw';
import tokens from '@/ui/theme/tokens.json';

/** Created once at module scope: a per-render component type would remount. */
const AnimatedPath = Animated.createAnimatedComponent(Path);

type StitchStepAnimationProps = {
  readonly art: StitchStepArt;
  /** The step's zero-based position, which also spaces the cascade. */
  readonly stepIndex: number;
};

/**
 * The decorative line drawing beneath one instruction sentence.
 *
 * It is **not** content: the sentence above it says everything the drawing
 * shows, so the whole subtree is hidden from VoiceOver and TalkBack rather than
 * given a label that would make a maker hear the same step twice. It carries no
 * text, no `accessibilityRole="image"`, no timer, and no network call, and it
 * renders in the same pass as the sentence — nothing about the text waits on it.
 */
export function StitchStepAnimation({
  art,
  stepIndex,
}: StitchStepAnimationProps) {
  const { animatedProps } = useStrokeDraw(
    art.draw.length,
    stepIndex * tokens.motion.stepStaggerMs,
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: '100%',
        maxWidth: STITCH_ART_MAX_WIDTH,
        aspectRatio: STITCH_ART_VIEWBOX.width / STITCH_ART_VIEWBOX.height,
      }}
      testID={`stitch-step-art-${stepIndex}`}
    >
      <Svg
        height="100%"
        viewBox={`0 0 ${STITCH_ART_VIEWBOX.width} ${STITCH_ART_VIEWBOX.height}`}
        width="100%"
      >
        {art.base.map((stroke) => (
          <Path
            d={stroke.d}
            fill="none"
            key={`${stroke.role}:${stroke.d}`}
            stroke={STROKE_COLOR[stroke.role]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={BASE_STROKE_WIDTH}
          />
        ))}
        <AnimatedPath
          animatedProps={animatedProps}
          d={art.draw.d}
          fill="none"
          stroke={STROKE_COLOR[art.draw.role]}
          strokeDasharray={[art.draw.length, art.draw.length]}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={DRAW_STROKE_WIDTH}
        />
      </Svg>
    </View>
  );
}
