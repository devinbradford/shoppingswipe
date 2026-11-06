import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { DeckView } from '@/components/DeckView';
import { GlassIconButton, GlassPill } from '@/components/Glass';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useReminder, useWeekly } from '@/hooks/useRetention';
import { colors, space } from '@/theme/tokens';

/** "Your weekly 10": this week's best matches as a short deck of their own. */
export default function WeeklyScreen() {
  const weekly = useWeekly();
  const insets = useSafeAreaInsets();
  if (!weekly.ids) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.back}>
          <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
        </View>
        <LoadingView label="Choosing this week's 10" />
      </View>
    );
  }
  return <WeeklyDeck ids={weekly.ids} />;
}

function WeeklyDeck({ ids }: { ids: string[] }) {
  const deck = useDeck(undefined, undefined, ids);
  const retailers = useRetailerNames();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const reminder = useReminder();
  const left = deck.status === 'ready' ? deck.cards.length : null;
  const done = left === 0;
  // Same rule as everywhere: only offered after real use, and only once.
  const askReminder = done && reminder.offer;

  if (done) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.back}>
          <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
        </View>
        <StateView
          icon="sparkles"
          title="That's this week's 10"
          message={
            reminder.on
              ? "Your next 10 arrive Monday. We'll let you know."
              : reminder.blocked
                ? 'Your next 10 arrive Monday. Notifications are off for CureAvo in your phone settings.'
                : 'Your next 10 arrive Monday, chosen for how your taste has grown.'
          }
          primary={
            askReminder
              ? { label: 'Remind me on Mondays', onPress: () => void reminder.turnOn() }
              : { label: 'Back to For you', onPress: () => router.navigate('/') }
          }
          secondary={askReminder ? { label: 'Back to For you', onPress: () => router.navigate('/') } : undefined}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <DeckView
        deck={deck}
        retailers={retailers}
        reduceMotion={reduceMotion}
        bottomInset={insets.bottom}
        topBarHeight={space.lg + 60}
        keptTarget={undefined}
        empty={{
          title: "That's this week's 10",
          message: 'Your next 10 arrive Monday.',
          primary: { label: 'Back to For you', onPress: () => router.navigate('/') },
        }}
        topBar={
          <View style={[styles.topBar, { top: insets.top + space.lg }]} pointerEvents="box-none">
            <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
            <GlassPill>
              <AppText variant="eyebrow" color={colors.onPhoto} accessibilityRole="header">
                {`YOUR WEEKLY 10${left !== null ? ` · ${left} LEFT` : ''}`}
              </AppText>
            </GlassPill>
            <View style={styles.spacer} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: space.lg },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spacer: { width: 44 },
});
