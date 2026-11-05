import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Product } from '@/domain/types';
import { formatPrice } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

interface PhotoTileProps {
  product: Product;
  retailerName?: string;
  height: number;
  onPress: () => void;
  /** Press and hold: opens the piece's menu (Add to list, Buy now, Remove). */
  onLongPress?: () => void;
  /** Selection mode: true/false shows a checkbox; undefined means not selecting. */
  selected?: boolean;
}

/** Mood-board tile: the photo with the price and name set over its lower edge. */
export function PhotoTile({ product, retailerName, height, onPress, onLongPress, selected }: PhotoTileProps) {
  const price = formatPrice(product.priceCents, product.currency);
  const selecting = selected !== undefined;
  return (
    <View style={{ height }}>
      <Pressable
        onPress={onPress}
        onLongPress={
          onLongPress && !selecting
            ? () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onLongPress();
              }
            : undefined
        }
        delayLongPress={350}
        accessibilityRole={selecting ? 'checkbox' : 'button'}
        accessibilityState={selecting ? { checked: selected } : undefined}
        accessibilityLabel={`${product.title}, ${price}${retailerName ? `, at ${retailerName}` : ''}`}
        accessibilityHint={selecting ? undefined : 'Opens product details'}
        accessibilityActions={onLongPress && !selecting ? [{ name: 'longpress', label: 'More options' }] : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') onLongPress?.();
        }}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
        <ProductImage
          uri={product.imageUrls[0]}
          style={StyleSheet.absoluteFill}
          fit="showcase"
          insets={{ top: space.sm, left: space.sm, right: space.sm, bottom: Math.round(height * 0.3) }}
        />
        <LinearGradient colors={[colors.scrimLight, colors.scrim]} style={styles.scrim} pointerEvents="none" />
        <View style={styles.text} pointerEvents="none">
          <AppText variant="heading" color={colors.onPhoto} style={styles.price}>
            {price}
          </AppText>
          <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {product.title}
          </AppText>
        </View>
        {selecting ? (
          <View style={[styles.check, selected && styles.checkOn]} pointerEvents="none">
            {selected ? <Icon name="check" size={16} color={colors.onInk} /> : null}
          </View>
        ) : null}
        {selected ? <View style={styles.selectedRing} pointerEvents="none" /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.placeholder },
  pressed: { opacity: 0.88 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  text: { position: 'absolute', left: space.md, right: space.md, bottom: space.md, gap: 2 },
  price: { lineHeight: 26 },
  check: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.onPhoto,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.keep, borderColor: colors.keep },
  selectedRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.keep,
  },
});
