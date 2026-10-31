import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/types';
import { formatPrice } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './Button';
import { ProductImage } from './ProductImage';

interface ProductGridItemProps {
  product: Product;
  retailerName?: string;
  onPress: () => void;
  onRemove?: () => void;
  /** Position in a 2-column grid, so an odd last item stays half width. */
  index: number;
}

export function ProductGridItem({ product, retailerName, onPress, onRemove, index }: ProductGridItemProps) {
  const price = formatPrice(product.priceCents, product.currency);
  return (
    <View style={[styles.item, index % 2 === 0 ? styles.left : styles.right]}>
      <View>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${product.title}, ${price}${retailerName ? `, at ${retailerName}` : ''}`}
          accessibilityHint="Opens product details"
          style={({ pressed }) => [pressed && styles.pressed]}>
          <ProductImage uri={product.imageUrls[0]} style={styles.image} />
          <View style={styles.text}>
            <AppText variant="label" style={styles.price}>
              {price}
            </AppText>
            <AppText variant="bodySmall" numberOfLines={1}>
              {product.title}
            </AppText>
            {retailerName ? (
              <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                {retailerName}
              </AppText>
            ) : null}
          </View>
        </Pressable>
        {onRemove ? (
          <View style={styles.remove}>
            <IconButton icon="close" label={`Remove ${product.title} from kept`} onPress={onRemove} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { width: '50%' },
  left: { paddingRight: space.md / 2 },
  right: { paddingLeft: space.md / 2 },
  pressed: { opacity: 0.85 },
  image: { aspectRatio: 0.8, borderRadius: radii.md },
  text: { paddingTop: space.sm, gap: 2 },
  price: { fontSize: 18 },
  // Sits over the photo's top-right corner, whichever column the item is in.
  remove: { position: 'absolute', top: space.xs, right: space.xs },
});
