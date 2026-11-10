import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * The CureAvo symbol, "the pick": two outlined cards with a butter card slid out and
 * tilted, like a right swipe caught mid-motion. Built from plain views so it stays
 * crisp at any size without an SVG library. Decorative: hide it from screen readers
 * where a text label sits beside it.
 */
export function BrandMark({ size = 20, ink = colors.ink }: { size?: number; ink?: string }) {
  const u = size / 100;
  const card = { width: 38 * u, height: 50 * u, borderRadius: 7 * u };
  const stroke = Math.max(1.25, 7 * u);
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={[styles.abs, card, { left: 14 * u, top: 30 * u, borderWidth: stroke, borderColor: ink }]} />
      <View
        style={[
          styles.abs,
          card,
          { left: 25 * u, top: 23 * u, borderWidth: stroke, borderColor: ink, backgroundColor: colors.background },
        ]}
      />
      <View
        style={[
          styles.abs,
          card,
          {
            left: 46 * u,
            top: 17 * u,
            backgroundColor: colors.keep,
            borderWidth: stroke * 0.75,
            borderColor: ink,
            transform: [{ rotate: '12deg' }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
