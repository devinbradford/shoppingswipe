/**
 * Coming-back rules: visits, "Your weekly 10" weeks, and when to offer the reminder.
 * Pure: no React, no storage. Times are epoch ms; days and weeks use the phone's local time.
 */

const HOUR = 3600_000;

/** "2026-11-06": the local calendar day. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight at the start of the week's Monday. */
export function weekStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d.getTime();
}

/** Identifies a week (its Monday), e.g. "2026-11-02". */
export function weekKey(at: number): string {
  return dayKey(weekStart(at));
}

/** "Week of Nov 2". */
export function weekLabel(at: number): string {
  return `Week of ${new Date(weekStart(at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** A return worth welcoming: a different day, and at least 12 hours since they were last here. */
export function isReturnVisit(lastActiveAt: number, now: number): boolean {
  return lastActiveAt > 0 && now - lastActiveAt >= 12 * HOUR && dayKey(lastActiveAt) !== dayKey(now);
}

/** "since yesterday", "since Tuesday" (within the last week) or "since Oct 28". */
export function sinceLabel(then: number, now: number): string {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfThen = new Date(then).setHours(0, 0, 0, 0);
  const days = Math.round((startOfToday - startOfThen) / (24 * HOUR));
  if (days <= 1) return 'since yesterday';
  if (days < 7) return `since ${new Date(then).toLocaleDateString('en-US', { weekday: 'long' })}`;
  return `since ${new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Remember the day of a visit (keeps the last 60 distinct days). */
export function addVisitDay(days: readonly string[], at: number): string[] {
  const key = dayKey(at);
  return days.includes(key) ? [...days] : [...days, key].slice(-60);
}

/** Offer the weekly reminder only after real use: a second day of visits and 5+ keeps, and only once. */
export function shouldOfferReminder({
  visitDays,
  keepCount,
  decided,
}: {
  visitDays: number;
  keepCount: number;
  decided: boolean;
}): boolean {
  return !decided && visitDays >= 2 && keepCount >= 5;
}
