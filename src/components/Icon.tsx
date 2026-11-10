import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { colors } from '@/theme/tokens';

type PlatformNames = Extract<SymbolViewProps['name'], { android?: unknown }>;
type SFSymbol = NonNullable<PlatformNames['ios']>;
type AndroidSymbol = NonNullable<PlatformNames['android']>;

const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  close: { ios: 'xmark', android: 'close' },
  keep: { ios: 'heart.fill', android: 'favorite' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  search: { ios: 'magnifyingglass', android: 'search' },
  external: { ios: 'arrow.up.right', android: 'arrow_outward' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  bag: { ios: 'bag', android: 'shopping_bag' },
  check: { ios: 'checkmark', android: 'check' },
  info: { ios: 'info.circle', android: 'info' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync' },
  cloud: { ios: 'checkmark.icloud', android: 'cloud_done' },
  cloudOff: { ios: 'icloud.slash', android: 'cloud_off' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view' },
  heart: { ios: 'heart', android: 'favorite_border' },
  mail: { ios: 'envelope', android: 'mail' },
  shield: { ios: 'lock.shield', android: 'shield' },
  plus: { ios: 'plus', android: 'add' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  sort: { ios: 'arrow.up.arrow.down', android: 'swap_vert' },
  trash: { ios: 'trash', android: 'delete' },
  list: { ios: 'rectangle.stack', android: 'collections_bookmark' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  swipe: { ios: 'hand.draw', android: 'swipe' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/** Native icons: SF Symbols on iOS, Material Symbols on Android. Decorative only. */
export function Icon({ name, size = 22, color = colors.ink }: IconProps) {
  const icon = ICONS[name];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android, web: icon.android }}
      size={size}
      tintColor={color}
      weight="semibold"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
