import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

export const LIST_CARD_WIDTH = 132;

/** A list as a board cover: a 2×2 collage of its first photos, then its name and count. */
export function ListCoverCard({
  name,
  count,
  photos,
  onPress,
}: {
  name: string;
  count: number;
  /** Up to four photo URLs, newest first. */
  photos: readonly (string | undefined)[];
  onPress: () => void;
}) {
  const cells = [0, 1, 2, 3].map((i) => photos[i]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} list, ${count} ${count === 1 ? 'piece' : 'pieces'}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.collage}>
        {cells.map((uri, i) => (
          <View key={i} style={styles.cell}>
            {uri ? <ProductImage uri={uri} style={StyleSheet.absoluteFill} fit="showcase" /> : null}
          </View>
        ))}
      </View>
      <AppText variant="label" numberOfLines={1}>
        {name}
      </AppText>
      <AppText variant="caption" color={colors.inkMuted}>
        {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'piece' : 'pieces'}`}
      </AppText>
    </Pressable>
  );
}

/** The "New list" card at the end of the row. */
export function NewListCard({ onPress, hint }: { onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New list"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.collage, styles.newCollage]}>
        <Icon name="plus" size={24} color={colors.keep} />
      </View>
      <AppText variant="label">New list</AppText>
      <AppText variant="caption" color={colors.inkMuted} numberOfLines={2}>
        {hint ?? 'Group by room or project'}
      </AppText>
    </Pressable>
  );
}

const GAP = 2;
const CELL = (LIST_CARD_WIDTH - GAP) / 2;

const styles = StyleSheet.create({
  card: { width: LIST_CARD_WIDTH, gap: 2 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  collage: {
    width: LIST_CARD_WIDTH,
    height: LIST_CARD_WIDTH,
    borderRadius: radii.md,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    backgroundColor: colors.background,
    marginBottom: space.sm,
  },
  cell: { width: CELL, height: CELL, backgroundColor: colors.surface, overflow: 'hidden' },
  newCollage: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
});
