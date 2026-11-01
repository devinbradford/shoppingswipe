import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryTile } from '@/components/CategoryTile';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FilterSheet } from '@/components/FilterSheet';
import { ProductGridItem } from '@/components/ProductGridItem';
import { SearchField } from '@/components/SearchField';
import { LoadingView, StateView } from '@/components/StateView';
import { countActiveFilters, EMPTY_FILTERS, type SearchFilters } from '@/domain/filters';
import type { CategorySummary, Product } from '@/domain/types';
import { useCategorySummaries, useFilterOptions, useProductSearch, useRetailerNames } from '@/hooks/useCatalog';
import { formatPrice, pluralize } from '@/lib/format';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

type Row =
  | { kind: 'category'; category: CategorySummary & { coverUrl?: string } }
  | { kind: 'product'; product: Product };

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const keptCount = useSwipeStore((s) => s.saved.length);
  const categories = useCategorySummaries();
  const search = useProductSearch(query, filters);
  const options = useFilterOptions(query);
  const retailers = useRetailerNames();
  const activeFilters = countActiveFilters(filters);
  const searching = query.trim().length > 0 || activeFilters > 0;

  // One list for both modes, so the search box is never rebuilt (and the keyboard stays up).
  const rows: Row[] = searching
    ? search.status === 'ready'
      ? search.data.map((product) => ({ kind: 'product', product }))
      : []
    : categories.summaries.map((category) => ({ kind: 'category', category }));

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="hero" accessibilityRole="header">
          Discover
        </AppText>
        <Button
          label={keptCount > 0 ? `Kept ${keptCount}` : 'Kept'}
          variant="secondary"
          icon="keep"
          onPress={() => router.push('/kept')}
          accessibilityHint="Opens the things you kept"
        />
      </View>
      <AppText variant="body" color={colors.inkMuted}>
        Pick a category and swipe. Right to keep, left to skip.
      </AppText>
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        <Button
          label={activeFilters > 0 ? `Filters ${activeFilters}` : 'Filters'}
          variant={activeFilters > 0 ? 'primary' : 'secondary'}
          onPress={() => setShowFilters(true)}
          accessibilityHint="Filter by category, price and store"
        />
      </View>
      {activeFilters > 0 ? <ActiveFilters filters={filters} onChange={setFilters} options={options} /> : null}
      {searching && search.status === 'ready' && rows.length > 0 ? (
        <AppText variant="bodySmall" color={colors.inkMuted} accessibilityLiveRegion="polite">
          {pluralize(rows.length, 'result')}
        </AppText>
      ) : null}
    </View>
  );

  const empty = searching ? (
    search.status === 'error' ? (
      <StateView
        icon="refresh"
        title="Search didn't work"
        message="Something went wrong. Try again."
        primary={{ label: 'Try again', onPress: search.reload }}
      />
    ) : search.status === 'loading' || search.pending ? (
      <LoadingView label="Searching" />
    ) : (
      <StateView
        icon="search"
        title="No matches"
        message={
          activeFilters > 0
            ? 'Nothing matches these filters. Try loosening them.'
            : `Nothing found for "${search.query}". Try a brand, color or style.`
        }
        primary={activeFilters > 0 ? { label: 'Clear filters', onPress: () => setFilters(EMPTY_FILTERS) } : undefined}
      />
    )
  ) : categories.status === 'error' ? (
    <StateView
      icon="refresh"
      title="Couldn't load categories"
      message="Something went wrong on our side."
      primary={{ label: 'Try again', onPress: categories.reload }}
    />
  ) : (
    <LoadingView label="Loading categories" />
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'category' ? `c:${r.category.id}` : `p:${r.product.id}`)}
        numColumns={2}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) =>
          item.kind === 'category' ? (
            <View style={[styles.cell, index % 2 === 0 ? styles.left : styles.right]}>
              <CategoryTile
                label={item.category.label}
                remaining={item.category.remainingCount}
                coverUrl={item.category.coverUrl}
                onPress={() => router.push({ pathname: '/deck/[category]', params: { category: item.category.id } })}
              />
            </View>
          ) : (
            <ProductGridItem
              index={index}
              product={item.product}
              retailerName={retailers.get(item.product.retailerId)}
              onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.product.id } })}
            />
          )
        }
        ListEmptyComponent={empty}
        ListFooterComponent={searching ? undefined : <ResetLink />}
      />
      <FilterSheet
        visible={showFilters}
        value={filters}
        categories={options.categories}
        retailers={options.retailers}
        countFor={options.countFor}
        onApply={setFilters}
        onClose={() => setShowFilters(false)}
      />
    </SafeAreaView>
  );
}

/** Removable chips for each active filter group. */
function ActiveFilters({
  filters,
  onChange,
  options,
}: {
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  options: ReturnType<typeof useFilterOptions>;
}) {
  const names = (ids: string[], all: { id: string; label?: string; name?: string }[]) =>
    ids
      .map((id) => all.find((x) => x.id === id))
      .map((x) => x?.label ?? x?.name ?? '')
      .join(', ');
  const { minPriceCents: min, maxPriceCents: max } = filters;
  const price =
    min !== null && max !== null
      ? `${formatPrice(min)}–${formatPrice(max)}`
      : min !== null
        ? `${formatPrice(min)}+`
        : max !== null
          ? `Up to ${formatPrice(max)}`
          : null;
  return (
    <View style={styles.chips}>
      {filters.categoryIds.length > 0 ? (
        <Chip
          label={names(filters.categoryIds, options.categories)}
          selected
          removable
          accessibilityLabel={`Remove category filter: ${names(filters.categoryIds, options.categories)}`}
          onPress={() => onChange({ ...filters, categoryIds: [] })}
        />
      ) : null}
      {price ? (
        <Chip
          label={price}
          selected
          removable
          accessibilityLabel={`Remove price filter: ${price}`}
          onPress={() => onChange({ ...filters, minPriceCents: null, maxPriceCents: null })}
        />
      ) : null}
      {filters.retailerIds.length > 0 ? (
        <Chip
          label={names(filters.retailerIds, options.retailers)}
          selected
          removable
          accessibilityLabel={`Remove store filter: ${names(filters.retailerIds, options.retailers)}`}
          onPress={() => onChange({ ...filters, retailerIds: [] })}
        />
      ) : null}
    </View>
  );
}

/** Small reset so the sample deck can be replayed. */
function ResetLink() {
  const resetSwipes = useSwipeStore((s) => s.resetAll);
  const resetLists = useWishlistStore((s) => s.resetAll);
  const hasHistory = useSwipeStore((s) => s.swipes.length > 0);
  const [confirm, setConfirm] = useState(false);
  if (!hasHistory) return null;
  return (
    <>
      <Pressable
        onPress={() => setConfirm(true)}
        accessibilityRole="button"
        accessibilityLabel="Reset swipes, kept items and lists"
        style={styles.reset}>
        <AppText variant="caption" color={colors.inkSubtle}>
          Reset swipes, kept items and lists
        </AppText>
      </Pressable>
      <ConfirmSheet
        visible={confirm}
        title="Reset everything?"
        message="This clears your swipes, kept items, lists and learned taste on this phone."
        confirmLabel="Reset"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          resetSwipes();
          resetLists();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md, flexGrow: 1 },
  header: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '50%' },
  left: { paddingRight: space.md / 2 },
  right: { paddingLeft: space.md / 2 },
  reset: { alignSelf: 'center', padding: space.lg, minHeight: 48, justifyContent: 'center' },
});
