import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/TabBar';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useSwipeStore } from '@/store/swipeStore';
import { colors } from '@/theme/tokens';

/** The four main tabs. Room decks, product pages and setup screens open above them, full screen. */
export default function TabsLayout() {
  const keptSeenAt = usePreferencesStore((s) => s.keptSeenAt);
  // Pieces kept since the Kept tab was last opened.
  const fresh = useSwipeStore((s) => s.saved.filter((i) => i.savedAt > keptSeenAt).length);

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" options={{ title: 'For you' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen
        name="kept"
        options={{ title: 'Kept', tabBarBadge: fresh > 0 ? (fresh > 9 ? '9+' : fresh) : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
