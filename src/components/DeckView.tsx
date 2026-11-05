import { router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SwipeDirection } from '@/domain/types';
import type { useDeck } from '@/hooks/useDeck';
import { formatPrice } from '@/lib/format';
import { recordSignal } from '@/store/signalStore';
import { space } from '@/theme/tokens';
import { GlassIconButton } from './Glass';
import { QuestionPill } from './QuestionPill';
import { LoadingView, StateView, type StateAction } from './StateView';
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
}

/**
 * The full-screen swipe deck with its Skip / Undo / Keep buttons, question pill
 * and loading, error and empty states. Used by For you and the room decks.
 */
export function DeckView({ deck, retailers, reduceMotion, topBar, topBarHeight, bottomInset, empty }: DeckViewProps) {
  const deckRef = useRef<SwipeDeckHandle>(null);
  const insets = useSafeAreaInsets();

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

  const isEmpty = deck.status === 'ready' && deck.cards.length === 0;
  const showDeck = deck.status === 'ready' && !isEmpty;
  const actionsBottom = bottomInset + space.lg;
  // Room the price block needs above the buttons (button + caption + spacing).
  const infoBottom = actionsBottom + 66 + 22 + space.xxl;

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

      {showDeck && deck.question ? (
        // Floats over the bottom of the photo, just above the price and name, so nothing is covered.
        <View style={[styles.question, { bottom: infoBottom + QUESTION_ABOVE_INFO }]} pointerEvents="box-none">
          <QuestionPill
            question={deck.question}
            onAnswer={deck.answerQuestion}
            onDismiss={deck.dismissQuestion}
            reduceMotion={reduceMotion}
          />
        </View>
      ) : null}

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

/** The price, name and store line take about this much room above `infoBottom`. */
const QUESTION_ABOVE_INFO = 200;

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
  question: { position: 'absolute', left: 0, right: 0 },
});
