import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button, IconButton } from '@/components/Button';
import { GlassIconButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { ListPickerSheet } from '@/components/ListPickerSheet';
import { SimilarRow } from '@/components/SimilarRow';
import { UndoToast } from '@/components/UndoToast';
import { LoadingView, StateView } from '@/components/StateView';
import type { Product, Retailer } from '@/domain/types';
import { useProduct } from '@/hooks/useCatalog';
import { useBuyNow } from '@/hooks/useBuyNow';
import { useUndoToast } from '@/hooks/useUndoToast';
import { useProductInsights } from '@/hooks/useProductInsights';
import { useListsForProduct } from '@/hooks/useWishlists';
import { formatPrice } from '@/lib/format';
import { COMMISSION_NOTE } from '@/lib/disclosure';
import { usePurchaseStore } from '@/store/purchaseStore';
import { recordSignal } from '@/store/signalStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, radii, space } from '@/theme/tokens';

/** How much of the details sheet shows over the photo before you pull it up. */
const PEEK = 214;
const SHEET_RADIUS = 28;

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

/**
 * The photo fills the screen like the swipe card; the details sit in a sheet you pull up over it.
 * The sheet is the scroll content, so it moves with normal scroll physics; the photo drifts up slowly behind it.
 */
function ProductDetail({ product, retailer }: { product: Product; retailer: Retailer | null }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [photo, setPhoto] = useState(0);
  const isKept = useSwipeStore((s) => s.saved.some((i) => i.productId === product.id));
  const addSaved = useSwipeStore((s) => s.addSaved);
  const removeSaved = useSwipeStore((s) => s.removeSaved);
  const restoreSaved = useSwipeStore((s) => s.restoreSaved);
  const toast = useUndoToast();
  const addToList = useWishlistStore((s) => s.add);
  const inLists = useListsForProduct(product.id);
  const [picking, setPicking] = useState(false);
  const { buy } = useBuyNow();
  const boughtAt = usePurchaseStore((s) => s.bought.find((b) => b.productId === product.id)?.at);
  const { why, similar } = useProductInsights(product);
  const price = formatPrice(product.priceCents, product.currency);
  const retailerName = retailer?.name ?? 'the retailer';

  // Price/Keep/Buy row plus the commission note.
  const barHeight = 98 + Math.max(insets.bottom, space.md);
  const sheetTop = Math.max(320, height - barHeight - PEEK);

  // Opening a product and flipping through its photos say a little about taste.
  useEffect(() => {
    recordSignal(product.id, 'detail_open');
  }, [product.id]);
  useEffect(() => {
    if (photo > 0) recordSignal(product.id, 'photo_browse');
  }, [photo, product.id]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const photoStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return {
      transform: [
        // Drift up at 40% speed so the sheet slides over it; stretch a little when pulled down.
        { translateY: y > 0 ? y * 0.6 : y },
        { scale: y < 0 ? 1 + -y / sheetTop : 1 },
      ],
    };
  });
  // Once the sheet reaches the top, a solid strip keeps text from sliding under the Close button.
  const headerEnd = sheetTop - insets.top - 64;
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [headerEnd - 40, headerEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, sheetTop * 0.8], [0, 0.6], Extrapolation.CLAMP),
  }));

  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPhoto(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const openViewer = (index: number) =>
    router.push({ pathname: '/photos/[id]', params: { id: product.id, index: String(index) } });

  const toggleKeep = () => {
    if (isKept) {
      const item = useSwipeStore.getState().saved.find((i) => i.productId === product.id);
      removeSaved(product.id);
      toast.show({
        message: 'Removed from Kept',
        undo: item ? () => restoreSaved(item) : undefined,
        // Only an un-keep that sticks says something about taste.
        commit: () => recordSignal(product.id, 'unsave'),
      });
    } else {
      addSaved(product.id);
      toast.show({ message: 'Kept' });
    }
  };

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: barHeight + space.xl }}>
        <Animated.View style={[{ height: sheetTop }, photoStyle]}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPage}
            accessibilityLabel={`Photos of ${product.title}`}>
            {product.imageUrls.map((uri, i) => (
              <Pressable
                key={uri}
                onPress={() => openViewer(i)}
                accessibilityRole="button"
                accessibilityLabel={`Photo ${i + 1} of ${product.imageUrls.length}`}
                accessibilityHint="Opens the photo full screen to zoom in">
                <ProductImage
                  uri={uri}
                  style={{ width, height: sheetTop + SHEET_RADIUS }}
                  fit="showcase"
                  insets={{
                    top: insets.top + 64,
                    bottom: SHEET_RADIUS + space.xxl,
                    left: space.lg,
                    right: space.lg,
                  }}
                  priority={i === 0 ? 'high' : 'normal'}
                />
              </Pressable>
            ))}
          </ScrollView>
          {product.imageUrls.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {product.imageUrls.map((uri, i) => (
                <View key={uri} style={[styles.dot, i === photo && styles.dotActive]} />
              ))}
            </View>
          ) : null}
          <Animated.View style={[styles.dim, dimStyle]} pointerEvents="none" />
        </Animated.View>

        <View style={[styles.sheet, { minHeight: height - insets.top - space.xxxl }]}>
          <View style={styles.handle} />
          <AppText variant="eyebrow" color={colors.inkMuted} numberOfLines={1}>
            {`${product.brand} · ${retailerName}`.toUpperCase()}
          </AppText>
          <AppText variant="heading" accessibilityRole="header" numberOfLines={2}>
            {product.title}
          </AppText>
          <AppText variant="title">{price}</AppText>
          {boughtAt ? (
            <View style={styles.bought}>
              <Icon name="check" size={14} color={colors.keep} />
              <AppText variant="caption" color={colors.accentText}>
                You bought this on {new Date(boughtAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </AppText>
            </View>
          ) : null}
          {why ? (
            <View style={styles.why} accessibilityLabel={`Why it's for you: ${why}`}>
              <View style={styles.whyDot} />
              <AppText variant="caption" color={colors.accentText} style={styles.whyText}>
                Why it&apos;s for you ·{' '}
                <AppText variant="italic" color={colors.accentText}>
                  {why}
                </AppText>
              </AppText>
            </View>
          ) : null}

          <AppText variant="body" color={colors.inkMuted} style={styles.description}>
            {product.description}
          </AppText>

          <View style={styles.card}>
            <Fact label="Material" value={product.material} />
            <Fact label="Color" value={product.color} />
            <Fact label="Style" value={product.styleTags.join(', ')} last />
          </View>

          <View style={styles.lists}>
            <AppText variant="bodySmall" color={colors.inkMuted} style={styles.flex}>
              {inLists.length === 0 ? 'Not in any list yet.' : `In ${inLists.map((l) => l.name).join(', ')}`}
            </AppText>
            <Button label="Add to list" variant="secondary" onPress={() => setPicking(true)} />
          </View>

          <View style={[styles.card, styles.soldBy]}>
            <Icon name="bag" size={20} color={colors.keep} />
            <View style={styles.flex}>
              <AppText variant="label">Sold by {retailerName}</AppText>
              <AppText variant="bodySmall" color={colors.inkMuted}>
                {retailer ? `${retailer.domain} · ` : ''}You check out on their site. They set the price, stock and
                delivery.
              </AppText>
            </View>
          </View>

          {similar.length > 0 ? (
            <View style={styles.similar}>
              <AppText variant="eyebrow" color={colors.inkMuted} accessibilityRole="header">
                MORE LIKE THIS
              </AppText>
              <View style={styles.similarRow}>
                <SimilarRow
                  products={similar}
                  gutter={space.xl}
                  onOpen={(p) => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
                />
              </View>
            </View>
          ) : null}
        </View>
      </Animated.ScrollView>

      <Animated.View style={[styles.header, { height: insets.top + 64 }, headerStyle]} pointerEvents="none" />
      <View style={[styles.close, { top: insets.top + space.md }]}>
        <GlassIconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>

      <ListPickerSheet
        visible={picking}
        title="Add to list"
        checkedIds={new Set(inLists.map((l) => l.id))}
        onClose={() => setPicking(false)}
        onPick={(listId) => {
          addToList(listId, [product.id]);
          recordSignal(product.id, 'list_add');
        }}
      />

      {toast.toast ? (
        <UndoToast
          id={toast.toast.id}
          message={toast.toast.message}
          onUndo={toast.toast.undo ? toast.undo : undefined}
          onExpire={toast.expire}
          bottom={barHeight + space.sm}
        />
      ) : null}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={styles.barRow}>
          <View style={styles.barPrice}>
            <AppText variant="heading" numberOfLines={1}>
              {price}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
              at {retailerName}
            </AppText>
          </View>
          <Pressable
            onPress={toggleKeep}
            accessibilityRole="button"
            accessibilityLabel={isKept ? 'Kept' : 'Keep'}
            accessibilityState={{ selected: isKept }}
            accessibilityHint={isKept ? 'Removes it from your kept list' : 'Adds it to your kept list'}
            style={({ pressed }) => [styles.keep, isKept && styles.keepOn, pressed && styles.pressed]}>
            <Icon name={isKept ? 'keep' : 'heart'} size={22} color={isKept ? colors.onInk : colors.keep} />
          </Pressable>
          <Button
            label="Buy now"
            icon="external"
            size="lg"
            style={styles.buy}
            onPress={() => buy(product)}
            accessibilityHint={`Opens ${retailerName}'s website`}
          />
        </View>
        <AppText variant="caption" color={colors.inkSubtle} style={styles.note}>
          {COMMISSION_NOTE}
        </AppText>
      </View>
    </View>
  );
}

function Fact({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.fact, last && styles.factLast]}>
      <AppText variant="bodySmall" color={colors.inkMuted}>
        {label}
      </AppText>
      <AppText variant="bodySmall" style={[styles.factValue, styles.capitalize]}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { padding: space.lg, alignItems: 'flex-end' },
  close: { position: 'absolute', right: space.lg },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: colors.tabBar,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dots: {
    position: 'absolute',
    bottom: space.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pip },
  dotActive: { backgroundColor: colors.pipActive, width: 18 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  sheet: {
    marginTop: -SHEET_RADIUS,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    backgroundColor: colors.background,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.sm,
    boxShadow: `0 -12px 32px ${colors.shadow}66`,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.md,
  },
  why: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },

  whyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.keep },
  whyText: { flexShrink: 1 },
  description: { marginTop: space.lg },
  card: {
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
  factLast: { borderBottomWidth: 0 },
  factValue: { flexShrink: 1, textAlign: 'right' },
  capitalize: { textTransform: 'capitalize' },
  lists: { marginTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  soldBy: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  similar: { marginTop: space.xxl, gap: space.md },
  similarRow: { marginHorizontal: -space.xl },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barPrice: { flexShrink: 1, minWidth: 0 },
  keep: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.keep,
  },
  keepOn: { backgroundColor: colors.keep },
  pressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  buy: { flex: 1 },
  note: { textAlign: 'center' },
  bought: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
