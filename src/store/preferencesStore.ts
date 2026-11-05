import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { recordOps } from '@/sync/record';

interface PreferencesState {
  /** Styles picked on first launch (3–5). Fed into the taste profile. */
  stylePicks: string[];
  /** True once the user finished or skipped the taste picker. */
  onboarded: boolean;
  /** True once the 3-screen intro was seen or skipped (on this phone). */
  introSeen: boolean;
  markIntroSeen: () => void;
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
      partialize: (s) => ({ stylePicks: s.stylePicks, onboarded: s.onboarded, introSeen: s.introSeen }),
    },
  ),
);
