import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

interface CategoryTileProps {
  label: string;
  remaining: number;
  coverUrl?: string;
  onPress: () => void;
}

export function CategoryTile({ label, remaining, coverUrl, onPress }: CategoryTileProps) {
  const countText = remaining === 0 ? 'All seen' : `${remaining} left`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${countText}`}
      accessibilityHint="Opens the swipe deck"
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <ProductImage uri={coverUrl} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[colors.scrimLight, colors.scrim]} style={styles.scrim} />
      <View style={styles.text}>
        <AppText variant="heading" color={colors.onInk}>
          {label}
        </AppText>
        <AppText variant="caption" color={colors.onInk} style={styles.count}>
          {countText}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 0.82,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  text: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.xxs },
  count: { opacity: 0.85 },
});
