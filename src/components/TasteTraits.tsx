import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function adjustedLabel(adjusted: 'more' | 'less' | null) {
  return adjusted === 'more' ? 'You asked for more' : adjusted === 'less' ? 'You asked for less' : null;
}

/** A material, colour or disliked trait. Tap to adjust. */
export function TraitChip({
  label,
  adjusted,
  tone = 'like',
  onPress,
}: {
  label: string;
  adjusted: 'more' | 'less' | null;
  tone?: 'like' | 'dislike';
  onPress: () => void;
}) {
  const note = adjustedLabel(adjusted);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titleCase(label)}${note ? `. ${note}` : ''}`}
      accessibilityHint="Show more, show less, or forget"
      style={({ pressed }) => [styles.chip, tone === 'dislike' && styles.chipDislike, pressed && styles.pressed]}>
      {adjusted ? (
        <Icon
          name={adjusted === 'more' ? 'plus' : 'close'}
          size={12}
          color={adjusted === 'more' ? colors.accent : colors.skip}
        />
      ) : null}
      <AppText variant="bodySmall" color={tone === 'dislike' ? colors.skip : colors.ink}>
        {titleCase(label)}
      </AppText>
    </Pressable>
  );
}

const CARD_W = 150;

/** A style they love, as a photo card. Tap to adjust. */
export function StyleTraitCard({
  label,
  adjusted,
  photo,
  onPress,
}: {
  label: string;
  adjusted: 'more' | 'less' | null;
  /** A bundled room photo or a product photo URL. */
  photo: { bundled: number } | { uri: string } | undefined;
  onPress: () => void;
}) {
  const note = adjustedLabel(adjusted);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titleCase(label)}${note ? `. ${note}` : ''}`}
      accessibilityHint="Show more, show less, or forget"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {photo && 'bundled' in photo ? (
        <Image source={photo.bundled} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : photo ? (
        <ProductImage uri={photo.uri} style={StyleSheet.absoluteFill} fit="showcase" />
      ) : null}
      <LinearGradient
        colors={[colors.scrimLight, colors.scrimMid, colors.scrim]}
        locations={[0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      {adjusted === 'more' ? (
        <View style={styles.badge}>
          <Icon name="plus" size={11} color={colors.onInk} />
          <AppText variant="eyebrow" color={colors.onInk} style={styles.badgeText}>
            MORE
          </AppText>
        </View>
      ) : null}
      <AppText variant="heading" color={colors.onPhoto} style={styles.cardLabel}>
        {titleCase(label)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    backgroundColor: colors.accentGlass,
  },
  chipDislike: { borderColor: colors.skip, backgroundColor: colors.skipSoft },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  card: {
    width: CARD_W,
    height: Math.round(CARD_W * 1.25),
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    justifyContent: 'flex-end',
  },
  cardLabel: { padding: space.md },
  badge: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.keep,
  },
  badgeText: { fontSize: 9, lineHeight: 12, letterSpacing: 1.4 },
});
