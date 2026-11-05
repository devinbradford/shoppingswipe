import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GlassIconButton } from '@/components/Glass';
import { PriceSlider } from '@/components/PriceSlider';
import { budgetAnchor, budgetAnswer, budgetIndex, formatBudget, NO_LIMIT, type RoomChoice } from '@/domain/budget';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, space } from '@/theme/tokens';

const ROOM_LABEL: Record<RoomChoice, string> = {
  'living-room': 'Living room',
  bedroom: 'Bedroom',
  'kitchen-dining': 'Kitchen & dining',
  browsing: 'Just browsing',
};

/**
 * Onboarding: "What do you usually spend on a sofa?" A soft limit, never a filter.
 * With `?edit=1` (from Profile) it starts on the saved answer and goes back when done.
 */
export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const editing = useLocalSearchParams<{ edit?: string }>().edit === '1';
  const room = usePreferencesStore((s) => s.room);
  const saved = usePreferencesStore((s) => s.budget);
  const setBudget = usePreferencesStore((s) => s.setBudget);
  const anchor = budgetAnchor(room);
  const [index, setIndex] = useState(() => (editing ? budgetIndex(anchor, saved) : anchor.defaultIndex));
  const value = (i: number) => formatBudget(anchor.stops[i]);
  const first = anchor.stops[0];

  const finish = (withBudget: boolean) => {
    const answer = withBudget ? budgetAnswer(anchor, index) : null;
    setBudget(answer);
    if (editing) {
      router.back();
      return;
    }
    const tags = [room ? ROOM_LABEL[room] : null, answer ? value(index) : null].filter(Boolean).join('|');
    // For you opens on the room they picked.
    router.replace({ pathname: '/building', params: { next: '/', tags } });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg }]}>
      <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
      <View style={styles.header}>
        <AppText variant="eyebrow" color={colors.inkMuted}>
          {editing ? 'YOUR BUDGET' : 'STEP 3 OF 3'}
        </AppText>
        <AppText variant="hero" accessibilityRole="header">
          What do you usually spend on{' '}
          <AppText variant="hero" color={colors.accentText} style={styles.italic}>
            {anchor.noun}?
          </AppText>
        </AppText>
        <AppText variant="body" color={colors.inkMuted}>
          A rough number is fine. Pricier pieces still show up, just less often, and it adjusts as you swipe.
        </AppText>
      </View>

      <View style={styles.pick}>
        <AppText variant="price" style={styles.value} accessibilityLiveRegion="polite">
          {value(index)}
        </AppText>
        <PriceSlider
          count={anchor.stops.length}
          index={index}
          onChange={setIndex}
          label={`Budget for ${anchor.noun}`}
          valueText={value}
        />
        <View style={styles.ends}>
          <AppText variant="caption" color={colors.inkMuted}>
            ${first.toLocaleString('en-US')}
          </AppText>
          <AppText variant="caption" color={colors.inkMuted}>
            {formatBudget(NO_LIMIT)}
          </AppText>
        </View>
      </View>

      <View style={styles.footer}>
        <Button label={editing ? 'Save' : 'Build my feed'} size="lg" onPress={() => finish(true)} />
        <Button label="I'm flexible" variant="ghost" onPress={() => finish(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl, gap: space.xl },
  header: { gap: space.md },
  italic: { fontFamily: fonts.serifItalic },
  pick: { flex: 1, justifyContent: 'center', gap: space.lg },
  value: { textAlign: 'center' },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { gap: space.xs },
});
