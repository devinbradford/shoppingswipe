/// <reference types="node" />
/**
 * Prints the recommender scorecard: the same simulated shoppers swiping with
 * the v1 engine, v2 without questions, and v2 with questions.
 *
 *   npm run engine-report            (200 shoppers, ~1 minute)
 *   npm run engine-report -- 50      (quicker)
 */
import { generateCatalog } from '../src/data/sample/catalog';
import { benchmark, type Scorecard } from '../src/recommendation/sim/simulate';

const shoppers = Number(process.argv[2] ?? 200);
const catalog = generateCatalog({ perSubcategory: 120, seed: 11 }).filter((p) => p.categoryId === 'living-room');

const pct = (x: number) => `${Math.round(x * 100)}%`;
const rows: [string, (s: Scorecard) => string][] = [
  ['Keep rate, swipes 1-10', (s) => pct(s.keepRateFirst10)],
  ['Keep rate, swipes 11-30', (s) => pct(s.keepRateSwipes11to30)],
  ['Keep rate, swipes 31-60', (s) => pct(s.keepRateSwipes31to60)],
  ['Swipes until 6 of 10 are keeps', (s) => s.swipesToTaste.toFixed(1)],
  ['How much they like late cards (avg)', (s) => s.avgUtilityLate.toFixed(2)],
  ['Over-budget cards, swipes 31-60', (s) => pct(s.overBudgetLate)],
  ['Cards with a hated feature, 31-60', (s) => pct(s.dislikesShownLate)],
  ['Look-alike neighbours', (s) => pct(s.lookAlikeNeighbours)],
  ['Questions per 50 swipes', (s) => s.questionsPer50.toFixed(1)],
  ['Questions answered', (s) => pct(s.answeredShare)],
];

for (const withPicks of [false, true]) {
  const t0 = Date.now();
  const cards = benchmark(catalog, { shoppers, withPicks, swipes: 60 });
  console.log(`\n${withPicks ? 'WITH' : 'WITHOUT'} welcome-screen style picks — ${shoppers} shoppers, ${catalog.length} products, 60 swipes each (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(['Metric'.padEnd(38), ...cards.map((c) => c.engine.padStart(16))].join(''));
  for (const [label, f] of rows) console.log([label.padEnd(38), ...cards.map((c) => f(c).padStart(16))].join(''));
}
