import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Header } from '@/components/Header';
import { NameSheet } from '@/components/NameSheet';
import { ProductGridItem } from '@/components/ProductGridItem';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useWishlistProducts } from '@/hooks/useWishlists';
import { pluralize } from '@/lib/format';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { list, products, status, reload } = useWishlistProducts(id);
  const retailers = useRetailerNames();
  const rename = useWishlistStore((s) => s.rename);
  const remove = useWishlistStore((s) => s.remove);
  const removeItems = useWishlistStore((s) => s.removeItems);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (status !== 'loading' && !list) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header onBack={() => router.back()} />
        <StateView
          icon="info"
          title="List not found"
          message="It may have been deleted."
          primary={{ label: 'Back to kept', onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <FlatList
        data={status === 'ready' ? products : []}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.head}>
            <AppText variant="hero" accessibilityRole="header" numberOfLines={2}>
              {list?.name ?? ''}
            </AppText>
            <AppText variant="body" color={colors.inkMuted}>
              {pluralize(list?.items.length ?? 0, 'item')}
            </AppText>
            <View style={styles.actions}>
              <Button label="Rename" variant="secondary" onPress={() => setRenaming(true)} />
              <Button label="Delete list" variant="ghost" onPress={() => setConfirmDelete(true)} />
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <ProductGridItem
            index={index}
            product={item}
            retailerName={retailers.get(item.retailerId)}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
            onRemove={() => list && removeItems(list.id, [item.id])}
            removeLabel={`Remove ${item.title} from ${list?.name ?? 'this list'}`}
          />
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingView label="Loading list" />
          ) : status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load this list"
              message="Your items are still saved. Try again in a moment."
              primary={{ label: 'Try again', onPress: reload }}
            />
          ) : (
            <StateView
              icon="keep"
              title="This list is empty"
              message="Go to Kept, tap Select, and copy or move items here."
              primary={{ label: 'Go to kept', onPress: () => router.back() }}
            />
          )
        }
      />

      <NameSheet
        visible={renaming}
        title="Rename list"
        submitLabel="Save name"
        initialName={list?.name}
        onClose={() => setRenaming(false)}
        onSubmit={(name) => {
          if (!list) return null;
          const r = rename(list.id, name);
          return r.ok ? null : r.error;
        }}
      />
      <ConfirmSheet
        visible={confirmDelete}
        title={`Delete "${list?.name ?? ''}"?`}
        message="The list goes away. Items stay in Kept if they're still there."
        confirmLabel="Delete list"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!list) return;
          remove(list.id);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.xl, flexGrow: 1 },
  head: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
