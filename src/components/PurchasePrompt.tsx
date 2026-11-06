import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';

/** Fades away on its own if ignored. */
const SHOW_MS = 15000;

/** "Welcome back. Did you buy it?" — a small pill at the top after a store visit. */
export function PurchasePrompt({
  title,
  storeName,
  onBought,
  onNotYet,
  onIgnore,
  reduceMotion,
}: {
  title: string;
  storeName: string;
  onBought: () => void;
  onNotYet: () => void;
  onIgnore: () => void;
  reduceMotion?: boolean;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const t = setTimeout(onIgnore, SHOW_MS);
    return () => clearTimeout(t);
  }, [onIgnore]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(220)}
      // Sits just above the bottom bar (Buy now / tabs) so it never covers Close or Back.
      style={[styles.wrap, { bottom: insets.bottom + 112 }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Back from ${storeName}. Did you buy ${title}?`}>
      <View style={styles.text}>
        <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
          Back from {storeName}
        </AppText>
        <AppText variant="label" numberOfLines={1}>
          Did you buy it?
        </AppText>
      </View>
      <Pressable
        onPress={onNotYet}
        accessibilityRole="button"
        accessibilityLabel="Not yet"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <AppText variant="label" color={colors.inkMuted}>
          Not yet
        </AppText>
      </Pressable>
      <Pressable
        onPress={onBought}
        accessibilityRole="button"
        accessibilityLabel="Bought it"
        style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
        <AppText variant="label" color={colors.onInk}>
          Bought it
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    boxShadow: `0 12px 32px ${colors.shadow}99`,
  },
  text: { flex: 1, minWidth: 0 },
  button: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radii.pill, justifyContent: 'center' },
  primary: { backgroundColor: colors.keep },
  pressed: { opacity: 0.8 },
});
