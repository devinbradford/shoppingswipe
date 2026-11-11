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
  ['text on photos over the dark fade', colors.onPhoto, colors.stage],
  ['button text on forest', colors.onAction, colors.action],
  ['text on butter', colors.onInk, colors.keep],
  ['text on soft butter', colors.accentText, colors.keepSoft],
  ['button text on slate', colors.onAction, colors.skip],
  ['slate text on background', colors.skip, colors.background],
  ['accent text on background', colors.accentText, colors.background],
  ['accent text on surface', colors.accentText, colors.surface],
  ['error text on background', colors.danger, colors.background],
  ['error text on surface', colors.danger, colors.surface],
  ['text on the photo stage', colors.onPhoto, colors.stage],
];

describe('color contrast (WCAG AA)', () => {
  it.each(TEXT_PAIRS)('%s is at least 4.5:1', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('subtle ink is only used for placeholders and decoration (3:1 minimum)', () => {
    expect(contrast(colors.inkSubtle, colors.surface)).toBeGreaterThanOrEqual(3);
  });
});

/** A translucent colour ("rgba(r, g, b, a)") drawn over a solid hex background, as a hex colour. */
function over(rgba: string, bg: string): string {
  const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number);
  const n = parseInt(bg.slice(1), 16);
  const base = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mixed = [r, g, b].map((c, i) => Math.round(c * a + base[i] * (1 - a)));
  return '#' + mixed.map((c) => c.toString(16).padStart(2, '0')).join('');
}

describe('swipe controls on the dark stage (Step 4)', () => {
  const fill = over(colors.controlFill, colors.stage);

  it('captions (SKIP / UNDO / KEEP) are readable text: at least 4.5:1', () => {
    expect(contrast(over(colors.onPhotoMuted, colors.stage), colors.stage)).toBeGreaterThanOrEqual(4.5);
  });

  it('Skip and Undo icons stand out on their fill: at least 4.5:1', () => {
    expect(contrast(colors.onPhoto, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('the Keep icon stands out on butter', () => {
    expect(contrast(colors.onInk, colors.keep)).toBeGreaterThanOrEqual(4.5);
  });

  it('button rings are visible against the stage: at least 3:1 (non-text UI)', () => {
    expect(contrast(over(colors.controlRing, colors.stage), colors.stage)).toBeGreaterThanOrEqual(3);
    expect(contrast(over(colors.controlRingSoft, colors.stage), colors.stage)).toBeGreaterThanOrEqual(3);
  });

  it('unavailable Undo is still clearly visible (3:1), just quieter than available Undo', () => {
    const off = over(colors.controlOff, colors.stage);
    expect(contrast(off, colors.stage)).toBeGreaterThanOrEqual(3);
    expect(contrast(off, colors.stage)).toBeLessThan(contrast(colors.onPhoto, fill));
    expect(contrast(over(colors.controlRingOff, colors.stage), colors.stage)).toBeLessThan(
      contrast(over(colors.controlRingSoft, colors.stage), colors.stage),
    );
  });
});
