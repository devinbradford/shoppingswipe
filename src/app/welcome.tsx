import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { LoadingView, StateView } from '@/components/StateView';
import { StyleTile } from '@/components/StyleTile';
import { MAX_STYLE_PICKS, MIN_STYLE_PICKS, pickerCta, toggleStylePick } from '@/domain/tastePicker';
import { useStyleOptions } from '@/hooks/useCatalog';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, space } from '@/theme/tokens';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** First-launch taste picker: tap 3–5 styles so the deck is personal from the first card. */
export default function WelcomeScreen() {
  const styles_ = useStyleOptions();
  const saved = usePreferencesStore((s) => s.stylePicks);
  const onboarded = usePreferencesStore((s) => s.onboarded);
  const setStylePicks = usePreferencesStore((s) => s.setStylePicks);
  const skip = usePreferencesStore((s) => s.skipOnboarding);
  const [picks, setPicks] = useState<string[]>(saved);
  const ready = picks.length >= MIN_STYLE_PICKS;
  const full = picks.length >= MAX_STYLE_PICKS;

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <FlatList
        data={styles_.status === 'ready' ? styles_.data : []}
        keyExtractor={(s) => s.tag}
        numColumns={2}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columns}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText variant="hero" accessibilityRole="header">
              {onboarded ? 'Your styles' : 'Welcome'}
            </AppText>
            <AppText variant="body" color={colors.inkMuted}>
              Pick {MIN_STYLE_PICKS} to {MAX_STYLE_PICKS} styles you like. Your first deck will lean toward them, and it
              keeps learning as you swipe.
            </AppText>
            <AppText variant="label" color={colors.keep} accessibilityLiveRegion="polite">
              {picks.length} of {MAX_STYLE_PICKS} picked
            </AppText>
          </View>
        }
        renderItem={({ item }) => (
          <StyleTile
            label={titleCase(item.tag)}
            coverUrl={item.coverUrl}
            selected={picks.includes(item.tag)}
            disabled={full && !picks.includes(item.tag)}
            onPress={() => setPicks((p) => toggleStylePick(p, item.tag))}
          />
        )}
        ListEmptyComponent={
          styles_.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load styles"
              message="You can skip this and start swiping."
              primary={{ label: 'Try again', onPress: styles_.reload }}
            />
          ) : (
            <LoadingView label="Loading styles" />
          )
        }
      />
      <View style={styles.footer}>
        <Button
          label={onboarded ? 'Cancel' : 'Skip for now'}
          variant="ghost"
          onPress={() => {
            if (!onboarded) skip();
            leave();
          }}
        />
        <Button
          label={pickerCta(picks.length)}
          disabled={!ready}
          size="lg"
          style={styles.cta}
          onPress={() => {
            setStylePicks(picks);
            leave();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },
  columns: { gap: space.md },
  header: { gap: space.sm, paddingTop: space.lg, paddingBottom: space.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: { flex: 1 },
});
