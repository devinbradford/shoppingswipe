import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { BuyScene, LearnScene, WelcomeScene } from '@/components/IntroScenes';
import { useCategorySummaries } from '@/hooks/useCatalog';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/** Furniture types shown first in the intro scenes (sofa first: it's the Buy now example). */
const SHOWCASE_TYPES = ['sofas', 'accent-chairs', 'bed-frames', 'nightstands', 'dining-tables', 'rugs'];

/** How long the second slide stays up before moving on. */
const SLIDE_MS = 3200;

const SLIDES = [
  {
    title: ['Your taste.\n', 'Discovered.'],
    body: 'Discover furniture you’ll love, one swipe at a time. The more you swipe, the better your finds.',
  },
  { title: ['It learns ', 'your taste.'], body: 'Every swipe makes the next pieces feel more like you.' },
  { title: ['Buy from the stores ', 'you trust.'], body: 'Tap Buy now and finish on the retailer’s own site.' },
] as const;

/** The welcome photo's shape (width / height) and its largest height. */
const HERO_RATIO = 4 / 5;
const HERO_MAX_H = 440;

/**
 * First-launch intro: a welcome slide, then two short slides that explain
 * CureAvo, then the style picker. The welcome waits for "Start discovering",
 * the middle slide moves on by itself, the last waits for "Get started". Tap the
 * right side to go forward, the left side to go back, or Skip at any time.
 */
export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const markIntroSeen = usePreferencesStore((s) => s.markIntroSeen);
  const { summaries } = useCategorySummaries();
  const [index, setIndex] = useState(0);
  const first = index === 0;
  const last = index === SLIDES.length - 1;
  const [heroBox, setHeroBox] = useState({ w: 0, h: 0 });
  const onHeroLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setHeroBox({ w: width, h: height });
  };
  // As large as the space allows, never taller than HERO_MAX_H.
  const heroH = Math.min(heroBox.h, HERO_MAX_H, heroBox.w / HERO_RATIO);

  // One photo per furniture type, the signature pieces first, so the scenes show real variety.
  const photos = useMemo(() => {
    const types = summaries.flatMap((room) => room.subcategories);
    const rank = (id: string) => {
      const i = SHOWCASE_TYPES.indexOf(id);
      return i === -1 ? SHOWCASE_TYPES.length : i;
    };
    return [...types]
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map((t) => t.coverUrl)
      .filter((u): u is string => !!u)
      .slice(0, 6);
  }, [summaries]);
  // The welcome shows the accent chair.
  const chairPhoto =
    summaries.flatMap((room) => room.subcategories).find((t) => t.id === 'accent-chairs')?.coverUrl ?? photos[1];

  const finish = () => {
    markIntroSeen();
    router.replace('/welcome');
  };

  // Progress line for the current slide, and auto-advance.
  const fill = useSharedValue(0);
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${SLIDES[index].title.join('')} ${SLIDES[index].body}`);
    fill.set(0);
    const waits = first || last;
    fill.set(withTiming(1, { duration: waits ? 600 : SLIDE_MS, easing: Easing.linear }));
    if (waits) return;
    const timer = setTimeout(() => setIndex((i) => Math.min(i + 1, SLIDES.length - 1)), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, first, last, fill]);

  const current = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.get() }] }));
  const slide = SLIDES[index];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.top}>
        <View style={styles.pips} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => (
            <View key={i} style={styles.pip}>
              {i < index ? <View style={[styles.pipFill, styles.full]} /> : null}
              {i === index ? <Animated.View style={[styles.pipFill, current]} /> : null}
            </View>
          ))}
        </View>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          accessibilityLabel="Skip intro"
          hitSlop={12}
          style={styles.skip}>
          <AppText variant="bodySmall" color={colors.inkMuted}>
            Skip
          </AppText>
        </Pressable>
      </View>

      <Pressable
        style={[styles.body, first && styles.welcomeBody]}
        accessibilityRole="button"
        accessibilityLabel={last ? 'Intro' : 'Next'}
        accessibilityHint={last ? undefined : 'Shows the next step'}
        onPress={(e) => {
          const goBack = e.nativeEvent.locationX < 120;
          if (goBack) setIndex((i) => Math.max(0, i - 1));
          else if (!last) setIndex((i) => i + 1);
        }}>
        <View
          style={[styles.scene, first && styles.heroArea]}
          onLayout={first ? onHeroLayout : undefined}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {first && heroH > 0 ? (
            <WelcomeScene photo={chairPhoto} width={heroH * HERO_RATIO} height={heroH} reduceMotion={reduceMotion} />
          ) : null}
          {index === 1 ? <LearnScene photos={photos} reduceMotion={reduceMotion} /> : null}
          {index === 2 ? <BuyScene photo={photos[0]} reduceMotion={reduceMotion} /> : null}
        </View>

        <Animated.View key={index} entering={reduceMotion ? undefined : FadeIn.duration(320)} style={styles.copy}>
          <AppText variant="hero" color={colors.ink} style={styles.center} accessibilityRole="header">
            {slide.title[0]}
            <AppText variant="hero" color={colors.accentText} style={styles.italic}>
              {slide.title[1]}
            </AppText>
          </AppText>
          <AppText
            variant="body"
            color={colors.inkMuted}
            style={[styles.center, styles.lede, first && styles.welcomeLede]}>
            {slide.body}
          </AppText>
        </Animated.View>
      </Pressable>

      <View style={styles.footer}>
        {first ? (
          <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(250).duration(400)}>
            <Button
              label="Start discovering"
              variant="keep"
              size="lg"
              style={styles.cta}
              accessibilityHint="Shows how CureAvo works"
              onPress={() => setIndex(1)}
            />
          </Animated.View>
        ) : last ? (
          <Animated.View entering={reduceMotion ? undefined : FadeIn.delay(200).duration(300)}>
            <Button label="Get started" size="lg" onPress={finish} />
          </Animated.View>
        ) : (
          <View style={styles.footerSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: 44 },
  pips: { flex: 1, flexDirection: 'row', gap: space.xs },
  pip: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.pip, overflow: 'hidden' },
  pipFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: colors.pipActive,
    transformOrigin: 'left',
  },
  full: { transform: [{ scaleX: 1 }] },
  skip: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', gap: space.xxl },
  scene: { alignItems: 'center' },
  welcomeBody: { gap: space.xl, paddingTop: space.md, paddingBottom: space.xl },
  heroArea: { flex: 1, minHeight: 0, justifyContent: 'center' },
  copy: { gap: space.md, alignItems: 'center' },
  center: { textAlign: 'center' },
  italic: { fontFamily: fonts.serifItalic },
  lede: { maxWidth: 320 },
  /** Narrower so the welcome line breaks into three even lines. */
  welcomeLede: { maxWidth: 300 },
  footer: { minHeight: 56, justifyContent: 'center' },
  cta: { minHeight: 56 },
  footerSpacer: { height: 56, borderRadius: radii.pill },
});
