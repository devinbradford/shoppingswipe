import { addPurchase, canAskAboutPurchase, markAsked } from '../purchases';

describe('purchase questions', () => {
  it('asks once per product', () => {
    expect(canAskAboutPurchase('a', [], [])).toBe(true);
    const asked = markAsked([], 'a');
    expect(canAskAboutPurchase('a', [], asked)).toBe(false);
    expect(canAskAboutPurchase('b', [], asked)).toBe(true);
  });

  it('never asks about something already bought', () => {
    expect(canAskAboutPurchase('a', [{ productId: 'a', at: 1 }], [])).toBe(false);
  });

  it('records a purchase once, newest first', () => {
    const one = addPurchase([], 'a', 1);
    const two = addPurchase(one, 'b', 2);
    expect(two.map((p) => p.productId)).toEqual(['b', 'a']);
    expect(addPurchase(two, 'a', 3)).toEqual(two);
  });

  it('keeps the asked list bounded', () => {
    let asked: string[] = [];
    for (let i = 0; i < 600; i++) asked = markAsked(asked, `p${i}`);
    expect(asked).toHaveLength(500);
    expect(asked.at(-1)).toBe('p599');
  });
});
