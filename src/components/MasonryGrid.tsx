import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { space } from '@/theme/tokens';

/** Height-to-width ratios repeated down the board so tiles vary like a mood board. */
const RATIOS = [1.36, 1.0, 1.12, 1.0, 1.36, 1.12];

interface MasonryGridProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, height: number) => ReactNode;
  /** Horizontal padding of the screen around the grid. */
  gutter?: number;
  gap?: number;
}

/** Two columns of tiles with varying heights, filled left-right in order. */
export function MasonryGrid<T>({ items, keyOf, renderItem, gutter = space.xl, gap = space.md }: MasonryGridProps<T>) {
  const { width } = useWindowDimensions();
  const colWidth = (width - gutter * 2 - gap) / 2;
  const columns: { item: T; height: number }[][] = [[], []];
  const heights = [0, 0];
  items.forEach((item, i) => {
    const h = Math.round(colWidth * RATIOS[i % RATIOS.length]);
    // Put each tile in the shorter column so the bottoms stay roughly even.
    const col = heights[0] <= heights[1] ? 0 : 1;
    columns[col].push({ item, height: h });
    heights[col] += h + gap;
  });
  return (
    <View style={[styles.row, { gap, paddingHorizontal: gutter }]}>
      {columns.map((col, c) => (
        <View key={c} style={[styles.col, { gap }]}>
          {col.map(({ item, height }) => (
            <View key={keyOf(item)}>{renderItem(item, height)}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0 },
});
