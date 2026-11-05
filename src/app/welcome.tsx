import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ProductImage } from '@/components/ProductImage';
import { LoadingView, StateView } from '@/components/StateView';
import { MAX_STYLE_PICKS, MIN_STYLE_PICKS, pickerCta, toggleStylePick } from '@/domain/tastePicker';
import { useStyleOptions } from '@/hooks/useCatalog';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, space } from '@/theme/tokens';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** First-launch taste picker: tap 3–5 styles so the deck is personal from the first card. */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const options = useStyleOptions();
  const saved = usePreferencesStore((s) => s.stylePicks);
  const onboarded = usePreferencesStore((s) => s.onboarded);
  const setStylePicks = usePreferencesStore((s) => s.setStylePicks);
  const skip = usePreferencesStore((s) => s.skipOnboarding);
  const [picks, setPicks] = useState<string[]>(saved);
  const ready = picks.length >= MIN_STYLE_PICKS;
  const full = picks.length >= MAX_STYLE_PICKS;
  const styleList = options.status === 'ready' ? options.data : [];
  const heroUrl = styleList.find((s) => s.coverUrl)?.coverUrl;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <View style={styles.hero}>
          <ProductImage uri={heroUrl} style={StyleSheet.absoluteFill} priority="high" />
          <LinearGradient
            colors={[colors.scrimMid, colors.scrimLight, colors.scrimLight, colors.scrim, colors.background]}
            locations={[0, 0.22, 0.42, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
          <AppText variant="eyebrow" color={colors.onPhoto} style={[styles.brand, { top: insets.top + space.lg }]}>
            CUREAVO
          </AppText>
          <View style={styles.heroText}>
            <AppText variant="hero" color={colors.onPhoto} accessibilityRole="header">
              {onboarded ? 'Your styles' : 'What feels like '}
              {onboarded ? null : (
                <AppText variant="hero" color={colors.accentText} style={styles.italic}>
                  home?
                </AppText>
              )}
            </AppText>
            <AppText variant="body" color={colors.inkMuted}>
              Pick {MIN_STYLE_PICKS} to {MAX_STYLE_PICKS} styles. Your first deck is built around them, and it keeps
              learning as you swipe.
            </AppText>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.countRow}>
            <AppText variant="eyebrow" color={colors.inkMuted}>
              STYLES
            </AppText>
            <AppText variant="bodySmall" accessibilityLiveRegion="polite">
              {picks.length} of {MAX_STYLE_PICKS}
            </AppText>
          </View>
          {options.status === 'ready' ? (
            <View style={styles.chips}>
              {styleList.map((s) => {
                const on = picks.includes(s.tag);
                return (
                  <Chip
                    key={s.tag}
                    label={titleCase(s.tag)}
                    size="lg"
                    selected={on}
                    checkWhenSelected
                    disabled={full && !on}
                    accessibilityHint={full && !on ? 'You can pick up to 5. Unpick one to choose this.' : undefined}
                    onPress={() => setPicks((p) => toggleStylePick(p, s.tag))}
                  />
                );
              })}
            </View>
          ) : options.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load styles"
              message="You can skip this and start swiping."
              primary={{ label: 'Try again', onPress: options.reload }}
            />
          ) : (
            <LoadingView label="Loading styles" />
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Button
          label={pickerCta(picks.length)}
          disabled={!ready}
          size="lg"
          onPress={() => {
            const firstTime = !onboarded;
            setStylePicks(picks);
            // First launch: a short "building your feed" moment, then Discover.
            if (firstTime) router.replace('/building');
            else leave();
          }}
        />
        <Button
          label={onboarded ? 'Cancel' : 'Skip for now'}
          variant="ghost"
          onPress={() => {
            if (!onboarded) skip();
            leave();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: space.xl },
  hero: { height: 400, justifyContent: 'flex-end' },
  brand: { position: 'absolute', left: space.xl },
  heroText: { paddingHorizontal: space.xl, gap: space.md },
  italic: { fontFamily: fonts.serifItalic },
  body: { paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.lg },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.xs },
});
