import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** "Are you sure?" for actions that can't be undone. */
export function ConfirmSheet({ visible, title, message, confirmLabel, onConfirm, onClose }: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <AppText color={colors.inkMuted}>{message}</AppText>
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.flex} />
        <Button
          label={confirmLabel}
          variant="skip"
          onPress={() => {
            onConfirm();
            onClose();
          }}
          style={styles.flex}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  flex: { flex: 1 },
});
