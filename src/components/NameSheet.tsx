import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, hitTarget, radii, space, type as typeScale } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface NameSheetProps {
  visible: boolean;
  title: string;
  submitLabel: string;
  initialName?: string;
  /** Return an error message to show, or null when the name was accepted. */
  onSubmit: (name: string) => string | null;
  onClose: () => void;
}

/** Ask for a list name (create or rename). */
export function NameSheet({ visible, onClose, ...rest }: NameSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={rest.title}>
      {/* Remount each time it opens so the field starts fresh. */}
      {visible ? <NameForm {...rest} onClose={onClose} /> : null}
    </Sheet>
  );
}

export function NameForm({
  submitLabel,
  initialName = '',
  onSubmit,
  onClose,
}: Omit<NameSheetProps, 'visible' | 'title'>) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const e = onSubmit(name);
    if (e) setError(e);
    else onClose();
  };
  return (
    <View style={styles.form}>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        placeholder="e.g. Living room"
        placeholderTextColor={colors.inkSubtle}
        style={[styles.input, error ? styles.inputError : null]}
        autoFocus
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={submit}
        accessibilityLabel="List name"
        accessibilityHint={error ?? undefined}
      />
      {error ? (
        <AppText variant="bodySmall" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Button label={submitLabel} onPress={submit} size="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  input: {
    ...typeScale.body,
    color: colors.ink,
    minHeight: hitTarget,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.danger },
});
