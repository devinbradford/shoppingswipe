import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { GlassIconButton, GlassPill } from '@/components/Glass';
import { LoadingView } from '@/components/StateView';
import { ZoomableImage } from '@/components/ZoomableImage';
import { useProduct } from '@/hooks/useCatalog';
import { colors, space } from '@/theme/tokens';

/** Full-screen photos: pinch or double-tap to zoom, swipe sideways between photos, swipe down to close. */
export default function PhotoViewer() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const result = useProduct(id);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const start = Math.max(0, Number(index) || 0);
  const [page, setPage] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const dismiss = useSharedValue(0);
  const photos = result.status === 'ready' && result.data ? result.data.product.imageUrls : [];
  const title = result.status === 'ready' && result.data ? result.data.product.title : '';

  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - 0.75 * dismiss.get() }));
  const chrome = useAnimatedStyle(() => ({ opacity: 1 - dismiss.get() * 2 }));

  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      {photos.length === 0 ? (
        <LoadingView label="Loading photos" />
      ) : (
        <ScrollView
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: start * width, y: 0 }}
          onMomentumScrollEnd={onPage}>
          {photos.map((uri, i) => (
            <ZoomableImage
              key={uri}
              uri={uri}
              width={width}
              height={height}
              onZoomChange={setZoomed}
              onDismiss={() => router.back()}
              dismissProgress={dismiss}
              accessibilityLabel={`${title}, photo ${i + 1} of ${photos.length}`}
            />
          ))}
        </ScrollView>
      )}
      <Animated.View style={[styles.top, { top: insets.top + space.md }, chrome]} pointerEvents="box-none">
        {photos.length > 1 ? (
          <GlassPill>
            <AppText variant="eyebrow" color={colors.onPhoto} accessibilityLiveRegion="polite">
              {`${page + 1} / ${photos.length}`}
            </AppText>
          </GlassPill>
        ) : (
          <View />
        )}
        <GlassIconButton icon="close" label="Close photos" onPress={() => router.back()} />
      </Animated.View>
      <Animated.View style={[styles.hint, { bottom: insets.bottom + space.lg }, chrome]} pointerEvents="none">
        <AppText variant="caption" color={colors.inkMuted}>
          {zoomed ? 'Double-tap to zoom out' : 'Pinch or double-tap to zoom'}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backdrop: { backgroundColor: colors.shadow },
  top: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
