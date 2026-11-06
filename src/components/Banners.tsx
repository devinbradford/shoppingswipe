import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { ProductImage } from './ProductImage';

interface BannerProps {
  onClose: () => void;
  reduceMotion?: boolean;
}

/** One-line glass pill over the deck: icon, title, subtitle, close. Tap to open. */
export function BannerPill({
  icon,
  title,
  subtitle,
  onPress,
  onClose,
  reduceMotion,
}: BannerProps & { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(260)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={styles.pill}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${subtitle}`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        <Icon name={icon} size={16} color={colors.keep} />
        <View style={styles.text}>
          <AppText variant="label" color={colors.onPhoto} numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color={colors.accentText} numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
      </Pressable>
      <CloseButton onPress={onClose} />
    </Animated.View>
  );
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

/** Our own card before the phone's permission prompt: what we'd send, and how often. */
export function ReminderOfferCard({
  onYes,
  onNo,
  busy,
  reduceMotion,
}: {
  onYes: () => void;
  onNo: () => void;
  busy?: boolean;
  reduceMotion?: boolean;
}) {
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(260)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={[styles.pill, styles.offer]}
      accessibilityLabel="Want a heads-up when your weekly 10 is ready? One reminder on Monday mornings, nothing else.">
      <View style={styles.offerText}>
        <AppText variant="label" color={colors.onPhoto}>
          Want a heads-up on Mondays?
        </AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          One reminder when your weekly 10 is ready. Nothing else.
        </AppText>
      </View>
      <View style={styles.offerButtons}>
        <Pressable
          onPress={onNo}
          accessibilityRole="button"
          accessibilityLabel="No thanks"
          style={({ pressed }) => [styles.offerButton, pressed && styles.pressed]}>
          <AppText variant="label" color={colors.inkMuted}>
            No thanks
          </AppText>
        </Pressable>
        <Pressable
          onPress={onYes}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Remind me"
          style={({ pressed }) => [styles.offerButton, styles.offerYes, pressed && styles.pressed]}>
          <AppText variant="label" color={colors.onInk}>
            Remind me
          </AppText>
        </Pressable>
      </View>
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
  offer: {
    flexDirection: 'column',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    marginHorizontal: space.lg,
    borderRadius: radii.lg,
    padding: space.md,
    paddingLeft: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
  },
  offerText: { gap: 2 },
  offerButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
  offerButton: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radii.pill, justifyContent: 'center' },
  offerYes: { backgroundColor: colors.keep },
});
