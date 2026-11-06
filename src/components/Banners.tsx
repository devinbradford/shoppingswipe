import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';

interface BannerProps {
  onClose: () => void;
  reduceMotion?: boolean;
}

/** "Welcome back · 12 pieces picked for you since Tuesday", with three small photos. */
export function WelcomeBackCard({
  subtitle,
  photos,
  onPress,
  onClose,
  reduceMotion,
}: BannerProps & { subtitle: string; photos: (string | undefined)[]; onPress: () => void }) {
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(300)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={[styles.pill, styles.card]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Welcome back. ${subtitle}. Start swiping`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <View style={styles.thumbs} importantForAccessibility="no-hide-descendants">
          {photos.slice(0, 3).map((uri, i) => (
            <View key={i} style={[styles.thumb, i > 0 && styles.thumbOverlap]}>
              <ProductImage uri={uri} style={StyleSheet.absoluteFill} fit="showcase" />
            </View>
          ))}
        </View>
        <View style={styles.text}>
          <AppText variant="heading" color={colors.onPhoto} numberOfLines={1}>
            Welcome back
          </AppText>
          <AppText variant="caption" color={colors.accentText} numberOfLines={2}>
            {subtitle}
          </AppText>
        </View>
      </Pressable>
      <CloseButton onPress={onClose} />
    </Animated.View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={6}
      style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Icon name="close" size={14} color={colors.inkMuted} />
    </Pressable>
  );
}

const THUMB = 40;

const styles = StyleSheet.create({
  pill: {
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
  card: { borderRadius: radii.lg, paddingLeft: space.md, marginHorizontal: space.lg, alignSelf: 'stretch' },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingRight: space.sm,
    flexShrink: 1,
  },
  text: { gap: 1, flexShrink: 1 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  thumbs: { flexDirection: 'row', paddingVertical: space.sm },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  thumbOverlap: { marginLeft: -14 },
});
