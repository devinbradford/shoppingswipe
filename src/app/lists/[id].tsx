import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GlassIconButton } from '@/components/Glass';
import { Header } from '@/components/Header';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { MasonryGrid } from '@/components/MasonryGrid';
import { NameSheet } from '@/components/NameSheet';
import { PhotoTile } from '@/components/PhotoTile';
import { LoadingView, StateView } from '@/components/StateView';
import { UndoToast } from '@/components/UndoToast';
import { boardTotal, formatBoardTotal, shareListText } from '@/domain/board';
import type { Product } from '@/domain/types';
import { useBuyNow } from '@/hooks/useBuyNow';
import { useBoughtIds } from '@/hooks/usePurchasePrompt';
import { useRetailerNames } from '@/hooks/useCatalog';
import { useUndoToast } from '@/hooks/useUndoToast';
import { useWishlistProducts } from '@/hooks/useWishlists';
import { formatPrice } from '@/lib/format';
import { outboundUrl } from '@/lib/outboundLink';
import { recordSignal } from '@/store/signalStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, fonts, space } from '@/theme/tokens';

/** iOS can't open a sheet while another is still closing. */
const AFTER_SHEET_MS = Platform.OS === 'ios' ? 420 : 0;

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { list, products, status, reload } = useWishlistProducts(id);
  const retailers = useRetailerNames();
  const insets = useSafeAreaInsets();
  const rename = useWishlistStore((s) => s.rename);
  const remove = useWishlistStore((s) => s.remove);
  const removeItems = useWishlistStore((s) => s.removeItems);
  const addToList = useWishlistStore((s) => s.add);
  const { buy } = useBuyNow();
  const boughtIds = useBoughtIds();
  const toast = useUndoToast();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuFor, setMenuFor] = useState<Product | null>(null);
  const [copyFor, setCopyFor] = useState<Product | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

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

  const total = formatBoardTotal(boardTotal(products), formatPrice);

  const share = async () => {
    if (!list || products.length === 0) return;
    setShareError(null);
    const message = shareListText(list.name, products, {
      storeName: (p) => retailers.get(p.retailerId),
      linkFor: outboundUrl,
      formatPrice,
    });
    try {
      await Share.share({ title: list.name, message });
    } catch {
      setShareError("Couldn't open sharing on this device.");
    }
  };

  const removeFromList = (p: Product) => {
    if (!list) return;
    const listId = list.id;
    removeItems(listId, [p.id]);
    toast.show({ message: `Removed ${p.title}`, undo: () => addToList(listId, [p.id]) });
  };

  const error = shareError;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}>
        <View style={styles.head}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            LIST
          </AppText>
          <AppText variant="hero" accessibilityRole="header" numberOfLines={2} style={styles.italic}>
            {list?.name ?? ''}
          </AppText>
          {status === 'ready' ? (
            <AppText variant="bodySmall" color={colors.inkMuted}>
              {total}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            {products.length > 0 ? <Chip label="Share" onPress={() => void share()} /> : null}
            <Chip label="Rename" onPress={() => setRenaming(true)} />
            <Chip label="Delete list" onPress={() => setConfirmDelete(true)} />
          </View>
        </View>
        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <AppText variant="bodySmall" color={colors.skip}>
              {error}
            </AppText>
          </View>
        ) : null}
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
                onLongPress={() => setMenuFor(item)}
                tag={boughtIds.has(item.id) ? 'BOUGHT' : undefined}
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
                icon="list"
                title="Nothing here yet"
                message="Add pieces from Kept (press and hold one, or tap Select), or from any product page."
                primary={{ label: 'Go to kept', onPress: () => router.navigate('/kept') }}
              />
            )}
          </View>
        )}
      </ScrollView>

      {toast.toast ? (
        <UndoToast
          id={toast.toast.id}
          message={toast.toast.message}
          onUndo={toast.undo}
          onExpire={toast.expire}
          bottom={insets.bottom + space.lg}
        />
      ) : null}

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.title ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                {
                  label: 'Add to another list',
                  icon: 'list',
                  onPress: () => {
                    const p = menuFor;
                    setTimeout(() => setCopyFor(p), AFTER_SHEET_MS);
                  },
                },
                {
                  label: 'Buy now',
                  icon: 'external',
                  onPress: () => buy(menuFor),
                },
                {
                  label: 'Remove from this list',
                  icon: 'trash',
                  destructive: true,
                  onPress: () => removeFromList(menuFor),
                },
              ]
            : []
        }
      />
      <ListPickerSheet
        visible={copyFor !== null}
        title="Add to list"
        checkedIds={new Set(list ? [list.id] : [])}
        onClose={() => setCopyFor(null)}
        onPick={(listId) => {
          if (!copyFor) return;
          addToList(listId, [copyFor.id]);
          recordSignal(copyFor.id, 'list_add');
        }}
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
  topBar: { paddingHorizontal: space.lg, paddingTop: space.sm },
  content: { gap: space.xl, flexGrow: 1 },
  head: { gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md },
  italic: { fontFamily: fonts.serifItalic },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  error: { marginHorizontal: space.xl, backgroundColor: colors.skipSoft, borderRadius: 12, padding: space.md },
  empty: { flex: 1, minHeight: 360 },
});
