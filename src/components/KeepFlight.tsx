import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme/tokens';
import { Icon } from './Icon';

interface Point {
  x: number;
  y: number;
}

const SIZE = 44;
const DURATION_MS = 620;

/** A small champagne heart that arcs from the card to where kept things go (the Kept tab or button). */
export function KeepFlight({
  id,
  from,
  to,
  onDone,
}: {
  id: number;
  from: Point;
  to: Point;
  /** Called with `id` once the heart has landed. Keep it stable (useCallback). */
  onDone: (id: number) => void;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(
      withTiming(1, { duration: DURATION_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(onDone, id);
      }),
    );
  }, [t, id, onDone]);

  const style = useAnimatedStyle(() => {
    const p = t.get();
    // Rises a little first, then drops into the target.
    const arc = Math.sin(Math.PI * p) * 70;
    return {
      opacity: p < 0.1 ? p * 10 : p > 0.85 ? (1 - p) / 0.15 : 1,
      transform: [
        { translateX: from.x + (to.x - from.x) * p - SIZE / 2 },
        { translateY: from.y + (to.y - from.y) * p - arc - SIZE / 2 },
        { scale: 1.1 - 0.6 * p },
      ],
    };
  });

  return (
    <Animated.View style={[styles.heart, style]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <Icon name="keep" size={20} color={colors.onInk} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.keep,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 8px 24px ${colors.keepGlow}`,
  },
});
