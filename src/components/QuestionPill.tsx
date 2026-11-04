import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { Question, SkipReason } from '@/recommendation';
import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

type Answer = 'less' | 'fine' | SkipReason;

interface QuestionPillProps {
  question: Question;
  onAnswer: (answer: Answer) => void;
  /** Faded out or closed without an answer. */
  onDismiss: () => void;
  reduceMotion?: boolean;
}

const WHY: { label: string; value: SkipReason }[] = [
  { label: 'Style', value: 'style' },
  { label: 'Price', value: 'price' },
  { label: 'Color', value: 'color' },
  { label: 'Material', value: 'material' },
];

/**
 * The occasional quick question after a telling skip ("Not into boucle?").
 * Fades on its own after a few seconds; ignoring it is always fine. Stays put
 * while a screen reader is on, so there's time to hear and answer it.
 */
export function QuestionPill({ question, onAnswer, onDismiss, reduceMotion }: QuestionPillProps) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    AccessibilityInfo.announceForAccessibility(question.title);
    // (The web build always reports a screen reader, so only trust this on phones.)
    (Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isScreenReaderEnabled())
      .catch(() => false)
      .then((reader) => {
        if (cancelled || reader) return;
        timer = setTimeout(onDismiss, question.type === 'why' ? 5500 : 4500);
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [question.key, question.title, question.type, onDismiss]);

  const options: { label: string; value: Answer; primary?: boolean }[] =
    question.type === 'why'
      ? WHY
      : question.kind === 'price'
        ? [
            { label: 'Show lower prices', value: 'less', primary: true },
            { label: 'Prices are fine', value: 'fine' },
          ]
        : [
            { label: 'Less of this', value: 'less', primary: true },
            { label: 'No, just these', value: 'fine' },
          ];

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(180)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={styles.pill}
      accessibilityRole="alert">
      <View style={styles.head}>
        <AppText variant="label" color={colors.onPhoto} style={styles.title}>
          {question.title}
        </AppText>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now"
          hitSlop={12}
          style={styles.close}>
          <Icon name="close" size={14} color={colors.inkMuted} />
        </Pressable>
      </View>
      <View style={styles.options}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => onAnswer(o.value)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            style={({ pressed }) => [styles.option, o.primary && styles.primary, pressed && styles.pressed]}>
            <AppText variant="bodySmall" color={o.primary ? colors.onInk : colors.onPhoto}>
              {o.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    boxShadow: `0 12px 32px ${colors.shadow}80`,
    borderWidth: 1,
    borderColor: colors.accentGlassBorder,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { flex: 1 },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassStrongBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.keep, borderColor: colors.keep },
  pressed: { opacity: 0.8 },
});
