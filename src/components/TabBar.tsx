import * as Haptics from 'expo-haptics';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/tabs';
import { useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/** Tab route name → icon. Labels come from each screen's `title` option. */
const ICONS: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: 'sparkles', active: 'sparkles' },
  discover: { idle: 'grid', active: 'grid' },
  kept: { idle: 'heart', active: 'keep' },
  profile: { idle: 'person', active: 'person' },
};

/**
 * CureAvo's own tab bar: slim, espresso, floating over the bottom of the
 * screen. The active tab turns champagne with a small dot. Reports its height
 * so screens can leave room for it (`useBottomTabBarHeight`).
 */
export function TabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
      onLayout={(e) => reportHeight?.(e.nativeEvent.layout.height)}
      accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        const focused = state.index === i;
        const label = typeof options.title === 'string' ? options.title : route.name;
        const icon = ICONS[route.name] ?? { idle: 'info', active: 'info' };
        const badge = options.tabBarBadge;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              if (!focused) {
                Haptics.selectionAsync().catch(() => {});
                navigateToTab(route.key);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${label}, ${badge} new` : label}
            style={styles.item}>
            <View style={[styles.dot, focused && styles.dotOn]} />
            <View>
              <Icon
                name={focused ? icon.active : icon.idle}
                size={21}
                color={focused ? colors.keep : colors.inkMuted}
              />
              {badge ? (
                <View style={styles.badge}>
                  <AppText variant="caption" color={colors.onInk} style={styles.badgeText}>
                    {badge}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="caption" color={focused ? colors.accentText : colors.inkMuted} numberOfLines={1}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: space.xs,
    backgroundColor: colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52, justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 2 },
  dotOn: { backgroundColor: colors.keep },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.keep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
