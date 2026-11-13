/**
 * Learning-data integrity, fix 2: signals and Your taste answers are cleared only by explicit
 * operations, never because the swipe list became empty (Undo of the only swipe, a sync).
 */
import { buildTasteModel, tasteSummary } from '@/recommendation';
import { clearLocalAccountData } from '@/sync/appSync';
import { claimLocalLearningData, clearLocalLearningData } from '../localLearningData';
import { usePreferencesStore } from '../preferencesStore';
import { useSnapshotStore } from '../productSnapshotStore';
import { useSignalStore } from '../signalStore';
import { useSwipeStore } from '../swipeStore';

const keep = (id: string, at: number) =>
  useSwipeStore.getState().recordSwipe({ id: `${id}@${at}`, productId: id, categoryId: 'bedroom', direction: 'keep', swipedAt: at });

function seedEverything() {
  // Onboarding.
  usePreferencesStore.getState().answerRoom({ roomId: 'mid-century', version: 2, love: true, at: 1 });
  usePreferencesStore.getState().setStylePicks(['mid-century', 'scandinavian', 'industrial']);
  // Independent signals from before any deck swipe, and an explicit Your taste answer.
  const sig = useSignalStore.getState();
  sig.record('search-hit', 'detail_open');
  sig.record('bought-one', 'buy_click');
  sig.record('bought-one', 'purchase');
  sig.answerFeature('style:coastal', 'less');
}
const onboarding = () => {
  const p = usePreferencesStore.getState();
  return JSON.stringify({ rooms: p.roomAnswers, picks: p.stylePicks });
};
const signalTypes = () => useSignalStore.getState().signals.map((s) => s.type);

beforeEach(() => {
  useSwipeStore.getState().resetAll();
  clearLocalLearningData();
  usePreferencesStore.getState().resetAll();
});

describe('Undo', () => {
  it('undoing the only swipe reverses that swipe and its Keep, and nothing else', () => {
    seedEverything();
    const before = onboarding();
    keep('first-card', 100);
    useSwipeStore.getState().undoLastSwipe();
    expect(useSwipeStore.getState().swipes).toEqual([]);
    expect(useSwipeStore.getState().saved).toEqual([]);
    expect(signalTypes()).toEqual(['detail_open', 'buy_click', 'purchase']);
    expect(useSignalStore.getState().feedback.map((f) => f.kind)).toEqual(['feature']);
    expect(onboarding()).toBe(before);
  });

  it('so the shopper\'s "show me less coastal" survives in the model and in Your taste', () => {
    seedEverything();
    keep('first-card', 100);
    useSwipeStore.getState().undoLastSwipe();
    const { signals, feedback } = useSignalStore.getState();
    const model = buildTasteModel({ swipes: [], products: new Map(), bands: {}, signals, feedback });
    expect(model.muted).toEqual(['style:coastal']);
    expect(tasteSummary(model).dislikes.map((d) => d.key)).toContain('style:coastal');
  });

  it('undoing one of several swipes behaves the same (no special case at zero)', () => {
    seedEverything();
    keep('a', 100);
    keep('b', 200);
    useSwipeStore.getState().undoLastSwipe();
    useSwipeStore.getState().undoLastSwipe();
    expect(signalTypes()).toEqual(['detail_open', 'buy_click', 'purchase']);
  });
});

describe('sync', () => {
  it('an empty swipe list arriving from the account erases no signals or answers', () => {
    seedEverything();
    keep('a', 100);
    useSwipeStore.setState({ swipes: [], saved: [] }); // what appSync.replaceState does
    expect(signalTypes()).toEqual(['detail_open', 'buy_click', 'purchase']);
    expect(useSignalStore.getState().feedback).toHaveLength(1);
  });
});

describe('explicit clears still clear', () => {
  it('Profile → Reset (swipes and lists cleared + clearLocalLearningData) clears signals and answers', () => {
    seedEverything();
    keep('a', 100);
    useSwipeStore.getState().resetAll();
    expect(signalTypes()).toHaveLength(3); // clearing swipes alone no longer touches them…
    clearLocalLearningData(); // …Reset does it explicitly
    expect(useSignalStore.getState().signals).toEqual([]);
    expect(useSignalStore.getState().feedback).toEqual([]);
  });

  it('sign-out and account deletion (clearLocalAccountData) clear signals and answers', () => {
    seedEverything();
    keep('a', 100);
    clearLocalAccountData();
    expect(useSignalStore.getState().signals).toEqual([]);
    expect(useSignalStore.getState().feedback).toEqual([]);
    expect(useSnapshotStore.getState().snapshots).toEqual({});
  });
});

describe('account switching', () => {
  it('signals made before signing in go with the history merged into that account', () => {
    seedEverything();
    claimLocalLearningData('user-a');
    expect(signalTypes()).toHaveLength(3);
    claimLocalLearningData('user-a'); // every later sync
    expect(signalTypes()).toHaveLength(3);
  });

  it("another account syncing onto this phone never sees the previous account's signals", () => {
    claimLocalLearningData('user-a');
    seedEverything();
    claimLocalLearningData('user-b');
    expect(useSignalStore.getState().signals).toEqual([]);
    expect(useSignalStore.getState().feedback).toEqual([]);
    expect(useSnapshotStore.getState().owner).toBe('user-b');
  });
});
