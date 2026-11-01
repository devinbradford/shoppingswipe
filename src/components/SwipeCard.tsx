import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SwipeDirection } from '@/domain/types';
import { formatPrice } from '@/lib/format';
import { colors, motion, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';
import type { DeckCardData } from './SwipeDeck';

export interface SwipeCardApi {
  /** Animate the card off screen, then report the swipe (used by the buttons). */
  flyOut: (direction: SwipeDirection) => void;
}

interface SwipeCardProps {
  card: DeckCardData;
  isTop: boolean;
  /** 0 → 1 as the top card is dragged toward a decision. Drives the card behind. */
  progress: SharedValue<number>;
  retailerName: string;
  onSwiped: (direction: SwipeDirection) => void;
  onOpen: () => void;
  registerApi?: (api: SwipeCardApi | null) => void;
  /** "Reduce motion" is on: no tilt, no springy settle, quicker exit. */
  reduceMotion?: boolean;
}

const SPRING = { damping: 18, stiffness: 220, mass: 0.9 };

export function SwipeCard({
  card,
  isTop,
  progress,
  retailerName,
  onSwiped,
  onOpen,
  registerApi,
  reduceMotion = false,
}: SwipeCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const threshold = screenWidth * motion.swipeThreshold;
  const flyDistance = screenWidth * 1.4;
  const flyMs = reduceMotion ? 90 : motion.flyOutMs;
  const tilt = reduceMotion ? 0 : 12;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const pastThreshold = useSharedValue(false);
  const [photo, setPhoto] = useState(0);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  const { product, reasonText } = card;
  const photos = product.imageUrls;

  // A card that just became the top one resets the shared progress.
  useEffect(() => {
    if (isTop) progress.set(0);
  }, [isTop, progress]);

  const finish = (direction: SwipeDirection) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSwiped(direction);
  };
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  const flyOut = (direction: SwipeDirection) => {
    'worklet';
    const sign = direction === 'keep' ? 1 : -1;
    progress.set(withTiming(1, { duration: flyMs }));
    tx.set(
      withTiming(sign * flyDistance, { duration: flyMs }, (done) => {
        if (done) scheduleOnRN(finish, direction);
      }),
    );
  };

  useEffect(() => {
    if (!isTop || !registerApi) return;
    registerApi({ flyOut: (d) => flyOut(d) });
    return () => registerApi(null);
  });

  const pan = usePanGesture({
    enabled: isTop,
    activeOffsetX: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(reduceMotion ? 0 : e.translationY * 0.35);
      progress.set(Math.min(1, Math.abs(e.translationX) / threshold));
      const past = Math.abs(e.translationX) > threshold;
      if (past !== pastThreshold.get()) {
        pastThreshold.set(past);
        if (past) scheduleOnRN(tick);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      const fling =
        Math.abs(e.velocityX) > motion.swipeVelocity && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (Math.abs(e.translationX) > threshold || fling) {
        flyOut(e.translationX > 0 ? 'keep' : 'skip');
      } else {
        const settle = (v: number) => (reduceMotion ? withTiming(v, { duration: 120 }) : withSpring(v, SPRING));
        tx.set(settle(0));
        ty.set(settle(0));
        progress.set(settle(0));
      }
      pastThreshold.set(false);
    },
  });

  const tap = useTapGesture({
    enabled: isTop,
    runOnJS: true,
    onActivate: (e) => {
      // Bottom info area opens details; left/right of the photo flips through images.
      if (e.y > cardSize.height * 0.68) {
        onOpen();
      } else if (e.x < cardSize.width * 0.4) {
        setPhoto((p) => Math.max(0, p - 1));
      } else {
        setPhoto((p) => Math.min(photos.length - 1, p + 1));
      }
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    if (!isTop) {
      const p = progress.get();
      return {
        transform: [{ scale: 0.95 + 0.05 * p }, { translateY: 14 * (1 - p) }],
      };
    }
    const x = tx.get();
    return {
      transform: [
        { translateX: x },
        { translateY: ty.get() },
        { rotate: `${interpolate(x, [-screenWidth, screenWidth], [-tilt, tilt], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  const keepStamp = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [threshold * 0.25, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const skipStamp = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [-threshold, -threshold * 0.25], [1, 0], Extrapolation.CLAMP),
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCardSize({ width, height });
  };

  const price = formatPrice(product.priceCents, product.currency);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, cardStyle]}
        onLayout={onLayout}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessible={isTop}
        accessibilityLabel={`${product.title}, ${price}, ${product.brand} at ${retailerName}`}
        accessibilityHint="Swipe up or down for Keep, Skip and more actions. Double tap for details."
        accessibilityActions={[
          { name: 'keep', label: 'Keep' },
          { name: 'skip', label: 'Skip' },
          { name: 'activate', label: 'Open details' },
          { name: 'increment', label: 'Next photo' },
          { name: 'decrement', label: 'Previous photo' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'keep') flyOut('keep');
          if (e.nativeEvent.actionName === 'skip') flyOut('skip');
          if (e.nativeEvent.actionName === 'activate') onOpen();
          if (e.nativeEvent.actionName === 'increment') setPhoto((p) => Math.min(photos.length - 1, p + 1));
          if (e.nativeEvent.actionName === 'decrement') setPhoto((p) => Math.max(0, p - 1));
        }}
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}>
        {/* The photo ignores touches so the card's own gestures always get them. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ProductImage uri={photos[photo]} style={StyleSheet.absoluteFill} priority={isTop ? 'high' : 'normal'} />
        </View>

        {photos.length > 1 ? (
          <View style={styles.pips} pointerEvents="none">
            {photos.map((uri, i) => (
              <View key={uri} style={[styles.pip, i === photo && styles.pipActive]} />
            ))}
          </View>
        ) : null}

        <Animated.View style={[styles.stamp, styles.keepStamp, keepStamp]} pointerEvents="none">
          <AppText variant="title" color={colors.keep}>
            Keep
          </AppText>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.skipStamp, skipStamp]} pointerEvents="none">
          <AppText variant="title" color={colors.skip}>
            Skip
          </AppText>
        </Animated.View>

        <LinearGradient colors={[colors.scrimLight, colors.scrim]} style={styles.scrim} pointerEvents="none" />
        <View style={styles.info} pointerEvents="none">
          {reasonText ? (
            <View style={styles.reason}>
              <AppText variant="caption" color={colors.onInk} numberOfLines={1}>
                {reasonText}
              </AppText>
            </View>
          ) : null}
          <AppText variant="price" color={colors.onInk}>
            {price}
          </AppText>
          <AppText variant="heading" color={colors.onInk} numberOfLines={2}>
            {product.title}
          </AppText>
          <AppText variant="bodySmall" color={colors.onInk} style={styles.meta} numberOfLines={1}>
            {product.brand} · {retailerName}
          </AppText>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    boxShadow: `0 10px 30px ${colors.shadow}22`,
  },
  pips: {
    position: 'absolute',
    top: space.md,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    gap: space.xs,
  },
  pip: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.pip },
  pipActive: { backgroundColor: colors.pipActive },
  stamp: {
    position: 'absolute',
    top: space.xxl + space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
    borderWidth: 3,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  keepStamp: { left: space.xl, borderColor: colors.keep, transform: [{ rotate: '-12deg' }] },
  skipStamp: { right: space.xl, borderColor: colors.skip, transform: [{ rotate: '12deg' }] },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%' },
  info: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xl, gap: space.xs },
  reason: {
    alignSelf: 'flex-start',
    backgroundColor: colors.keep,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    marginBottom: space.sm,
  },
  meta: { opacity: 0.85 },
});
