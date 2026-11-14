# Calibration round 1: results (pack `calibration-v2-1`, 14 Nov 2026)

These are **real observations from three people** (the study lead and two outside raters) on CureAvo's own drawings. No store photos were used, and no model was involved.

**Privacy:** the raw exports (rater codes, timestamps, per-person answers) are kept privately and are **not** in this public repository. The committed record is the de-identified summary `data/vision-eval/labels-summary/calibration-v2-1.json`: vote counts per question, median times, and the report numbers.

Reproduce (needs the private raw exports in a local, git-ignored folder):

```bash
npm run vision:calibration -- --labels data/vision-eval/labels/calibration-v2-1
```

## Result: all gates pass (provisional; see the open question)

| Check | All 3 raters | Outside raters only (2) | Gate |
| --- | --- | --- | --- |
| Structure triplet agreement κ | 1.00 | 1.00 | ≥ 0.40 ✓ |
| Overall-look triplet agreement κ | 0.87 | 1.00 (1 ambiguous item) | ≥ 0.40 ✓ |
| 1–5 ratings α, structure / overall look | 0.71 / 0.60 | 0.53 / 0.44 | ≥ 0.60 for ratings to count |
| Structure picks shape over colour | 100% | 100% | ≥ 80% ✓ |
| Overall look notices a finish change | 100% | 100% | ≥ 80% ✓ |
| Photography ignored (both questions) | 100% / 100% | 100% / 100% | ≥ 80% ✓ |
| Contrast pairs rated the expected way | 100% | 100% | ≥ 70% ✓ |
| Same answer for both on contrast questions | 73% | 70% | warn > 90% ✓ |
| Attention checks | 100% each | 100% each | ≥ 90% ✓ |
| Ambiguous judgments | 0 | 1 (c02, overall look) | ≤ 20% ✓ |

## What it tells us

1. **People understood the two questions and kept them apart.**
   - Structure followed shape every time.
   - Overall look caught every finish change.
   - Nobody was swayed by room vs white-background photos.
2. **Colour really matters to the overall look.** When shape and colour pointed different ways, overall look went with the colour match about 37% of the time. That's large enough that a structure-only model would miss a real share of what appeals to people, which supports measuring both.
3. **Finish leaks into "structure" a little.** On the two finish-only screens, both options were the same design, so "can't tell" was the expected structure answer. All three raters instead picked the option with the same finish. That's harmless here, but the next guideline should say: *"If two pieces differ only in colour or finish, the structure answer is Can't tell."*
4. **1–5 ratings are the weakest part.**
   - α is 0.71 and 0.60 with all three raters, but only 0.53 and 0.44 for the two outside raters alone.
   - One rater gave both "only colour/finish differs" pairs the same rating on both questions.
   - There were only three pairs, so this is thin evidence. Ratings stay **reported, not a gate**, as planned.
5. **Two questions on one screen cost 1.44× one question**, not 2×, so the combined screen saves about 28%. This is based on only 3 one-question screens per kind, so treat it as indicative.

## Workload (measured; drawings are probably faster than real photos)

Median time per screen: two-question triplet 11 s, two-question pair 18 s, same-thing check 5 s, attribute form 22 s.

| Plan | Minutes per rater | Sittings (≤45 min) |
| --- | --- | --- |
| Planned volumes (300 triplets, 250 pairs, 80 same, 200 attribute forms) | ~240 | 6 |
| **Recommended:** 300 triplets, **150 pairs**, 80 same-thing, attributes split so **2 raters per product** (≈133 forms each) | **~178** | **4** |

Recommendation:
- Cut pairs to 150. They are the slowest screen and the least reliable.
- Have each product's attributes done by 2 raters instead of 3.
- Keep the triplets, which are the core measure and showed the strongest agreement.
- Re-time with the real-photo calibration in Stage 2 (dev products only) before fixing the plan, because real photos take longer to read than simple drawings.

## Open question before relying on these numbers

- **Independence of the two outside raters (unconfirmed).** The session times suggest both outside sessions ran back to back on one device. That's fine **if they were two different people who answered alone, without seeing each other's screen or discussing answers.** Otherwise agreement is overstated, and round 1 counts as one outside rater.
- A further independent rater may complete the calibration later. **Calibration is not final** until independence is confirmed and that check is done.

## Limits of this round

- 17 screens of simple drawings test whether the instructions work, **not** how hard real catalog photos are. High agreement here is expected and doesn't predict agreement on real furniture.
- Two items were weak and will be fixed in the next pack:
  - **c08:** the "clear mismatch" shared the anchor's doors, rounding and colour.
  - **c17:** the attribute item was too small and thin to tell a plinth from a sled.

  Two of the three raters said plinth, which was correct.
- These answers are about drawings only. They are never mixed with real-catalog labels and never used as model inputs.
