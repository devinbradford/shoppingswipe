import { router } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SwipeDirection } from '@/domain/types';
import type { useDeck } from '@/hooks/useDeck';
import { formatPrice } from '@/lib/format';
import { recordSignal } from '@/store/signalStore';
import { space } from '@/theme/tokens';
import { GlassIconButton } from './Glass';
import { KeepFlight } from './KeepFlight';
import { LoadingView, StateView, type StateAction } from './StateView';
import { deckLayout } from '@/lib/deckLayout';
import { SwipeDeck, type SwipeDeckHandle } from './SwipeDeck';

type Deck = ReturnType<typeof useDeck>;

interface DeckViewProps {
  deck: Deck;
  retailers: Map<string, string>;
  reduceMotion: boolean;
  /** Floats over the top of the photo (back button, label, chips…). */
  topBar: ReactNode;
  /** How far below the safe area the top bar reaches, so loading/empty states start under it. */
  topBarHeight: number;
  /** Space to leave at the bottom (the safe area, or the tab bar when there is one). */
  bottomInset: number;
  empty: { title: string; message: string; primary: StateAction; secondary?: StateAction };
  /** Where a kept piece's heart flies to (the Kept tab or button), in screen points. */
  keptTarget?: { x: number; y: number };
}

/**
 * The full-screen swipe deck with its Skip / Undo / Keep buttons
 * and loading, error and empty states. Used by For you and the room decks.
 */
export function DeckView({
  deck,
  retailers,
  reduceMotion,
  topBar,
  topBarHeight,
  bottomInset,
  empty,
  keptTarget,
}: DeckViewProps) {
  const deckRef = useRef<SwipeDeckHandle>(null);
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const drag = useSharedValue(0);
  // What was swiped, newest last, so Undo can fly the right card back from the right side.
  const history = useRef<{ productId: string; direction: SwipeDirection }[]>([]);
  const [flights, setFlights] = useState<number[]>([]);
  const land = useCallback((id: number) => setFlights((f) => f.filter((x) => x !== id)), []);

  // Tell screen reader users what happened and what's next.
  const onSwipe = (direction: SwipeDirection) => {
    const [current, next] = deck.cards;
    deck.swipe(direction);
    if (!current) return;
    history.current = [...history.current.slice(-19), { productId: current.product.id, direction }];
    if (direction === 'keep' && keptTarget && !reduceMotion) setFlights((f) => [...f, Date.now()]);
    const what = `${direction === 'keep' ? 'Kept' : 'Skipped'} ${current.product.title}.`;
    const then = next
      ? ` Next: ${next.product.title}, ${formatPrice(next.product.priceCents, next.product.currency)}.`
      : ' That was the last one.';
    AccessibilityInfo.announceForAccessibility(what + then);
  };
  const onUndo = () => {
    const last = history.current.at(-1);
    if (last && deck.canUndo) {
      history.current = history.current.slice(0, -1);
      deckRef.current?.prepareReturn(last.productId, last.direction);
    }
    deck.undo();
    AccessibilityInfo.announceForAccessibility('Undid last swipe.');
  };

  const isEmpty = deck.status === 'ready' && deck.cards.length === 0;
  const showDeck = deck.status === 'ready' && !isEmpty;
  // Photo, details and buttons: worked out from this screen, its safe areas and text size.
  const layout = deckLayout({ height, pipsTop: insets.top + space.xs, bottomInset, fontScale });
  const { actionsBottom } = layout;

  // The button you're dragging toward grows; the other one steps back.
  const keepButton = useAnimatedStyle(() => {
    const d = drag.get();
    return {
      opacity: interpolate(d, [-1, 0], [0.45, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 1], [1, 1.16], Extrapolation.CLAMP) }],
    };
  });
  const skipButton = useAnimatedStyle(() => {
    const d = drag.get();
    return {
      opacity: interpolate(d, [0, 1], [1, 0.45], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [-1, 0], [1.16, 1], Extrapolation.CLAMP) }],
    };
  });
  const undoButton = useAnimatedStyle(() => ({ opacity: 1 - 0.6 * Math.min(1, Math.abs(drag.get())) }));

  return (
    <View style={styles.screen}>
      {showDeck ? (
        <SwipeDeck
          ref={deckRef}
          cards={deck.cards}
          retailerNames={retailers}
          onSwipe={onSwipe}
          reduceMotion={reduceMotion}
          drag={drag}
          pipsTop={insets.top + space.xs}
          layout={layout}
          hint={deck.coldStart ? 'Keep a few you like and the deck will learn' : null}
          onOpen={(p) => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
          onPhotoBrowse={(p) => recordSignal(p.id, 'photo_browse')}
        />
      ) : (
        <View style={[styles.stateArea, { paddingTop: insets.top + topBarHeight, paddingBottom: bottomInset }]}>
          {deck.status === 'loading' ? <LoadingView label="Loading products" /> : null}
          {deck.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load products"
              message="Something went wrong. Check your connection and try again."
              primary={{ label: 'Try again', onPress: deck.retry }}
            />
          ) : null}
          {isEmpty ? <StateView icon="check" {...empty} /> : null}
        </View>
      )}

      {topBar}

      {showDeck ? (
        <View style={[styles.actions, { bottom: actionsBottom }]} pointerEvents="box-none">
          <Animated.View style={skipButton}>
            <GlassIconButton
              icon="close"
              label="Skip"
              caption="SKIP"
              size={66}
              tone="strong"
              onPress={() => deckRef.current?.swipe('skip')}
            />
          </Animated.View>
          <Animated.View style={[styles.undo, undoButton]}>
            <GlassIconButton
              icon="undo"
              label="Undo last swipe"
              caption="UNDO"
              onPress={onUndo}
              disabled={!deck.canUndo}
              size={46}
            />
          </Animated.View>
          <Animated.View style={keepButton}>
            <GlassIconButton
              icon="keep"
              label="Keep"
              caption="KEEP"
              size={66}
              tone="accent"
              onPress={() => deckRef.current?.swipe('keep')}
            />
          </Animated.View>
        </View>
      ) : null}

      {keptTarget
        ? flights.map((id) => (
            <KeepFlight key={id} id={id} from={{ x: width / 2, y: height * 0.42 }} to={keptTarget} onDone={land} />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stateArea: { flex: 1 },
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
