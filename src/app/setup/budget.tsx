import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GlassIconButton } from '@/components/Glass';
import { PriceSlider } from '@/components/PriceSlider';
import {
  budgetAnchor,
  budgetAnswer,
  budgetFromDollars,
  budgetIndex,
  formatBudget,
  nearestIndex,
  NO_LIMIT,
  parseDollars,
  type RoomChoice,
} from '@/domain/budget';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space, type as typeScale } from '@/theme/tokens';

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
  // A typed amount that isn't one of the slider's stops (e.g. $1,850).
  const savedDollars = saved && saved.subcategoryId === anchor.subcategoryId ? saved.maxCents / 100 : null;
  const savedIsStop = savedDollars !== null && anchor.stops.includes(savedDollars);
  const [custom, setCustom] = useState<number | null>(editing && savedDollars && !savedIsStop ? savedDollars : null);
  const [index, setIndex] = useState(() =>
    editing
      ? savedDollars && !savedIsStop
        ? nearestIndex(anchor, savedDollars)
        : budgetIndex(anchor, saved)
      : anchor.defaultIndex,
  );
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [typeError, setTypeError] = useState<string | null>(null);
  const value = (i: number) => formatBudget(anchor.stops[i]);
  const shown = custom !== null ? formatBudget(custom) : value(index);

  const slide = (i: number) => {
    setCustom(null);
    setIndex(i);
  };
  const submitTyped = () => {
    const dollars = parseDollars(draft);
    if (dollars === null) {
      setTypeError('Type an amount like 2000 or $1,800.');
      return;
    }
    setTypeError(null);
    setTyping(false);
    setCustom(anchor.stops.includes(dollars) ? null : dollars);
    setIndex(nearestIndex(anchor, dollars));
  };
  const first = anchor.stops[0];

  const finish = (withBudget: boolean) => {
    const answer = !withBudget
      ? null
      : custom !== null
        ? budgetFromDollars(anchor, custom)
        : budgetAnswer(anchor, index);
    setBudget(answer);
    if (editing) {
      router.back();
      return;
    }
    const tags = [room ? ROOM_LABEL[room] : null, answer ? shown : null].filter(Boolean).join('|');
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
        {typing ? (
          <View style={styles.typeRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submitTyped}
              onBlur={() => draft.trim() && submitTyped()}
              placeholder="e.g. 2000"
              placeholderTextColor={colors.inkSubtle}
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus
              accessibilityLabel={`Type your budget for ${anchor.noun}, in dollars`}
              style={styles.input}
            />
            <Button label="Done" variant="secondary" onPress={submitTyped} />
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setDraft('');
              setTyping(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Budget ${shown}. Tap to type an amount`}
            accessibilityLiveRegion="polite"
            style={styles.valueTap}>
            <AppText variant="price" style={styles.value}>
              {shown}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted} style={styles.value}>
              Tap to type an exact amount
            </AppText>
          </Pressable>
        )}
        {typeError ? (
          <AppText variant="caption" color={colors.danger} style={styles.value} accessibilityLiveRegion="assertive">
            {typeError}
          </AppText>
        ) : null}
        <PriceSlider
          count={anchor.stops.length}
          index={index}
          onChange={slide}
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
  valueTap: { gap: space.xs },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    color: colors.ink,
    ...typeScale.heading,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: { gap: space.xs },
});
