import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ROOMS } from '@/data/rooms';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { colors, fonts, radii, space } from '@/theme/tokens';

const roomImage = (id: string) => ROOMS.find((r) => r.id === id)?.image ?? ROOMS[0].image;

/**
 * First launch, between the welcome and the rooms (Devin's design): why rooms, how to
 * answer, and what happens next. The card demo plays once: a nudge left (pass), back,
 * then right (love). Nothing to practise; the next screen is the real thing.
 */
export default function TasteIntroScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const x = useSharedValue(0);
  const pass = useSharedValue(0);
  const love = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    const ease = { duration: 420, easing: Easing.inOut(Easing.cubic) };
    x.set(
      withDelay(
        500,
        withSequence(
          withTiming(-38, ease),
          withTiming(-38, { duration: 300 }),
          withTiming(0, ease),
          withTiming(38, ease),
          withTiming(38, { duration: 700 }),
          withTiming(0, ease),
        ),
      ),
    );
    pass.set(
      withDelay(
        650,
        withSequence(
          withTiming(1, { duration: 220 }),
          withTiming(1, { duration: 450 }),
          withTiming(0, { duration: 260 }),
        ),
      ),
    );
    love.set(withDelay(1850, withSequence(withTiming(1, { duration: 220 }), withTiming(1, { duration: 1100 }))));
  }, [reduceMotion, x, pass, love]);

  const front = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { rotate: `${(x.get() / 38) * 7}deg` }],
  }));
  const passStyle = useAnimatedStyle(() => ({ opacity: pass.get(), transform: [{ scale: 0.8 + 0.2 * pass.get() }] }));
  const loveStyle = useAnimatedStyle(() => ({ opacity: love.get(), transform: [{ scale: 0.8 + 0.2 * love.get() }] }));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}>
      <View style={styles.copy}>
        <AppText variant="eyebrow" color={colors.accentText}>
          FIRST, A LITTLE ABOUT YOUR TASTE
        </AppText>
        <AppText variant="hero" accessibilityRole="header" style={styles.headline}>
          Every great find starts with{' '}
          <AppText variant="hero" style={[styles.headline, styles.italic]}>
            your
          </AppText>{' '}
          taste.
        </AppText>
        <AppText variant="body" color={colors.inkMuted}>
          We&apos;ll show you 8 different rooms. Love what you see or pass on what you don&apos;t. Your picks help us
          find furniture that feels like you.
        </AppText>
      </View>

      <View style={styles.demo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.card, styles.back, styles.backLeft]}>
          <Image source={roomImage('scandinavian')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>
        <View style={[styles.card, styles.back, styles.backRight]}>
          <Image source={roomImage('mid-century')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </View>
        <Animated.View style={[styles.card, styles.front, front]}>
          <Image source={roomImage('organic-modern')} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
        <Animated.View style={[styles.badge, styles.passBadge, passStyle]}>
          <Icon name="close" size={20} color={colors.skip} />
        </Animated.View>
        <Animated.View style={[styles.badge, styles.loveBadge, loveStyle]}>
          <Icon name="keep" size={22} color={colors.onInk} />
        </Animated.View>
      </View>

      <View style={styles.steps} accessible accessibilityLabel="See 8 rooms. Swipe right or left. See your style.">
        <View style={styles.step}>
          <Icon name="photos" size={24} color={colors.accent} />
          <AppText variant="bodySmall" style={styles.stepText}>
            See 8 rooms
          </AppText>
        </View>
        <View style={[styles.step, styles.stepMiddle]}>
          <Icon name="swipe" size={24} color={colors.accent} />
          <AppText variant="bodySmall" style={styles.stepText}>
            Swipe right or left
          </AppText>
        </View>
        <View style={styles.step}>
          <BrandMark size={24} ink={colors.accent} />
          <AppText variant="bodySmall" style={styles.stepText}>
            See your style
          </AppText>
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Let's find my style" size="lg" onPress={() => router.replace('/rooms')} style={styles.cta} />
        <AppText variant="bodySmall" color={colors.inkMuted}>
          8 quick picks · About 30 seconds
        </AppText>
      </View>
    </View>
  );
}

const FRONT_W = 170;
const FRONT_H = 224;
const BACK_W = 150;
const BACK_H = 200;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl },
  copy: { gap: space.md },
  headline: { fontSize: 42, lineHeight: 44 },
  italic: { fontFamily: fonts.serifItalic },
  demo: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute', borderRadius: radii.md + 2, overflow: 'hidden', backgroundColor: colors.placeholder },
  back: { width: BACK_W, height: BACK_H, boxShadow: `0 10px 24px ${colors.shadow}1F` },
  backLeft: { transform: [{ translateX: -58 }, { translateY: 20 }, { rotate: '-8deg' }] },
  backRight: { transform: [{ translateX: 58 }, { translateY: 20 }, { rotate: '8deg' }] },
  front: {
    width: FRONT_W,
    height: FRONT_H,
    borderWidth: 3,
    borderColor: colors.background,
    boxShadow: `0 18px 36px ${colors.shadow}38`,
  },
  badge: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    top: '58%',
  },
  passBadge: { left: '12%', backgroundColor: colors.background, boxShadow: `0 6px 16px ${colors.shadow}2E` },
  loveBadge: { right: '12%', backgroundColor: colors.keep, boxShadow: `0 6px 16px ${colors.shadow}2E` },
  steps: { flexDirection: 'row', paddingVertical: space.lg },
  step: { flex: 1, alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  stepMiddle: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stepText: { textAlign: 'center' },
  footer: { alignItems: 'center', gap: space.md },
  cta: { alignSelf: 'stretch' },
});
