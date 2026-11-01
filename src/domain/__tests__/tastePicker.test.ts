import { MAX_STYLE_PICKS, pickerCta, toggleStylePick } from '../tastePicker';

describe('style picker rules', () => {
  it('toggles picks and stops at the maximum', () => {
    let picks: string[] = [];
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f']) picks = toggleStylePick(picks, s);
    expect(picks).toHaveLength(MAX_STYLE_PICKS);
    expect(picks).not.toContain('f');
    expect(toggleStylePick(picks, 'a')).not.toContain('a');
  });

  it('tells the user how many more to pick', () => {
    expect(pickerCta(0)).toBe('Pick 3 more');
    expect(pickerCta(2)).toBe('Pick 1 more');
    expect(pickerCta(3)).toBe('Start swiping');
  });
});
