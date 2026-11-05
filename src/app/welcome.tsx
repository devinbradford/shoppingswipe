import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { StylePhotoCard } from '@/components/StylePhotoCard';
import { STYLE_PHOTOS } from '@/data/stylePhotos';
import { MAX_STYLE_PICKS, MIN_STYLE_PICKS, pickerCta, toggleStylePick } from '@/domain/tastePicker';
import { useStyleOptions } from '@/hooks/useCatalog';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, space } from '@/theme/tokens';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const GAP = space.sm + 2;

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
  // Styles in the catalog that don't have a room photo yet are offered as small chips.
  const moreStyles =
    options.status === 'ready'
      ? options.data.map((s) => s.tag).filter((tag) => !STYLE_PHOTOS.some((p) => p.tag === tag))
      : [];
  const [width, setWidth] = useState(0);
  const cardWidth = Math.max(80, Math.floor((width - 2 * space.xl - 2 * GAP) / 3));
  const toggle = (tag: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPicks((p) => toggleStylePick(p, tag));
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space.lg }]}
        bounces={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.header}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            {onboarded ? 'CUREAVO' : 'STEP 1 OF 3'}
          </AppText>
          <AppText variant="hero" color={colors.onPhoto} accessibilityRole="header">
            {onboarded ? 'Your styles' : 'What feels like '}
            {onboarded ? null : (
              <AppText variant="hero" color={colors.accentText} style={styles.italic}>
                home?
              </AppText>
            )}
          </AppText>
          <AppText variant="body" color={colors.inkMuted}>
            Tap {MIN_STYLE_PICKS} to {MAX_STYLE_PICKS} rooms you&apos;d love to live in. Your first deck is built around
            them.
          </AppText>
        </View>

        <View style={styles.countRow}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            STYLES
          </AppText>
          <AppText variant="bodySmall" accessibilityLiveRegion="polite">
            {picks.length} of {MAX_STYLE_PICKS}
          </AppText>
        </View>

        <View style={styles.grid}>
          {STYLE_PHOTOS.map((s) => {
            const on = picks.includes(s.tag);
            return (
              <StylePhotoCard
                key={s.tag}
                label={titleCase(s.tag)}
                source={s.source}
                width={cardWidth}
                selected={on}
                dimmed={full && !on}
                onPress={() => toggle(s.tag)}
              />
            );
          })}
        </View>

        {moreStyles.length ? (
          <View style={styles.more}>
            <AppText variant="eyebrow" color={colors.inkMuted}>
              MORE STYLES
            </AppText>
            <View style={styles.chips}>
              {moreStyles.map((tag) => {
                const on = picks.includes(tag);
                return (
                  <Chip
                    key={tag}
                    label={titleCase(tag)}
                    selected={on}
                    checkWhenSelected
                    disabled={full && !on}
                    accessibilityHint={full && !on ? 'You can pick up to 5. Unpick one to choose this.' : undefined}
                    onPress={() => toggle(tag)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Button
          label={pickerCta(picks.length)}
          disabled={!ready}
          size="lg"
          onPress={() => {
            const firstTime = !onboarded;
            setStylePicks(picks);
            // First launch: two quick questions (room, budget), then "building your feed".
            if (firstTime) router.push('/setup/room');
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
  scroll: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.lg },
  header: { gap: space.md, paddingTop: space.md },
  italic: { fontFamily: fonts.serifItalic },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  more: { gap: space.sm, paddingTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.xs },
});
