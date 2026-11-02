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
  /** Fixed width for tiles in a horizontal row. */
  width?: number;
}

/** Product-type tile on Discover (Sofas, Nightstands…): the whole product, its name and what's left. */
export function CategoryTile({ label, remaining, coverUrl, onPress, width = 150 }: CategoryTileProps) {
  const countText = remaining === 0 ? 'All seen' : `${remaining} left`;
  const height = Math.round(width * 1.3);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${countText}`}
      accessibilityHint="Opens the swipe deck"
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.pressed]}>
      <ProductImage
        uri={coverUrl}
        style={StyleSheet.absoluteFill}
        fit="showcase"
        insets={{ top: space.md, left: space.md, right: space.md, bottom: 62 }}
      />
      <LinearGradient colors={[colors.scrimLight, colors.scrim]} style={styles.scrim} pointerEvents="none" />
      <View style={styles.text} pointerEvents="none">
        <AppText variant="heading" color={colors.onPhoto} numberOfLines={1}>
          {label}
        </AppText>
        <AppText variant="eyebrow" color={colors.inkMuted}>
          {countText.toUpperCase()}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.placeholder },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  text: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, gap: space.xs },
});
