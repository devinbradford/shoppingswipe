import { router } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Header } from '@/components/Header';
import { ProductGridItem } from '@/components/ProductGridItem';
import { LoadingView, StateView } from '@/components/StateView';
import { useRetailerNames, useSavedProducts } from '@/hooks/useCatalog';
import { pluralize } from '@/lib/format';
import { useSwipeStore } from '@/store/swipeStore';
import { colors, space } from '@/theme/tokens';

export default function KeptScreen() {
  const saved = useSavedProducts();
  const retailers = useRetailerNames();
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  const products = saved.status === 'ready' ? (saved.data ?? []) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Header onBack={() => router.back()} />
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <AppText variant="hero" accessibilityRole="header">
              Kept
            </AppText>
            {products.length > 0 ? (
              <AppText variant="body" color={colors.inkMuted} style={styles.sub}>
                {pluralize(products.length, 'item')}
              </AppText>
            ) : null}
          </>
        }
        renderItem={({ item, index }) => (
          <ProductGridItem
            index={index}
            product={item}
            retailerName={retailers.get(item.retailerId)}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.xl, flexGrow: 1 },
  sub: { marginTop: space.xs },
});
