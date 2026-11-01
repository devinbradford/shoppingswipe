import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

interface StyleTileProps {
  label: string;
  coverUrl?: string;
  selected: boolean;
  /** True when the maximum is reached and this one isn't picked. */
  disabled: boolean;
  onPress: () => void;
}

export function StyleTile({ label, coverUrl, selected, disabled, onPress }: StyleTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      accessibilityHint={disabled ? 'You can pick up to 5. Unpick one to choose this.' : undefined}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ProductImage uri={coverUrl} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[colors.scrimLight, colors.scrim]} style={styles.scrim} />
      <AppText variant="label" color={colors.onInk} style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? <Icon name="check" size={16} color={colors.onInk} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 0.9,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 3,
    borderColor: colors.background,
  },
  selected: { borderColor: colors.keep },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  label: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.onInk,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.keep, borderColor: colors.keep },
});
