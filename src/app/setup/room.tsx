import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GlassIconButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { RoomDrawing } from '@/components/RoomDrawing';
import type { RoomChoice } from '@/domain/budget';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

const ROOMS: { id: RoomChoice; label: string; detail: string; tint: string }[] = [
  { id: 'living-room', label: 'Living room', detail: 'Sofas, chairs, rugs', tint: colors.paperOat },
  { id: 'bedroom', label: 'Bedroom', detail: 'Beds, nightstands, dressers', tint: colors.paperSage },
  { id: 'kitchen-dining', label: 'Kitchen & dining', detail: 'Tables, chairs, stools', tint: colors.paperClay },
  { id: 'browsing', label: 'Just browsing', detail: 'A bit of everything', tint: colors.paperStone },
];

const GAP = space.md;
/** The quick press when a card is chosen (ms, down and back). */
const PRESS_MS = 90;
/** Room for the button under the cards, kept even before it appears so nothing jumps. */
const SLOT_H = 56;

/**
 * Onboarding, last question: "What are you shopping for right now?" Four drawn cards;
 * tap one to choose it (gold outline + check), then "Start discovering" opens For you
 * on that room. With `?edit=1` (from Profile) it saves the choice and goes back.
 */
export default function RoomScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const editing = useLocalSearchParams<{ edit?: string }>().edit === '1';
  const current = usePreferencesStore((s) => s.room);
  const setRoom = usePreferencesStore((s) => s.setRoom);
  const [choice, setChoice] = useState<RoomChoice | null>(editing ? current : null);
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  const [headerEnd, setHeaderEnd] = useState(0);
  const tile = Math.max(120, Math.floor((screen.width - 2 * space.xl - GAP) / 2));
  // Cards are tall (1.4×) where there's room and shorter on smaller phones. The button
  // row is pinned below them, so it's always on screen; the tiniest phones scroll the cards.
  const footerH = space.md + SLOT_H + insets.bottom + space.lg;
  const room = screen.height - footerH - headerEnd - 2 * space.lg - GAP;
  const cardH = Math.round(Math.max(tile * 1.05, Math.min(tile * 1.4, room / 2)));
  const showBack = editing || router.canGoBack();

  const pick = (room: RoomChoice) => {
    Haptics.selectionAsync().catch(() => {});
    setChoice(room);
  };

  const finish = (room: RoomChoice | null) => {
    setRoom(room);
    if (editing) router.back();
    // Budget is asked later, once they've seen real prices (Profile → Budget).
    else router.replace('/');
  };

  return (
    <View style={styles.screen} onLayout={(e) => setScreen(e.nativeEvent.layout)}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.md, paddingBottom: space.lg }]}
        bounces={false}>
        {showBack || !editing ? (
          <View style={styles.top}>
            {showBack ? <GlassIconButton icon="back" label="Back" onPress={() => router.back()} /> : <View />}
            {editing ? null : (
              <Pressable
                onPress={() => finish(null)}
                accessibilityRole="button"
                accessibilityLabel="Skip"
                hitSlop={12}
                style={styles.skip}>
                <AppText variant="bodySmall" color={colors.inkMuted} style={styles.underline}>
                  Skip
                </AppText>
              </Pressable>
            )}
          </View>
        ) : null}

        <View
          style={styles.header}
          onLayout={(e) => setHeaderEnd(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            {editing ? 'SHOPPING FOR' : 'LAST QUESTION'}
          </AppText>
          <AppText variant="hero" accessibilityRole="header">
            What are you shopping for{' '}
            <AppText variant="hero" color={colors.accentText} style={styles.italic}>
              right now?
            </AppText>
          </AppText>
          <AppText variant="body" color={colors.inkMuted}>
            {editing
              ? 'For you starts on this room. You can switch rooms any time.'
              : 'We’ll start with what you’re looking for. You can always explore everything else.'}
          </AppText>
        </View>

        <View style={styles.grid}>
          {ROOMS.map((r) => (
            <RoomCard
              key={r.id}
              label={r.label}
              detail={r.detail}
              kind={r.id}
              tint={r.tint}
              width={tile}
              height={cardH}
              selected={choice === r.id}
              reduceMotion={reduceMotion}
              onPress={() => pick(r.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.slot}>
          {choice ? (
            <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(200)} style={styles.cta}>
              <Button label={editing ? 'Done' : 'Start discovering'} size="lg" onPress={() => finish(choice)} />
            </Animated.View>
          ) : (
            <AppText variant="bodySmall" color={colors.inkMuted}>
              Pick one to begin
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

interface RoomCardProps {
  label: string;
  detail: string;
  kind: RoomChoice;
  tint: string;
  width: number;
  height: number;
  selected: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}

/** One choice: the whole card is the tap target; a quick press, then the gold outline and check. */
function RoomCard({ label, detail, kind, tint, width, height, selected, reduceMotion, onPress }: RoomCardProps) {
  const scale = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Animated.View style={press}>
      <Pressable
        onPress={() => {
          if (!reduceMotion)
            scale.set(withSequence(withTiming(0.97, { duration: PRESS_MS }), withTiming(1, { duration: PRESS_MS })));
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${detail}`}
        accessibilityState={{ selected }}
        style={[styles.card, { width, height, backgroundColor: tint }, selected && styles.selected]}>
        <View style={styles.art} pointerEvents="none">
          <RoomDrawing kind={kind} width={drawingWidth(width, height)} />
        </View>
        <View pointerEvents="none">
          <AppText variant="label">{label}</AppText>
          <AppText variant="caption" color={colors.inkMuted}>
            {detail}
          </AppText>
        </View>
        {selected ? (
          <View style={styles.check} pointerEvents="none">
            <Icon name="check" size={14} color={colors.onInk} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** As wide as the card allows, but leaving room for the two lines of text underneath. */
const drawingWidth = (w: number, h: number) =>
  Math.min(w - 2 * space.md - 6, ((h - 2 * space.md - 6 - LABEL_H) * 128) / 100);
/** Height of the name and detail lines under each drawing (detail can wrap to two). */
const LABEL_H = 56;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: space.xl, gap: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  skip: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  header: { gap: space.md },
  italic: { fontFamily: fonts.serifItalic },
  grid: { marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: {
    borderRadius: radii.lg,
    padding: space.md,
    justifyContent: 'space-between',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.keep },
  art: { alignItems: 'center', paddingTop: space.xs },
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.keep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md },
  slot: { height: SLOT_H, alignItems: 'center', justifyContent: 'center' },
  cta: { alignSelf: 'stretch' },
});
