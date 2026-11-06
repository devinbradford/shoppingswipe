import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface ProfileRowProps {
  icon: IconName;
  title: string;
  /** Current value or a short explanation, under the title. */
  detail?: string;
  onPress: () => void;
  /** Spoken hint, e.g. "Opens in your browser". */
  hint?: string;
  /** Show the "opens elsewhere" arrow instead of the chevron. */
  external?: boolean;
  /** An on/off row: shows a switch (no chevron); tapping anywhere flips it. */
  toggle?: boolean;
}

/** A tappable settings row: icon, title, value, chevron. */
export function ProfileRow({ icon, title, detail, onPress, hint, external, toggle }: ProfileRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={toggle !== undefined ? 'switch' : external ? 'link' : 'button'}
      accessibilityState={toggle !== undefined ? { checked: toggle } : undefined}
      aria-checked={toggle}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={colors.keep} />
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {detail ? (
          <AppText variant="bodySmall" color={colors.inkMuted} numberOfLines={2}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {toggle !== undefined ? (
        <Switch
          value={toggle}
          onValueChange={onPress}
          trackColor={{ false: colors.border, true: colors.keep }}
          thumbColor={colors.ink}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <Icon name={external ? 'external' : 'chevronRight'} size={16} color={colors.inkMuted} />
      )}
    </Pressable>
  );
}

/** Groups rows under a small spaced-capitals heading. */
export function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" color={colors.inkMuted} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  group: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1, gap: 2 },
});
