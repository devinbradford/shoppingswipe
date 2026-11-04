/**
 * When to ask the shopper a quick question, and what to ask.
 *
 * Pure TypeScript (see engine.ts). The app should be curious only when it's
 * surprised, never after every skip:
 *
 *  Ask (right after a skip) when:
 *   - pattern:  3 of the last 5 swipes were skips sharing a material, color,
 *               style or high price → "Not into bouclé?"
 *   - mixed:    they used to keep something but keep skipping it now
 *               → "Gone off walnut?"
 *   - surprise: they skipped a strong "For you" pick → "What put you off?"
 *  Hold back when:
 *   - asked within the last 8 swipes;
 *   - they're on a fast streak (last 3 swipes under 0.9 s each);
 *   - they ignored the last 2 questions (quiet for the rest of the session);
 *   - the same question was already asked.
 */
import type { Product, SwipeDirection } from '../domain/types';
import { productFeatures, type FeatureKind, type PriceBands } from './engine';
import type { TasteModel } from './model';

export interface SessionSwipe {
  product: Product;
  direction: SwipeDirection;
  /** How long the card was on top, ms. */
  dwellMs?: number;
  /** The card's score when it was shown. */
  predicted: number;
  /** It was shown with a "For you" reason. */
  forYou: boolean;
}

export interface QuestionState {
  /** Question keys already asked (never repeated). */
  asked: string[];
  /** Session swipe count when the last question was shown. */
  lastAskedAt: number | null;
  /** Questions in a row that were ignored. */
  ignoredStreak: number;
}

export const EMPTY_QUESTION_STATE: QuestionState = { asked: [], lastAskedAt: null, ignoredStreak: 0 };

export interface QuestionOptions {
  cooldown: number;
  patternWindow: number;
  patternSkips: number;
  fastMs: number;
  streak: number;
  maxIgnored: number;
  surpriseScore: number;
}

export const QUESTION_OPTIONS: QuestionOptions = {
  cooldown: 8,
  patternWindow: 5,
  patternSkips: 3,
  fastMs: 900,
  streak: 3,
  maxIgnored: 2,
  surpriseScore: 0.6,
};

export type Question =
  | {
      type: 'feature';
      trigger: 'pattern' | 'mixed';
      /** Unique per question, for "never ask twice". */
      key: string;
      featureKey: string;
      kind: FeatureKind;
      label: string;
      title: string;
    }
  | { type: 'why'; key: string; productId: string; title: string };

const ASKABLE: FeatureKind[] = ['material', 'color', 'style', 'price'];
const PRIORITY: Record<string, number> = { material: 0, color: 1, style: 2, price: 3 };

function askableKeys(product: Product, bands: PriceBands) {
  return productFeatures(product, bands).filter(
    (f) => ASKABLE.includes(f.kind) && (f.kind !== 'price' || f.value === 'high'),
  );
}

function featureTitle(trigger: 'pattern' | 'mixed', kind: FeatureKind, label: string): string {
  if (kind === 'price') return trigger === 'pattern' ? 'Prices too high lately?' : 'Rethinking the budget?';
  return trigger === 'pattern' ? `Not into ${label}?` : `Gone off ${label}?`;
}

export function nextQuestion(
  session: readonly SessionSwipe[],
  model: TasteModel,
  bands: PriceBands,
  state: QuestionState,
  options: QuestionOptions = QUESTION_OPTIONS,
): Question | null {
  const n = session.length;
  const last = session[n - 1];
  if (!last || last.direction !== 'skip') return null;
  if (state.ignoredStreak >= options.maxIgnored) return null;
  if (state.lastAskedAt !== null && n - state.lastAskedAt < options.cooldown) return null;
  const tail = session.slice(-options.streak);
  if (tail.length === options.streak && tail.every((s) => s.dwellMs !== undefined && s.dwellMs < options.fastMs)) {
    return null;
  }

  const blocked = (featureKey: string) =>
    model.muted.includes(featureKey) || model.fine.includes(featureKey) || state.asked.includes(`feature:${featureKey}`);
  const lastFeatures = askableKeys(last.product, bands);

  // 1. A pattern of skips sharing what they just skipped.
  const windowSkips = session.slice(-options.patternWindow).filter((s) => s.direction === 'skip');
  const counts = new Map<string, number>();
  for (const s of windowSkips) for (const f of askableKeys(s.product, bands)) counts.set(f.key, (counts.get(f.key) ?? 0) + 1);
  const pattern = lastFeatures
    .filter((f) => (counts.get(f.key) ?? 0) >= options.patternSkips && !blocked(f.key))
    .sort((a, b) => (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0) || PRIORITY[a.kind] - PRIORITY[b.kind])[0];
  if (pattern) {
    return {
      type: 'feature',
      trigger: 'pattern',
      key: `feature:${pattern.key}`,
      featureKey: pattern.key,
      kind: pattern.kind,
      label: pattern.label,
      title: featureTitle('pattern', pattern.kind, pattern.label),
    };
  }

  // 2. Mixed signals: something they used to keep, now skipped twice recently.
  const recent = session.slice(-4).filter((s) => s.direction === 'skip');
  const mixed = lastFeatures
    .filter((f) => {
      if (blocked(f.key) || (model.long[f.key]?.pos ?? 0) < 2) return false;
      const hits = recent.filter((s) => askableKeys(s.product, bands).some((g) => g.key === f.key)).length;
      return hits >= 2;
    })
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind])[0];
  if (mixed) {
    return {
      type: 'feature',
      trigger: 'mixed',
      key: `feature:${mixed.key}`,
      featureKey: mixed.key,
      kind: mixed.kind,
      label: mixed.label,
      title: featureTitle('mixed', mixed.kind, mixed.label),
    };
  }

  // 3. They skipped a strong "For you" pick.
  const whyKey = `why:${last.product.id}`;
  if (last.forYou && last.predicted >= options.surpriseScore && !state.asked.includes(whyKey)) {
    return { type: 'why', key: whyKey, productId: last.product.id, title: 'What put you off?' };
  }
  return null;
}

/** Update the question state after a question is shown. */
export function markAsked(state: QuestionState, question: Question, sessionLength: number): QuestionState {
  return { ...state, asked: [...state.asked, question.key], lastAskedAt: sessionLength };
}
