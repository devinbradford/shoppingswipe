import { formatPrice, timeAgo } from '../format';

describe('formatting', () => {
  it('formats prices', () => {
    expect(formatPrice(12900)).toBe('$129');
    expect(formatPrice(4999)).toBe('$49.99');
  });

  it('says how long ago a sync happened', () => {
    const now = 1_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(timeAgo(now - 26 * 3_600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });
});
