import { Image, type ImageStyle } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp } from 'react-native';

import { colors } from '@/theme/tokens';
import { Icon } from './Icon';

interface ProductImageProps {
  uri: string | undefined;
  style?: StyleProp<ImageStyle>;
  /** Describe the photo for screen readers; omit when the surrounding element already does. */
  accessibilityLabel?: string;
  priority?: 'low' | 'normal' | 'high';
}

/** Product photo with a quiet placeholder while loading and a fallback if it fails. */
export function ProductImage({ uri, style, accessibilityLabel, priority = 'normal' }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.frame, style]}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
          priority={priority}
          cachePolicy="memory-disk"
          recyclingKey={uri}
          onError={() => setFailed(true)}
          accessible={!!accessibilityLabel}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <View style={styles.fallback}>
          <Icon name="bag" size={28} color={colors.inkSubtle} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.placeholder, overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
