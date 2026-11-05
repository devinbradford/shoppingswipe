import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/types';
import { formatPrice } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { ProductImage } from './ProductImage';

const CARD_W = 148;

/** "More like this": a sideways row of small product cards. */
export function SimilarRow({
  products,
  onOpen,
  gutter,
}: {
  products: readonly Product[];
  onOpen: (product: Product) => void;
  /** Left/right padding so the row lines up with the page. */
  gutter: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: gutter }]}
      accessibilityLabel="More like this">
      {products.map((p) => {
        const price = formatPrice(p.priceCents, p.currency);
        return (
          <Pressable
            key={p.id}
            onPress={() => onOpen(p)}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}, ${price}`}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.photo}>
              <ProductImage uri={p.imageUrls[0]} style={StyleSheet.absoluteFill} fit="showcase" />
            </View>
            <AppText variant="heading" numberOfLines={1}>
              {price}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted} numberOfLines={2}>
              {p.title}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.md },
  card: { width: CARD_W, gap: space.xs },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  photo: {
    width: CARD_W,
    height: Math.round(CARD_W * 1.2),
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    marginBottom: space.xs,
  },
});
