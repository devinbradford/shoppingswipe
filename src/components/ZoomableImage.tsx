import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  /** Zoomed in: the parent stops paging between photos so panning moves the photo instead. */
  onZoomChange: (zoomed: boolean) => void;
  /** Swiped down far enough to close. */
  onDismiss: () => void;
  /** 0 → 1 while dragging down to close; the parent fades its backdrop with it. */
  dismissProgress: SharedValue<number>;
  accessibilityLabel?: string;
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const SPRING = { damping: 20, stiffness: 220 };

/** A photo you can pinch or double-tap to zoom, pan around when zoomed, and swipe down to close. */
export function ZoomableImage({
  uri,
  width,
  height,
  onZoomChange,
  onDismiss,
  dismissProgress,
  accessibilityLabel,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const zoomed = useSharedValue(false);

  const clampPan = (s: number) => {
    'worklet';
    const maxX = ((s - 1) * width) / 2;
    const maxY = ((s - 1) * height) / 2;
    x.set(Math.max(-maxX, Math.min(maxX, x.get())));
    y.set(Math.max(-maxY, Math.min(maxY, y.get())));
  };
  const setZoomed = (z: boolean) => {
    'worklet';
    if (zoomed.get() !== z) {
      zoomed.set(z);
      scheduleOnRN(onZoomChange, z);
    }
  };
  const reset = () => {
    'worklet';
    scale.set(withSpring(1, SPRING));
    x.set(withSpring(0, SPRING));
    y.set(withSpring(0, SPRING));
    savedScale.set(1);
    savedX.set(0);
    savedY.set(0);
    setZoomed(false);
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.max(0.8, Math.min(MAX_SCALE, savedScale.get() * e.scale)));
    },
    onDeactivate: () => {
      'worklet';
      if (scale.get() <= 1.05) {
        reset();
        return;
      }
      savedScale.set(scale.get());
      clampPan(scale.get());
      savedX.set(x.get());
      savedY.set(y.get());
      setZoomed(true);
    },
  });

  // Zoomed: move the photo. Not zoomed: only a downward drag (to close); sideways goes to the photo pager.
  const pan = usePanGesture({
    activeOffsetY: [-12, 12],
    failOffsetX: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      if (zoomed.get()) {
        x.set(savedX.get() + e.translationX);
        y.set(savedY.get() + e.translationY);
        clampPan(scale.get());
      } else {
        const down = Math.max(0, e.translationY);
        y.set(down);
        dismissProgress.set(Math.min(1, down / (height * 0.4)));
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (zoomed.get()) {
        savedX.set(x.get());
        savedY.set(y.get());
        return;
      }
      if (e.translationY > 120 || e.velocityY > 900) {
        scheduleOnRN(onDismiss);
      } else {
        y.set(withSpring(0, SPRING));
        dismissProgress.set(withTiming(0, { duration: 160 }));
      }
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDistance: 20,
    onActivate: () => {
      'worklet';
      if (zoomed.get()) {
        reset();
      } else {
        scale.set(withSpring(DOUBLE_TAP_SCALE, SPRING));
        savedScale.set(DOUBLE_TAP_SCALE);
        setZoomed(true);
      }
    },
  });

  const gesture = useCompetingGestures(doubleTap, useSimultaneousGestures(pinch, pan));

  const style = useAnimatedStyle(() => {
    const p = dismissProgress.get();
    return {
      transform: [
        { translateX: x.get() },
        { translateY: y.get() },
        { scale: scale.get() * (zoomed.get() ? 1 : 1 - 0.15 * p) },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, styles.frame]}>
        {/* The photo ignores touches so the gestures always get them (and web doesn't start an image drag). */}
        <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={160}
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
