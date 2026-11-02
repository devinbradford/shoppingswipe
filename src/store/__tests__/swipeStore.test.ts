import { useSwipeStore } from '../swipeStore';

const keep = (productId: string, swipedAt: number) =>
  useSwipeStore.getState().recordSwipe({ productId, categoryId: 'bedroom', direction: 'keep', swipedAt });

beforeEach(() => useSwipeStore.getState().resetAll());

describe('swipe store', () => {
  it('adds kept products to the kept list, newest first', () => {
    keep('a', 1);
    useSwipeStore.getState().recordSwipe({ productId: 'b', categoryId: 'bedroom', direction: 'skip', swipedAt: 2 });
    keep('c', 3);
    const { swipes, saved } = useSwipeStore.getState();
    expect(swipes).toHaveLength(3);
    expect(saved.map((s) => s.productId)).toEqual(['c', 'a']);
  });

  it('undo removes the last swipe and its keep', () => {
    keep('a', 1);
    keep('b', 2);
    const undone = useSwipeStore.getState().undoLastSwipe();
    expect(undone?.productId).toBe('b');
    expect(useSwipeStore.getState().saved.map((s) => s.productId)).toEqual(['a']);
    expect(useSwipeStore.getState().swipes).toHaveLength(1);
  });

  it('removing from kept leaves the swipe log alone', () => {
    keep('a', 1);
    useSwipeStore.getState().removeSaved('a');
    expect(useSwipeStore.getState().saved).toEqual([]);
    expect(useSwipeStore.getState().swipes).toHaveLength(1);
  });
});
