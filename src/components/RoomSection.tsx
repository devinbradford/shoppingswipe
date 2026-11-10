import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CategorySummary, SubcategoryId } from '@/domain/types';
import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { CategoryTile } from './CategoryTile';

interface RoomSectionProps {
  room: CategorySummary;
  /** Swipe one product type, e.g. just sofas. */
  onOpenType: (id: SubcategoryId) => void;
  /** Swipe everything in the room. */
  onOpenRoom: () => void;
  /** The screen's side padding, so the row can scroll edge to edge. */
  gutter: number;
}

/** A room on Discover: its name, a "Swipe all" link and a row of product types. */
export function RoomSection({ room, onOpenType, onOpenRoom, gutter }: RoomSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <AppText variant="title" accessibilityRole="header">
            {room.label}
          </AppText>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            {room.remainingCount === 0 ? 'ALL SEEN' : `${room.remainingCount} LEFT`}
          </AppText>
        </View>
        <Pressable
          onPress={onOpenRoom}
          accessibilityRole="button"
          accessibilityLabel={`Swipe all ${room.label.toLowerCase()}`}
          hitSlop={8}
          style={({ pressed }) => [styles.all, pressed && styles.pressed]}>
          <AppText variant="bodySmall" color={colors.accent}>
            Swipe all
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.row, { marginHorizontal: -gutter }]}
        contentContainerStyle={[styles.rowContent, { paddingHorizontal: gutter }]}>
        {room.subcategories.map((s) => (
          <CategoryTile
            key={s.id}
            label={s.label}
            remaining={s.remainingCount}
            coverUrl={s.coverUrl}
            onPress={() => onOpenType(s.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  titles: { gap: space.xs, flexShrink: 1 },
  all: { minHeight: 44, justifyContent: 'center', paddingLeft: space.md },
  pressed: { opacity: 0.7 },
  row: { flexGrow: 0 },
  rowContent: { gap: space.md },
});
