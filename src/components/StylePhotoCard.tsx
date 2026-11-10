import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

interface StylePhotoCardProps {
  label: string;
  source: number;
  selected: boolean;
  /** The maximum is reached and this one isn't picked. */
  dimmed: boolean;
  onPress: () => void;
  width: number;
}

/** A tappable room photo in the style picker, with a champagne check when picked. */
export function StylePhotoCard({ label, source, selected, dimmed, onPress, width }: StylePhotoCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: dimmed }}
      accessibilityLabel={label}
      accessibilityHint={dimmed ? 'You can pick up to 5. Unpick one to choose this.' : undefined}
      style={({ pressed }) => [
        styles.card,
        { width, height: Math.round(width * 1.3) },
        selected && styles.selected,
        dimmed && styles.dimmed,
        pressed && styles.pressed,
      ]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      <LinearGradient
        colors={[colors.scrimLight, colors.scrimLight, colors.scrim]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {selected ? (
        <View style={styles.check}>
          <Icon name="check" size={13} color={colors.onInk} />
        </View>
      ) : null}
      <AppText
        variant="label"
        color={colors.onPhoto}
        style={styles.label}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'flex-end',
  },
  selected: { borderColor: colors.accent },
  dimmed: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }] },
  check: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.keep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { paddingHorizontal: space.sm, paddingBottom: space.sm + 2, fontSize: 13, lineHeight: 17 },
});
