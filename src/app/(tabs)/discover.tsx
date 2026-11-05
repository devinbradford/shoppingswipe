import { router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { FilterSheet } from '@/components/FilterSheet';
import { ProductGridItem } from '@/components/ProductGridItem';
import { RoomSection } from '@/components/RoomSection';
import { SearchField } from '@/components/SearchField';
import { LoadingView, StateView } from '@/components/StateView';
import { countActiveFilters, EMPTY_FILTERS, type SearchFilters } from '@/domain/filters';
import type { Product } from '@/domain/types';
import { useCategorySummaries, useFilterOptions, useProductSearch, useRetailerNames } from '@/hooks/useCatalog';
import { formatPrice, pluralize } from '@/lib/format';
import { colors, space } from '@/theme/tokens';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const tabBarHeight = useBottomTabBarHeight();
  const categories = useCategorySummaries();
  const search = useProductSearch(query, filters);
  const options = useFilterOptions(query);
  const retailers = useRetailerNames();
  const activeFilters = countActiveFilters(filters);
  const searching = query.trim().length > 0 || activeFilters > 0;

  // One list for both modes, so the search box is never rebuilt (and the keyboard stays up).
  // Browsing shows the rooms inside the list header; searching fills the list with results.
  const rows: Product[] = searching && search.status === 'ready' ? search.data : [];

  const header = (
    <View style={styles.header}>
      <AppText variant="hero" accessibilityRole="header">
        Discover
      </AppText>
      <AppText variant="body" color={colors.inkMuted}>
        Pick a room or a piece of furniture and swipe. Right to keep, left to skip.
      </AppText>
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        <Button
          label={activeFilters > 0 ? `Filters ${activeFilters}` : 'Filters'}
          variant={activeFilters > 0 ? 'primary' : 'secondary'}
          onPress={() => setShowFilters(true)}
          accessibilityHint="Filter by room, type, price and store"
        />
      </View>
      {activeFilters > 0 ? <ActiveFilters filters={filters} onChange={setFilters} options={options} /> : null}
      {searching && search.status === 'ready' && rows.length > 0 ? (
        <AppText variant="bodySmall" color={colors.inkMuted} accessibilityLiveRegion="polite">
          {pluralize(rows.length, 'result')}
        </AppText>
      ) : null}
      {!searching ? (
        categories.status === 'ready' ? (
          <View style={styles.rooms}>
            {categories.summaries.map((room) => (
              <RoomSection
                key={room.id}
                room={room}
                gutter={space.lg}
                onOpenRoom={() => router.push({ pathname: '/deck/[category]', params: { category: room.id } })}
                onOpenType={(type) =>
                  router.push({ pathname: '/deck/[category]', params: { category: room.id, type } })
                }
              />
            ))}
          </View>
        ) : categories.status === 'error' ? (
          <StateView
            icon="refresh"
            title="Couldn't load rooms"
            message="Something went wrong on our side."
            primary={{ label: 'Try again', onPress: categories.reload }}
          />
        ) : (
          <LoadingView label="Loading rooms" />
        )
      ) : null}
    </View>
  );

  const empty = !searching ? null : search.status === 'error' ? (
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
          : `Nothing found for "${search.query}". Try a type, color or style.`
      }
      primary={activeFilters > 0 ? { label: 'Clear filters', onPress: () => setFilters(EMPTY_FILTERS) } : undefined}
    />
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        numColumns={2}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xxl }]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <ProductGridItem
            index={index}
            product={item}
            retailerName={retailers.get(item.retailerId)}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={empty ?? undefined}
      />
      <FilterSheet
        visible={showFilters}
        value={filters}
        categories={options.categories}
        subcategories={options.subcategories}
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
          accessibilityLabel={`Remove room filter: ${names(filters.categoryIds, options.categories)}`}
          onPress={() => onChange({ ...filters, categoryIds: [] })}
        />
      ) : null}
      {filters.subcategoryIds.length > 0 ? (
        <Chip
          label={names(filters.subcategoryIds, options.subcategories)}
          selected
          removable
          accessibilityLabel={`Remove type filter: ${names(filters.subcategoryIds, options.subcategories)}`}
          onPress={() => onChange({ ...filters, subcategoryIds: [] })}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, gap: space.md, flexGrow: 1 },
  header: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  rooms: { gap: space.xxl, paddingTop: space.lg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
