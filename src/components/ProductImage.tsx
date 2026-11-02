import { Image, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp } from 'react-native';

import { colors, radii } from '@/theme/tokens';
import { Icon } from './Icon';

interface Insets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

interface ProductImageProps {
  uri: string | undefined;
  style?: StyleProp<ImageStyle>;
  /**
   * "cover" fills the frame and may crop the edges (good for mood shots).
   * "showcase" always shows the whole product: the photo fits inside the
   * frame, with a soft blurred copy of itself filling any leftover space.
   */
  fit?: 'cover' | 'showcase';
  /** Showcase only: keep the product clear of overlays (status bar, price block…). */
  insets?: Insets;
  /** Describe the photo for screen readers; omit when the surrounding element already does. */
  accessibilityLabel?: string;
  priority?: 'low' | 'normal' | 'high';
}

/** Product photo with a quiet placeholder while loading and a fallback if it fails. */
export function ProductImage({
  uri,
  style,
  fit = 'cover',
  insets,
  accessibilityLabel,
  priority = 'normal',
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  // Showcase: the photo's shape (width ÷ height) and the space it can use, so the
  // product can be drawn at its exact fitted size with rounded corners.
  const [shape, setShape] = useState<{ uri: string; ratio: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const ratio = shape && shape.uri === uri ? shape.ratio : null;
  const fitted =
    ratio && box && box.w > 0 && box.h > 0
      ? box.w / box.h > ratio
        ? { width: box.h * ratio, height: box.h }
        : { width: box.w, height: box.w / ratio }
      : null;
  const onBox = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };
  const common = {
    source: { uri },
    transition: 160,
    priority,
    cachePolicy: 'memory-disk' as const,
    recyclingKey: uri,
    onError: () => setFailed(true),
  };

  return (
    <View style={[styles.frame, style]}>
      {!uri || failed ? (
        <View style={styles.fallback}>
          <Icon name="bag" size={28} color={colors.inkMuted} />
        </View>
      ) : fit === 'cover' ? (
        <Image
          {...common}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={!!accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <>
          {/* Ambient backdrop: the same photo, enlarged, blurred and dimmed. */}
          <Image
            {...common}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
            contentFit="cover"
            blurRadius={40}
            accessible={false}
          />
          <View style={styles.dim} />
          <View
            onLayout={onBox}
            pointerEvents="none"
            style={[
              styles.productBox,
              {
                top: insets?.top ?? 0,
                bottom: insets?.bottom ?? 0,
                left: insets?.left ?? 0,
                right: insets?.right ?? 0,
              },
            ]}>
            <Image
              {...common}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (uri && width > 0 && height > 0) setShape({ uri, ratio: width / height });
              }}
              style={fitted ? [styles.product, fitted] : StyleSheet.absoluteFill}
              contentFit="contain"
              accessible={!!accessibilityLabel}
              accessibilityLabel={accessibilityLabel}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.placeholder, overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  backdrop: { transform: [{ scale: 1.15 }] },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrimMid },
  productBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  product: { borderRadius: radii.md, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)' },
});
