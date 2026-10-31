import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { AppText } from './AppText';
import { IconButton } from './Button';

interface HeaderProps {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}

/** Quiet top bar: back button, optional centered title, optional right slot. */
export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>{onBack ? <IconButton icon="back" label="Back" onPress={onBack} /> : null}</View>
      {title ? (
        <AppText variant="label" numberOfLines={1} style={styles.title} accessibilityRole="header">
          {title}
        </AppText>
      ) : (
        <View style={styles.title} />
      )}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  side: { minWidth: 48, flexDirection: 'row' },
  right: { justifyContent: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
});
