import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BudgetAnswer, RoomChoice } from '@/domain/budget';
import type { RoomAnswer } from '@/recommendation/rooms';
import { recordOps } from '@/sync/record';

interface PreferencesState {
  /** Styles picked on first launch (3–5). Fed into the taste profile. */
  stylePicks: string[];
  /** True once the user finished or skipped the taste picker. */
  onboarded: boolean;
  /** True once the 3-screen intro was seen or skipped (on this phone). */
  introSeen: boolean;
  markIntroSeen: () => void;
  /** Room they said they're shopping for (onboarding), or null if skipped. On this phone only for now. */
  room: RoomChoice | null;
  /** Budget they gave (onboarding), or null for no limit / skipped. On this phone only for now. */
  budget: BudgetAnswer | null;
  setRoom: (room: RoomChoice | null) => void;
  setBudget: (budget: BudgetAnswer | null) => void;
  /** When the Kept tab was last opened (epoch ms). Drives the "new" badge. */
  keptSeenAt: number;
  markKeptSeen: () => void;
  /** The one-time "Your taste is taking shape" card in For you was seen or closed. */
  tasteRevealSeen: boolean;
  markTasteRevealSeen: () => void;
  /** The one-time "press and hold a piece" tip on Kept was used or dismissed. */
  holdTipSeen: boolean;
  markHoldTipSeen: () => void;
  /** The first Keep or Skip on a product went through (ends the first-action hint for good). */
  firstActionDone: boolean;
  markFirstActionDone: () => void;
  /** Love / Not for me answers to the onboarding rooms, in order. On this phone only for now. */
  roomAnswers: RoomAnswer[];
  answerRoom: (answer: RoomAnswer) => void;
  /** Takes back the last room answer. */
  undoRoomAnswer: () => void;
  /** Clears the room answers (Profile → Redo the rooms). */
  clearRoomAnswers: () => void;
  setStylePicks: (styles: string[]) => void;
  skipOnboarding: () => void;
  resetAll: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      stylePicks: [],
      onboarded: false,
      introSeen: false,
      markIntroSeen: () => set({ introSeen: true }),
      room: null,
      budget: null,
      setRoom: (room) => set({ room }),
      setBudget: (budget) => set({ budget }),
      keptSeenAt: 0,
      markKeptSeen: () => set({ keptSeenAt: Date.now() }),
      tasteRevealSeen: false,
      markTasteRevealSeen: () => set({ tasteRevealSeen: true }),
      holdTipSeen: false,
      markHoldTipSeen: () => set({ holdTipSeen: true }),
      firstActionDone: false,
      markFirstActionDone: () => set({ firstActionDone: true }),
      roomAnswers: [],
      answerRoom: (answer) =>
        set({ roomAnswers: [...get().roomAnswers.filter((a) => a.roomId !== answer.roomId), answer] }),
      undoRoomAnswer: () => set({ roomAnswers: get().roomAnswers.slice(0, -1) }),
      clearRoomAnswers: () => set({ roomAnswers: [] }),
      setStylePicks: (stylePicks) => {
        set({ stylePicks, onboarded: true });
        recordOps([{ type: 'profile.set', profile: { stylePicks, onboarded: true } }]);
      },
      skipOnboarding: () => {
        set({ onboarded: true });
        recordOps([{ type: 'profile.set', profile: { stylePicks: get().stylePicks, onboarded: true } }]);
      },
      resetAll: () =>
        set({
          stylePicks: [],
          roomAnswers: [],
          onboarded: false,
          room: null,
          budget: null,
          tasteRevealSeen: false,
          firstActionDone: false,
        }),
    }),
    {
      name: 'swipeshop.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        stylePicks: s.stylePicks,
        roomAnswers: s.roomAnswers,
        onboarded: s.onboarded,
        introSeen: s.introSeen,
        room: s.room,
        budget: s.budget,
        keptSeenAt: s.keptSeenAt,
        tasteRevealSeen: s.tasteRevealSeen,
        holdTipSeen: s.holdTipSeen,
        firstActionDone: s.firstActionDone,
      }),
    },
  ),
);
