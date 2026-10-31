import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hitTarget, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'keep' | 'skip' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}

const FILL: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, fg: colors.onInk },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.border },
  keep: { bg: colors.keep, fg: colors.onInk },
  skip: { bg: colors.skip, fg: colors.onInk },
  ghost: { bg: 'transparent', fg: colors.ink },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  accessibilityHint,
  style,
  size = 'md',
}: ButtonProps) {
  const fill = FILL[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        { backgroundColor: fill.bg, borderColor: fill.border ?? fill.bg },
        variant === 'ghost' && styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={size === 'lg' ? 20 : 18} color={fill.fg} /> : null}
        <AppText variant="label" color={fill.fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'plain' | 'surface';
}

/** Round icon-only button. `label` is read by screen readers. */
export function IconButton({ icon, label, onPress, disabled, tone = 'surface' }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        tone === 'surface' && styles.iconSurface,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: hitTarget,
    paddingHorizontal: space.xl,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: { minHeight: 58, paddingHorizontal: space.xxl },
  ghost: { paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.38 },
  icon: {
    width: hitTarget,
    height: hitTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSurface: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
