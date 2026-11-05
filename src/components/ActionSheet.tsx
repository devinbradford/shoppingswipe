import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitTarget, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';

export interface SheetAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Rose text for actions that remove something. */
  destructive?: boolean;
  /** Shows a check (for picking one option, e.g. a sort). */
  checked?: boolean;
}

/** A sheet of simple rows: the long-press menu on a piece, or a sort picker. Closes after a tap. */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.rows}>
        {actions.map((a) => {
          const tint = a.destructive ? colors.skip : a.checked ? colors.keep : colors.ink;
          return (
            <Pressable
              key={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              accessibilityRole={a.checked === undefined ? 'button' : 'radio'}
              accessibilityState={a.checked === undefined ? undefined : { checked: a.checked }}
              accessibilityLabel={a.label}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Icon name={a.icon} size={20} color={a.destructive ? colors.skip : colors.keep} />
              <AppText variant="label" color={tint} style={styles.label}>
                {a.label}
              </AppText>
              {a.checked ? <Icon name="check" size={18} color={colors.keep} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  rows: { paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: hitTarget + 4,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  label: { flex: 1 },
});
