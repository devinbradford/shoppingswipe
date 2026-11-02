import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { GlassIconButton, GlassTextButton } from '@/components/Glass';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { NameSheet } from '@/components/NameSheet';
import { MasonryGrid } from '@/components/MasonryGrid';
import { PhotoTile } from '@/components/PhotoTile';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames, useSavedProducts } from '@/hooks/useCatalog';
import { useTransferFromKept, type TransferMode } from '@/hooks/useWishlists';
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.listsScroll}
      contentContainerStyle={styles.listsRow}
      accessibilityLabel="Your lists">
      <Chip
        label="All"
        selected
        onPress={() => {}}
        accessibilityLabel={`All kept, ${pluralize(products.length, 'item')}`}
      />
      {lists.map((l) => (
        <Chip
          key={l.id}
          label={`${l.name}  ${l.items.length}`}
          accessibilityLabel={`${l.name} list, ${pluralize(l.items.length, 'item')}`}
          onPress={() => router.push({ pathname: '/lists/[id]', params: { id: l.id } })}
        />
      ))}
      <Chip label="+ New list" accessibilityLabel="New list" onPress={() => setNaming(true)} />
    </ScrollView>
  );

  const empty =
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
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
        {products.length > 0 ? (
          <GlassTextButton
            label={selecting ? 'Done' : 'Select'}
            onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="hero" accessibilityRole="header">
            Kept
          </AppText>
          {products.length > 0 ? (
            <AppText variant="eyebrow" color={colors.inkMuted}>
              {selecting ? 'TAP TO SELECT' : `${products.length} ${products.length === 1 ? 'PIECE' : 'PIECES'}`}
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
          <MasonryGrid
            items={products}
            keyOf={(p) => p.id}
            renderItem={(item, height) => (
              <PhotoTile
                product={item}
                height={height}
                retailerName={retailers.get(item.retailerId)}
                selected={selecting ? selected.has(item.id) : undefined}
                onPress={() =>
                  selecting ? toggle(item.id) : router.push({ pathname: '/product/[id]', params: { id: item.id } })
                }
                onRemove={() => removeSaved(item.id)}
                removeLabel={`Remove ${item.title} from kept`}
              />
            )}
          />
        ) : (
          <View style={styles.empty}>{empty}</View>
        )}
      </ScrollView>

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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  content: { paddingBottom: space.xxxl, gap: space.lg, flexGrow: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  notice: { marginHorizontal: space.xl, backgroundColor: colors.keepSoft, borderRadius: 12, padding: space.md },
  listsScroll: { flexGrow: 0 },
  listsRow: { gap: space.sm, paddingHorizontal: space.xl, alignItems: 'center' },
  empty: { flex: 1, minHeight: 360 },
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
