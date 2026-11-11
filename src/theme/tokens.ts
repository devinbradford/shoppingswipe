/**
 * Design tokens. Every color, font, size, space and radius used in the UI
 * lives here. Components must not contain raw hex values.
 *
 * Look: "The Pick", Forest & Butter (Devin's choice, Nov 2026). Cream pages,
 * forest green for actions and accents, butter only for the moment something
 * is picked or loved, product photos always the most colourful thing on screen.
 * Instrument Serif for names, prices and headings; DM Sans for everything else.
 */

export const colors = {
  /** Cream: app background. */
  background: '#FBF7EC',
  /** Paper: raised surfaces (sheets, inputs, list rows, room-photo cards). */
  surface: '#F1ECDD',
  /** Clean white behind product cut-out photos, so white photo backgrounds look intentional. */
  card: '#FFFFFF',
  /** Hairline borders and dividers. */
  border: '#E2DCCB',
  /** Primary text and icons (deep green-black). */
  ink: '#1C2A22',
  inkMuted: '#4F5C53',
  /** Placeholders and decoration only (not for readable text). */
  inkSubtle: '#7C877F',
  /** Text and icons on a butter fill (picked, loved, selected chips). */
  onInk: '#1C2A22',
  /** Forest: main buttons and the one accent for text, icons and selected borders. */
  action: '#23412F',
  /** Text and icons on a forest or dark fill. */
  onAction: '#FBF7EC',
  accent: '#23412F',
  accentText: '#23412F',
  /** Text and icons placed over a photo. */
  onPhoto: '#FBF7EC',
  /** Secondary text over a photo (store name, counts). */
  onPhotoMuted: 'rgba(251, 247, 236, 0.8)',
  /** Behind full-screen photos (rooms, photo viewer): a gallery wall. */
  stage: '#1C2A22',
  /** Butter: keep / love / picked. Always with dark text on it. */
  keep: '#EBCB6B',
  keepSoft: '#F6EBC4',
  /** Pass / skip: a quiet slate, never red (passing on something isn't an error). */
  skip: '#5D6A61',
  skipSoft: '#E4E6DF',
  /** Errors and destructive actions. */
  danger: '#A8432F',
  /** Frosted controls floating over photos. */
  glass: 'rgba(28, 42, 34, 0.38)',
  glassBorder: 'rgba(251, 247, 236, 0.32)',
  glassStrongBorder: 'rgba(251, 247, 236, 0.5)',
  /** The bottom tab bar: cream, nearly opaque. */
  tabBar: 'rgba(251, 247, 236, 0.98)',
  /** Soft butter panel for the "For you" bubble and quiet highlights. */
  accentGlass: '#F6EBC4',
  accentGlassBorder: '#E3CF8A',
  /** Scrim drawn over photos so text stays legible. */
  scrim: 'rgba(28, 42, 34, 0.86)',
  scrimMid: 'rgba(28, 42, 34, 0.52)',
  scrimLight: 'rgba(28, 42, 34, 0)',
  /** Drag feedback on the swipe card: butter for Keep, slate for Skip. */
  keepGlow: 'rgba(235, 203, 107, 0.7)',
  keepWash: 'rgba(235, 203, 107, 0.08)',
  skipGlow: 'rgba(93, 106, 97, 0.55)',
  skipWash: 'rgba(93, 106, 97, 0.06)',
  /** Progress lines. */
  pip: 'rgba(28, 42, 34, 0.18)',
  pipActive: '#1C2A22',
  shadow: '#1C2A22',
  /** Placeholder fill while photos load. */
  placeholder: '#EDE7D8',
  /**
   * Skip / Undo / Keep under the swipe card (Step 4, Option A). Over the dark stage:
   * a faint cream fill and ring so Skip and Undo read as buttons; Keep stays solid butter.
   * Captions use `onPhotoMuted`. "Off" = Undo when there's nothing to undo: outline only, softer icon.
   */
  controlFill: 'rgba(251, 247, 236, 0.1)',
  controlRing: 'rgba(251, 247, 236, 0.6)',
  controlRingSoft: 'rgba(251, 247, 236, 0.4)',
  controlRingOff: 'rgba(251, 247, 236, 0.24)',
  controlOff: 'rgba(251, 247, 236, 0.45)',
  /** Paper tints behind the line drawings on "What are you shopping for?" (one per room). */
  paperOat: '#EDE3D0',
  paperSage: '#DFE4DC',
  paperClay: '#ECD9CC',
  paperStone: '#E5E2DA',
  /** The soft circle of light behind each drawing. */
  paperGlow: 'rgba(251, 247, 236, 0.6)',
} as const;

export const fonts = {
  /** Instrument Serif: names, prices, headings. Loaded in the root layout. */
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  /** DM Sans: everything else. */
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.serif, fontSize: 46, lineHeight: 48, letterSpacing: -0.4 },
  price: { fontFamily: fonts.serif, fontSize: 52, lineHeight: 54, letterSpacing: -0.4 },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34 },
  heading: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28 },
  /** Product name under the photo on the swipe card (two lines at most). */
  cardTitle: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28 },
  /** Price beside the store name on the swipe card. */
  cardPrice: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 26 },
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
  /** Upward drag (pt) or fling speed that opens the product page. */
  openDistance: 110,
  openVelocity: 800,
} as const;
