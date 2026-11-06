import type { CategoryId, SubcategoryId } from './types';

/**
 * Onboarding budget question: which piece we ask about for each room, the
 * slider's stops, and how an answer is shown. Rules only, no UI.
 */

/** What the shopper chose on the room question ("just browsing" = no room). */
export type RoomChoice = CategoryId | 'browsing';

export interface BudgetAnchor {
  /** The product type the question is about, e.g. sofas. */
  subcategoryId: SubcategoryId;
  /** "a sofa", for "What do you usually spend on a sofa?". */
  noun: string;
  /** Slider stops in whole dollars; the last stop means "no limit". */
  stops: number[];
  /** Index of the stop the slider starts on. */
  defaultIndex: number;
}

const ANCHORS: Record<RoomChoice, BudgetAnchor> = {
  'living-room': {
    subcategoryId: 'sofas',
    noun: 'a sofa',
    stops: [500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 4000, 0],
    defaultIndex: 4,
  },
  bedroom: {
    subcategoryId: 'bed-frames',
    noun: 'a bed frame',
    stops: [300, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 0],
    defaultIndex: 3,
  },
  'kitchen-dining': {
    subcategoryId: 'dining-tables',
    noun: 'a dining table',
    stops: [300, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 0],
    defaultIndex: 3,
  },
  browsing: {
    subcategoryId: 'sofas',
    noun: 'a sofa',
    stops: [500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 4000, 0],
    defaultIndex: 4,
  },
};

export function budgetAnchor(room: RoomChoice | null): BudgetAnchor {
  return ANCHORS[room ?? 'browsing'];
}

/** A stop of 0 means "no limit". */
export const NO_LIMIT = 0;

/** "Up to $1,500" or "No limit". */
export function formatBudget(dollars: number): string {
  return dollars === NO_LIMIT ? 'No limit' : `Up to $${dollars.toLocaleString('en-US')}`;
}

/** The saved budget: a price cap for one product type, which the engine scales to the others. */
export interface BudgetAnswer {
  subcategoryId: SubcategoryId;
  /** Cents. */
  maxCents: number;
}

/** Turns a slider stop into the saved answer; "no limit" saves nothing. */
export function budgetAnswer(anchor: BudgetAnchor, index: number): BudgetAnswer | null {
  const dollars = anchor.stops[Math.max(0, Math.min(anchor.stops.length - 1, index))];
  return dollars === NO_LIMIT ? null : { subcategoryId: anchor.subcategoryId, maxCents: dollars * 100 };
}

/** The slider stop a saved answer sits on (for editing it later). Unknown answers start on the default. */
export function budgetIndex(anchor: BudgetAnchor, answer: BudgetAnswer | null): number {
  if (!answer) return anchor.stops.length - 1;
  if (answer.subcategoryId !== anchor.subcategoryId) return anchor.defaultIndex;
  const i = anchor.stops.indexOf(answer.maxCents / 100);
  return i >= 0 ? i : anchor.defaultIndex;
}

/** A typed amount (whole dollars) as a saved answer; 0 or less means no limit. */
export function budgetFromDollars(anchor: BudgetAnchor, dollars: number): BudgetAnswer | null {
  const d = Math.round(dollars);
  return d > 0 ? { subcategoryId: anchor.subcategoryId, maxCents: d * 100 } : null;
}

/** The slider stop closest to an amount (never the "no limit" stop for a real amount). */
export function nearestIndex(anchor: BudgetAnchor, dollars: number): number {
  let best = 0;
  anchor.stops.forEach((stop, i) => {
    if (stop !== NO_LIMIT && Math.abs(stop - dollars) < Math.abs(anchor.stops[best] - dollars)) best = i;
  });
  return best;
}

/** Turns what they typed ("$2,000", "2k", "1800") into whole dollars, or null if it isn't a sensible amount. */
export function parseDollars(text: string): number | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(k?)$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] ? 1000 : 1);
  return n >= 50 && n <= 100000 ? Math.round(n) : null;
}
