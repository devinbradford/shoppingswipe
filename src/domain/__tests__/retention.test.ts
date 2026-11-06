import {
  addVisitDay,
  dayKey,
  isReturnVisit,
  shouldOfferReminder,
  sinceLabel,
  weekKey,
  weekLabel,
  weekStart,
} from '../retention';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('weeks', () => {
  it('start on Monday, local time', () => {
    // Thu Nov 5 2026 → Mon Nov 2
    expect(weekKey(at(2026, 11, 5))).toBe('2026-11-02');
    // Sunday still belongs to the week that started Monday
    expect(weekKey(at(2026, 11, 8, 23))).toBe('2026-11-02');
    expect(weekKey(at(2026, 11, 9, 0))).toBe('2026-11-09');
    expect(new Date(weekStart(at(2026, 11, 5))).getDay()).toBe(1);
    expect(weekLabel(at(2026, 11, 5))).toBe('Week of Nov 2');
  });
});

describe('returns', () => {
  it('needs a new day and 12+ hours', () => {
    expect(isReturnVisit(0, at(2026, 11, 5))).toBe(false);
    expect(isReturnVisit(at(2026, 11, 5, 9), at(2026, 11, 5, 23))).toBe(false);
    expect(isReturnVisit(at(2026, 11, 5, 23), at(2026, 11, 6, 7))).toBe(false);
    expect(isReturnVisit(at(2026, 11, 5, 18), at(2026, 11, 6, 9))).toBe(true);
  });

  it('says when they were last here in plain words', () => {
    const now = at(2026, 11, 6);
    expect(sinceLabel(at(2026, 11, 5), now)).toBe('since yesterday');
    expect(sinceLabel(at(2026, 11, 3), now)).toBe('since Tuesday');
    expect(sinceLabel(at(2026, 10, 20), now)).toBe('since Oct 20');
  });

  it('counts distinct visit days', () => {
    let days: string[] = [];
    days = addVisitDay(days, at(2026, 11, 5, 9));
    days = addVisitDay(days, at(2026, 11, 5, 20));
    days = addVisitDay(days, at(2026, 11, 6));
    expect(days).toEqual([dayKey(at(2026, 11, 5)), dayKey(at(2026, 11, 6))]);
  });
});

describe('reminder offer', () => {
  it('waits for real use and asks once', () => {
    expect(shouldOfferReminder({ visitDays: 1, keepCount: 9, decided: false })).toBe(false);
    expect(shouldOfferReminder({ visitDays: 2, keepCount: 4, decided: false })).toBe(false);
    expect(shouldOfferReminder({ visitDays: 2, keepCount: 5, decided: false })).toBe(true);
    expect(shouldOfferReminder({ visitDays: 5, keepCount: 20, decided: true })).toBe(false);
  });
});
