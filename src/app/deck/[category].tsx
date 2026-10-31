import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button, IconButton } from '@/components/Button';
import { Header } from '@/components/Header';
import { LoadingView, StateView } from '@/components/StateView';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { CATEGORY_IDS, type CategoryId } from '@/domain/types';
import { useCategorySummaries, useRetailerNames } from '@/hooks/useCatalog';
import { useDeck } from '@/hooks/useDeck';
import { useSwipeStore } from '@/store/swipeStore';
import { colors, space } from '@/theme/tokens';

function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
}

export default function DeckScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  if (!isCategoryId(category)) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header onBack={() => router.back()} />
        <StateView
          icon="info"
          title="Category not found"
          primary={{ label: 'Back to discover', onPress: () => router.replace('/') }}
        />
      </SafeAreaView>
    );
  }
  return <Deck categoryId={category} />;
}

function Deck({ categoryId }: { categoryId: CategoryId }) {
  const { summaries } = useCategorySummaries();
  const label = summaries.find((c) => c.id === categoryId)?.label ?? '';
  const deck = useDeck(categoryId);
  const retailers = useRetailerNames();
  const keptCount = useSwipeStore((s) => s.saved.length);
  const deckRef = useRef<SwipeDeckHandle>(null);
  const empty = deck.status === 'ready' && deck.cards.length === 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header
        title={label}
        onBack={() => router.back()}
        right={
          <Button
            label={keptCount > 0 ? `Kept ${keptCount}` : 'Kept'}
            variant="ghost"
            onPress={() => router.push('/kept')}
            accessibilityHint="Opens the things you kept"
          />
        }
      />

      <View style={styles.deckArea}>
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
        {deck.status === 'ready' && !empty ? (
          <SwipeDeck
            ref={deckRef}
            cards={deck.cards}
            retailerNames={retailers}
            onSwipe={deck.swipe}
            onOpen={(p) => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
          />
        ) : null}
      </View>

      <View style={styles.footer}>
        {deck.status === 'ready' && deck.coldStart && !empty ? (
          <AppText variant="caption" color={colors.inkMuted} style={styles.hint}>
            Keep a few things you like and we&apos;ll start tailoring the deck.
          </AppText>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Skip"
            icon="close"
            variant="skip"
            size="lg"
            style={styles.action}
            disabled={deck.status !== 'ready' || empty}
            onPress={() => deckRef.current?.swipe('skip')}
          />
          <IconButton icon="undo" label="Undo last swipe" onPress={deck.undo} disabled={!deck.canUndo} />
          <Button
            label="Keep"
            icon="keep"
            variant="keep"
            size="lg"
            style={styles.action}
            disabled={deck.status !== 'ready' || empty}
            onPress={() => deckRef.current?.swipe('keep')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  deckArea: { flex: 1, marginHorizontal: space.lg, marginTop: space.xs },
  footer: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, gap: space.md },
  hint: { textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  action: { flex: 1 },
});
