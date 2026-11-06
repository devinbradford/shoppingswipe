import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** "Your weekly 10" as a cover tile (top of Discover). A dot shows it hasn't been opened this week. */
export function WeeklyTile({ subtitle, isNew, onPress }: { subtitle: string; isNew?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Your weekly 10. ${subtitle}${isNew ? '. New' : ''}`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Icon name="sparkles" size={20} color={colors.onInk} />
      </View>
      <View style={styles.text}>
        <AppText variant="heading">Your weekly 10</AppText>
        <AppText variant="caption" color={colors.accentText}>
          {subtitle}
        </AppText>
      </View>
      {isNew ? <View style={styles.dot} /> : null}
      <Icon name="chevronRight" size={16} color={colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentGlass,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.keep,
  },
  text: { flex: 1, gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.keep },
});
