import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/** The quiet cards above the headline: every taste welcome, yours still to be found. */
const STYLE_CARDS = [
  { label: 'Rustic', tilt: '-5deg', left: -54, top: 50, faded: true },
  { label: 'Mid-century', tilt: '-2deg', left: 58, top: 40, faded: false },
  { label: 'Coastal', tilt: '3deg', left: 292, top: 44, faded: false },
] as const;

/**
 * First launch, screen 1 (Devin's "2a"): a still, editorial welcome. No photo (one
 * photo would suggest one taste) and no animation: the rooms that follow do the talking.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const markIntroSeen = usePreferencesStore((s) => s.markIntroSeen);
  const skipOnboarding = usePreferencesStore((s) => s.skipOnboarding);

  const discover = () => {
    markIntroSeen();
    router.replace('/rooms');
  };
  const skip = () => {
    markIntroSeen();
    skipOnboarding();
    router.replace('/');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="CureAvo">
        <BrandMark size={20} />
        <AppText variant="heading" style={styles.wordmark}>
          CureAvo
        </AppText>
      </View>

      <View style={styles.cards} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {STYLE_CARDS.map((c) => (
          <View
            key={c.label}
            style={[
              styles.card,
              { left: c.left, top: c.top, transform: [{ rotate: c.tilt }] },
              c.faded && styles.faded,
            ]}>
            <AppText variant="heading" color={c.faded ? colors.inkMuted : colors.ink} style={styles.cardWord}>
              {c.label}
            </AppText>
          </View>
        ))}
        <View style={[styles.card, styles.picked]}>
          <AppText variant="eyebrow" color={colors.onInk}>
            YOURS
          </AppText>
          <AppText variant="title" color={colors.onInk} style={styles.pickedWord}>
            Still to be found
          </AppText>
        </View>
      </View>

      <View style={styles.copy}>
        <AppText variant="hero" style={styles.headline} accessibilityRole="header">
          Find your kind of beautiful.
        </AppText>
        <AppText variant="body" color={colors.inkMuted} style={styles.lede}>
          Mid-century, coastal, a bit of everything. Swipe what catches your eye and we&apos;ll learn which is you.
        </AppText>
      </View>

      <View style={styles.footer}>
        <AppText variant="bodySmall" color={colors.inkMuted}>
          Free · No account needed · Real furniture stores
        </AppText>
        <View style={styles.actions}>
          <Button label="Discover my style" size="lg" onPress={discover} style={styles.primary} />
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel="Skip to shopping"
            hitSlop={12}
            style={styles.skip}>
            <AppText variant="label" style={styles.underline}>
              Skip
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const CARD_W = 104;
const CARD_H = 136;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl, overflow: 'hidden' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  wordmark: { fontSize: 21, lineHeight: 24 },
  cards: { height: 210, marginTop: space.lg, marginHorizontal: -space.xl },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    padding: space.md,
    borderRadius: radii.md - 2,
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  faded: { opacity: 0.7 },
  cardWord: { fontSize: 17, lineHeight: 19 },
  picked: {
    left: 170,
    top: 2,
    width: 114,
    height: 150,
    backgroundColor: colors.keep,
    justifyContent: 'space-between',
    transform: [{ rotate: '9deg' }],
    boxShadow: `0 16px 30px ${colors.shadow}2E`,
  },
  pickedWord: { fontFamily: fonts.serifItalic, fontSize: 26, lineHeight: 27 },
  copy: { flex: 1, justifyContent: 'center', gap: space.lg },
  headline: { fontSize: 62, lineHeight: 60, letterSpacing: -0.8 },
  lede: { maxWidth: 310 },
  footer: { gap: space.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  primary: { flex: 1 },
  skip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: space.xs },
  underline: { textDecorationLine: 'underline' },
});
