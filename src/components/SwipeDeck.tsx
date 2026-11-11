import { Image } from 'expo-image';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import type { Product, SwipeDirection } from '@/domain/types';
import type { DeckLayout } from '@/lib/deckLayout';
import { SwipeCard, type SwipeCardApi } from './SwipeCard';

/** What the deck needs per card. Matches `DeckCard` from `useDeck`. */
export interface DeckCardData {
  product: Product;
  reasonText: string | null;
  forYou: string | null;
}

export interface SwipeDeckHandle {
  swipe: (direction: SwipeDirection) => void;
  /** Call just before undoing: that product's card flies back in from the side it left. */
  prepareReturn: (productId: string, direction: SwipeDirection) => void;
}

interface SwipeDeckProps {
  cards: readonly DeckCardData[];
  retailerNames: ReadonlyMap<string, string>;
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: (product: Product) => void;
  /** The shopper flipped to another photo of the top card. */
  onPhotoBrowse?: (product: Product) => void;
  reduceMotion?: boolean;
  /** Layout around the full-screen card: where the photo lines and price sit. */
  pipsTop?: number;
  /** Where the photo, details and buttons sit (from `deckLayout`). */
  layout: DeckLayout;
  /** Shown in the "For you" spot while the deck is still learning. */
  hint?: string | null;
  /** Written while dragging: -1 (Skip) → 1 (Keep). */
  drag?: SharedValue<number>;
  ref?: Ref<SwipeDeckHandle>;
}

/** Shows the top two cards; the one behind grows as the top is dragged away. */
export function SwipeDeck({
  cards,
  retailerNames,
  onSwipe,
  onOpen,
  onPhotoBrowse,
  reduceMotion,
  pipsTop,
  layout,
  hint,
  drag,
  ref,
}: SwipeDeckProps) {
  const [returning, setReturning] = useState<{ productId: string; direction: SwipeDirection } | null>(null);
  const progress = useSharedValue(0);
  const topApi = useRef<SwipeCardApi | null>(null);
  const busy = useRef(false);
  const topId = cards[0]?.product.id;

  useEffect(() => {
    busy.current = false;
  }, [topId]);

  useImperativeHandle(ref, () => ({
    swipe: (direction) => {
      if (busy.current || !topApi.current) return;
      busy.current = true;
      topApi.current.flyOut(direction);
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
            onSwiped={onSwipe}
            reduceMotion={reduceMotion}
            pipsTop={pipsTop}
            layout={layout}
            hint={hint}
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
  deck: { flex: 1 },
});
