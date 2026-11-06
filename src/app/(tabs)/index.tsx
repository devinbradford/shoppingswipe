import { Redirect, router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { DeckView } from '@/components/DeckView';
import { GlassChip, GlassPill } from '@/components/Glass';
import { BannerPill, ReminderOfferCard, WelcomeBackCard } from '@/components/Banners';
import { TasteRevealPill } from '@/components/TasteRevealPill';
import type { RoomChoice } from '@/domain/budget';
import type { CategoryId } from '@/domain/types';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useReminder, useWeekly } from '@/hooks/useRetention';
import { sinceLabel } from '@/domain/retention';
import { useRetentionStore } from '@/store/retentionStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { colors, space } from '@/theme/tokens';

const ROOMS: { id: CategoryId | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'living-room', label: 'Living room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen-dining', label: 'Kitchen & dining' },
];

/** Swipes before the one-time "Your taste is taking shape" moment. */
const REVEAL_AFTER = 30;

const toRoom = (choice: RoomChoice | null): CategoryId | null => (choice && choice !== 'browsing' ? choice : null);

/** Home tab: one personalized deck across every room, narrowed with the room chips. */
export default function ForYouScreen() {
  const hydrated = useHydrated();
  const onboarded = usePreferencesStore((s) => s.onboarded);
  const introSeen = usePreferencesStore((s) => s.introSeen);
  const savedRoom = usePreferencesStore((s) => s.room);
  const hasSwipes = useSwipeStore((s) => s.swipes.length > 0);

  // First launch: send new shoppers through onboarding.
  if (!hydrated) return <View style={styles.screen} />;
  if (!onboarded && !hasSwipes) return <Redirect href={introSeen ? '/welcome' : '/intro'} />;

  // Starts on the room they're shopping for; changing it in Profile starts afresh.
  return <ForYou key={savedRoom ?? 'all'} initialRoom={toRoom(savedRoom)} />;
}

function ForYou({ initialRoom }: { initialRoom: CategoryId | null }) {
  const [room, setRoom] = useState<CategoryId | null>(initialRoom);
  const deck = useDeck(room ?? undefined);
  const retailers = useRetailerNames();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width, height } = useWindowDimensions();
  // Kept is the third of four equal tabs; its icon sits about 20pt below the bar's top edge.
  const keptTab = { x: width * 0.625, y: height - tabBarHeight + 20 };
  const showCount = deck.status === 'ready' && deck.cards.length > 0;
  const roomLabel = ROOMS.find((r) => r.id === room)?.label ?? 'All';
  const swipeCount = useSwipeStore((s) => s.swipes.length);
  const revealSeen = usePreferencesStore((s) => s.tasteRevealSeen);
  const markRevealSeen = usePreferencesStore((s) => s.markTasteRevealSeen);
  const showReveal = !revealSeen && swipeCount >= REVEAL_AFTER;
  const welcome = useRetentionStore((s) => s.welcome);
  const dismissWelcome = useRetentionStore((s) => s.dismissWelcome);
  const weekly = useWeekly();
  const reminder = useReminder();
  const [weeklyClosed, setWeeklyClosed] = useState(false);
  // "Picked for you": cards with a taste reason, or simply what's lined up next.
  const picked = deck.cards.filter((c) => c.forYou).length || deck.cards.length;

  // One banner at a time, most timely first.
  const banner =
    welcome && deck.cards.length > 0 ? (
      <WelcomeBackCard
        subtitle={`${picked >= 30 ? '30+' : picked} ${picked === 1 ? 'piece' : 'pieces'} picked for you ${sinceLabel(welcome.since, welcome.at)}`}
        photos={deck.cards.slice(0, 3).map((c) => c.product.imageUrls[0])}
        onPress={dismissWelcome}
        onClose={dismissWelcome}
        reduceMotion={reduceMotion}
      />
    ) : showReveal ? (
      <TasteRevealPill
        reduceMotion={reduceMotion}
        onClose={markRevealSeen}
        onOpen={() => {
          markRevealSeen();
          router.push('/taste');
        }}
      />
    ) : reminder.offer && weekly.ids ? (
      <ReminderOfferCard
        onYes={() => void reminder.turnOn()}
        onNo={reminder.decline}
        busy={reminder.busy}
        reduceMotion={reduceMotion}
      />
    ) : weekly.ids && weekly.remaining > 0 && !weeklyClosed ? (
      <BannerPill
        icon="sparkles"
        title="Your weekly 10"
        subtitle={`${weekly.label} · ${weekly.remaining} left`}
        onPress={() => router.push('/weekly')}
        onClose={() => setWeeklyClosed(true)}
        reduceMotion={reduceMotion}
      />
    ) : null;

  return (
    <View style={styles.screen}>
      <DeckView
        deck={deck}
        retailers={retailers}
        reduceMotion={reduceMotion}
        bottomInset={tabBarHeight}
        keptTarget={keptTab}
        topBarHeight={space.lg + 110}
        empty={{
          title: room ? `You've seen everything in ${roomLabel.toLowerCase()}` : "You've seen everything for now",
          message: room
            ? 'Try another room, or look back at what you kept.'
            : 'Look back at what you kept, or search Discover.',
          primary: { label: 'View kept', onPress: () => router.navigate('/kept') },
          secondary: room
            ? { label: 'Show all rooms', onPress: () => setRoom(null) }
            : { label: 'Go to discover', onPress: () => router.navigate('/discover') },
        }}
        topBar={
          <View style={[styles.top, { top: insets.top + space.lg }]} pointerEvents="box-none">
            <View style={styles.titleRow} pointerEvents="box-none">
              <GlassPill>
                <AppText variant="eyebrow" color={colors.onPhoto} accessibilityRole="header">
                  {`FOR YOU${showCount ? ` · ${deck.cards.length} LEFT` : ''}`}
                </AppText>
              </GlassPill>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              accessibilityRole="radiogroup"
              accessibilityLabel="Room">
              {ROOMS.map((r) => (
                <GlassChip key={r.label} label={r.label} selected={r.id === room} onPress={() => setRoom(r.id)} />
              ))}
            </ScrollView>
            {banner}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', left: 0, right: 0, gap: space.sm },
  titleRow: { flexDirection: 'row', justifyContent: 'center' },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
});
