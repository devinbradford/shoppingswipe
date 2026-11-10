import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SwipeDirection } from '@/domain/types';
import { brandLine, formatPrice } from '@/lib/format';
import { colors, motion, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { metaFor } from '@/lib/photoLayout';
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
  /** -1 (Skip) → 1 (Keep) while the top card is dragged. Lets the buttons react. */
  drag?: SharedValue<number>;
  /** Fly in from this side (the card just came back with Undo). */
  enterFrom?: SwipeDirection;
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
/** Space between the photo progress lines and the top of the photo card. */
const PHOTO_TOP = 64;

export function SwipeCard({
  card,
  isTop,
  progress,
  drag,
  enterFrom,
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

  // An undone card starts off screen on the side it left and springs back in.
  const enterX = enterFrom && !reduceMotion ? (enterFrom === 'keep' ? 1 : -1) * flyDistance : 0;
  const tx = useSharedValue(enterX);
  const ty = useSharedValue(0);
  const pastThreshold = useSharedValue(false);
  /** +1 when grabbed in the top half, -1 in the bottom half: the card tilts around your finger. */
  const grab = useSharedValue(1);
  const cardHeight = useSharedValue(0);
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
    if (!isTop) return;
    progress.set(0);
    drag?.set(withTiming(0, { duration: 160 }));
  }, [isTop, progress, drag]);

  useEffect(() => {
    if (enterX !== 0) tx.set(withSpring(0, SPRING));
    // Only on mount: this card's entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the drag for the Skip / Keep buttons.
  useAnimatedReaction(
    () => tx.get(),
    (x) => {
      if (isTop && drag) drag.set(Math.max(-1, Math.min(1, x / threshold)));
    },
  );

  const finish = (direction: SwipeDirection) => {
    Haptics.impactAsync(
      direction === 'keep' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
    onSwiped(direction);
  };
  const open = () => {
    Haptics.selectionAsync().catch(() => {});
    onOpen();
  };
  const tick = () => {
    Haptics.selectionAsync().catch(() => {});
  };

  /** Throw the card off screen. With a fling speed it leaves at that speed and keeps its angle. */
  const flyOut = (direction: SwipeDirection, velocityX = 0, velocityY = 0) => {
    'worklet';
    const sign = direction === 'keep' ? 1 : -1;
    const remaining = Math.abs(sign * flyDistance - tx.get());
    const speed = Math.abs(velocityX);
    const ms = reduceMotion ? flyMs : speed > 0 ? Math.max(140, Math.min(320, (remaining / speed) * 1000)) : flyMs;
    progress.set(withTiming(1, { duration: ms }));
    if (!reduceMotion && velocityY !== 0) {
      ty.set(withTiming(ty.get() + velocityY * (ms / 1000) * 0.6, { duration: ms }));
    }
    tx.set(
      withTiming(sign * flyDistance, { duration: ms, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(finish, direction);
      }),
    );
  };

  useEffect(() => {
    if (!isTop || !registerApi) return;
    registerApi({
      flyOut: (d) => {
        grab.set(1);
        flyOut(d);
      },
    });
    return () => registerApi(null);
  });

  const pan = usePanGesture({
    enabled: isTop,
    activeOffsetX: [-12, 12],
    // Upward drags count too (they open the product page); downward ones don't.
    activeOffsetY: [-14, 10000],
    onBegin: (e) => {
      'worklet';
      grab.set(cardHeight.get() > 0 && e.y > cardHeight.get() / 2 ? -1 : 1);
    },
    onUpdate: (e) => {
      'worklet';
      tx.set(e.translationX);
      ty.set(reduceMotion ? 0 : e.translationY * (e.translationY < 0 ? 0.6 : 0.35));
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
      const upward =
        Math.abs(e.translationX) < threshold &&
        Math.abs(e.translationY) > Math.abs(e.translationX) &&
        (e.translationY < -motion.openDistance || e.velocityY < -motion.openVelocity);
      if (!upward && (Math.abs(e.translationX) > threshold || fling)) {
        flyOut(e.translationX > 0 ? 'keep' : 'skip', fling ? e.velocityX : 0, e.velocityY);
      } else {
        if (upward) scheduleOnRN(open);
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
        open();
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
        {
          rotate: `${grab.get() * interpolate(x, [-screenWidth, screenWidth], [-tilt, tilt], Extrapolation.CLAMP)}deg`,
        },
      ],
    };
  });

  // Edge glow: fades in as the card heads for a decision, full at the point of no return.
  const keepGlow = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [threshold * 0.15, threshold], [0, 1], Extrapolation.CLAMP),
  }));
  const skipGlow = useAnimatedStyle(() => ({
    opacity: interpolate(tx.get(), [-threshold, -threshold * 0.15], [1, 0], Extrapolation.CLAMP),
  }));
  const keepMark = useAnimatedStyle(() => {
    const x = tx.get();
    return {
      opacity: interpolate(x, [threshold * 0.3, threshold * 0.8], [0, 1], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(x, [threshold * 0.3, threshold, threshold * 1.5], [0.6, 1, 1.12], Extrapolation.CLAMP) },
      ],
    };
  });
  const skipMark = useAnimatedStyle(() => {
    const x = tx.get();
    return {
      opacity: interpolate(x, [-threshold * 0.8, -threshold * 0.3], [1, 0], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(x, [-threshold * 1.5, -threshold, -threshold * 0.3], [1.12, 1, 0.6], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCardSize({ width, height });
    cardHeight.set(height);
  };

  const price = formatPrice(product.priceCents, product.currency);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, cardStyle]}
        onLayout={onLayout}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessible={isTop}
        accessibilityLabel={`${product.title}, ${price}, ${product.material}, ${product.color}, ${product.brand ? `${product.brand} ` : ''}at ${retailerName}${forYou ? `. Picked for you: ${forYou}` : ''}`}
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
        importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
        // iPhone screen readers ignore importantForAccessibility: hide the card underneath explicitly.
        accessibilityElementsHidden={!isTop}
        aria-hidden={!isTop}>
        {/* The photo ignores touches so the card's own gestures always get them. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <ProductImage
            uri={photos[photo]}
            style={StyleSheet.absoluteFill}
            fit="studio"
            meta={metaFor(photos, product.imageMeta, photo)}
            // Keep the whole product between the top controls and the price block.
            insets={{
              top: pipsTop + PHOTO_TOP,
              bottom: infoBottom + INFO_BLOCK_HEIGHT,
              left: space.lg,
              right: space.lg,
            }}
            priority={isTop ? 'high' : 'normal'}
          />
        </View>

        {/* Ends where the photo card begins, so the card stays clean. */}
        <LinearGradient
          colors={[colors.scrimMid, colors.scrimLight]}
          style={[styles.topScrim, { height: pipsTop + PHOTO_TOP }]}
          pointerEvents="none"
        />
        {photos.length > 1 ? (
          <View style={[styles.pips, { top: pipsTop }]} pointerEvents="none">
            {photos.map((uri, i) => (
              <View key={uri} style={[styles.pip, i === photo && styles.pipActive]} />
            ))}
          </View>
        ) : null}

        <LinearGradient
          colors={[colors.scrimLight, colors.scrimMid, colors.scrim, colors.background]}
          locations={[0, 0.35, 0.72, 1]}
          // Starts below the photo card: only the text area gets the fade.
          style={[styles.scrim, { height: infoBottom + INFO_BLOCK_HEIGHT }]}
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
          <AppText variant="eyebrow" color={colors.onPhotoMuted} numberOfLines={1} style={styles.meta}>
            {brandLine(product.brand, retailerName).toUpperCase()}
          </AppText>
        </View>

        <Animated.View style={[styles.glow, styles.keepGlow, keepGlow]} pointerEvents="none" />
        <Animated.View style={[styles.glow, styles.skipGlow, skipGlow]} pointerEvents="none" />
        <Animated.View style={[styles.mark, styles.keepMark, keepMark]} pointerEvents="none">
          <Icon name="keep" size={30} color={colors.onInk} />
        </Animated.View>
        <Animated.View style={[styles.mark, styles.skipMark, skipMark]} pointerEvents="none">
          <Icon name="close" size={30} color={colors.onAction} />
        </Animated.View>
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
  glow: { ...StyleSheet.absoluteFill, borderWidth: 2 },
  keepGlow: {
    borderColor: colors.accent,
    backgroundColor: colors.keepWash,
    boxShadow: `inset 0 0 56px 2px ${colors.keepGlow}`,
  },
  skipGlow: {
    borderColor: colors.skip,
    backgroundColor: colors.skipWash,
    boxShadow: `inset 0 0 56px 2px ${colors.skipGlow}`,
  },
  mark: {
    position: 'absolute',
    top: '30%',
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Each mark sits on the side the card is leaving from, so it stays on screen.
  keepMark: { left: space.xxl, backgroundColor: colors.keep, boxShadow: `0 10px 30px ${colors.keepGlow}` },
  skipMark: { right: space.xxl, backgroundColor: colors.skip, boxShadow: `0 10px 30px ${colors.skipGlow}` },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
