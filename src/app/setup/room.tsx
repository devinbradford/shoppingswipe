import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GlassIconButton } from '@/components/Glass';
import { ProductImage } from '@/components/ProductImage';
import type { RoomChoice } from '@/domain/budget';
import type { SubcategoryId } from '@/domain/types';
import { STYLE_PHOTOS, stylePhoto } from '@/data/stylePhotos';
import { useCategorySummaries } from '@/hooks/useCatalog';
import { usePreferencesStore } from '@/store/preferencesStore';
import { colors, fonts, radii, space } from '@/theme/tokens';

const ROOMS: { id: RoomChoice; label: string; detail: string; cover?: SubcategoryId }[] = [
  { id: 'living-room', label: 'Living room', detail: 'Sofas, chairs, rugs', cover: 'sofas' },
  { id: 'bedroom', label: 'Bedroom', detail: 'Beds, nightstands, dressers', cover: 'bed-frames' },
  { id: 'kitchen-dining', label: 'Kitchen & dining', detail: 'Tables, chairs, stools', cover: 'dining-tables' },
  { id: 'browsing', label: 'Just browsing', detail: 'A bit of everything' },
];

const GAP = space.sm + 2;

/**
 * Onboarding: "What are you shopping for right now?" For you opens on that room afterwards.
 * With `?edit=1` (from Profile) it saves the choice and goes back.
 */
export default function RoomScreen() {
  const insets = useSafeAreaInsets();
  const editing = useLocalSearchParams<{ edit?: string }>().edit === '1';
  const current = usePreferencesStore((s) => s.room);
  const { summaries } = useCategorySummaries();
  const picks = usePreferencesStore((s) => s.stylePicks);
  const setRoom = usePreferencesStore((s) => s.setRoom);
  const [width, setWidth] = useState(0);
  const tile = Math.max(120, Math.floor((width - 2 * space.xl - GAP) / 2));

  const coverOf = (type?: SubcategoryId) =>
    type ? summaries.flatMap((r) => r.subcategories).find((s) => s.id === type)?.coverUrl : undefined;
  const browsePhoto = stylePhoto(picks[0] ?? '') ?? STYLE_PHOTOS[0].source;

  const choose = (room: RoomChoice | null) => {
    if (room) Haptics.selectionAsync().catch(() => {});
    setRoom(room);
    if (editing) router.back();
    else router.push('/setup/budget');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.md, paddingBottom: editing ? insets.bottom + space.xl : space.xl },
        ]}
        bounces={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <GlassIconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={styles.header}>
          <AppText variant="eyebrow" color={colors.inkMuted}>
            {editing ? 'SHOPPING FOR' : 'STEP 2 OF 3'}
          </AppText>
          <AppText variant="hero" accessibilityRole="header">
            What are you shopping for{' '}
            <AppText variant="hero" color={colors.accentText} style={styles.italic}>
              right now?
            </AppText>
          </AppText>
          <AppText variant="body" color={colors.inkMuted}>
            {editing
              ? 'For you starts on this room. You can switch rooms any time.'
              : "We'll open straight into it. You can explore every room later."}
          </AppText>
        </View>

        <View style={styles.grid}>
          {ROOMS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => choose(r.id)}
              accessibilityRole="button"
              accessibilityLabel={`${r.label}. ${r.detail}`}
              accessibilityState={editing ? { selected: r.id === current } : undefined}
              style={({ pressed }) => [
                styles.tile,
                { width: tile, height: Math.round(tile * 1.15) },
                editing && r.id === current && styles.current,
                pressed && styles.pressed,
              ]}>
              {r.cover ? (
                <ProductImage uri={coverOf(r.cover)} style={StyleSheet.absoluteFill} />
              ) : (
                <Image source={browsePhoto} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
              <LinearGradient
                colors={[colors.scrimLight, colors.scrimMid, colors.scrim]}
                locations={[0.3, 0.65, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.tileText}>
                <AppText variant="heading" color={colors.onPhoto}>
                  {r.label}
                </AppText>
                <AppText variant="caption" color={colors.inkMuted}>
                  {r.detail}
                </AppText>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {editing ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <Button label="Skip" variant="ghost" onPress={() => choose(null)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.xl },
  header: { gap: space.md },
  italic: { fontFamily: fonts.serifItalic },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  current: { borderColor: colors.accent, borderWidth: 2 },
  pressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent },
  tileText: { padding: space.md, gap: 2 },
  footer: { paddingHorizontal: space.xl, paddingTop: space.sm },
});
