import { colors } from '../tokens';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text pairs actually used in the app. 4.5:1 is the WCAG AA minimum for normal text.
const TEXT_PAIRS: [string, string, string][] = [
  ['text on background', colors.ink, colors.background],
  ['text on surface', colors.ink, colors.surface],
  ['muted text on background', colors.inkMuted, colors.background],
  ['muted text on surface', colors.inkMuted, colors.surface],
  ['text on photos over the dark fade', colors.onPhoto, colors.background],
  ['button text on light button', colors.onInk, colors.ink],
  ['button text on champagne', colors.onInk, colors.keep],
  ['button text on rose', colors.onInk, colors.skip],
  ['champagne on its soft panel', colors.keep, colors.keepSoft],
  ['accent text on soft panel', colors.accentText, colors.keepSoft],
  ['rose text on its soft panel', colors.skip, colors.skipSoft],
  ['rose text on background', colors.skip, colors.background],
  ['champagne text on background', colors.keep, colors.background],
];

describe('color contrast (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('subtle ink is only used for placeholders and decoration (3:1 minimum)', () => {
    expect(contrast(colors.inkSubtle, colors.surface)).toBeGreaterThanOrEqual(3);
  });
});
