import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { unavailablePrice, type UnavailableItem } from '@/domain/availability';
import { formatPrice } from '@/lib/format';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface UnavailableSectionProps {
  items: readonly UnavailableItem[];
  /** Store names by retailer id (the snapshot's own name is the fallback). */
  retailerNames: ReadonlyMap<string, string>;
  boughtIds: ReadonlySet<string>;
  /** Name shown when the app never kept a copy of the product, e.g. "A piece you kept". */
  fallbackTitle: string;
  /** What Remove takes it out of, for the button's spoken label: "Kept", "this list". */
  removeFrom: string;
  onRemove: (item: UnavailableItem) => void;
}

/**
 * Saved pieces the catalog no longer returns (P1-2), below the board: last-seen photo, name,
 * store and an honestly labelled price, plus Remove. No Buy now and no product page: there is
 * nothing verified to buy.
 */
export function UnavailableSection({
  items,
  retailerNames,
  boughtIds,
  fallbackTitle,
  removeFrom,
  onRemove,
}: UnavailableSectionProps) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" color={colors.inkMuted} accessibilityRole="header">
        UNAVAILABLE ON CUREAVO
      </AppText>
      <AppText variant="caption" color={colors.inkMuted}>
        These aren&apos;t in our catalog right now, so they can&apos;t be bought here. They stay until you remove them.
      </AppText>
      {items.map((item) => (
        <UnavailableRow
          key={item.productId}
          item={item}
          storeName={
            item.snapshot ? (retailerNames.get(item.snapshot.retailerId) ?? item.snapshot.retailerName) : undefined
          }
          bought={boughtIds.has(item.productId)}
          fallbackTitle={fallbackTitle}
          removeFrom={removeFrom}
          onRemove={() => onRemove(item)}
        />
      ))}
    </View>
  );
}

function UnavailableRow({
  item,
  storeName,
  bought,
  fallbackTitle,
  removeFrom,
  onRemove,
}: {
  item: UnavailableItem;
  storeName?: string;
  bought: boolean;
  fallbackTitle: string;
  removeFrom: string;
  onRemove: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const title = item.snapshot?.title ?? fallbackTitle;
  const price = unavailablePrice(item, formatPrice);
  const details = [price, storeName, bought ? 'Bought' : null].filter((d): d is string => !!d);
  const photo = item.snapshot?.imageUrl;
  return (
    <View style={styles.row}>
      <View
        style={styles.info}
        accessible
        accessibilityLabel={[title, 'unavailable on CureAvo', ...details].join(', ')}>
        <View style={styles.thumb}>
          {photo && !photoFailed ? (
            <Image
              source={{ uri: photo }}
              style={styles.photo}
              contentFit="contain"
              onError={() => setPhotoFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Icon name="photos" size={22} color={colors.inkSubtle} />
          )}
        </View>
        <View style={styles.text}>
          <AppText variant="bodySmall" numberOfLines={2}>
            {title}
          </AppText>
          {details.length ? (
            <AppText variant="caption" color={colors.inkMuted}>
              {details.join(' · ')}
            </AppText>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title} from ${removeFrom}`}
        hitSlop={8}
        style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
        <AppText variant="caption" color={colors.danger}>
          Remove
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md, paddingHorizontal: space.xl, paddingTop: space.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%', opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  remove: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
