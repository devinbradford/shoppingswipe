import { Pressable, StyleSheet, View } from 'react-native';

import { pluralize } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

interface ListCardProps {
  name: string;
  count: number;
  coverUrl?: string;
  onPress: () => void;
}

/** Wishlist tile in the horizontal "Lists" row. */
export function ListCard({ name, count, coverUrl, onPress }: ListCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} list, ${pluralize(count, 'item')}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <ProductImage uri={coverUrl} style={styles.cover} />
      <View style={styles.text}>
        <AppText variant="label" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          {pluralize(count, 'item')}
        </AppText>
      </View>
    </Pressable>
  );
}

export function NewListCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New list"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.cover, styles.newCover]}>
        <AppText variant="title" color={colors.inkMuted}>
          +
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText variant="label">New list</AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          Group what you kept
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 132, gap: space.sm },
  pressed: { opacity: 0.85 },
  cover: { width: 132, height: 132, borderRadius: radii.md },
  newCover: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { gap: 2 },
});
