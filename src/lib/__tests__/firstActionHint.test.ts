import { usePreferencesStore } from '@/store/preferencesStore';
import { useSwipeStore } from '@/store/swipeStore';
import { firstActionHintText, HINT_LONG, HINT_SHORT, shouldShowFirstActionHint } from '../firstActionHint';

describe('shouldShowFirstActionHint', () => {
  it('shows only for a shopper who skipped the rooms and has never swiped a product', () => {
    expect(shouldShowFirstActionHint({ firstActionDone: false, roomAnswerCount: 0, swipeCount: 0 })).toBe(true);
  });

  it('never shows for shoppers who did the rooms (they practised the swipe there)', () => {
    expect(shouldShowFirstActionHint({ firstActionDone: false, roomAnswerCount: 8, swipeCount: 0 })).toBe(false);
    expect(shouldShowFirstActionHint({ firstActionDone: false, roomAnswerCount: 3, swipeCount: 0 })).toBe(false);
  });

  it('never shows once the first action went through, even after Undo emptied the history', () => {
    expect(shouldShowFirstActionHint({ firstActionDone: true, roomAnswerCount: 0, swipeCount: 0 })).toBe(false);
  });

  it('never shows to existing shoppers who have swipes but predate the setting', () => {
    expect(shouldShowFirstActionHint({ firstActionDone: false, roomAnswerCount: 0, swipeCount: 12 })).toBe(false);
  });
});

describe('firstActionHintText', () => {
  it('uses the full sentence at normal and moderately larger text', () => {
    for (const w of [375, 393, 430]) {
      expect(firstActionHintText(w, 1)).toBe(HINT_LONG);
      expect(firstActionHintText(w, 1.3)).toBe(HINT_LONG);
    }
  });

  it('switches to the short sentence when the long one would not fit, never half of it', () => {
    for (const w of [375, 393, 430]) expect(firstActionHintText(w, 2)).toBe(HINT_SHORT);
    expect(firstActionHintText(320, 1.5)).toBe(HINT_SHORT);
    // Text above the 2× cap behaves like 2×.
    expect(firstActionHintText(430, 3.1)).toBe(HINT_SHORT);
  });

  it('only ever returns one of the two complete sentences', () => {
    for (const w of [320, 375, 393, 430, 600])
      for (const fs of [0, 1, 1.15, 1.3, 1.5, 1.75, 2, 3])
        expect([HINT_LONG, HINT_SHORT]).toContain(firstActionHintText(w, fs));
  });
});

describe('first-action setting', () => {
  beforeEach(() => {
    usePreferencesStore.getState().resetAll();
    useSwipeStore.getState().resetAll();
  });
  const state = () => ({
    firstActionDone: usePreferencesStore.getState().firstActionDone,
    roomAnswerCount: usePreferencesStore.getState().roomAnswers.length,
    swipeCount: useSwipeStore.getState().swipes.length,
  });

  it('is set once, survives Undo, and is cleared by Profile → Reset', () => {
    expect(shouldShowFirstActionHint(state())).toBe(true);
    useSwipeStore
      .getState()
      .recordSwipe({ id: 'a@1', productId: 'a', categoryId: 'bedroom', direction: 'skip', swipedAt: 1 });
    usePreferencesStore.getState().markFirstActionDone();
    useSwipeStore.getState().undoLastSwipe();
    expect(useSwipeStore.getState().swipes).toHaveLength(0);
    expect(shouldShowFirstActionHint(state())).toBe(false);
    usePreferencesStore.getState().resetAll();
    useSwipeStore.getState().resetAll();
    expect(shouldShowFirstActionHint(state())).toBe(true);
  });
});
