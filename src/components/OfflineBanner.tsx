import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

/**
 * Slim strip across the top while the phone is offline. It sits above the
 * screens (not on top of them) so it never hides a button.
 */
export function OfflineBanner({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <View
      style={[styles.banner, { paddingTop: insets.top + space.xs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite">
      <Icon name="offline" size={14} color={colors.onAction} />
      <AppText variant="caption" color={colors.onAction} style={styles.text}>
        You&apos;re offline. Swiping still works; new photos and store links need a connection.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    backgroundColor: colors.ink,
  },
  text: { flexShrink: 1 },
});
