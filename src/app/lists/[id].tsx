import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { Header } from '@/components/Header';
import { NameSheet } from '@/components/NameSheet';
import { GlassIconButton } from '@/components/Glass';
import { MasonryGrid } from '@/components/MasonryGrid';
import { PhotoTile } from '@/components/PhotoTile';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useWishlistProducts } from '@/hooks/useWishlists';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, fonts, space } from '@/theme/tokens';

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
      <View style={styles.topBar}>
        <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            {`LIST · ${(list?.items.length ?? 0) === 1 ? '1 PIECE' : `${list?.items.length ?? 0} PIECES`}`}
          </AppText>
          <AppText variant="hero" accessibilityRole="header" numberOfLines={2} style={styles.italic}>
            {list?.name ?? ''}
          </AppText>
          <View style={styles.actions}>
            <Chip label="Rename" onPress={() => setRenaming(true)} />
            <Chip label="Delete list" onPress={() => setConfirmDelete(true)} />
          </View>
        </View>
        {status === 'ready' && products.length > 0 ? (
          <MasonryGrid
            items={products}
            keyOf={(p) => p.id}
            renderItem={(item, height) => (
              <PhotoTile
                product={item}
                height={height}
                retailerName={retailers.get(item.retailerId)}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
                onRemove={() => list && removeItems(list.id, [item.id])}
                removeLabel={`Remove ${item.title} from ${list?.name ?? 'this list'}`}
              />
            )}
          />
        ) : (
          <View style={styles.empty}>
            {status === 'loading' ? (
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
            )}
          </View>
        )}
      </ScrollView>

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
  topBar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  content: { paddingBottom: space.xxxl, gap: space.xl, flexGrow: 1 },
  head: { gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md },
  italic: { fontFamily: fonts.serifItalic },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  empty: { flex: 1, minHeight: 360 },
});
