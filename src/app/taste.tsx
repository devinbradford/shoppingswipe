import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GlassIconButton } from '@/components/Glass';
import { LoadingView, StateView } from '@/components/StateView';
import { StyleTraitCard, TraitChip } from '@/components/TasteTraits';
import { formatBudget } from '@/domain/budget';
import { useTaste } from '@/hooks/useTaste';
import { useUndoToast } from '@/hooks/useUndoToast';
import { UndoToast } from '@/components/UndoToast';
import { formatPrice, pluralize } from '@/lib/format';
import type { Trait } from '@/recommendation';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSignalStore } from '@/store/signalStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

/** "Your taste": what CureAvo has learned, in plain words, and a way to adjust it. */
export default function TasteScreen() {
  const taste = useTaste();
  const stated = usePreferencesStore((s) => s.budget);
  const answerFeature = useSignalStore((s) => s.answerFeature);
  const startFresh = useSignalStore((s) => s.startFresh);
  const toast = useUndoToast();
  const insets = useSafeAreaInsets();
  const [adjusting, setAdjusting] = useState<Trait | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const s = taste.summary;

  const adjust = (trait: Trait, answer: 'more' | 'less' | 'forget') => {
    answerFeature(trait.key, answer);
    const what =
      answer === 'more'
        ? `Showing more ${trait.label}.`
        : answer === 'less'
          ? `Showing less ${trait.label}.`
          : `Forgot ${trait.label}.`;
    AccessibilityInfo.announceForAccessibility(`${what} Your feed has been updated.`);
    toast.show({
      message:
        answer === 'less'
          ? `Got it: less ${trait.label}. It's now under Less your thing.`
          : answer === 'more'
            ? `Got it: more ${trait.label} in your feed.`
            : `Forgot ${trait.label}.`,
    });
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      {taste.status === 'loading' || !s ? (
        taste.status === 'error' ? (
          <StateView
            icon="refresh"
            title="Couldn't load your taste"
            message="Try again in a moment."
            primary={{ label: 'Try again', onPress: taste.reload }}
          />
        ) : (
          <LoadingView label="Reading your taste" />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            <AppText variant="eyebrow" color={colors.inkMuted}>
              YOUR TASTE
            </AppText>
            {s.stage === 'learning' || !s.headline ? (
              <>
                <AppText variant="hero" accessibilityRole="header">
                  {s.stage === 'learning' ? 'Still learning' : 'Taking shape'}
                </AppText>
                <AppText variant="body" color={colors.inkMuted}>
                  {s.stage === 'learning'
                    ? 'After about 10 swipes this page shows what you love.'
                    : "We're seeing patterns, but nothing we'd bet on yet. A few more keeps and this fills in."}{' '}
                  {s.swipeCount > 0 ? `So far: ${pluralize(s.swipeCount, 'swipe')}.` : ''}
                </AppText>
                <Button label="Keep swiping" onPress={() => router.navigate('/')} />
              </>
            ) : (
              <>
                <AppText variant="hero" accessibilityRole="header" style={styles.headline}>
                  {s.headline}
                </AppText>
                <AppText variant="body" color={colors.inkMuted}>
                  {s.stage === 'shaping' ? 'An early read, based' : 'Based'} on {pluralize(s.swipeCount, 'swipe')} and{' '}
                  {pluralize(s.positiveCount, 'piece')} you loved. It keeps learning as you go. Tap anything to adjust
                  it.
                </AppText>
              </>
            )}
          </View>

          {s.styles.length > 0 ? (
            <Section title="STYLES YOU LOVE">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
                {s.styles.map((t) => (
                  <StyleTraitCard
                    key={t.key}
                    label={t.label}
                    adjusted={t.adjusted}
                    photo={taste.stylePhotos.get(t.key)}
                    onPress={() => setAdjusting(t)}
                  />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {s.materials.length > 0 ? (
            <Section title="MATERIALS">
              <Chips traits={s.materials} onPress={setAdjusting} />
            </Section>
          ) : null}

          {s.colors.length > 0 ? (
            <Section title="COLOURS">
              <Chips traits={s.colors} onPress={setAdjusting} />
            </Section>
          ) : null}

          {taste.price || stated ? (
            <Section title="PRICE">
              <View style={styles.card}>
                {taste.price ? (
                  <AppText variant="body">
                    For {taste.price.noun}, you usually land around{' '}
                    <AppText variant="body" color={colors.accentText}>
                      {formatPrice(taste.price.usualCents)}
                    </AppText>{' '}
                    and rarely go above{' '}
                    <AppText variant="body" color={colors.accentText}>
                      {formatPrice(taste.price.ceilingCents)}
                    </AppText>
                    .
                  </AppText>
                ) : null}
                <View style={styles.cardRow}>
                  <AppText variant="bodySmall" color={colors.inkMuted} style={styles.flex}>
                    Budget you set: {stated ? formatBudget(stated.maxCents / 100) : 'none'}
                  </AppText>
                  <Button
                    label="Edit"
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/setup/budget', params: { edit: '1' } })}
                  />
                </View>
              </View>
            </Section>
          ) : null}

          {s.dislikes.length > 0 ? (
            <Section title="LESS YOUR THING">
              <Chips traits={s.dislikes} tone="dislike" onPress={setAdjusting} />
              <AppText variant="caption" color={colors.inkMuted} style={styles.gutter}>
                These still show up now and then, just less often.
              </AppText>
            </Section>
          ) : null}

          {s.swipeCount > 0 || s.positiveCount > 0 ? (
            <View style={styles.footer}>
              <Button label="Start fresh" variant="ghost" onPress={() => setConfirmFresh(true)} />
            </View>
          ) : null}
        </ScrollView>
      )}

      {toast.toast ? (
        <UndoToast
          id={toast.toast.id}
          message={toast.toast.message}
          onExpire={toast.expire}
          bottom={insets.bottom + space.lg}
        />
      ) : null}
      <ActionSheet
        visible={adjusting !== null}
        title={adjusting ? adjusting.label.charAt(0).toUpperCase() + adjusting.label.slice(1) : ''}
        onClose={() => setAdjusting(null)}
        actions={
          adjusting
            ? [
                {
                  label: 'Show me more',
                  icon: 'plus',
                  checked: adjusting.adjusted === 'more',
                  onPress: () => adjust(adjusting, 'more'),
                },
                {
                  label: 'Show me less',
                  icon: 'close',
                  checked: adjusting.adjusted === 'less',
                  onPress: () => adjust(adjusting, 'less'),
                },
                {
                  label: 'Forget this',
                  icon: 'refresh',
                  destructive: true,
                  onPress: () => adjust(adjusting, 'forget'),
                },
              ]
            : []
        }
      />
      <ConfirmSheet
        visible={confirmFresh}
        title="Start fresh?"
        message="CureAvo forgets what it learned about your taste and starts learning again. Your kept pieces, lists and budget stay."
        confirmLabel="Start fresh"
        onClose={() => setConfirmFresh(false)}
        onConfirm={startFresh}
      />
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" color={colors.inkMuted} accessibilityRole="header" style={styles.gutter}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Chips({ traits, tone, onPress }: { traits: Trait[]; tone?: 'like' | 'dislike'; onPress: (t: Trait) => void }) {
  return (
    <View style={[styles.chips, styles.gutter]}>
      {traits.map((t) => (
        <TraitChip key={t.key} label={t.label} adjusted={t.adjusted} tone={tone} onPress={() => onPress(t)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  content: { paddingBottom: space.xxxl, gap: space.xxl },
  head: { gap: space.md, paddingHorizontal: space.xl, paddingTop: space.md },
  headline: { fontFamily: fonts.serifItalic },
  section: { gap: space.md },
  gutter: { paddingHorizontal: space.xl },
  cards: { gap: space.md, paddingHorizontal: space.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: {
    marginHorizontal: space.xl,
    padding: space.lg,
    gap: space.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  footer: { alignItems: 'center' },
});
