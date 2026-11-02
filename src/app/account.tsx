import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GlassIconButton } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { useAccount } from '@/hooks/useAccount';
import { pluralize, timeAgo } from '@/lib/format';
import { colors, fonts, radii, space } from '@/theme/tokens';

export default function AccountScreen() {
  const a = useAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <GlassIconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!a.configured ? (
          <NotSetUp />
        ) : a.status === 'signedIn' ? (
          <>
            <View style={styles.head}>
              <AppText variant="eyebrow" color={colors.inkMuted}>
                {a.provider ? `SIGNED IN WITH ${a.provider.toUpperCase()}` : 'SIGNED IN'}
              </AppText>
              <AppText variant="hero" accessibilityRole="header" numberOfLines={2}>
                {a.name ?? 'Your account'}
              </AppText>
              {a.email ? (
                <AppText variant="body" color={colors.inkMuted}>
                  {a.email}
                </AppText>
              ) : null}
            </View>

            <View style={styles.panel} accessibilityLiveRegion="polite">
              <Icon name={a.offline ? 'cloudOff' : 'cloud'} size={20} color={a.offline ? colors.skip : colors.keep} />
              <View style={styles.panelText}>
                <AppText variant="label">
                  {a.offline
                    ? 'Waiting for a connection'
                    : a.pending > 0
                      ? 'Syncing…'
                      : a.lastSyncedAt
                        ? `Synced ${timeAgo(a.lastSyncedAt)}`
                        : 'Getting your account ready…'}
                </AppText>
                <AppText variant="bodySmall" color={colors.inkMuted}>
                  {a.pending > 0
                    ? `${pluralize(a.pending, 'change')} will be saved to your account when you're online.`
                    : 'Your kept items, lists and taste are saved to your account and match on every device you sign in on.'}
                </AppText>
              </View>
            </View>

            {a.error ? <ErrorNote text={a.error} /> : null}

            <View style={styles.actions}>
              <Button label="Sync now" icon="sync" variant="secondary" onPress={a.syncNow} disabled={a.busy !== null} />
              <Button label="Sign out" variant="secondary" onPress={a.signOut} disabled={a.busy !== null} />
            </View>
            <AppText variant="caption" color={colors.inkMuted}>
              Signing out removes your kept items and lists from this phone. They stay in your account.
            </AppText>

            <View style={styles.danger}>
              <Button
                label="Delete account"
                variant="ghost"
                onPress={() => setConfirmDelete(true)}
                disabled={a.busy !== null}
                accessibilityHint="Permanently deletes your account and everything in it"
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.head}>
              <AppText variant="eyebrow" color={colors.inkMuted}>
                ACCOUNT
              </AppText>
              <AppText variant="hero" accessibilityRole="header">
                Keep your taste{' '}
                <AppText variant="hero" color={colors.accentText} style={styles.italic}>
                  everywhere.
                </AppText>
              </AppText>
              <AppText variant="body" color={colors.inkMuted}>
                Sign in to save your kept items, lists and style to your account, and pick up where you left off on any
                phone. Everything you’ve done so far comes with you.
              </AppText>
            </View>

            <View style={styles.signIn}>
              <Button
                label={a.busy === 'apple' ? 'Opening Apple…' : 'Continue with Apple'}
                size="lg"
                onPress={() => a.signIn('apple')}
                disabled={a.busy !== null}
              />
              <Button
                label={a.busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                size="lg"
                variant="secondary"
                onPress={() => a.signIn('google')}
                disabled={a.busy !== null}
              />
              {a.busy === 'apple' || a.busy === 'google' ? (
                <ActivityIndicator color={colors.inkMuted} accessibilityLabel="Signing in" />
              ) : null}
            </View>

            {a.error ? <ErrorNote text={a.error} /> : null}

            <AppText variant="caption" color={colors.inkMuted} style={styles.fine}>
              Optional. Swiping works without an account. We only use your name and email to identify your account.
            </AppText>
          </>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={confirmDelete}
        title="Delete your account?"
        message="This permanently deletes your account, your swipes, kept items, lists and style picks. It can't be undone."
        confirmLabel="Delete account"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (await a.deleteAccount()) router.back();
        }}
      />
    </SafeAreaView>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <AppText variant="bodySmall" color={colors.skip}>
        {text}
      </AppText>
    </View>
  );
}

function NotSetUp() {
  return (
    <View style={styles.head}>
      <AppText variant="eyebrow" color={colors.inkMuted}>
        ACCOUNT
      </AppText>
      <AppText variant="hero" accessibilityRole="header">
        Accounts are almost ready
      </AppText>
      <AppText variant="body" color={colors.inkMuted}>
        Sign-in turns on once the app is connected to its server. Until then, everything you do is saved on this phone.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingTop: space.sm },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xl },
  head: { gap: space.md, paddingTop: space.md },
  italic: { fontFamily: fonts.serifItalic },
  panel: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  panelText: { flex: 1, gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  danger: { alignItems: 'flex-start', marginTop: space.xl },
  signIn: { gap: space.md },
  fine: { textAlign: 'center' },
  error: { backgroundColor: colors.skipSoft, borderRadius: radii.sm, padding: space.md },
});
