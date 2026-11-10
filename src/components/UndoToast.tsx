import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';

const SHOW_MS = 4500;

/**
 * "Removed · Undo" pill that floats above the bottom of the screen for a few seconds.
 * Change `id` for each new message; `onExpire` runs if it times out without Undo.
 */
export function UndoToast({
  id,
  message,
  onUndo,
  onExpire,
  bottom,
}: {
  id: number;
  message: string;
  /** Leave out for a plain confirmation with no Undo. */
  onUndo?: () => void;
  onExpire: () => void;
  bottom: number;
}) {
  useEffect(() => {
    const t = setTimeout(onExpire, SHOW_MS);
    return () => clearTimeout(t);
    // One timer per message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <Animated.View
      key={id}
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.toast, { bottom }]}
      accessibilityLiveRegion="polite">
      <AppText variant="bodySmall" color={colors.ink} style={styles.message} numberOfLines={1}>
        {message}
      </AppText>
      {onUndo ? (
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo"
          hitSlop={8}
          style={styles.undo}>
          <AppText variant="label" color={colors.accent}>
            Undo
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0 10px 30px ${colors.shadow}88`,
  },
  message: { flex: 1, paddingVertical: space.md },
  undo: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
});
