import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { DeckView } from '@/components/DeckView';
import { GlassIconButton, GlassPill, GlassTextButton } from '@/components/Glass';
import { Header } from '@/components/Header';
import { StateView } from '@/components/StateView';
import { CATEGORY_IDS, SUBCATEGORY_IDS, type CategoryId, type SubcategoryId } from '@/domain/types';
import { useCategorySummaries, useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { useSwipeStore } from '@/store/swipeStore';
import { colors, space } from '@/theme/tokens';

function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
}

function isSubcategoryId(v: unknown): v is SubcategoryId {
  return typeof v === 'string' && (SUBCATEGORY_IDS as readonly string[]).includes(v);
}

export default function DeckScreen() {
  // /deck/living-room swipes the whole room; /deck/living-room?type=sofas just sofas.
  const { category, type } = useLocalSearchParams<{ category: string; type?: string }>();
  if (!isCategoryId(category) || (type !== undefined && !isSubcategoryId(type))) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header onBack={() => router.back()} />
        <StateView
          icon="info"
          title="Not found"
          primary={{ label: 'Back to discover', onPress: () => router.replace('/discover') }}
        />
      </SafeAreaView>
    );
  }
  return <Deck categoryId={category} subcategoryId={isSubcategoryId(type) ? type : undefined} />;
}

/** A single room (or product type), full screen with the tab bar hidden. */
function Deck({ categoryId, subcategoryId }: { categoryId: CategoryId; subcategoryId?: SubcategoryId }) {
  const { summaries } = useCategorySummaries();
  const room = summaries.find((c) => c.id === categoryId);
  const label = (subcategoryId ? room?.subcategories.find((s) => s.id === subcategoryId)?.label : room?.label) ?? '';
  const deck = useDeck(categoryId, subcategoryId);
  const retailers = useRetailerNames();
  const keptCount = useSwipeStore((s) => s.saved.length);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const showCount = deck.status === 'ready' && deck.cards.length > 0;
  const eyebrow = label ? `${label.toUpperCase()}${showCount ? ` · ${deck.cards.length} LEFT` : ''}` : '';

  return (
    <View style={styles.screen}>
      <DeckView
        deck={deck}
        retailers={retailers}
        reduceMotion={reduceMotion}
        bottomInset={insets.bottom}
        topBarHeight={space.lg + 60}
        empty={{
          title: label ? `You've seen everything in ${label.toLowerCase()}` : "You've seen everything here",
          message: 'Try another room, or look back at what you kept.',
          primary: { label: 'View kept', onPress: () => router.navigate('/kept') },
          secondary: { label: 'Back to discover', onPress: () => router.back() },
        }}
        topBar={
          <View style={[styles.topBar, { top: insets.top + space.lg }]} pointerEvents="box-none">
            <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
            {eyebrow ? (
              <GlassPill>
                <AppText variant="eyebrow" color={colors.onPhoto} accessibilityRole="header">
                  {eyebrow}
                </AppText>
              </GlassPill>
            ) : (
              <View />
            )}
            <GlassTextButton
              label={keptCount > 0 ? `Kept ${keptCount}` : 'Kept'}
              onPress={() => router.navigate('/kept')}
              hint="Opens the things you kept"
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
