import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OfflineBanner } from '@/components/OfflineBanner';
import { StateView } from '@/components/StateView';
import { useOnline } from '@/hooks/useOnline';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const online = useOnline();
  // If fonts fail we still start, falling back to the system font.
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      <OfflineBanner visible={!online} />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="deck/[category]" />
          <Stack.Screen name="kept" />
          <Stack.Screen name="lists/[id]" />
          <Stack.Screen name="product/[id]" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
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
