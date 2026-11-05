import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface StateAction {
  label: string;
  onPress: () => void;
}

interface StateViewProps {
  icon?: IconName;
  title: string;
  message?: string;
  primary?: StateAction;
  secondary?: StateAction;
}

/** Centered message for empty and error states. */
export function StateView({ icon, title, message, primary, secondary }: StateViewProps) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      {icon ? (
        <View style={styles.badge}>
          <Icon name={icon} size={26} color={colors.inkMuted} />
        </View>
      ) : null}
      <AppText variant="heading" style={styles.center} accessibilityRole="header">
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color={colors.inkMuted} style={styles.center}>
          {message}
        </AppText>
      ) : null}
      {primary || secondary ? (
        <View style={styles.actions}>
          {primary ? <Button label={primary.label} onPress={primary.onPress} /> : null}
          {secondary ? <Button label={secondary.label} onPress={secondary.onPress} variant="secondary" /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function LoadingView({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.wrap} accessibilityLabel={label} accessible>
      <ActivityIndicator color={colors.inkMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  center: { textAlign: 'center', maxWidth: 320 },
  actions: { marginTop: space.lg, gap: space.sm, alignSelf: 'stretch', maxWidth: 320, width: '100%' },
});
