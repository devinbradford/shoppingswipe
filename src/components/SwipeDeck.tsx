import { Image } from 'expo-image';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { Product, SwipeDirection } from '@/domain/types';
import type { DeckLayout } from '@/lib/deckLayout';
import type { CardBadge } from '@/recommendation';
import { colors } from '@/theme/tokens';
import { SwipeCard, type SwipeCardApi } from './SwipeCard';

/** What the deck needs per card. Matches `DeckCard` from `useDeck`. */
export interface DeckCardData {
  product: Product;
  reasonText: string | null;
  forYou: string | null;
  badge: CardBadge;
}

export interface SwipeDeckHandle {
  swipe: (direction: SwipeDirection) => void;
  /**
   * Undo pressed: if a card is still on its way out, call it back (nothing was recorded yet)
   * and return true. Returns false when nothing is leaving, so the newest committed swipe
   * should be undone instead.
   */
  cancelPending: () => boolean;
  /** Call just before undoing: that product's card flies back in from the side it left. */
  prepareReturn: (productId: string, direction: SwipeDirection) => void;
}

interface SwipeDeckProps {
  cards: readonly DeckCardData[];
  retailerNames: ReadonlyMap<string, string>;
  /** A card finished leaving: commit this swipe for this product. */
  onSwipe: (direction: SwipeDirection, productId: string) => void;
  /** A card is on its way out (Undo can call it back), or not. */
  onPendingChange?: (pending: boolean) => void;
  onOpen: (product: Product) => void;
  /** The shopper flipped to another photo of the top card. */
  onPhotoBrowse?: (product: Product) => void;
  reduceMotion?: boolean;
  /** Layout around the full-screen card: where the photo lines and price sit. */
  pipsTop?: number;
  /** Where the photo, details and buttons sit (from `deckLayout`). */
  layout: DeckLayout;
  /** First-action hint for the top card (shoppers who skipped the rooms), or null. */
  firstActionHint?: string | null;
  /** Written while dragging: -1 (Skip) → 1 (Keep). */
  drag?: SharedValue<number>;
  ref?: Ref<SwipeDeckHandle>;
}

/** Shows the top two cards; the one behind grows as the top is dragged away. */
export function SwipeDeck({
  cards,
  retailerNames,
  onSwipe,
  onPendingChange,
  onOpen,
  onPhotoBrowse,
  reduceMotion,
  pipsTop,
  layout,
  firstActionHint = null,
  drag,
  ref,
}: SwipeDeckProps) {
  const [returning, setReturning] = useState<{ productId: string; direction: SwipeDirection } | null>(null);
  const progress = useSharedValue(0);
  const topApi = useRef<SwipeCardApi | null>(null);
  const busy = useRef(false);
  /** The card on its way out, until it lands (swipe committed) or Undo calls it back. */
  const pending = useRef<{ productId: string; flight: number } | null>(null);
  const topId = cards[0]?.product.id;

  const setPending = (next: { productId: string; flight: number } | null) => {
    const changed = (pending.current === null) !== (next === null);
    pending.current = next;
    if (changed) onPendingChange?.(next !== null);
  };

  useEffect(() => {
    busy.current = false;
  }, [topId]);

  // The deck was replaced (room switch, reload) while a card was leaving: that exit is void.
  useEffect(() => {
    const p = pending.current;
    if (p && !cards.some((c) => c.product.id === p.productId)) setPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // Leaving the screen with a card mid-exit: nothing is pending any more.
  useEffect(
    () => () => {
      if (pending.current) onPendingChange?.(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleLeave = (productId: string, _direction: SwipeDirection, flight: number) => {
    busy.current = true;
    setPending({ productId, flight });
  };

  /** Only the exit still pending is committed; one that Undo called back is turned down. */
  const handleSwiped = (direction: SwipeDirection, productId: string, flight: number) => {
    const p = pending.current;
    if (!p || p.productId !== productId || p.flight !== flight) return false;
    setPending(null);
    onSwipe(direction, productId);
    return true;
  };

  useImperativeHandle(ref, () => ({
    swipe: (direction) => {
      if (busy.current || pending.current || !topApi.current) return;
      busy.current = true;
      topApi.current.flyOut(direction);
    },
    cancelPending: () => {
      const p = pending.current;
      if (!p) return false;
      setPending(null);
      busy.current = false;
      if (topApi.current?.productId === p.productId) topApi.current.cancel();
      return true;
    },
    prepareReturn: (productId, direction) => setReturning({ productId, direction }),
  }));

  // Warm the image cache for the next few cards so they appear instantly.
  useEffect(() => {
    const upcoming = cards
      .slice(1, 5)
      .map((c) => c.product.imageUrls[0])
      .filter(Boolean);
    if (upcoming.length) Image.prefetch(upcoming).catch(() => {});
  }, [cards]);

  const visible = cards.slice(0, 2);

  return (
    <View style={styles.deck}>
      {[...visible].reverse().map((card) => {
        const isTop = card.product.id === topId;
        return (
          <SwipeCard
            key={card.product.id}
            card={card}
            isTop={isTop}
            progress={progress}
            drag={drag}
            enterFrom={returning?.productId === card.product.id ? returning.direction : undefined}
            retailerName={retailerNames.get(card.product.retailerId) ?? ''}
            onLeave={handleLeave}
            onSwiped={handleSwiped}
            reduceMotion={reduceMotion}
            pipsTop={pipsTop}
            layout={layout}
            firstActionHint={isTop ? firstActionHint : null}
            onOpen={() => onOpen(card.product)}
            onPhotoBrowse={onPhotoBrowse ? () => onPhotoBrowse(card.product) : undefined}
            registerApi={
              isTop
                ? (api) => {
                    topApi.current = api;
                  }
                : undefined
            }
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Dark stage behind the cards, so the card underneath (drawn slightly smaller) never
  // shows the page's cream colour at the edges while the top card is dragged.
  deck: { flex: 1, backgroundColor: colors.stage },
});
