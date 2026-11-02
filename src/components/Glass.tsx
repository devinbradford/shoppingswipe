import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/** Translucent pill that floats over a photo (labels like "FURNITURE · 18 LEFT"). */
export function GlassPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.pill, style]}>{children}</View>;
}

interface GlassIconButtonProps {
  icon: IconName;
  /** Read by screen readers. */
  label: string;
  onPress: () => void;
  size?: number;
  /** "accent" is the solid champagne Keep button. */
  tone?: 'glass' | 'strong' | 'accent';
  disabled?: boolean;
  /** Small spaced capitals shown under the button (e.g. "SKIP"). */
  caption?: string;
}

/** Round button over a photo: glass for secondary actions, champagne for Keep. */
export function GlassIconButton({
  icon,
  label,
  onPress,
  size = 44,
  tone = 'glass',
  disabled,
  caption,
}: GlassIconButtonProps) {
  const button = (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2 },
        tone === 'glass' && styles.glass,
        tone === 'strong' && styles.strong,
        tone === 'accent' && styles.accent,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.34)} color={tone === 'accent' ? colors.onInk : colors.onPhoto} />
    </Pressable>
  );
  if (!caption) return button;
  return (
    <View style={styles.withCaption}>
      {button}
      <AppText variant="eyebrow" color={colors.inkMuted} importantForAccessibility="no" accessible={false}>
        {caption}
      </AppText>
    </View>
  );
}

/** Text button with a glass background, e.g. "Kept 4". */
export function GlassTextButton({ label, onPress, hint }: { label: string; onPress: () => void; hint?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={6}
      style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      <AppText variant="bodySmall" color={colors.onPhoto}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: { alignItems: 'center', justifyContent: 'center' },
  glass: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  strong: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassStrongBorder },
  accent: {
    backgroundColor: colors.keep,
    boxShadow: `0 10px 28px ${colors.keep}4D`,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.35 },
  withCaption: { alignItems: 'center', gap: space.sm },
  textButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
