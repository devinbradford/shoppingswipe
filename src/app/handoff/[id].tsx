import * as Network from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProductImage } from '@/components/ProductImage';
import { LoadingView } from '@/components/StateView';
import type { Product } from '@/domain/types';
import { visitStore } from '@/hooks/useBuyNow';
import { useProduct } from '@/hooks/useCatalog';
import { COMMISSION_NOTE } from '@/lib/disclosure';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { colors, radii, space } from '@/theme/tokens';

/** How long the "Taking you to…" moment lasts before the store opens. */
const HANDOFF_MS = 1100;

/** Buy now: a calm moment with the product and the store's name, then the store opens in a sheet. */
export default function HandoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useProduct(id);
  const data = result.status === 'ready' ? result.data : null;

  return (
    <View style={styles.screen}>
      {data ? (
        <Handoff product={data.product} storeName={data.retailer?.name ?? 'the store'} />
      ) : result.status === 'loading' ? (
        <LoadingView label="Getting the store ready" />
      ) : (
        <Message title="Couldn't find this product" body="It may no longer be available." />
      )}
    </View>
  );
}

type Phase = 'counting' | 'opening' | 'offline' | 'failed';

function Handoff({ product, storeName }: { product: Product; storeName: string }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [phase, setPhase] = useState<Phase>('counting');
  const [attempt, setAttempt] = useState(0);
  const cancelled = useRef(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (phase !== 'counting') return;
    const ms = reduceMotion ? 600 : HANDOFF_MS;
    progress.set(0);
    progress.set(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.quad) }));
    const t = setTimeout(async () => {
      if (cancelled.current) return;
      // Check right before leaving: a fresh status, not one that may still be loading.
      const net = await Network.getNetworkStateAsync().catch(() => null);
      if (net && (net.isConnected === false || net.isInternetReachable === false)) {
        setPhase('offline');
        return;
      }
      setPhase('opening');
      try {
        await visitStore(product, storeName);
        if (!cancelled.current) router.back();
      } catch {
        setPhase('failed');
      }
    }, ms);
    return () => clearTimeout(t);
    // `attempt` restarts the countdown after Try again.
  }, [phase, attempt, product, storeName, reduceMotion, progress]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const close = () => {
    cancelled.current = true;
    router.back();
  };
  const retry = () => {
    setAttempt((a) => a + 1);
    setPhase('counting');
  };

  return (
    <View style={[styles.body, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.center}>
        <View style={styles.photo}>
          <ProductImage uri={product.imageUrls[0]} style={StyleSheet.absoluteFill} fit="showcase" />
        </View>
        {phase === 'offline' ? (
          <Message
            title="You're offline"
            body={`Connect to the internet to open ${storeName}. This piece will be right here.`}
          />
        ) : phase === 'failed' ? (
          <Message title={`Couldn't open ${storeName}`} body="Try again in a moment." />
        ) : (
          <View style={styles.text} accessibilityLiveRegion="polite">
            <AppText variant="eyebrow" color={colors.inkMuted}>
              TAKING YOU TO
            </AppText>
            <AppText variant="title" accessibilityRole="header" style={styles.centered}>
              {storeName}
            </AppText>
            <AppText variant="bodySmall" color={colors.inkMuted} style={styles.centered} numberOfLines={2}>
              {product.title}
            </AppText>
            <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Animated.View style={[styles.fill, bar]} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.footer}>
        <AppText variant="caption" color={colors.inkMuted} style={styles.centered}>
          {COMMISSION_NOTE} You check out on {storeName}&apos;s site.
        </AppText>
        {phase === 'offline' || phase === 'failed' ? <Button label="Try again" onPress={retry} /> : null}
        <Button label={phase === 'counting' ? 'Cancel' : 'Close'} variant="ghost" onPress={close} />
      </View>
    </View>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.text} accessibilityLiveRegion="polite">
      <AppText variant="heading" accessibilityRole="header" style={styles.centered}>
        {title}
      </AppText>
      <AppText variant="body" color={colors.inkMuted} style={styles.centered}>
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  photo: {
    width: 168,
    height: 168,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
  },
  text: { alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  centered: { textAlign: 'center' },
  track: {
    marginTop: space.lg,
    width: 140,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.keep },
  footer: { gap: space.sm },
});
