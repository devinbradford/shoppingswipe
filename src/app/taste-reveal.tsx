import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ROOMS } from '@/data/rooms';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { currentAnswers, roomReveal } from '@/recommendation/rooms';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/**
 * First launch, screen 3: what the room answers clearly agree on. Honest by design:
 * a trait is named only when at least two loved rooms show it, and the copy says
 * it's a first read that sharpens with real swipes.
 */
export default function TasteRevealScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const redo = useLocalSearchParams<{ redo?: string }>().redo === '1';
  const answers = usePreferencesStore((s) => s.roomAnswers);
  const clearRoomAnswers = usePreferencesStore((s) => s.clearRoomAnswers);
  const reveal = roomReveal(answers, ROOMS);
  const lovedRooms = currentAnswers(answers, ROOMS)
    .filter((a) => a.love)
    .map((a) => ROOMS.find((r) => r.id === a.roomId)!)
    .slice(0, 3);

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
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
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

        {lovedRooms.length ? (
          <View style={styles.rooms} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {lovedRooms.map((r, i) => (
              <View
                key={r.id}
                style={[
                  styles.room,
                  i === lovedRooms.length - 1 && styles.roomPicked,
                  { marginTop: i === lovedRooms.length - 1 ? 0 : 10 - i * 4 },
                ]}>
                <Image source={r.image} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.traits}>
          {reveal.likes.map((t, i) => (
            <Animated.View
              key={t.key}
              entering={reduceMotion ? undefined : FadeInDown.delay(150 + i * 140).duration(320)}
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
        </View>

        <AppText variant="body" color={colors.inkMuted}>
          {reveal.likes.length
            ? 'A first read, not a verdict. It sharpens with every piece you swipe.'
            : 'Your answers point in a few directions, which is fine. Your feed will work it out as you swipe real pieces.'}
        </AppText>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="Keep going" size="lg" onPress={next} style={styles.primary} />
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
      </View>
    </View>
  );
}

const ROOM_W = 98;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl },
  scroll: { gap: space.lg, paddingBottom: space.xl },
  headline: { fontSize: 44, lineHeight: 46 },
  italic: { fontFamily: fonts.serifItalic, fontSize: 44, lineHeight: 46 },
  rooms: { flexDirection: 'row', gap: space.sm + 2, paddingVertical: space.sm },
  room: {
    width: ROOM_W,
    height: 128,
    borderRadius: radii.md - 2,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
  },
  roomPicked: { borderWidth: 3, borderColor: colors.keep, transform: [{ rotate: '6deg' }] },
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
