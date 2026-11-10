import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, motion, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';

const SPRING = { damping: 18, stiffness: 220, mass: 0.9 };

export interface RoomSwipeApi {
  flyOut: (love: boolean) => void;
}

interface RoomSwipeCardProps {
  image: number;
  alt: string;
  onAnswer: (love: boolean) => void;
  /** Lets the Love / Not for me buttons throw the card. */
  registerApi: (api: RoomSwipeApi | null) => void;
  reduceMotion: boolean;
  /** Slide in from this side (undo brings a room back from where it left). */
  enterFrom?: -1 | 0 | 1;
}

/**
 * One onboarding room: a full photo you swipe right (Love it) or left (Not for me).
 * Same gesture feel as product cards; a butter edge and label show while dragging right.
 */
export function RoomSwipeCard({ image, alt, onAnswer, registerApi, reduceMotion, enterFrom = 0 }: RoomSwipeCardProps) {
  const { width } = useWindowDimensions();
  const threshold = width * motion.swipeThreshold;
  const flyDistance = width * 1.4;
  const tx = useSharedValue(enterFrom * width);
  const ty = useSharedValue(0);

  useEffect(() => {
    if (enterFrom !== 0) tx.set(reduceMotion ? withTiming(0, { duration: 160 }) : withSpring(0, SPRING));
    // Only on mount: this card's entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (love: boolean) => {
    Haptics.impactAsync(love ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onAnswer(love);
  };

  const flyOut = (love: boolean, velocityX = 0) => {
    'worklet';
    const target = (love ? 1 : -1) * flyDistance;
    const speed = Math.abs(velocityX);
    const ms = reduceMotion
      ? 140
      : speed > 0
        ? Math.max(140, Math.min(300, (Math.abs(target - tx.get()) / speed) * 1000))
        : motion.flyOutMs;
    tx.set(
      withTiming(target, { duration: ms, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(finish, love);
      }),
    );
  };

  useEffect(() => {
    registerApi({ flyOut: (love) => flyOut(love) });
    return () => registerApi(null);
  });

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(reduceMotion ? 0 : e.translationY * 0.3);
    },
    onDeactivate: (e) => {
      'worklet';
      const fling =
        Math.abs(e.velocityX) > motion.swipeVelocity && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (Math.abs(e.translationX) > threshold || fling) {
        flyOut(e.translationX > 0, fling ? e.velocityX : 0);
      } else {
        const settle = (v: number) => (reduceMotion ? withTiming(v, { duration: 120 }) : withSpring(v, SPRING));
        tx.set(settle(0));
        ty.set(settle(0));
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() },
      { translateY: ty.get() },
      { rotate: `${reduceMotion ? 0 : (tx.get() / width) * 14}deg` },
    ],
  }));
  const loveStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, tx.get() / threshold)) }));
  const passStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, -tx.get() / threshold)) }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]} accessible accessibilityRole="image" accessibilityLabel={alt}>
        <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        <Animated.View style={[styles.edge, loveStyle]} pointerEvents="none" />
        <Animated.View style={[styles.tag, styles.loveTag, loveStyle]} pointerEvents="none">
          <AppText variant="label" color={colors.onInk}>
            Love it
          </AppText>
        </Animated.View>
        <Animated.View style={[styles.tag, styles.passTag, passStyle]} pointerEvents="none">
          <AppText variant="label" color={colors.onAction}>
            Not for me
          </AppText>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Keeps the card's size stable between rooms. */
export function RoomCardFrame({ children }: { children: React.ReactNode }) {
  return <View style={styles.frame}>{children}</View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, minHeight: 0 },
  card: {
    flex: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    boxShadow: `0 24px 48px ${colors.shadow}59`,
  },
  edge: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.lg,
    borderWidth: 4,
    borderColor: colors.keep,
  },
  tag: {
    position: 'absolute',
    top: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radii.pill,
  },
  loveTag: { left: space.lg, backgroundColor: colors.keep },
  passTag: { right: space.lg, backgroundColor: colors.skip },
});
