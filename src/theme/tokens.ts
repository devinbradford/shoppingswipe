/**
 * Design tokens. Every color, font, size, space and radius used in the UI
 * lives here. Components must not contain raw hex values.
 */

export const colors = {
  /** Stone: app background. */
  background: '#ECEEEA',
  /** Slightly raised surface (tiles, inputs). */
  surface: '#F6F7F4',
  /** Hairline borders and dividers. */
  border: '#D9DCD5',
  /** Graphite: primary text and icons. */
  ink: '#22283A',
  inkMuted: '#5C6272',
  inkSubtle: '#8A8F9B',
  /** Text and icons placed on a dark or colored fill. */
  onInk: '#F6F7F4',
  /** Bottle-green: keep. */
  keep: '#2E6A4F',
  keepSoft: '#DCE8E1',
  /** Oxblood: skip. */
  skip: '#9E3B36',
  skipSoft: '#F1DEDC',
  /** Scrim drawn over photos so text stays legible. */
  scrim: 'rgba(16, 19, 28, 0.62)',
  scrimLight: 'rgba(16, 19, 28, 0)',
  /** Photo progress pips. */
  pip: 'rgba(246, 247, 244, 0.45)',
  pipActive: '#F6F7F4',
  shadow: '#10131C',
  /** Placeholder fill while photos load. */
  placeholder: '#DDE0D9',
} as const;

export const fonts = {
  /** Bricolage Grotesque: headings and prices. Loaded in the root layout. */
  display: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
  displayExtra: 'BricolageGrotesque_800ExtraBold',
  /** `undefined` means the platform system font. */
  body: undefined,
} as const;

export const type = {
  hero: { fontFamily: fonts.displayExtra, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  price: { fontFamily: fonts.displayExtra, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
  label: { fontFamily: fonts.displayMedium, fontSize: 16, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 22 },
  bodySmall: { fontSize: 14, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  card: 28,
  pill: 999,
} as const;

/** Minimum tap target (Apple HIG 44pt, Material 48dp). */
export const hitTarget = 48;

export const motion = {
  /** Fraction of screen width the card must travel to count as a swipe. */
  swipeThreshold: 0.28,
  /** Fling speed (pt/s) that commits a swipe regardless of distance. */
  swipeVelocity: 900,
  flyOutMs: 220,
} as const;
