import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** Show a small × (for removable "active filter" chips). */
  removable?: boolean;
  /** Show a check mark when selected (style picks). */
  checkWhenSelected?: boolean;
  /** Disabled (e.g. the maximum number of picks is reached). */
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  size?: 'md' | 'lg';
}

export function Chip({
  label,
  selected = false,
  onPress,
  removable,
  checkWhenSelected,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  size = 'md',
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      accessibilityState={removable ? undefined : { checked: selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        size === 'lg' && styles.lg,
        selected && styles.on,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {checkWhenSelected && selected ? <Icon name="check" size={14} color={colors.onInk} /> : null}
      <AppText variant={size === 'lg' ? 'label' : 'bodySmall'} color={selected ? colors.onInk : colors.ink}>
        {label}
      </AppText>
      {removable ? <Icon name="close" size={14} color={selected ? colors.onInk : colors.inkMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  on: { backgroundColor: colors.keep, borderColor: colors.keep },
  pressed: { opacity: 0.8 },
  lg: { paddingHorizontal: space.lg + 2 },
  disabled: { opacity: 0.4 },
});
