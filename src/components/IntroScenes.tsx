import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

/**
 * The three looping illustrations for the first-launch intro. Presentational
 * only: photos come in as props. With reduce motion they hold a still frame.
 */

const CARD_W = 210;
const CARD_H = 280;

/** 0 → 1 repeating timeline: wait, play, hold, reset. */
function useLoop(reduceMotion: boolean, playMs: number, waitMs = 500, holdMs = 500, still = 0.55) {
  const t = useSharedValue(reduceMotion ? still : 0);
  useEffect(() => {
    if (reduceMotion) {
      t.set(still);
      return;
    }
    t.set(
      withRepeat(
        withSequence(
          withDelay(waitMs, withTiming(1, { duration: playMs, easing: Easing.inOut(Easing.cubic) })),
          withDelay(holdMs, withTiming(0, { duration: 0 })),
        ),
        -1,
      ),
    );
  }, [t, reduceMotion, playMs, waitMs, holdMs, still]);
  return t;
}

/** Slide 1: a card swipes right with a Keep stamp; the next card steps up. */
export function SwipeScene({ photos, reduceMotion }: { photos: string[]; reduceMotion: boolean }) {
  const t = useLoop(reduceMotion, 850, 600, 350, 0.45);
  const top = useAnimatedStyle(() => {
    const p = t.get();
    return {
      transform: [{ translateX: p * 300 }, { translateY: p * 24 }, { rotate: `${p * 16}deg` }],
      opacity: 1 - Math.max(0, p - 0.75) * 4,
    };
  });
  const under = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + 0.08 * t.get() }, { translateY: 18 * (1 - t.get()) }] }));
  const stamp = useAnimatedStyle(() => ({ opacity: Math.min(1, t.get() * 3) }));
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.card, under]}>
        <ProductImage uri={photos[1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.card, top]}>
        <ProductImage uri={photos[0]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.stamp, stamp]}>
          <AppText variant="eyebrow" color={colors.keep}>
            KEEP
          </AppText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Slide 2: six pieces; the ones that aren't you fade away, the ones that are light up. */
export function LearnScene({ photos, reduceMotion }: { photos: string[]; reduceMotion: boolean }) {
  const t = useLoop(reduceMotion, 1100, 500, 1300, 1);
  const match = [true, false, true, false, true, false];
  return (
    <View style={styles.stage}>
      <View style={styles.grid}>
        {match.map((m, i) => (
          <MiniCard key={i} uri={photos[i % Math.max(1, photos.length)]} match={m} t={t} />
        ))}
      </View>
      <ForYouPill t={t} />
    </View>
  );
}

function MiniCard({ uri, match, t }: { uri?: string; match: boolean; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return match
      ? { opacity: 1, transform: [{ scale: 1 + 0.04 * p }], borderColor: p > 0.5 ? colors.keep : colors.glassBorder }
      : { opacity: 1 - 0.8 * p, transform: [{ scale: 1 - 0.08 * p }], borderColor: colors.glassBorder };
  });
  return (
    <Animated.View style={[styles.mini, style]}>
      <ProductImage uri={uri} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function ForYouPill({ t }: { t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: Math.max(0, t.get() * 2 - 1),
    transform: [{ translateY: 8 * (1 - t.get()) }],
  }));
  return (
    <Animated.View style={[styles.forYou, style]}>
      <View style={styles.dot} />
      <AppText variant="caption" color={colors.accentText}>
        For you · curved shapes, warm wood
      </AppText>
    </Animated.View>
  );
}

/** Slide 3: a kept piece with its store and a gently pulsing Buy now. */
export function BuyScene({ photo, reduceMotion }: { photo?: string; reduceMotion: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [pulse, reduceMotion]);
  const button = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.035 * pulse.get() }],
    boxShadow: `0 0 ${12 + 14 * pulse.get()}px ${colors.accentGlassBorder}`,
  }));
  return (
    <View style={styles.stage}>
      <View style={[styles.card, styles.buyCard]}>
        <View style={styles.buyPhoto}>
          <ProductImage uri={photo} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.buyInfo}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            SAMPLE STORE
          </AppText>
          <AppText variant="heading" color={colors.ink}>
            $1,249
          </AppText>
          <Animated.View style={[styles.buy, button]}>
            <Icon name="external" size={14} color={colors.onInk} />
            <AppText variant="label" color={colors.onInk}>
              Buy now
            </AppText>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: CARD_H + 40, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    boxShadow: `0 22px 44px ${colors.shadow}99`,
  },
  stamp: {
    position: 'absolute',
    top: space.lg,
    left: space.lg,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 2,
    borderColor: colors.keep,
    borderRadius: radii.sm,
    transform: [{ rotate: '-12deg' }],
    backgroundColor: colors.scrimMid,
  },
  grid: { width: 3 * 92 + 2 * space.sm, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mini: {
    width: 92,
    height: 116,
    borderRadius: radii.sm + 4,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 2,
  },
  forYou: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    backgroundColor: colors.background,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.keep },
  buyCard: { position: 'relative', height: CARD_H + 10 },
  buyPhoto: { flex: 1 },
  buyInfo: { padding: space.lg, gap: space.xs, backgroundColor: colors.surface },
  buy: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.keep,
  },
});
