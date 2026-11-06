import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface SwitcherOption {
  id: string;
  label: string;
  /** Small second line, e.g. "Week of Nov 2 · 6 left". */
  detail?: string;
  selected?: boolean;
  /** Something new here: shows a dot on the row and on the pill. */
  isNew?: boolean;
  icon?: IconName;
  onPress: () => void;
}

/**
 * The single control at the top of For you: "FOR YOU · ALL ROOMS ⌄". Tap for a small menu:
 * rooms first (pick one), then shortcuts (weekly 10, what we've learned). Nothing else sits
 * over the photo.
 */
export function DeckSwitcher({
  title,
  current,
  rooms,
  extras,
  top,
  reduceMotion,
}: {
  /** "FOR YOU". */
  title: string;
  /** "All rooms", "Bedroom"… */
  current: string;
  rooms: SwitcherOption[];
  extras: SwitcherOption[];
  /** Distance from the top of the screen to the pill. */
  top: number;
  reduceMotion?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const hasNew = extras.some((e) => e.isNew);
  const pick = (o: SwitcherOption) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(false);
    o.onPress();
  };

  return (
    <>
      <View style={[styles.anchor, { top }]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${title.toLowerCase()}, ${current}${hasNew ? ', something new inside' : ''}`}
          accessibilityHint="Choose a room, or open your weekly 10"
          hitSlop={8}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <AppText variant="eyebrow" color={colors.onPhoto}>
            {title}
          </AppText>
          <AppText variant="eyebrow" color={colors.accentText}>
            {`· ${current.toUpperCase()}`}
          </AppText>
          <Icon name="chevronDown" size={12} color={colors.onPhoto} />
          {hasNew ? <View style={styles.pillDot} /> : null}
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(140)}
          exiting={reduceMotion ? undefined : FadeOut.duration(120)}
          style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        </Animated.View>
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(180)}
          style={[styles.menu, { top: Math.max(top, insets.top) + 52 }]}
          accessibilityViewIsModal>
          {rooms.map((o) => (
            <Row key={o.id} option={o} onPress={() => pick(o)} radio />
          ))}
          {extras.length > 0 ? <View style={styles.divider} /> : null}
          {extras.map((o) => (
            <Row key={o.id} option={o} onPress={() => pick(o)} />
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}

function Row({ option, onPress, radio }: { option: SwitcherOption; onPress: () => void; radio?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityState={radio ? { checked: !!option.selected } : undefined}
      aria-checked={radio ? !!option.selected : undefined}
      accessibilityLabel={`${option.label}${option.detail ? `, ${option.detail}` : ''}${option.isNew ? ', new' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {option.icon ? <Icon name={option.icon} size={16} color={colors.keep} /> : null}
      <View style={styles.rowText}>
        <AppText variant="label" color={option.selected ? colors.accentText : colors.ink}>
          {option.label}
        </AppText>
        {option.detail ? (
          <AppText variant="caption" color={colors.inkMuted}>
            {option.detail}
          </AppText>
        ) : null}
      </View>
      {option.isNew ? <View style={styles.rowDot} /> : null}
      {option.selected ? <Icon name="check" size={16} color={colors.keep} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pressed: { opacity: 0.8 },
  pillDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.keep,
  },
  backdrop: { backgroundColor: colors.scrimMid },
  menu: {
    position: 'absolute',
    alignSelf: 'center',
    width: 290,
    paddingVertical: space.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0 18px 40px ${colors.shadow}99`,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: colors.keepSoft },
  rowText: { flex: 1, gap: 1 },
  rowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.keep },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xs },
});
