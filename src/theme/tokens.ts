/**
 * Design tokens. Every color, font, size, space and radius used in the UI
 * lives here. Components must not contain raw hex values.
 *
 * Look: "D · Mix". Warm espresso dark, full-bleed photography, champagne
 * accent, Instrument Serif for names and prices, Geist for everything else.
 */

export const colors = {
  /** Espresso: app background. */
  background: '#12110F',
  /** Slightly raised surface (sheets, inputs, list rows). */
  surface: '#1C1B18',
  /** Hairline borders and dividers. */
  border: '#33312C',
  /** Primary text and icons (warm off-white). */
  ink: '#F3F2EF',
  inkMuted: '#B8B4AC',
  /** Placeholders and decoration only (not for readable text). */
  inkSubtle: '#8C887F',
  /** Text and icons on a light fill (ink- or keep-filled buttons, selected chips). */
  onInk: '#12110F',
  /** Text and icons placed over a photo. */
  onPhoto: '#F3F2EF',
  /** Champagne: keep, selection, the one accent. */
  keep: '#D8C29D',
  keepSoft: '#2A261F',
  /** Rose: skip and errors (readable on the dark background). */
  skip: '#E0A39A',
  skipSoft: '#2E1F1C',
  /** Frosted controls floating over photos. */
  glass: 'rgba(18, 17, 15, 0.34)',
  glassBorder: 'rgba(243, 242, 239, 0.24)',
  glassStrongBorder: 'rgba(243, 242, 239, 0.42)',
  /** Accent-tinted glass for the "For you" bubble. */
  accentGlass: 'rgba(216, 194, 157, 0.16)',
  accentGlassBorder: 'rgba(216, 194, 157, 0.5)',
  accentText: '#EADCC0',
  /** Scrim drawn over photos so text stays legible. */
  scrim: 'rgba(18, 17, 15, 0.88)',
  scrimMid: 'rgba(18, 17, 15, 0.55)',
  scrimLight: 'rgba(18, 17, 15, 0)',
  /** Photo progress lines. */
  pip: 'rgba(243, 242, 239, 0.32)',
  pipActive: '#F3F2EF',
  shadow: '#000000',
  /** Placeholder fill while photos load. */
  placeholder: '#24221F',
} as const;

export const fonts = {
  /** Instrument Serif: names, prices, headings. Loaded in the root layout. */
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  /** Geist: everything else. */
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemiBold: 'Geist_600SemiBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 48, letterSpacing: -0.4 },
  price: { fontFamily: fonts.serif, fontSize: 52, lineHeight: 54, letterSpacing: -0.4 },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34 },
  heading: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28 },
  italic: { fontFamily: fonts.serifItalic, fontSize: 16, lineHeight: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodySmall: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  /** Small spaced-out capitals: FURNITURE · 18 LEFT. Write the text in capitals. */
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14, letterSpacing: 2.2 },
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
  md: 16,
  lg: 22,
  card: 0,
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
