import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getProductRepository } from '@/data';
import { shouldOfferReminder, weekKey, weekLabel } from '@/domain/retention';
import type { Product } from '@/domain/types';
import { cancelReminder, notificationsSupported, scheduleWeeklyReminder } from '@/lib/notifications';
import { hashSeed, pickWeekly } from '@/recommendation';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useRetentionStore } from '@/store/retentionStore';
import { selectSwipedIds, useSwipeStore } from '@/store/swipeStore';
import { useHydrated } from '@/store/useHydrated';
import { currentTasteModel, engagedProductIds } from './tasteModel';

/** Records visits: opening the app (or coming back to it) and leaving it. Mount once, in the root layout. */
export function useVisitTracking() {
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated) return;
    const { opened, left } = useRetentionStore.getState();
    opened(Date.now());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useRetentionStore.getState().opened(Date.now());
      else if (state === 'background') left(Date.now());
    });
    return () => sub.remove();
  }, [hydrated]);
}

/** Swipes (or style picks) needed before the weekly 10 is worth choosing. */
const WEEKLY_AFTER_SWIPES = 10;

export interface Weekly {
  /** "Week of Nov 2". */
  label: string;
  /** This week's picks, or null until there's enough taste to choose them. */
  ids: string[] | null;
  /** Picks not swiped yet. */
  remaining: number;
  /** Not opened yet this week. */
  isNew: boolean;
  markSeen: () => void;
}

/** "Your weekly 10": chosen once per week (Monday) from their taste, then fixed for the week. */
export function useWeekly(): Weekly {
  const hydrated = useHydrated();
  const weekly = useRetentionStore((s) => s.weekly);
  const setWeekly = useRetentionStore((s) => s.setWeekly);
  const swipes = useSwipeStore((s) => s.swipes);
  const seeded = usePreferencesStore((s) => s.stylePicks.length >= 3 || s.roomAnswers.length >= 4);
  const ready = swipes.length >= WEEKLY_AFTER_SWIPES || seeded;
  const [now] = useState(() => Date.now());
  const key = weekKey(now);
  const current = weekly?.key === key ? weekly : null;

  useEffect(() => {
    if (!hydrated || !ready || current) return;
    let cancelled = false;
    const repo = getProductRepository();
    (async () => {
      const swipedIds = selectSwipedIds(useSwipeStore.getState());
      const [candidates, engaged, bands] = await Promise.all([
        repo.listProducts({ excludeIds: swipedIds }),
        repo.getProducts(engagedProductIds()),
        repo.getPriceBands(),
      ]);
      if (cancelled) return;
      const known = new Map<string, Product>([...candidates, ...engaged].map((p) => [p.id, p]));
      const picks = pickWeekly(candidates, currentTasteModel(known, bands), bands, hashSeed(`weekly:${key}`));
      if (picks.length > 0) setWeekly({ key, ids: picks.map((p) => p.id) });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hydrated, ready, current, key, setWeekly]);

  const remaining = useMemo(() => {
    if (!current) return 0;
    const swiped = selectSwipedIds({ swipes });
    return current.ids.filter((id) => !swiped.has(id)).length;
  }, [current, swipes]);

  const seenKey = useRetentionStore((s) => s.weeklySeenKey);
  const markWeeklySeen = useRetentionStore((s) => s.markWeeklySeen);
  const markSeen = useCallback(() => markWeeklySeen(key), [markWeeklySeen, key]);
  return { label: weekLabel(now), ids: current?.ids ?? null, remaining, isNew: !!current && seenKey !== key, markSeen };
}

/** The weekly reminder: whether to offer it, and turning it on or off. */
export function useReminder() {
  const reminder = useRetentionStore((s) => s.reminder);
  const reminderId = useRetentionStore((s) => s.reminderId);
  const visitDays = useRetentionStore((s) => s.visitDays.length);
  const setReminder = useRetentionStore((s) => s.setReminder);
  const keepCount = useSwipeStore((s) => s.saved.length);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      // On web (the preview) there's nothing to schedule; the choice is still remembered.
      const id = notificationsSupported ? await scheduleWeeklyReminder() : null;
      if (notificationsSupported && !id) {
        setBlocked(true);
        setReminder('off', null);
      } else setReminder('on', id);
    } catch {
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  }, [setReminder]);

  const turnOff = useCallback(async () => {
    await cancelReminder(reminderId);
    setReminder('off', null);
  }, [reminderId, setReminder]);

  return {
    on: reminder === 'on',
    offer: shouldOfferReminder({ visitDays, keepCount, decided: reminder !== null }),
    busy,
    /** They said yes, but the phone's notification permission is off. */
    blocked,
    turnOn,
    turnOff,
    decline: () => setReminder('off', null),
  };
}
