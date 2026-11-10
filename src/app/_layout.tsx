import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OfflineBanner } from '@/components/OfflineBanner';
import { PurchasePrompt } from '@/components/PurchasePrompt';
import { StateView } from '@/components/StateView';
import { useOnline } from '@/hooks/useOnline';
import { usePurchasePrompt } from '@/hooks/usePurchasePrompt';
import { useVisitTracking } from '@/hooks/useRetention';
import { startNotifications } from '@/lib/notifications';
import { startAuth } from '@/lib/auth';
import { startSyncTriggers } from '@/sync/appSync';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });
  const online = useOnline();
  const reduceMotion = useReduceMotion();
  const purchase = usePurchasePrompt();
  useVisitTracking();
  // If fonts fail we still start, falling back to the system font.
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Accounts and sync run for the whole life of the app.
  useEffect(() => {
    const stopAuth = startAuth();
    const stopSync = startSyncTriggers();
    const stopNotifications = startNotifications();
    return () => {
      stopAuth();
      stopSync();
      stopNotifications();
    };
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <OfflineBanner visible={!online} />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: reduceMotion ? 'fade' : 'slide_from_right',
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="intro" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="taste-intro" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="rooms" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="taste-reveal" options={{ animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="deck/[category]" />
          <Stack.Screen name="lists/[id]" />
          <Stack.Screen name="taste" />
          <Stack.Screen name="weekly" />
          <Stack.Screen name="account" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
          <Stack.Screen name="auth-callback" />
          <Stack.Screen name="product/[id]" options={{ animation: reduceMotion ? 'fade' : 'slide_from_bottom' }} />
          <Stack.Screen
            name="photos/[id]"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              gestureEnabled: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="handoff/[id]"
            options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
          />
        </Stack>
        {purchase.visit ? (
          <PurchasePrompt
            key={purchase.visit.productId}
            title={purchase.visit.title}
            storeName={purchase.visit.storeName}
            onBought={purchase.bought}
            onNotYet={purchase.notYet}
            onIgnore={purchase.dismiss}
            reduceMotion={reduceMotion}
          />
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

/** Shown instead of a screen if it crashes, so the app never goes blank. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StateView
        icon="refresh"
        title="Something went wrong"
        message="This screen hit a problem. Your swipes and kept items are safe."
        primary={{ label: 'Try again', onPress: () => void retry() }}
      />
    </GestureHandlerRootView>
  );
}
