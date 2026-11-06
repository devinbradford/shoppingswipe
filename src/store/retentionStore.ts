import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { addVisitDay, isReturnVisit } from '@/domain/retention';

/**
 * Facts about coming back: when they were last here, which days they visited, this
 * week's "weekly 10", and their reminder choice. On this phone only.
 */
interface RetentionState {
  /** When the app last went to the background (or was last opened), epoch ms. */
  lastActiveAt: number;
  /** Distinct local days with a visit (last 60). */
  visitDays: string[];
  /** Set when they come back after a day or more: when they were last here, and when they came back. Not saved. */
  welcome: { since: number; at: number } | null;
  /** This week's picks, chosen once per week so they don't shuffle. */
  weekly: { key: string; ids: string[] } | null;
  /** Weekly reminder: null until they decide. */
  reminder: 'on' | 'off' | null;
  /** Id of the scheduled local notification, to cancel it later. */
  reminderId: string | null;
  opened: (now: number) => void;
  left: (now: number) => void;
  dismissWelcome: () => void;
  setWeekly: (weekly: { key: string; ids: string[] }) => void;
  setReminder: (reminder: 'on' | 'off', reminderId: string | null) => void;
  resetAll: () => void;
}

export const useRetentionStore = create<RetentionState>()(
  persist(
    (set, get) => ({
      lastActiveAt: 0,
      visitDays: [],
      welcome: null,
      weekly: null,
      reminder: null,
      reminderId: null,
      opened: (now) => {
        const { lastActiveAt, visitDays } = get();
        set({
          welcome: isReturnVisit(lastActiveAt, now) ? { since: lastActiveAt, at: now } : get().welcome,
          visitDays: addVisitDay(visitDays, now),
          lastActiveAt: now,
        });
      },
      left: (now) => set({ lastActiveAt: now }),
      dismissWelcome: () => set({ welcome: null }),
      setWeekly: (weekly) => set({ weekly }),
      setReminder: (reminder, reminderId) => set({ reminder, reminderId }),
      resetAll: () => set({ visitDays: [], welcome: null, weekly: null }),
    }),
    {
      name: 'cureavo.retention.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        lastActiveAt: s.lastActiveAt,
        visitDays: s.visitDays,
        weekly: s.weekly,
        reminder: s.reminder,
        reminderId: s.reminderId,
      }),
    },
  ),
);
