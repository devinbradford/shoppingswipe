import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme/tokens';

interface PriceSliderProps {
  /** Number of stops. */
  count: number;
  index: number;
  onChange: (index: number) => void;
  /** Read by screen readers, e.g. "Budget for a sofa". */
  label: string;
  /** Spoken value for a stop, e.g. "Up to $1,500". */
  valueText: (index: number) => string;
}

const THUMB = 30;

/** A stepped slider: drag or tap the track; it snaps to each stop with a soft tick. */
export function PriceSlider({ count, index, onChange, label, valueText }: PriceSliderProps) {
  const [width, setWidth] = useState(0);
  const usable = Math.max(1, width - THUMB);
  const step = usable / Math.max(1, count - 1);
  const x = useSharedValue(0);
  const current = useSharedValue(index);

  useEffect(() => {
    current.set(index);
    x.set(withTiming(index * step, { duration: 120 }));
  }, [index, step, x, current]);

  const select = (i: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(i);
  };

  const pan = usePanGesture({
    minDistance: 0,
    onUpdate: (e) => {
      'worklet';
      const pos = Math.min(usable, Math.max(0, e.x - THUMB / 2));
      x.set(pos);
      const i = Math.round(pos / step);
      if (i !== current.get()) {
        current.set(i);
        scheduleOnRN(select, i);
      }
    },
    onDeactivate: () => {
      'worklet';
      x.set(withTiming(current.get() * step, { duration: 120 }));
    },
  });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const fill = useAnimatedStyle(() => ({ width: x.get() + THUMB / 2 }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.wrap}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText(index) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment' && index < count - 1) select(index + 1);
          if (e.nativeEvent.actionName === 'decrement' && index > 0) select(index - 1);
        }}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fill]} />
        </View>
        <View style={styles.ticks} pointerEvents="none">
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={[styles.tick, i <= index && styles.tickOn]} />
          ))}
        </View>
        <Animated.View style={[styles.thumb, thumb]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 48, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: -THUMB / 2, top: 0, bottom: 0, backgroundColor: colors.keep },
  ticks: {
    position: 'absolute',
    left: THUMB / 2 - 2,
    right: THUMB / 2 - 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tick: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.inkSubtle },
  tickOn: { backgroundColor: colors.onInk },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.accent,
    boxShadow: `0 4px 14px ${colors.shadow}99`,
  },
});
