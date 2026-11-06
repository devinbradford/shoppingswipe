import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

/** One-time "Your taste is taking shape" moment over the deck. */
export function TasteRevealPill({
  onOpen,
  onClose,
  reduceMotion,
}: {
  onOpen: () => void;
  onClose: () => void;
  reduceMotion?: boolean;
}) {
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(260)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={styles.wrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Your taste is taking shape. See what we've learned"
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <Icon name="sparkles" size={16} color={colors.keep} />
        <View style={styles.text}>
          <AppText variant="label" color={colors.onPhoto} numberOfLines={1}>
            Your taste is taking shape
          </AppText>
          <AppText variant="caption" color={colors.accentText} numberOfLines={1}>
            See what we&apos;ve learned
          </AppText>
        </View>
      </Pressable>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={6}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <Icon name="close" size={14} color={colors.inkMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xs,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    boxShadow: `0 8px 24px ${colors.shadow}66`,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingRight: space.sm },
  text: { gap: 1 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
});
