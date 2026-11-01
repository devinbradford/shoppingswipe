/** Rules for the first-launch style picker. */
export const MIN_STYLE_PICKS = 3;
export const MAX_STYLE_PICKS = 5;

/** Toggle a style; refuses to go past the maximum. */
export function toggleStylePick(picks: readonly string[], tag: string, max = MAX_STYLE_PICKS): string[] {
  if (picks.includes(tag)) return picks.filter((p) => p !== tag);
  if (picks.length >= max) return [...picks];
  return [...picks, tag];
}

/** Button text for the picker's main action. */
export function pickerCta(count: number, min = MIN_STYLE_PICKS): string {
  if (count >= min) return 'Start swiping';
  const left = min - count;
  return `Pick ${left} more`;
}
