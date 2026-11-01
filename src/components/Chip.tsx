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
  accessibilityLabel?: string;
}

export function Chip({ label, selected = false, onPress, removable, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      accessibilityState={removable ? undefined : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [styles.chip, selected && styles.on, pressed && styles.pressed]}>
      <AppText variant="bodySmall" color={selected ? colors.onInk : colors.ink}>
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
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  on: { backgroundColor: colors.ink, borderColor: colors.ink },
  pressed: { opacity: 0.8 },
});
