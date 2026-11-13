import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newId } from '@/lib/ids';
import type { EngagementSignal, Feedback, FeatureFeedback, SignalType, SkipReason } from '@/recommendation';

/**
 * On-device record of how the shopper engages beyond swiping (opening a
 * product, browsing photos, adding to a list, Buy now, un-keeping, how long a
 * card was looked at) and their answers to the occasional question.
 *
 * Facts only, like swipeStore; the taste model in src/recommendation reads them.
 * Stays on this phone for now (not synced to the account yet).
 */
interface SignalState {
  signals: EngagementSignal[];
  feedback: Feedback[];
  record: (productId: string, type: SignalType, value?: number) => void;
  answerFeature: (featureKey: string, answer: FeatureFeedback['answer']) => void;
  answerSkipReason: (productId: string, reason: SkipReason) => void;
  /** "Your taste" → Start fresh: forget everything learned so far (Kept and lists stay). */
  startFresh: () => void;
  /** Clears everything. Called only from `clearLocalLearningData` / `claimLocalLearningData`. */
  resetAll: () => void;
}

/** Keep storage small: the oldest signals matter least anyway (they decay). */
const MAX_SIGNALS = 3000;

export const useSignalStore = create<SignalState>()(
  persist(
    (set) => ({
      signals: [],
      feedback: [],
      record: (productId, type, value) =>
        set((s) => ({
          signals: [...s.signals, { id: newId(), productId, type, at: Date.now(), value }].slice(-MAX_SIGNALS),
        })),
      answerFeature: (featureKey, answer) =>
        set((s) => ({
          feedback: [...s.feedback, { id: newId(), at: Date.now(), kind: 'feature', featureKey, answer }],
        })),
      answerSkipReason: (productId, reason) =>
        set((s) => ({
          feedback: [...s.feedback, { id: newId(), at: Date.now(), kind: 'skip_reason', productId, reason }],
        })),
      startFresh: () => set((s) => ({ feedback: [...s.feedback, { id: newId(), at: Date.now(), kind: 'reset' }] })),
      resetAll: () => set({ signals: [], feedback: [] }),
    }),
    {
      name: 'swipeshop.signals.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ signals: s.signals, feedback: s.feedback }),
    },
  ),
);

/** Shorthand for components: record an engagement signal. */
export const recordSignal = (productId: string, type: SignalType, value?: number) =>
  useSignalStore.getState().record(productId, type, value);

// Signals are cleared only by explicit operations (sign-out, account deletion, Profile → Reset;
// see `localLearningData.ts`), never because the swipe list became empty: undoing the only
// swipe, or a sync bringing an empty list, must not erase independent learning.
