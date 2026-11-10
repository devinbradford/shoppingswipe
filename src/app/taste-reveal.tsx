import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ROOMS } from '@/data/rooms';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { currentAnswers, roomReveal } from '@/recommendation/rooms';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/** How the settle runs after the last room (ms): gather, then the light comes up, then the words. */
const GATHER_MS = 300;
const LAND_MS = 380;
const WORDS_AT = GATHER_MS + LAND_MS;
/** Where each loved room sits in the stack while it gathers (logo-like fan). */
const STACK = [
  { dx: -18, dy: 8, rotate: -8 },
  { dx: 0, dy: 4, rotate: 3 },
  { dx: 18, dy: 0, rotate: 10 },
];

/**
 * First launch, screen 4: what the room answers clearly agree on. Honest by design:
 * a trait is named only when at least two loved rooms show it, and the copy says
 * it's a first read that sharpens with real swipes.
 *
 * Arriving from the last room (`?settle=1`) it "settles": the screen starts on the
 * dark room stage with the loved rooms gathered in the middle, the light comes up,
 * the rooms slide into their places, then the words appear. Under a second; a tap
 * skips to the end; reduce motion skips it.
 */
export default function TasteRevealScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ redo?: string; settle?: string }>();
  const redo = params.redo === '1';
  const settling = params.settle === '1' && !reduceMotion;
  const { width, height } = useWindowDimensions();
  const gather = useSharedValue(settling ? 0 : 1);
  const land = useSharedValue(settling ? 0 : 1);
  const words = useSharedValue(settling ? 0 : 1);
  const rowRef = useRef<React.ComponentRef<typeof View>>(null);
  const [rowAt, setRowAt] = useState<{ x: number; y: number } | null>(null);
  const [done, setDone] = useState(!settling);
  const answers = usePreferencesStore((s) => s.roomAnswers);
  const clearRoomAnswers = usePreferencesStore((s) => s.clearRoomAnswers);
  const reveal = roomReveal(answers, ROOMS);
  const lovedRooms = currentAnswers(answers, ROOMS)
    .filter((a) => a.love)
    .map((a) => ROOMS.find((r) => r.id === a.roomId)!)
    .slice(0, 3);

  // Start once the row's place on screen is known (or straight away with nothing to gather).
  useEffect(() => {
    if (!settling || (lovedRooms.length > 0 && !rowAt)) return;
    gather.set(withTiming(1, { duration: GATHER_MS, easing: Easing.out(Easing.cubic) }));
    land.set(withDelay(GATHER_MS, withTiming(1, { duration: LAND_MS, easing: Easing.inOut(Easing.cubic) })));
    words.set(withDelay(WORDS_AT, withTiming(1, { duration: 260 })));
    const t = setTimeout(() => setDone(true), WORDS_AT + 260);
    return () => clearTimeout(t);
    // Runs once per arrival; the room list doesn't change on this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settling, rowAt]);

  const skip = () => {
    for (const v of [gather, land, words]) {
      cancelAnimation(v);
      v.set(1);
    }
    setDone(true);
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - land.get() }));
  const wordsStyle = useAnimatedStyle(() => ({ opacity: words.get() }));

  const next = () => (redo ? router.replace('/profile') : router.replace('/setup/room'));
  const again = () => {
    clearRoomAnswers();
    router.replace({ pathname: '/rooms', params: redo ? { redo: '1' } : {} });
  };

  const headline =
    reveal.loved === 0
      ? 'Knowing what you don’t want helps too.'
      : reveal.likes.length
        ? 'Your taste is '
        : 'A mix of things you love.';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
      {settling ? <Animated.View style={[styles.backdrop, backdrop]} pointerEvents="none" /> : null}
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Animated.View style={[styles.copy, wordsStyle]}>
          <AppText variant="eyebrow" color={colors.accentText}>
            {`YOUR TASTE · FROM ${reveal.answered} ROOMS`}
          </AppText>
          <AppText variant="hero" accessibilityRole="header" style={styles.headline}>
            {headline}
            {reveal.loved > 0 && reveal.likes.length ? (
              <AppText variant="hero" style={styles.italic}>
                taking shape.
              </AppText>
            ) : null}
          </AppText>
        </Animated.View>

        {lovedRooms.length ? (
          <View
            ref={rowRef}
            onLayout={() => rowRef.current?.measureInWindow((x, y) => setRowAt({ x, y }))}
            style={styles.rooms}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            {lovedRooms.map((r, i) => {
              const last = i === lovedRooms.length - 1;
              const top = last ? 0 : 10 - i * 4;
              // From its place in the row to its place in the stack at the middle of the screen.
              const stack = STACK[last ? 2 : Math.min(i, 1)];
              const from = rowAt
                ? {
                    dx: width / 2 + stack.dx - (rowAt.x + i * (ROOM_W + ROOM_GAP) + ROOM_W / 2),
                    dy: height * 0.45 + stack.dy - (rowAt.y + space.sm + top + ROOM_H / 2),
                  }
                : { dx: 0, dy: 0 };
              return (
                <SettleRoom
                  key={r.id}
                  image={r.image}
                  picked={last}
                  marginTop={top}
                  from={from}
                  stackRotate={stack.rotate}
                  gather={gather}
                  land={land}
                  delay={i * 40}
                />
              );
            })}
          </View>
        ) : null}

        <Animated.View style={[styles.traits, wordsStyle]}>
          {reveal.likes.map((t, i) => (
            <Animated.View
              key={t.key}
              entering={
                reduceMotion ? undefined : FadeInDown.delay((settling ? WORDS_AT : 0) + 150 + i * 140).duration(320)
              }
              style={styles.trait}>
              <View style={styles.dot} />
              <View style={styles.traitText}>
                <AppText variant="title" style={styles.traitName}>
                  {t.label}
                </AppText>
                <AppText variant="bodySmall" color={colors.inkMuted}>
                  {t.reason}
                </AppText>
              </View>
            </Animated.View>
          ))}
          {reveal.dislike ? (
            <View style={styles.trait}>
              <View style={[styles.dot, styles.dotOff]} />
              <View style={styles.traitText}>
                <AppText variant="label">Less your thing: {reveal.dislike.label.toLowerCase()}</AppText>
                <AppText variant="bodySmall" color={colors.inkMuted}>
                  {reveal.dislike.reason}
                </AppText>
              </View>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View style={wordsStyle}>
          <AppText variant="body" color={colors.inkMuted}>
            {reveal.likes.length
              ? 'A first read, not a verdict. It sharpens with every piece you swipe.'
              : 'Your answers point in a few directions, which is fine. Your feed will work it out as you swipe real pieces.'}
          </AppText>
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.actions, wordsStyle]}>
        <Button label={redo ? 'Done' : 'Find my furniture'} size="lg" onPress={next} style={styles.primary} />
        <Pressable
          onPress={again}
          accessibilityRole="button"
          accessibilityLabel="Redo the rooms"
          hitSlop={12}
          style={styles.redo}>
          <AppText variant="label" style={styles.underline}>
            Redo
          </AppText>
        </Pressable>
      </Animated.View>

      {!done ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Show your taste now"
        />
      ) : null}
    </View>
  );
}

interface SettleRoomProps {
  image: number;
  picked: boolean;
  marginTop: number;
  /** Offset from its place in the row to its place in the gathered stack. */
  from: { dx: number; dy: number };
  stackRotate: number;
  gather: SharedValue<number>;
  land: SharedValue<number>;
  delay: number;
}

/** One loved room: appears small in the stack, then slides and straightens into its place in the row. */
function SettleRoom({ image, picked, marginTop, from, stackRotate, gather, land, delay }: SettleRoomProps) {
  const style = useAnimatedStyle(() => {
    const g = Math.max(0, Math.min(1, (gather.get() * (GATHER_MS + delay) - delay) / GATHER_MS));
    const l = land.get();
    const finalRotate = picked ? 6 : 0;
    return {
      opacity: g,
      transform: [
        { translateX: from.dx * (1 - l) },
        { translateY: from.dy * (1 - l) },
        { scale: 0.6 + 0.4 * g },
        { rotate: `${stackRotate + (finalRotate - stackRotate) * l}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.room, picked && styles.roomPickedBorder, { marginTop }, style]}>
      <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

const ROOM_W = 98;
const ROOM_H = 128;
const ROOM_GAP = space.sm + 2;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl },
  scroll: { gap: space.lg, paddingBottom: space.xl },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.stage },
  copy: { gap: space.lg },
  headline: { fontSize: 44, lineHeight: 46 },
  italic: { fontFamily: fonts.serifItalic, fontSize: 44, lineHeight: 46 },
  rooms: { flexDirection: 'row', gap: ROOM_GAP, paddingVertical: space.sm },
  room: {
    width: ROOM_W,
    height: ROOM_H,
    borderRadius: radii.md - 2,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
  },
  roomPickedBorder: { borderWidth: 3, borderColor: colors.keep },
  traits: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  trait: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: {
    width: 10,
    height: 10,
    marginTop: 10,
    borderRadius: 5,
    backgroundColor: colors.keep,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
  },
  dotOff: { backgroundColor: colors.skipSoft, borderColor: colors.border },
  traitText: { flex: 1, gap: 2 },
  traitName: { fontSize: 26, lineHeight: 30 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md },
  primary: { flex: 1 },
  redo: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.xs },
  underline: { textDecorationLine: 'underline' },
});
