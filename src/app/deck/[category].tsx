import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { GlassIconButton, GlassPill, GlassTextButton } from '@/components/Glass';
import { Header } from '@/components/Header';
import { LoadingView, StateView } from '@/components/StateView';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import {
  CATEGORY_IDS,
  SUBCATEGORY_IDS,
  type CategoryId,
  type SubcategoryId,
  type SwipeDirection,
} from '@/domain/types';
import { useCategorySummaries, useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { formatPrice } from '@/lib/format';
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
          primary={{ label: 'Back to discover', onPress: () => router.replace('/') }}
        />
      </SafeAreaView>
    );
  }
  return <Deck categoryId={category} subcategoryId={isSubcategoryId(type) ? type : undefined} />;
}

function Deck({ categoryId, subcategoryId }: { categoryId: CategoryId; subcategoryId?: SubcategoryId }) {
  const { summaries } = useCategorySummaries();
  const room = summaries.find((c) => c.id === categoryId);
  const label = (subcategoryId ? room?.subcategories.find((s) => s.id === subcategoryId)?.label : room?.label) ?? '';
  const deck = useDeck(categoryId, subcategoryId);
  const retailers = useRetailerNames();
  const keptCount = useSwipeStore((s) => s.saved.length);
  const deckRef = useRef<SwipeDeckHandle>(null);
  const reduceMotion = useReduceMotion();

  // Tell screen reader users what happened and what's next.
  const onSwipe = (direction: SwipeDirection) => {
    const [current, next] = deck.cards;
    deck.swipe(direction);
    if (!current) return;
    const what = `${direction === 'keep' ? 'Kept' : 'Skipped'} ${current.product.title}.`;
    const then = next
      ? ` Next: ${next.product.title}, ${formatPrice(next.product.priceCents, next.product.currency)}.`
      : ' That was the last one.';
    AccessibilityInfo.announceForAccessibility(what + then);
  };
  const onUndo = () => {
    deck.undo();
    AccessibilityInfo.announceForAccessibility('Undid last swipe.');
  };
  const empty = deck.status === 'ready' && deck.cards.length === 0;
  const showDeck = deck.status === 'ready' && !empty;
  const insets = useSafeAreaInsets();
  const barTop = insets.top + space.lg;
  const actionsBottom = insets.bottom + space.lg;
  // Room the price block needs above the buttons (button + caption + spacing).
  const infoBottom = actionsBottom + 66 + 22 + space.xxl;
  const eyebrow = label ? `${label.toUpperCase()}${showDeck ? ` · ${deck.cards.length} LEFT` : ''}` : '';

  return (
    <View style={styles.screen}>
      {showDeck ? (
        <SwipeDeck
          ref={deckRef}
          cards={deck.cards}
          retailerNames={retailers}
          onSwipe={onSwipe}
          reduceMotion={reduceMotion}
          pipsTop={insets.top + space.xs}
          infoBottom={infoBottom}
          hint={deck.coldStart ? 'Keep a few you like and the deck will learn' : null}
          onOpen={(p) => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
        />
      ) : (
        <View style={[styles.stateArea, { paddingTop: barTop + 60 }]}>
          {deck.status === 'loading' ? <LoadingView label="Loading products" /> : null}
          {deck.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load products"
              message="Something went wrong. Check your connection and try again."
              primary={{ label: 'Try again', onPress: deck.retry }}
            />
          ) : null}
          {empty ? (
            <StateView
              icon="check"
              title={label ? `You've seen everything in ${label.toLowerCase()}` : "You've seen everything here"}
              message="Try another category, or look back at what you kept."
              primary={{ label: 'View kept', onPress: () => router.push('/kept') }}
              secondary={{ label: 'Back to discover', onPress: () => router.back() }}
            />
          ) : null}
        </View>
      )}

      <View style={[styles.topBar, { top: barTop }]} pointerEvents="box-none">
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
          onPress={() => router.push('/kept')}
          hint="Opens the things you kept"
        />
      </View>

      {showDeck ? (
        <View style={[styles.actions, { bottom: actionsBottom }]} pointerEvents="box-none">
          <GlassIconButton
            icon="close"
            label="Skip"
            caption="SKIP"
            size={66}
            tone="strong"
            onPress={() => deckRef.current?.swipe('skip')}
          />
          <View style={styles.undo}>
            <GlassIconButton icon="undo" label="Undo last swipe" onPress={onUndo} disabled={!deck.canUndo} size={46} />
          </View>
          <GlassIconButton
            icon="keep"
            label="Keep"
            caption="KEEP"
            size={66}
            tone="accent"
            onPress={() => deckRef.current?.swipe('keep')}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stateArea: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.xxl,
  },
  undo: { paddingTop: 10 },
});
