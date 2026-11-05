import { Redirect, router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { DeckView } from '@/components/DeckView';
import { GlassChip, GlassPill } from '@/components/Glass';
import type { RoomChoice } from '@/domain/budget';
import type { CategoryId } from '@/domain/types';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
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
  const showCount = deck.status === 'ready' && deck.cards.length > 0;
  const roomLabel = ROOMS.find((r) => r.id === room)?.label ?? 'All';

  return (
    <View style={styles.screen}>
      <DeckView
        deck={deck}
        retailers={retailers}
        reduceMotion={reduceMotion}
        bottomInset={tabBarHeight}
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
