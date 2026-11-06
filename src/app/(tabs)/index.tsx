import { Redirect, router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckView } from '@/components/DeckView';
import { DeckSwitcher, type SwitcherOption } from '@/components/DeckSwitcher';
import { WelcomeBackCard } from '@/components/Banners';
import type { RoomChoice } from '@/domain/budget';
import type { CategoryId } from '@/domain/types';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useWeekly } from '@/hooks/useRetention';
import { sinceLabel } from '@/domain/retention';
import { useRetentionStore } from '@/store/retentionStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { colors, space } from '@/theme/tokens';

const ROOMS: { id: CategoryId | null; label: string }[] = [
  { id: null, label: 'All rooms' },
  { id: 'living-room', label: 'Living room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen-dining', label: 'Kitchen & dining' },
];

/** Swipes before "What we've learned" gets its new dot. */
const REVEAL_AFTER = 30;
/** How long the welcome-back note stays. */
const WELCOME_MS = 6000;

const toRoom = (choice: RoomChoice | null): CategoryId | null => (choice && choice !== 'browsing' ? choice : null);

/** Home tab: one personalized deck across every room; the pill at the top switches rooms. */
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
  const roomLabel = ROOMS.find((r) => r.id === room)?.label ?? 'All rooms';
  const swipeCount = useSwipeStore((s) => s.swipes.length);
  const revealSeen = usePreferencesStore((s) => s.tasteRevealSeen);
  const markRevealSeen = usePreferencesStore((s) => s.markTasteRevealSeen);
  const welcome = useRetentionStore((s) => s.welcome);
  const dismissWelcome = useRetentionStore((s) => s.dismissWelcome);
  const weekly = useWeekly();
  // "Picked for you": cards with a taste reason, or simply what's lined up next.
  const picked = deck.cards.filter((c) => c.forYou).length || deck.cards.length;
  const showWelcome = !!welcome && deck.cards.length > 0;

  // The welcome-back note fades on its own; nothing waits on it.
  useEffect(() => {
    if (!showWelcome) return;
    const t = setTimeout(dismissWelcome, WELCOME_MS);
    return () => clearTimeout(t);
  }, [showWelcome, dismissWelcome]);

  const extras: SwitcherOption[] = [];
  if (weekly.ids && weekly.remaining > 0) {
    extras.push({
      id: 'weekly',
      icon: 'sparkles',
      label: 'Your weekly 10',
      detail: `${weekly.label} · ${weekly.remaining} left`,
      isNew: weekly.isNew,
      onPress: () => router.push('/weekly'),
    });
  }
  if (swipeCount >= 10) {
    extras.push({
      id: 'taste',
      icon: 'heart',
      label: "What we've learned",
      detail: 'Your taste, in plain words',
      isNew: !revealSeen && swipeCount >= REVEAL_AFTER,
      onPress: () => {
        markRevealSeen();
        router.push('/taste');
      },
    });
  }

  const top = insets.top + space.lg;

  return (
    <View style={styles.screen}>
      <DeckView
        deck={deck}
        retailers={retailers}
        reduceMotion={reduceMotion}
        bottomInset={tabBarHeight}
        keptTarget={keptTab}
        topBarHeight={space.lg + 60}
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
          <>
            <DeckSwitcher
              title="FOR YOU"
              current={roomLabel}
              top={top}
              reduceMotion={reduceMotion}
              rooms={ROOMS.map((r) => ({
                id: r.id ?? 'all',
                label: r.label,
                selected: r.id === room,
                onPress: () => setRoom(r.id),
              }))}
              extras={extras}
            />
            {showWelcome && welcome ? (
              <View style={[styles.welcome, { top: top + 56 }]} pointerEvents="box-none">
                <WelcomeBackCard
                  subtitle={`${picked >= 30 ? '30+' : picked} ${picked === 1 ? 'piece' : 'pieces'} picked for you ${sinceLabel(welcome.since, welcome.at)}`}
                  photos={deck.cards.slice(0, 3).map((c) => c.product.imageUrls[0])}
                  onPress={dismissWelcome}
                  onClose={dismissWelcome}
                  reduceMotion={reduceMotion}
                />
              </View>
            ) : null}
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  welcome: { position: 'absolute', left: 0, right: 0 },
});
