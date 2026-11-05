import { useEffect, useRef, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Gives its children a quick bounce whenever `trigger` goes up (e.g. a count after a keep). */
export function Pulse({ trigger, children, disabled }: { trigger: number; children: ReactNode; disabled?: boolean }) {
  const scale = useSharedValue(1);
  const last = useRef(trigger);

  useEffect(() => {
    const grew = trigger > last.current;
    last.current = trigger;
    if (!grew || disabled) return;
    // Lands just after the heart arrives.
    scale.set(withSequence(withTiming(1, { duration: 520 }), withTiming(1.25, { duration: 110 }), withSpring(1)));
  }, [trigger, disabled, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
