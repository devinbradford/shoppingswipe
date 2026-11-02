import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { recordOps } from '@/sync/record';

interface PreferencesState {
  /** Styles picked on first launch (3–5). Fed into the taste profile. */
  stylePicks: string[];
  /** True once the user finished or skipped the taste picker. */
  onboarded: boolean;
  setStylePicks: (styles: string[]) => void;
  skipOnboarding: () => void;
  resetAll: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      stylePicks: [],
      onboarded: false,
      setStylePicks: (stylePicks) => {
        set({ stylePicks, onboarded: true });
        recordOps([{ type: 'profile.set', profile: { stylePicks, onboarded: true } }]);
      },
      skipOnboarding: () => {
        set({ onboarded: true });
        recordOps([{ type: 'profile.set', profile: { stylePicks: get().stylePicks, onboarded: true } }]);
      },
      resetAll: () => set({ stylePicks: [], onboarded: false }),
    }),
    {
      name: 'swipeshop.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ stylePicks: s.stylePicks, onboarded: s.onboarded }),
    },
  ),
);
