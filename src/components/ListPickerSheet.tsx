import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { pluralize } from '@/lib/format';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, hitTarget, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { NameForm } from './NameSheet';
import { Sheet } from './Sheet';

interface ListPickerSheetProps {
  visible: boolean;
  title: string;
  /** Lists to show as already containing the item(s). */
  checkedIds?: ReadonlySet<string>;
  onPick: (listId: string) => void;
  onClose: () => void;
}

/** Choose a wishlist, or create a new one on the spot. */
export function ListPickerSheet({ visible, title, checkedIds, onPick, onClose }: ListPickerSheetProps) {
  const lists = useWishlistStore((s) => s.lists);
  const create = useWishlistStore((s) => s.create);
  const [naming, setNaming] = useState(false);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setNaming(false);
        onClose();
      }}
      title={naming ? 'New list' : title}>
      {naming ? (
        <NameForm
          submitLabel="Create list"
          onClose={() => setNaming(false)}
          onSubmit={(name) => {
            const r = create(name);
            if (!r.ok) return r.error;
            onPick(r.id);
            setNaming(false);
            onClose();
            return null;
          }}
        />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.rows}>
          <Pressable
            onPress={() => setNaming(true)}
            accessibilityRole="button"
            accessibilityLabel="New list"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={[styles.badge, styles.badgeNew]}>
              <AppText variant="heading" color={colors.onInk}>
                +
              </AppText>
            </View>
            <AppText variant="label">New list</AppText>
          </Pressable>
          {lists.map((l) => {
            const checked = checkedIds?.has(l.id) ?? false;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  onPick(l.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${l.name}, ${pluralize(l.items.length, 'item')}${checked ? ', already added' : ''}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.badge}>
                  <AppText variant="label">{l.name.charAt(0).toUpperCase()}</AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="label" numberOfLines={1}>
                    {l.name}
                  </AppText>
                  <AppText variant="caption" color={colors.inkMuted}>
                    {pluralize(l.items.length, 'item')}
                  </AppText>
                </View>
                {checked ? <Icon name="check" size={18} color={colors.keep} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  rows: { gap: space.xs, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hitTarget + 8,
    paddingHorizontal: space.sm,
    borderRadius: radii.md,
  },
  pressed: { backgroundColor: colors.surface },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNew: { backgroundColor: colors.ink, borderColor: colors.ink },
  flex: { flex: 1 },
});
