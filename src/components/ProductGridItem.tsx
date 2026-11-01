import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/types';
import { formatPrice } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

interface ProductGridItemProps {
  product: Product;
  retailerName?: string;
  onPress: () => void;
  onRemove?: () => void;
  /** Screen reader label for the remove button. */
  removeLabel?: string;
  /** Selection mode: true/false shows a checkbox; undefined means not selecting. */
  selected?: boolean;
  /** Position in a 2-column grid, so an odd last item stays half width. */
  index: number;
}

export function ProductGridItem({
  product,
  retailerName,
  onPress,
  onRemove,
  removeLabel,
  selected,
  index,
}: ProductGridItemProps) {
  const price = formatPrice(product.priceCents, product.currency);
  return (
    <View style={[styles.item, index % 2 === 0 ? styles.left : styles.right]}>
      <View>
        <Pressable
          onPress={onPress}
          accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
          accessibilityState={selected === undefined ? undefined : { checked: selected }}
          accessibilityLabel={`${product.title}, ${price}${retailerName ? `, at ${retailerName}` : ''}`}
          accessibilityHint={selected === undefined ? 'Opens product details' : undefined}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <View>
            <ProductImage uri={product.imageUrls[0]} style={[styles.image, selected && styles.imageSelected]} />
            {selected !== undefined ? (
              <View style={[styles.check, selected && styles.checkOn]} pointerEvents="none">
                {selected ? <Icon name="check" size={16} color={colors.onInk} /> : null}
              </View>
            ) : null}
          </View>
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
        {onRemove && selected === undefined ? (
          <View style={styles.remove}>
            <IconButton icon="close" label={removeLabel ?? `Remove ${product.title} from kept`} onPress={onRemove} />
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
  imageSelected: { opacity: 0.75 },
  check: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.onInk,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.keep, borderColor: colors.keep },
  // Sits over the photo's top-right corner, whichever column the item is in.
  remove: { position: 'absolute', top: space.xs, right: space.xs },
});
