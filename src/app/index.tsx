import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button, IconButton } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FilterSheet } from '@/components/FilterSheet';
import { ProductGridItem } from '@/components/ProductGridItem';
import { RoomSection } from '@/components/RoomSection';
import { SearchField } from '@/components/SearchField';
import { LoadingView, StateView } from '@/components/StateView';
import { countActiveFilters, EMPTY_FILTERS, type SearchFilters } from '@/domain/filters';
import type { Product } from '@/domain/types';
import { useCategorySummaries, useFilterOptions, useProductSearch, useRetailerNames } from '@/hooks/useCatalog';
import { formatPrice, pluralize } from '@/lib/format';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const keptCount = useSwipeStore((s) => s.saved.length);
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const categories = useCategorySummaries();
  const search = useProductSearch(query, filters);
  const options = useFilterOptions(query);
  const retailers = useRetailerNames();
  const activeFilters = countActiveFilters(filters);
  const searching = query.trim().length > 0 || activeFilters > 0;
  const hydrated = useHydrated();
  const onboarded = usePreferencesStore((s) => s.onboarded);
  const introSeen = usePreferencesStore((s) => s.introSeen);
  const hasSwipes = useSwipeStore((s) => s.swipes.length > 0);

  // One list for both modes, so the search box is never rebuilt (and the keyboard stays up).
  // Browsing shows the rooms inside the list header; searching fills the list with results.
  const rows: Product[] = searching && search.status === 'ready' ? search.data : [];

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <AppText variant="hero" accessibilityRole="header">
          Discover
        </AppText>
        <View style={styles.headerActions}>
          <Button
            label={keptCount > 0 ? `Kept ${keptCount}` : 'Kept'}
            variant="secondary"
            icon="keep"
            onPress={() => router.push('/kept')}
            accessibilityHint="Opens the things you kept"
          />
          <IconButton icon="person" label={signedIn ? 'Account' : 'Sign in'} onPress={() => router.push('/account')} />
        </View>
      </View>
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

  // First launch: send new users to the style picker.
  if (!hydrated) return <SafeAreaView style={styles.screen} />;
  if (!onboarded && !hasSwipes) return <Redirect href={introSeen ? '/welcome' : '/intro'} />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        numColumns={2}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
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
        ListFooterComponent={searching ? undefined : <DiscoverFooter />}
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

function DiscoverFooter() {
  return (
    <View style={styles.footer}>
      <Pressable
        onPress={() => router.push('/welcome')}
        accessibilityRole="button"
        accessibilityLabel="Change your style picks"
        style={styles.reset}>
        <AppText variant="caption" color={colors.inkMuted}>
          Change your style picks
        </AppText>
      </Pressable>
      <ResetLink />
    </View>
  );
}

/** Small reset so the sample deck can be replayed. */
function ResetLink() {
  const resetSwipes = useSwipeStore((s) => s.resetAll);
  const resetLists = useWishlistStore((s) => s.resetAll);
  const resetPrefs = usePreferencesStore((s) => s.resetAll);
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
        <AppText variant="caption" color={colors.inkMuted}>
          Reset swipes, kept items and lists
        </AppText>
      </Pressable>
      <ConfirmSheet
        visible={confirm}
        title="Reset everything?"
        message="This clears your swipes, kept items, lists, style picks and learned taste on this phone."
        confirmLabel="Reset"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          resetSwipes();
          resetLists();
          resetPrefs();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md, flexGrow: 1 },
  header: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  rooms: { gap: space.xxl, paddingTop: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  footer: { alignItems: 'center', paddingTop: space.md },
  reset: { alignSelf: 'center', padding: space.lg, minHeight: 48, justifyContent: 'center' },
});
