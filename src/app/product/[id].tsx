import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button, IconButton } from '@/components/Button';
import { ProductImage } from '@/components/ProductImage';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { LoadingView, StateView } from '@/components/StateView';
import type { Product, Retailer } from '@/domain/types';
import { useProduct } from '@/hooks/useCatalog';
import { useOnline } from '@/hooks/useOnline';
import { useListsForProduct } from '@/hooks/useWishlists';
import { formatPrice } from '@/lib/format';
import { outboundUrl } from '@/lib/outboundLink';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, radii, space } from '@/theme/tokens';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useProduct(id);

  if (result.status === 'loading') {
    return (
      <SafeAreaView style={styles.screen}>
        <LoadingView label="Loading product" />
      </SafeAreaView>
    );
  }
  if (result.status === 'error' || !result.data) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.topBar}>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>
        <StateView
          icon="info"
          title={result.status === 'error' ? "Couldn't load this product" : 'Product not found'}
          message={
            result.status === 'error' ? 'Check your connection and try again.' : 'It may no longer be available.'
          }
          primary={
            result.status === 'error'
              ? { label: 'Try again', onPress: result.reload }
              : { label: 'Close', onPress: () => router.back() }
          }
        />
      </SafeAreaView>
    );
  }
  return <ProductDetail product={result.data.product} retailer={result.data.retailer} />;
}

function ProductDetail({ product, retailer }: { product: Product; retailer: Retailer | null }) {
  const { width } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const [opening, setOpening] = useState(false);
  const isKept = useSwipeStore((s) => s.saved.some((i) => i.productId === product.id));
  const addSaved = useSwipeStore((s) => s.addSaved);
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  const addToList = useWishlistStore((s) => s.add);
  const inLists = useListsForProduct(product.id);
  const [picking, setPicking] = useState(false);
  const online = useOnline();
  const [buyError, setBuyError] = useState<string | null>(null);
  const price = formatPrice(product.priceCents, product.currency);
  const retailerName = retailer?.name ?? 'the retailer';

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPhoto(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const buy = async () => {
    setBuyError(null);
    if (!online) {
      setBuyError(`You're offline. Connect to the internet to open ${retailerName}.`);
      return;
    }
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(outboundUrl(product));
    } catch {
      setBuyError(`Couldn't open ${retailerName}. Try again in a moment.`);
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            accessibilityLabel={`Photos of ${product.title}`}>
            {product.imageUrls.map((uri, i) => (
              <ProductImage
                key={uri}
                uri={uri}
                style={{ width, height: width * 1.2 }}
                accessibilityLabel={`Photo ${i + 1} of ${product.imageUrls.length}`}
                priority={i === 0 ? 'high' : 'normal'}
              />
            ))}
          </ScrollView>
          {product.imageUrls.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {product.imageUrls.map((uri, i) => (
                <View key={uri} style={[styles.dot, i === photo && styles.dotActive]} />
              ))}
            </View>
          ) : null}
          <SafeAreaView edges={['top']} style={styles.closeWrap}>
            <IconButton icon="close" label="Close" onPress={() => router.back()} />
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          <AppText variant="caption" color={colors.inkMuted}>
            {product.brand} · {retailerName}
          </AppText>
          <AppText variant="title" accessibilityRole="header">
            {product.title}
          </AppText>
          <AppText variant="price">{price}</AppText>
          <AppText variant="body" color={colors.inkMuted} style={styles.description}>
            {product.description}
          </AppText>

          <View style={styles.facts}>
            <Fact label="Material" value={product.material} />
            <Fact label="Color" value={product.color} />
            <Fact label="Style" value={product.styleTags.join(', ')} />
            {retailer ? <Fact label="Sold by" value={`${retailer.name} (${retailer.domain})`} /> : null}
          </View>

          <View style={styles.lists}>
            <AppText variant="bodySmall" color={colors.inkMuted} style={styles.listsText}>
              {inLists.length === 0 ? 'Not in any list yet.' : `In ${inLists.map((l) => l.name).join(', ')}`}
            </AppText>
            <Button label="Add to list" variant="secondary" onPress={() => setPicking(true)} />
          </View>
        </View>
      </ScrollView>

      <ListPickerSheet
        visible={picking}
        title="Add to list"
        checkedIds={new Set(inLists.map((l) => l.id))}
        onClose={() => setPicking(false)}
        onPick={(listId) => addToList(listId, [product.id])}
      />

      {buyError ? (
        <View style={styles.buyError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <AppText variant="bodySmall" color={colors.skip}>
            {buyError}
          </AppText>
        </View>
      ) : null}
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        <Button
          label={isKept ? 'Kept' : 'Keep'}
          icon={isKept ? 'check' : 'keep'}
          variant="secondary"
          size="lg"
          onPress={() => (isKept ? removeSaved(product.id) : addSaved(product.id))}
          accessibilityHint={isKept ? 'Removes it from your kept list' : 'Adds it to your kept list'}
        />
        <Button
          label="Buy now"
          icon="external"
          size="lg"
          style={styles.buy}
          disabled={opening}
          onPress={buy}
          accessibilityHint={`Opens ${retailerName}'s website`}
        />
      </SafeAreaView>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <AppText variant="bodySmall" color={colors.inkMuted}>
        {label}
      </AppText>
      <AppText variant="bodySmall" style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: space.lg, alignItems: 'flex-end' },
  scroll: { paddingBottom: space.xxl },
  closeWrap: { position: 'absolute', top: 0, right: 0, padding: space.lg },
  dots: {
    position: 'absolute',
    bottom: space.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pip },
  dotActive: { backgroundColor: colors.pipActive, width: 18 },
  body: { padding: space.xl, gap: space.sm },
  description: { marginTop: space.sm },
  lists: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  listsText: { flex: 1 },
  facts: {
    marginTop: space.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  factValue: { flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },
  bar: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  buy: { flex: 1 },
  buyError: { paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.skipSoft },
});
