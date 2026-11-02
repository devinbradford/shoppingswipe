import { Image } from 'expo-image';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { Product, SwipeDirection } from '@/domain/types';
import { SwipeCard, type SwipeCardApi } from './SwipeCard';

/** What the deck needs per card. Matches `DeckCard` from `useDeck`. */
export interface DeckCardData {
  product: Product;
  reasonText: string | null;
  forYou: string | null;
}

export interface SwipeDeckHandle {
  swipe: (direction: SwipeDirection) => void;
}

interface SwipeDeckProps {
  cards: readonly DeckCardData[];
  retailerNames: ReadonlyMap<string, string>;
  onSwipe: (direction: SwipeDirection) => void;
  onOpen: (product: Product) => void;
  reduceMotion?: boolean;
  /** Layout around the full-screen card: where the photo lines and price sit. */
  pipsTop?: number;
  infoBottom?: number;
  /** Shown in the "For you" spot while the deck is still learning. */
  hint?: string | null;
  ref?: Ref<SwipeDeckHandle>;
}

/** Shows the top two cards; the one behind grows as the top is dragged away. */
export function SwipeDeck({
  cards,
  retailerNames,
  onSwipe,
  onOpen,
  reduceMotion,
  pipsTop,
  infoBottom,
  hint,
  ref,
}: SwipeDeckProps) {
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
            retailerName={retailerNames.get(card.product.retailerId) ?? ''}
            onSwiped={onSwipe}
            reduceMotion={reduceMotion}
            pipsTop={pipsTop}
            infoBottom={infoBottom}
            hint={hint}
            onOpen={() => onOpen(card.product)}
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
