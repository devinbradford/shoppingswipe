import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CategoryTile } from '@/components/CategoryTile';
import { ProductGridItem } from '@/components/ProductGridItem';
import { SearchField } from '@/components/SearchField';
import { LoadingView, StateView } from '@/components/StateView';
import { useCategorySummaries, useProductSearch, useRetailerNames } from '@/hooks/useCatalog';
import { useSwipeStore } from '@/store/swipeStore';
import { colors, space } from '@/theme/tokens';

export default function DiscoverScreen() {
  const [query, setQuery] = useState('');
  const keptCount = useSwipeStore((s) => s.saved.length);
  const categories = useCategorySummaries();
  const search = useProductSearch(query);
  const retailers = useRetailerNames();
  const searching = query.trim().length > 0;

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
      <SearchField value={query} onChangeText={setQuery} />
    </View>
  );

  if (searching) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <FlatList
          data={search.status === 'ready' ? search.data : []}
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
          ListEmptyComponent={
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
                message={`Nothing found for "${search.query}". Try a brand, color or style.`}
              />
            )
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={categories.summaries}
        keyExtractor={(c) => c.id}
        numColumns={2}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columns}
        renderItem={({ item }) => (
          <CategoryTile
            label={item.label}
            remaining={item.remainingCount}
            coverUrl={item.coverUrl}
            onPress={() => router.push({ pathname: '/deck/[category]', params: { category: item.id } })}
          />
        )}
        ListEmptyComponent={
          categories.status === 'error' ? (
            <StateView
              icon="refresh"
              title="Couldn't load categories"
              message="Something went wrong on our side."
              primary={{ label: 'Try again', onPress: categories.reload }}
            />
          ) : (
            <LoadingView label="Loading categories" />
          )
        }
        ListFooterComponent={<ResetLink />}
      />
    </SafeAreaView>
  );
}

/** Small dev-friendly reset so the sample deck can be replayed. */
function ResetLink() {
  const resetAll = useSwipeStore((s) => s.resetAll);
  const hasHistory = useSwipeStore((s) => s.swipes.length > 0);
  if (!hasHistory) return null;
  return (
    <Pressable
      onPress={() =>
        Alert.alert('Reset everything?', 'This clears your swipes, kept items and learned taste on this phone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset', style: 'destructive', onPress: resetAll },
        ])
      }
      accessibilityRole="button"
      accessibilityLabel="Reset swipes and kept items"
      style={styles.reset}>
      <AppText variant="caption" color={colors.inkSubtle}>
        Reset swipes and kept items
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.md, flexGrow: 1 },
  columns: { gap: space.md },
  header: { gap: space.md, paddingTop: space.lg, paddingBottom: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reset: { alignSelf: 'center', padding: space.lg, minHeight: 48, justifyContent: 'center' },
});
