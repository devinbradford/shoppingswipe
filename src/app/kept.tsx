import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Header } from '@/components/Header';
import { ListCard, NewListCard } from '@/components/ListCard';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { NameSheet } from '@/components/NameSheet';
import { ProductGridItem } from '@/components/ProductGridItem';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames, useSavedProducts } from '@/hooks/useCatalog';
import { useListCovers, useTransferFromKept, type TransferMode } from '@/hooks/useWishlists';
import { pluralize } from '@/lib/format';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

export default function KeptScreen() {
  const saved = useSavedProducts();
  const retailers = useRetailerNames();
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  const lists = useWishlistStore((s) => s.lists);
  const createList = useWishlistStore((s) => s.create);
  const transfer = useTransferFromKept();
  const products = useMemo(() => (saved.status === 'ready' ? (saved.data ?? []) : []), [saved.status, saved.data]);
  const covers = useListCovers();

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<TransferMode | null>(null);
  const [naming, setNaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const listsRow = (
    <View style={styles.listsBlock}>
      <AppText variant="heading" accessibilityRole="header">
        Lists
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.listsRow}>
        <NewListCard onPress={() => setNaming(true)} />
        {lists.map((l) => (
          <ListCard
            key={l.id}
            name={l.name}
            count={l.items.length}
            coverUrl={covers.get(l.id)}
            onPress={() => router.push({ pathname: '/lists/[id]', params: { id: l.id } })}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header
        onBack={() => router.back()}
        right={
          products.length > 0 ? (
            <Button
              label={selecting ? 'Done' : 'Select'}
              variant="ghost"
              onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
            />
          ) : null
        }
      />
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View>
              <AppText variant="hero" accessibilityRole="header">
                Kept
              </AppText>
              {products.length > 0 ? (
                <AppText variant="body" color={colors.inkMuted} style={styles.sub}>
                  {selecting ? 'Tap items to select them.' : pluralize(products.length, 'item')}
                </AppText>
              ) : null}
            </View>
            {notice ? (
              <View style={styles.notice} accessibilityLiveRegion="polite">
                <AppText variant="bodySmall" color={colors.keep}>
                  {notice}
                </AppText>
              </View>
            ) : null}
            {saved.status === 'ready' ? listsRow : null}
            {products.length > 0 ? (
              <AppText variant="heading" accessibilityRole="header">
                All kept
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <ProductGridItem
            index={index}
            product={item}
            retailerName={retailers.get(item.retailerId)}
            selected={selecting ? selected.has(item.id) : undefined}
            onPress={() =>
              selecting ? toggle(item.id) : router.push({ pathname: '/product/[id]', params: { id: item.id } })
            }
            onRemove={() => removeSaved(item.id)}
          />
        )}
        ListEmptyComponent={
          saved.status === 'loading' ? (
            <LoadingView label="Loading kept items" />
          ) : saved.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load your kept items"
              message="They're still saved. Try again in a moment."
              primary={{ label: 'Try again', onPress: saved.reload }}
            />
          ) : (
            <StateView
              icon="keep"
              title="Nothing kept yet"
              message="Swipe right on anything you like and it'll show up here."
              primary={{ label: 'Start swiping', onPress: () => router.dismissTo('/') }}
            />
          )
        }
      />

      {selecting ? (
        <View style={styles.selectBar}>
          <AppText variant="label" style={styles.selectCount}>
            {selected.size === 0 ? 'None selected' : `${selected.size} selected`}
          </AppText>
          <Button
            label="Copy to list"
            variant="secondary"
            disabled={selected.size === 0}
            onPress={() => setPicker('copy')}
          />
          <Button label="Move to list" disabled={selected.size === 0} onPress={() => setPicker('move')} />
        </View>
      ) : null}

      <ListPickerSheet
        visible={picker !== null}
        title={
          picker === 'move'
            ? `Move ${pluralize(selected.size, 'item')} to…`
            : `Copy ${pluralize(selected.size, 'item')} to…`
        }
        onClose={() => setPicker(null)}
        onPick={(listId) => {
          const ids = [...selected];
          const name = useWishlistStore.getState().lists.find((l) => l.id === listId)?.name ?? 'list';
          transfer(ids, listId, picker ?? 'copy');
          setNotice(`${picker === 'move' ? 'Moved' : 'Copied'} ${pluralize(ids.length, 'item')} to ${name}.`);
          stopSelecting();
        }}
      />
      <NameSheet
        visible={naming}
        title="New list"
        submitLabel="Create list"
        onClose={() => setNaming(false)}
        onSubmit={(name) => {
          const r = createList(name);
          return r.ok ? null : r.error;
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.xl, flexGrow: 1 },
  headerBlock: { gap: space.xl },
  sub: { marginTop: space.xs },
  notice: { backgroundColor: colors.keepSoft, borderRadius: 12, padding: space.md },
  listsBlock: { gap: space.md },
  listsRow: { gap: space.md, paddingRight: space.lg },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  selectCount: { flex: 1 },
});
