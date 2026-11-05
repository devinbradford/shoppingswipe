import { router, useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { GlassTextButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { ListCoverCard, NewListCard } from '@/components/ListCoverCard';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { MasonryGrid } from '@/components/MasonryGrid';
import { NameSheet } from '@/components/NameSheet';
import { PhotoTile } from '@/components/PhotoTile';
import { LoadingView, StateView } from '@/components/StateView';
import { UndoToast } from '@/components/UndoToast';
import { arrangeBoard, BOARD_SORTS, boardTotal, formatBoardTotal, roomCounts, type BoardSort } from '@/domain/board';
import { CATEGORY_IDS, type CategoryId, type Product } from '@/domain/types';
import { useBuyNow } from '@/hooks/useBuyNow';
import { useCategorySummaries, useRetailerNames, useSavedProducts } from '@/hooks/useCatalog';
import { useUndoToast } from '@/hooks/useUndoToast';
import { useListCovers, useTransferFromKept, type TransferMode } from '@/hooks/useWishlists';
import { formatPrice, pluralize } from '@/lib/format';
import { usePreferencesStore } from '@/store/preferencesStore';
import { recordSignal } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

/** iOS can't open a sheet while another is still closing. */
const AFTER_SHEET_MS = Platform.OS === 'ios' ? 420 : 0;

export default function KeptScreen() {
  const saved = useSavedProducts();
  const retailers = useRetailerNames();
  const { summaries } = useCategorySummaries();
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  const restoreSaved = useSwipeStore((s) => s.restoreSaved);
  const lists = useWishlistStore((s) => s.lists);
  const createList = useWishlistStore((s) => s.create);
  const addToList = useWishlistStore((s) => s.add);
  const covers = useListCovers(lists);
  const transfer = useTransferFromKept();
  const tabBarHeight = useBottomTabBarHeight();
  const markKeptSeen = usePreferencesStore((s) => s.markKeptSeen);
  const { buy, error: buyError } = useBuyNow();
  const toast = useUndoToast();
  // Clears the "new" badge on the tab, now and when leaving (things kept while here aren't "new").
  useFocusEffect(
    useCallback(() => {
      markKeptSeen();
      return markKeptSeen;
    }, [markKeptSeen]),
  );
  const products = useMemo(() => (saved.status === 'ready' ? (saved.data ?? []) : []), [saved.status, saved.data]);

  const [room, setRoom] = useState<CategoryId | null>(null);
  const [sort, setSort] = useState<BoardSort>('newest');
  const [sorting, setSorting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<TransferMode | null>(null);
  const [menuFor, setMenuFor] = useState<Product | null>(null);
  const [pickFor, setPickFor] = useState<Product | null>(null);
  const [naming, setNaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = roomCounts(products);
  // A room filter whose last piece was removed falls back to everything.
  const activeRoom = room && counts[room] ? room : null;
  const shown = arrangeBoard(products, { room: activeRoom, sort });
  const total = formatBoardTotal(boardTotal(shown), formatPrice);
  const roomLabel = (id: CategoryId) => summaries.find((s) => s.id === id)?.label ?? id;
  const sortLabel = BOARD_SORTS.find((s) => s.id === sort)?.label ?? 'Newest';

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

  const remove = (p: Product) => {
    const item = useSwipeStore.getState().saved.find((i) => i.productId === p.id);
    if (!item) return;
    removeSaved(p.id);
    toast.show({
      message: `Removed ${p.title}`,
      undo: () => restoreSaved(item),
      // Only an un-keep that sticks says something about taste.
      commit: () => recordSignal(p.id, 'unsave'),
    });
  };

  const listsRow = (
    <View style={styles.section}>
      <AppText variant="eyebrow" color={colors.inkMuted} style={styles.gutter} accessibilityRole="header">
        YOUR LISTS
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.covers}
        accessibilityLabel="Your lists">
        {lists.map((l) => (
          <ListCoverCard
            key={l.id}
            name={l.name}
            count={l.items.length}
            photos={covers.get(l.id) ?? []}
            onPress={() => router.push({ pathname: '/lists/[id]', params: { id: l.id } })}
          />
        ))}
        <NewListCard
          onPress={() => setNaming(true)}
          hint={lists.length === 0 ? 'Group pieces by room or project' : undefined}
        />
      </ScrollView>
    </View>
  );

  const filterRow = (
    <View style={styles.filterRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.flex}
        accessibilityLabel="Filter by room">
        <Chip label="All" selected={!activeRoom} onPress={() => setRoom(null)} />
        {CATEGORY_IDS.filter((id) => counts[id]).map((id) => (
          <Chip
            key={id}
            label={`${roomLabel(id)}  ${counts[id]}`}
            accessibilityLabel={`${roomLabel(id)}, ${pluralize(counts[id] ?? 0, 'piece')}`}
            selected={activeRoom === id}
            onPress={() => setRoom(activeRoom === id ? null : id)}
          />
        ))}
      </ScrollView>
      <Pressable
        onPress={() => setSorting(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${sortLabel}`}
        hitSlop={6}
        style={({ pressed }) => [styles.sort, pressed && styles.pressed]}>
        <Icon name="sort" size={16} color={sort === 'newest' ? colors.inkMuted : colors.keep} />
      </Pressable>
    </View>
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
        primary={{ label: 'Start swiping', onPress: () => router.navigate('/') }}
      />
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xxl }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <AppText variant="hero" accessibilityRole="header">
              Kept
            </AppText>
            {products.length > 0 ? (
              <AppText variant="bodySmall" color={colors.inkMuted} accessibilityLiveRegion="polite">
                {selecting ? 'Tap pieces to select them' : total}
              </AppText>
            ) : null}
          </View>
          {products.length > 0 ? (
            <GlassTextButton
              label={selecting ? 'Done' : 'Select'}
              onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
            />
          ) : null}
        </View>
        {notice || buyError ? (
          <View style={[styles.notice, buyError ? styles.noticeError : null]} accessibilityLiveRegion="polite">
            <AppText variant="bodySmall" color={buyError ? colors.skip : colors.keep}>
              {buyError ?? notice}
            </AppText>
          </View>
        ) : null}
        {saved.status === 'ready' && (products.length > 0 || lists.length > 0) ? listsRow : null}
        {products.length > 0 ? filterRow : null}
        {products.length > 0 ? (
          <MasonryGrid
            items={shown}
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
                onLongPress={() => setMenuFor(item)}
              />
            )}
          />
        ) : (
          <View style={styles.empty}>{empty}</View>
        )}
      </ScrollView>

      {selecting ? (
        <View style={[styles.selectBar, { paddingBottom: tabBarHeight + space.sm }]}>
          <AppText variant="label" style={styles.flex}>
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

      {toast.toast ? (
        <UndoToast
          id={toast.toast.id}
          message={toast.toast.message}
          onUndo={toast.undo}
          onExpire={toast.expire}
          bottom={tabBarHeight + space.md}
        />
      ) : null}

      <ActionSheet
        visible={sorting}
        title="Sort by"
        onClose={() => setSorting(false)}
        actions={BOARD_SORTS.map((s) => ({
          label: s.label,
          icon: 'sort',
          checked: s.id === sort,
          onPress: () => setSort(s.id),
        }))}
      />
      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.title ?? ''}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                {
                  label: 'Add to list',
                  icon: 'list',
                  onPress: () => {
                    const p = menuFor;
                    setTimeout(() => setPickFor(p), AFTER_SHEET_MS);
                  },
                },
                {
                  label: 'Buy now',
                  icon: 'external',
                  onPress: () => void buy(menuFor, retailers.get(menuFor.retailerId)),
                },
                { label: 'Remove from kept', icon: 'trash', destructive: true, onPress: () => remove(menuFor) },
              ]
            : []
        }
      />
      <ListPickerSheet
        visible={pickFor !== null}
        title="Add to list"
        checkedIds={new Set(lists.filter((l) => l.items.some((i) => i.productId === pickFor?.id)).map((l) => l.id))}
        onClose={() => setPickFor(null)}
        onPick={(listId) => {
          if (!pickFor) return;
          addToList(listId, [pickFor.id]);
          recordSignal(pickFor.id, 'list_add');
          const name = useWishlistStore.getState().lists.find((l) => l.id === listId)?.name ?? 'list';
          setNotice(`Added ${pickFor.title} to ${name}.`);
        }}
      />
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
  content: { gap: space.lg, flexGrow: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
  },
  titleText: { gap: 2, flexShrink: 1 },
  gutter: { paddingHorizontal: space.xl },
  notice: { marginHorizontal: space.xl, backgroundColor: colors.keepSoft, borderRadius: 12, padding: space.md },
  noticeError: { backgroundColor: colors.skipSoft },
  section: { gap: space.md },
  covers: { gap: space.md, paddingHorizontal: space.xl },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingRight: space.lg, gap: space.sm },
  chips: { gap: space.sm, paddingLeft: space.xl, paddingRight: space.sm, alignItems: 'center' },
  sort: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
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
});
