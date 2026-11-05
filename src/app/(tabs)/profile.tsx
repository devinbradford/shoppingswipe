import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { ProfileRow, ProfileSection } from '@/components/ProfileRow';
import { budgetAnchor, formatBudget, NO_LIMIT, type RoomChoice } from '@/domain/budget';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { useSwipeStore } from '@/store/swipeStore';
import { useWishlistStore } from '@/store/wishlistStore';
import { colors, space } from '@/theme/tokens';

const ROOM_LABEL: Record<RoomChoice, string> = {
  'living-room': 'Living room',
  bedroom: 'Bedroom',
  'kitchen-dining': 'Kitchen & dining',
  browsing: 'Just browsing',
};

const SITE = 'https://cureavo.com';
const CONTACT = 'hello@cureavo.com';

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Profile tab: your styles, room and budget, account, and the small print. */
export default function ProfileScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const picks = usePreferencesStore((s) => s.stylePicks);
  const room = usePreferencesStore((s) => s.room);
  const budget = usePreferencesStore((s) => s.budget);
  const auth = useAuthStore();
  const anchor = budgetAnchor(room);
  const version = Constants.expoConfig?.version;

  const budgetText = budget
    ? `${formatBudget(budget.maxCents / 100)} for ${anchor.subcategoryId === budget.subcategoryId ? anchor.noun : 'a key piece'}`
    : formatBudget(NO_LIMIT);
  const openSite = (path: string) => WebBrowser.openBrowserAsync(`${SITE}${path}`).catch(() => {});

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + space.xxl }]}>
        <AppText variant="hero" accessibilityRole="header">
          Profile
        </AppText>

        <ProfileSection title="YOUR TASTE">
          <ProfileRow
            icon="sparkles"
            title="Your styles"
            detail={picks.length > 0 ? picks.map(titleCase).join(' · ') : 'None picked yet'}
            onPress={() => router.push('/welcome')}
            hint="Change the styles your feed starts from"
          />
          <ProfileRow
            icon="grid"
            title="Shopping for"
            detail={room ? ROOM_LABEL[room] : 'Every room'}
            onPress={() => router.push({ pathname: '/setup/room', params: { edit: '1' } })}
            hint="Choose the room For you opens on"
          />
          <ProfileRow
            icon="bag"
            title="Budget"
            detail={budgetText}
            onPress={() => router.push({ pathname: '/setup/budget', params: { edit: '1' } })}
            hint="A soft limit; pricier pieces still show up, just less often"
          />
        </ProfileSection>

        <ProfileSection title="ACCOUNT">
          <ProfileRow
            icon="person"
            title={auth.status === 'signedIn' ? (auth.name ?? 'Your account') : 'Sign in'}
            detail={
              auth.status === 'signedIn'
                ? 'Sync, sign out or delete your account'
                : 'Optional. Keeps your kept items and taste on every phone.'
            }
            onPress={() => router.push('/account')}
          />
        </ProfileSection>

        <ProfileSection title="ABOUT">
          <ProfileRow
            icon="shield"
            title="Privacy policy"
            onPress={() => openSite('/privacy.html')}
            hint="Opens in your browser"
            external
          />
          <ProfileRow
            icon="info"
            title="How CureAvo makes money"
            detail="Stores may pay us a small commission. Your price never changes."
            onPress={() => openSite('/#disclosure')}
            hint="Opens in your browser"
            external
          />
          <ProfileRow
            icon="mail"
            title="Contact us"
            detail={CONTACT}
            onPress={() => Linking.openURL(`mailto:${CONTACT}`).catch(() => {})}
            hint="Opens your email app"
            external
          />
        </ProfileSection>

        <View style={styles.footer}>
          <ResetLink />
          {version ? (
            <AppText variant="caption" color={colors.inkSubtle}>
              CureAvo {version}
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Clears everything on this phone, so the sample catalog can be replayed. */
function ResetLink() {
  const resetSwipes = useSwipeStore((s) => s.resetAll);
  const resetLists = useWishlistStore((s) => s.resetAll);
  const resetPrefs = usePreferencesStore((s) => s.resetAll);
  const resetPurchases = usePurchaseStore((s) => s.resetAll);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setConfirm(true)}
        accessibilityRole="button"
        accessibilityLabel="Reset swipes, kept items and lists"
        style={styles.reset}>
        <AppText variant="caption" color={colors.inkMuted}>
          Reset swipes, kept items and lists
        </AppText>
      </Pressable>
      <ConfirmSheet
        visible={confirm}
        title="Reset everything?"
        message="This clears your swipes, kept items, lists, style picks and learned taste on this phone."
        confirmLabel="Reset"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          resetSwipes();
          resetLists();
          resetPrefs();
          resetPurchases();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xl },
  footer: { alignItems: 'center', gap: space.xs },
  reset: { padding: space.lg, minHeight: 48, justifyContent: 'center' },
});
