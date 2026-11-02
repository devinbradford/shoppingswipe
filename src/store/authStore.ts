import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
  name: string | null;
  /** "apple" or "google". */
  provider: string | null;
  setSignedIn: (u: { userId: string; email: string | null; name: string | null; provider: string | null }) => void;
  setSignedOut: () => void;
}

/** Who is signed in. Supabase keeps the session itself; this mirrors it for the UI. */
export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  userId: null,
  email: null,
  name: null,
  provider: null,
  setSignedIn: (u) => set({ status: 'signedIn', ...u }),
  setSignedOut: () => set({ status: 'signedOut', userId: null, email: null, name: null, provider: null }),
}));
