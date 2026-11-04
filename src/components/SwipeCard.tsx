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
  /** Distance from the card's top to the photo progress lines (clears the status bar). */
  pipsTop?: number;
  /** Distance from the card's bottom to the price block (clears the buttons). */
  infoBottom?: number;
  /** Shown in the "For you" bubble's place when there is no reason yet. */
  hint?: string | null;
  /** Called when the shopper flips to another photo. */
  onPhotoBrowse?: () => void;
}

const SPRING = { damping: 18, stiffness: 220, mass: 0.9 };
/** Room the "For you" bubble, price, name and store line take up above `infoBottom`. */
const INFO_BLOCK_HEIGHT = 190;

export function SwipeCard({
  card,
  isTop,
  progress,
  retailerName,
  onSwiped,
  onOpen,
  registerApi,
  reduceMotion = false,
  pipsTop = space.md,
  infoBottom = space.xl,
  hint = null,
  onPhotoBrowse,
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
  const { product, forYou } = card;
  const photos = product.imageUrls;
  const nextPhoto = () => {
    if (photo < photos.length - 1) onPhotoBrowse?.();
    setPhoto((p) => Math.min(photos.length - 1, p + 1));
  };

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
      if (e.y > cardSize.height * 0.58) {
        onOpen();
      } else if (e.x < cardSize.width * 0.4) {
        setPhoto((p) => Math.max(0, p - 1));
      } else {
        nextPhoto();
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
          if (e.nativeEvent.actionName === 'increment') nextPhoto();
          if (e.nativeEvent.actionName === 'decrement') setPhoto((p) => Math.max(0, p - 1));
        }}
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}>
        {/* The photo ignores touches so the card's own gestures always get them. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ProductImage
            uri={photos[photo]}
            style={StyleSheet.absoluteFill}
            fit="showcase"
            // Keep the whole product between the top controls and the price block.
            insets={{ top: pipsTop + 64, bottom: infoBottom + INFO_BLOCK_HEIGHT, left: space.lg, right: space.lg }}
            priority={isTop ? 'high' : 'normal'}
          />
        </View>

        <LinearGradient
          colors={[colors.scrimMid, colors.scrimLight]}
          style={[styles.topScrim, { height: pipsTop + 120 }]}
          pointerEvents="none"
        />
        {photos.length > 1 ? (
          <View style={[styles.pips, { top: pipsTop }]} pointerEvents="none">
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

        <LinearGradient
          colors={[colors.scrimLight, colors.scrimMid, colors.scrim, colors.background]}
          locations={[0, 0.35, 0.72, 1]}
          style={styles.scrim}
          pointerEvents="none"
        />
        <View style={[styles.info, { bottom: infoBottom }]} pointerEvents="none">
          {forYou || hint ? (
            <View style={styles.forYou}>
              <View style={styles.dot} />
              {forYou ? (
                <AppText variant="caption" color={colors.accentText} numberOfLines={1} style={styles.forYouText}>
                  For you ·{' '}
                  <AppText variant="italic" color={colors.accentText}>
                    {forYou}
                  </AppText>
                </AppText>
              ) : (
                <AppText variant="caption" color={colors.accentText} numberOfLines={1} style={styles.forYouText}>
                  {hint}
                </AppText>
              )}
            </View>
          ) : null}
          <AppText variant="price" color={colors.onPhoto}>
            {price}
          </AppText>
          <AppText variant="title" color={colors.onPhoto} numberOfLines={2}>
            {product.title}
          </AppText>
          <AppText variant="eyebrow" color={colors.inkMuted} numberOfLines={1} style={styles.meta}>
            {`${product.brand} · ${retailerName}`.toUpperCase()}
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
  },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  pips: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    flexDirection: 'row',
    gap: space.xs,
  },
  pip: { flex: 1, height: 2, backgroundColor: colors.pip },
  pipActive: { backgroundColor: colors.pipActive },
  stamp: {
    position: 'absolute',
    top: '30%',
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
  },
  keepStamp: { left: space.xl, borderColor: colors.keep, transform: [{ rotate: '-8deg' }] },
  skipStamp: { right: space.xl, borderColor: colors.skip, transform: [{ rotate: '8deg' }] },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  info: { position: 'absolute', left: space.xl, right: space.xl, gap: space.sm },
  forYou: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: '100%',
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accentGlass,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    marginBottom: space.xs,
  },
  forYouText: { flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.keep },
  meta: { marginTop: space.xs },
});
