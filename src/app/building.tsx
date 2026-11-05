import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { ProductImage } from '@/components/ProductImage';
import { useStyleOptions } from '@/hooks/useCatalog';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/** How long the moment lasts before the first deck opens. Never longer than 2 s. */
const DURATION_MS = 1700;
const CARD_W = 148;
const CARD_H = 196;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Building your feed": a short moment after onboarding where three cards in
 * the shopper's styles fan out and settle into a deck while their answers
 * appear, then the app moves on. Makes the first deck feel made for them.
 *
 * Route params: `next` (where to go after; default Discover), `tags` (extra
 * answer labels to show, comma-separated, e.g. room and budget).
 */
export default function BuildingScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ next?: string; tags?: string }>();
  const picks = usePreferencesStore((s) => s.stylePicks);
  const styleOptions = useStyleOptions();

  const tags = useMemo(() => {
    const extra = (params.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return [...picks.map(titleCase), ...extra].slice(0, 6);
  }, [picks, params.tags]);

  // Cover photos for the picked styles (fall back to the most common styles).
  const covers = useMemo(() => {
    if (styleOptions.status !== 'ready') return [];
    const byTag = new Map(styleOptions.data.map((s) => [s.tag, s.coverUrl]));
    const chosen = picks.map((p) => byTag.get(p)).filter((u): u is string => !!u);
    const rest = styleOptions.data.map((s) => s.coverUrl).filter((u): u is string => !!u && !chosen.includes(u));
    return [...chosen, ...rest].slice(0, 3);
  }, [styleOptions, picks]);

  useEffect(() => {
    if (covers.length) Image.prefetch(covers).catch(() => {});
  }, [covers]);

  const fan = useSharedValue(0);
  const settle = useSharedValue(0);
  const bar = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility('Building your feed');
    const ease = Easing.out(Easing.cubic);
    fan.set(withTiming(1, { duration: reduceMotion ? 0 : 650, easing: ease }));
    settle.set(withDelay(900, withTiming(1, { duration: reduceMotion ? 0 : 450, easing: Easing.inOut(Easing.cubic) })));
    bar.set(withTiming(1, { duration: DURATION_MS - 150, easing: Easing.inOut(Easing.quad) }));
    const next = (typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/') as Href;
    const timer = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(next);
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [fan, settle, bar, reduceMotion, params.next]);

  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: bar.get() }] }));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl }]}>
      <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.glow} />
        {[0, 1, 2].map((i) => (
          <FeedCard key={i} index={i} uri={covers[i]} fan={fan} settle={settle} reduceMotion={reduceMotion} />
        ))}
      </View>

      <View style={styles.copy}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)}>
          <AppText variant="eyebrow" color={colors.inkMuted} style={styles.center}>
            BUILDING YOUR FEED
          </AppText>
        </Animated.View>
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(120).duration(420)}>
          <AppText variant="hero" style={styles.center} accessibilityRole="header">
            Made for <AppText variant="hero" color={colors.accentText} style={styles.italic}>you.</AppText>
          </AppText>
        </Animated.View>
        {tags.length ? (
          <View style={styles.tags}>
            {tags.map((t, i) => (
              <Tag key={t} label={t} delay={300 + i * 160} reduceMotion={reduceMotion} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Building your feed">
        <Animated.View style={[styles.fill, barStyle]} />
      </View>
    </View>
  );
}

/** One answer chip. Every chip takes its place from the start (so the row never shifts) and fades up in turn. */
function Tag({ label, delay, reduceMotion }: { label: string; delay: number; reduceMotion: boolean }) {
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withDelay(reduceMotion ? 0 : delay, withTiming(1, { duration: reduceMotion ? 200 : 360 })));
  }, [shown, delay, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduceMotion ? 0 : (1 - shown.get()) * 8 }],
  }));
  return (
    <Animated.View style={[styles.tag, style]}>
      <AppText variant="bodySmall" color={colors.ink}>
        {label}
      </AppText>
    </Animated.View>
  );
}

function FeedCard({
  index,
  uri,
  fan,
  settle,
  reduceMotion,
}: {
  index: number;
  uri?: string;
  fan: SharedValue<number>;
  settle: SharedValue<number>;
  reduceMotion: boolean;
}) {
  const side = index - 1; // -1, 0, 1
  const style = useAnimatedStyle(() => {
    const f = fan.get();
    const s = settle.get();
    if (reduceMotion) return { opacity: f, transform: [{ translateY: side * 6 }] };
    // Fan out from below, then gather into a neat deck (the middle card on top).
    const x = side * 64 * f * (1 - s);
    const y = (1 - f) * 70 + Math.abs(side) * 14 * (1 - s) + s * Math.abs(side) * 8;
    const rotate = side * 9 * f * (1 - s) + side * 2.5 * s;
    const scale = 0.9 + 0.1 * f - (side !== 0 ? 0.04 * s : 0);
    return { opacity: Math.min(1, f * 1.4), transform: [{ translateX: x }, { translateY: y }, { rotate: `${rotate}deg` }, { scale }] };
  });
  return (
    <Animated.View style={[styles.card, { zIndex: side === 0 ? 3 : 2 - index }, style]}>
      <ProductImage uri={uri} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl, justifyContent: 'center', gap: space.xxl },
  stage: { height: CARD_H + 60, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.accentGlass,
    opacity: 0.35,
    boxShadow: `0 0 80px 40px ${colors.accentGlass}`,
  },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    boxShadow: `0 18px 40px ${colors.shadow}99`,
  },
  copy: { alignItems: 'center', gap: space.md },
  center: { textAlign: 'center' },
  italic: { fontFamily: fonts.serifItalic },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.sm, maxWidth: 340 },
  tag: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    backgroundColor: colors.accentGlass,
  },
  track: {
    alignSelf: 'center',
    width: 160,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.pip,
    overflow: 'hidden',
  },
  fill: { flex: 1, backgroundColor: colors.keep, transformOrigin: 'left' },
});
