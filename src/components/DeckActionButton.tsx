import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type DeckActionKind = 'skip' | 'undo' | 'keep';

interface DeckActionButtonProps {
  kind: DeckActionKind;
  icon: IconName;
  /** Read by screen readers. */
  label: string;
  /** Small capitals under the button ("SKIP"); hidden from screen readers (the label says it). */
  caption: string;
  size: number;
  onPress: () => void;
  disabled?: boolean;
  /** "Reduce motion" is on: no press spring, just a brief dim while pressed. */
  reduceMotion?: boolean;
}

/** How far a button sinks while pressed. */
export const PRESS_SCALE = 0.92;
/** Quick and firm going down (about 90 ms), a gentle settle coming back. */
const PRESS_IN = { damping: 28, stiffness: 900, mass: 0.6 };
const PRESS_OUT = { damping: 15, stiffness: 420, mass: 0.7 };
const ICON_SCALE = 0.36;

/**
 * Skip / Undo / Keep under the swipe card. The action fires on release exactly as before;
 * the spring only animates the button (on the UI thread), so it never delays or blocks it.
 * Unavailable (Undo with nothing to undo): outline only with a softer icon and caption,
 * can't be pressed, and screen readers hear it as dimmed / disabled.
 */
export function DeckActionButton({
  kind,
  icon,
  label,
  caption,
  size,
  onPress,
  disabled = false,
  reduceMotion = false,
}: DeckActionButtonProps) {
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // If the button turns unavailable mid-press, it must not stay sunk.
  useEffect(() => {
    if (disabled) scale.set(1);
  }, [disabled, scale]);

  const iconColor = kind === 'keep' ? colors.onInk : disabled ? colors.controlOff : colors.onPhoto;

  return (
    <View style={styles.wrap}>
      <Animated.View style={pressStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            if (!reduceMotion) scale.set(withSpring(PRESS_SCALE, PRESS_IN));
          }}
          onPressOut={() => {
            scale.set(reduceMotion ? 1 : withSpring(1, PRESS_OUT));
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.round,
            { width: size, height: size, borderRadius: size / 2 },
            SURFACE[kind],
            disabled && styles.off,
            reduceMotion && pressed && styles.pressedStill,
          ]}>
          <Icon name={icon} size={Math.round(size * ICON_SCALE)} color={iconColor} />
        </Pressable>
      </Animated.View>
      <AppText
        variant="eyebrow"
        color={disabled ? colors.controlOff : colors.onPhotoMuted}
        importantForAccessibility="no"
        accessible={false}>
        {caption}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.sm },
  round: { alignItems: 'center', justifyContent: 'center' },
  off: { backgroundColor: 'transparent', borderColor: colors.controlRingOff },
  pressedStill: { opacity: 0.8 },
});

const SURFACE = StyleSheet.create({
  skip: { backgroundColor: colors.controlFill, borderWidth: 1.5, borderColor: colors.controlRing },
  undo: { backgroundColor: colors.controlFill, borderWidth: 1, borderColor: colors.controlRingSoft },
  keep: { backgroundColor: colors.keep },
});
