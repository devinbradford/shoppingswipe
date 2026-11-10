import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { RoomSwipeCard, type RoomSwipeApi } from '@/components/RoomSwipeCard';
import { ROOMS, ROOMS_BEFORE_SKIP } from '@/data/rooms';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { currentAnswers, lovedStyles, traitLabel } from '@/recommendation/rooms';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, hitTarget, radii, space } from '@/theme/tokens';

/**
 * First launch, screen 2: "Could you see yourself here?" Eight rooms, Love it or
 * Not for me. Answers are saved as they happen, so leaving and coming back resumes.
 * With `?redo=1` (Profile) it starts fresh and returns to Profile at the end.
 */
export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const redo = useLocalSearchParams<{ redo?: string }>().redo === '1';
  const answers = usePreferencesStore((s) => s.roomAnswers);
  const answerRoom = usePreferencesStore((s) => s.answerRoom);
  const undoRoomAnswer = usePreferencesStore((s) => s.undoRoomAnswer);
  const setStylePicks = usePreferencesStore((s) => s.setStylePicks);
  const api = useRef<RoomSwipeApi | null>(null);
  const [lastStyle, setLastStyle] = useState<{ label: string; n: number } | null>(null);
  const [enterFrom, setEnterFrom] = useState<-1 | 0 | 1>(0);

  const current = currentAnswers(answers, ROOMS);
  const answered = new Set(current.map((a) => a.roomId));
  const index = ROOMS.findIndex((r) => !answered.has(r.id));
  const room = index >= 0 ? ROOMS[index] : null;
  const done = current.length;

  const finish = (all = current) => {
    setStylePicks(lovedStyles(all, ROOMS));
    router.replace({ pathname: '/taste-reveal', params: redo ? { redo: '1' } : {} });
  };

  const answer = (love: boolean) => {
    if (!room) return;
    const a = { roomId: room.id, version: room.version, love, at: Date.now() };
    answerRoom(a);
    setEnterFrom(0);
    const label = traitLabel(`style:${room.style}`);
    setLastStyle({ label, n: done + 1 });
    AccessibilityInfo.announceForAccessibility(`${love ? 'Loved' : 'Passed on'} ${label}`);
    if (done + 1 >= ROOMS.length) finish([...current, a]);
  };

  const undo = () => {
    const last = current.at(-1);
    if (!last) return;
    undoRoomAnswer();
    setLastStyle(null);
    setEnterFrom(last.love ? 1 : -1);
  };

  const skip = () => {
    if (done >= ROOMS_BEFORE_SKIP) return finish();
    // Too few answers for an honest reveal: straight to the shopping question.
    setStylePicks(lovedStyles(current, ROOMS));
    router.replace(redo ? '/profile' : '/setup/room');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.top}>
        <View
          style={styles.ticks}
          accessible
          accessibilityLabel={`Room ${Math.min(done + 1, ROOMS.length)} of ${ROOMS.length}`}>
          {ROOMS.map((r, i) => (
            <View key={r.id} style={[styles.tick, i < done && styles.tickDone, i === done && styles.tickNow]} />
          ))}
        </View>
        {done >= ROOMS_BEFORE_SKIP ? (
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip the rest"
            hitSlop={12}
            style={styles.skip}>
            <AppText variant="bodySmall" color={colors.onPhoto} style={styles.underline}>
              Skip
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.skip} />
        )}
      </View>

      <AppText variant="title" color={colors.onPhoto} accessibilityRole="header" style={styles.question}>
        Could you see yourself here?
      </AppText>

      <View style={styles.stage}>
        {room ? (
          <RoomSwipeCard
            key={`${room.id}-${done}`}
            image={room.image}
            alt={room.alt}
            onAnswer={answer}
            registerApi={(a) => (api.current = a)}
            reduceMotion={reduceMotion}
            enterFrom={enterFrom}
          />
        ) : null}
      </View>

      <View style={styles.caption}>
        {lastStyle ? (
          <Animated.View
            key={lastStyle.n}
            entering={reduceMotion ? undefined : FadeIn.duration(180)}
            exiting={reduceMotion ? undefined : FadeOut.duration(400)}>
            <AppText variant="italic" color={colors.onPhotoMuted}>
              That was {lastStyle.label.toLowerCase()}
            </AppText>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => api.current?.flyOut(false)}
          disabled={!room}
          accessibilityRole="button"
          accessibilityLabel="Not for me"
          style={({ pressed }) => [styles.pill, styles.pass, pressed && styles.pressed]}>
          <AppText variant="label" color={colors.onPhoto}>
            Not for me
          </AppText>
        </Pressable>
        <Pressable
          onPress={undo}
          disabled={done === 0}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          accessibilityState={{ disabled: done === 0 }}
          style={({ pressed }) => [styles.undo, done === 0 && styles.disabled, pressed && styles.pressed]}>
          <Icon name="undo" size={20} color={colors.onPhoto} />
        </Pressable>
        <Pressable
          onPress={() => api.current?.flyOut(true)}
          disabled={!room}
          accessibilityRole="button"
          accessibilityLabel="Love it"
          style={({ pressed }) => [styles.pill, styles.love, pressed && styles.pressed]}>
          <AppText variant="label" color={colors.onInk}>
            Love it
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.stage, paddingHorizontal: space.xl },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: hitTarget },
  ticks: { flex: 1, flexDirection: 'row', gap: space.xs },
  tick: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.glassBorder },
  tickDone: { backgroundColor: colors.onPhoto },
  tickNow: { backgroundColor: colors.keep },
  skip: { minWidth: hitTarget, minHeight: hitTarget, alignItems: 'flex-end', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  question: { marginTop: space.xs, marginBottom: space.lg },
  stage: { flex: 1, minHeight: 0 },
  caption: { height: 36, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  pill: {
    minHeight: 56,
    paddingHorizontal: space.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pass: { borderWidth: 1.5, borderColor: colors.onPhoto },
  love: { backgroundColor: colors.keep },
  undo: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
