# Labelling protocol (human ground truth)

These labels come only from people. No model's output is ever stored as a label, used to pick "correct" answers, or shown to raters. Model judgments are scored against the labels and never become ground truth.

## 1. Raters

- At least **3 independent raters**. Proposed: Devin plus two people outside the project, ideally one with a furniture or interiors eye.
- Each rater gets a code (R1, R2, …), and only the code goes into exports. No names or emails.
- **Independence:**
  - raters must not discuss answers until everyone has exported;
  - raters see their own answers only;
  - nobody who has seen model results for a question labels it.
- **Blinding:** raters see photos only, with no title, store, price, tags or product id. Question order and left/right positions are shuffled per rater, and a "can't tell" option is always available.

## 2. The tool

Open `tools/annotate/index.html` directly in a browser by double-clicking it. It needs no server, no account and no install.

1. Enter your rater code and pick a pack (the practice pack is built in; others load from a `.json` file).
2. Answer each question. Keyboard shortcuts:
   - triplets: `a` = left, `l` = right, `x` = can't tell;
   - other questions: number keys;
   - confidence: `q` / `w` / `e` (default "fairly sure").
3. Progress is saved in this browser after every answer. Closing the tab and coming back resumes where you left off.
4. At the end, press **Download answers** and send the file to the study lead.

**Privacy and safety:**
- The page's security policy blocks every network request except images from our own data and (Stage 2) the stores' image CDN.
- Answers are never uploaded anywhere.
- The page has no external scripts or fonts.

**Time measurement:** the clock starts when all images have loaded and stops at the answer.

## 3. Question types and guidelines

**What "design" means:** the furniture's shape and construction. That includes:
- silhouette and proportions;
- arms, back and corners;
- legs or base, and how the piece meets the floor;
- door and drawer layout;
- edge and corner treatment;
- the overall design language (for example mid-century, farmhouse, japandi).

**What design does not mean:**
- **colour** or the finish's colour (walnut vs black is not a design difference);
- **photography**: cut-out vs room photo, angle, lighting, props, background;
- the **store's** usual photo style;
- size alone, when the proportions are the same.

| Kind | Question | Answers |
| --- | --- | --- |
| Triplet | "Which piece is closer in DESIGN to the top one?" | Left / Right / Can't tell, plus confidence 1–3 |
| Pair | "How similar are these two designs?" | 1 nothing alike · 2 same kind, little in common · 3 same family, clearly different · 4 very close · 5 almost the same design / Can't tell |
| Same thing | "Are these the same product?" | Same photo · Same design, other colour · Same design, other photo · Different products · Can't tell |
| Attributes | "Describe what you see" | silhouette, visual weight, base, finish, wood tone, texture, ornament 1–4, photo kind, whole product visible, free design-language words; any can be left as "not sure" |
| Relevance (Stage 2, pooled) | "If someone loved the left piece, how good a suggestion is the right one?" | 0 not relevant · 1 same kind, weak · 2 good · 3 excellent / same design / Can't tell |

**Rules of thumb:**
- Go with your first honest reading. Don't zoom in hunting for differences.
- If both options are equally close or equally far, choose **Can't tell**. That is useful information, not a failure.
- If a photo is too small, cropped or unclear to judge, choose Can't tell and set confidence to "Unsure".
- Never look products up on the store's site while labelling.

## 4. Export format (`LABELS_VERSION` 1)

The format is defined in `src/vision/schema.ts` and checked with `validateExport`:

```json
{
  "version": 1,
  "packId": "calibration-fixture-1",
  "rater": "R1",
  "startedAt": "…",
  "finishedAt": "…",
  "answers": [
    { "questionId": "cal-t3", "value": { "kind": "triplet", "choice": "b" }, "confidence": 2, "ms": 5400, "order": 0, "swapped": true, "at": "…" }
  ]
}
```

- Answers refer to the pack's **un-swapped** b/c and a/b. `swapped` records whether the screen showed them the other way round, and `order` records the position in that rater's sequence.
- Exports go in `data/vision-eval/labels/<pack id>/<rater>.json`. They contain no images and no personal details.
- **Aggregation**, done by the tools, never by hand:
  - majority with a more-than-50% threshold and at least 2 votes;
  - "ambiguous" when there is no majority or when "can't tell" is the most common answer;
  - ratings use the mean of at least 2;
  - relevance uses the median rounded down, and is left unjudged when fewer than 2 raters graded it.

## 5. Calibration round (before any real labelling)

**Purpose:** check that the questions are understandable, that people agree enough, and that they judge design rather than colour, photo style or store look. The results also set a realistic workload.

**Pack:**
- In Stage 1, raters use the **practice pack**: 28 questions drawn from our own SVG furniture, never retailer images.
  - 12 ordinary triplets;
  - 3 colour traps;
  - 3 photo traps;
  - 2 identical-photo attention checks;
  - 4 pair ratings;
  - 2 same-thing checks (1 an attention check);
  - 2 attribute sets.
- In Stage 2, after approval, a second calibration pack of 25–30 real-catalog questions drawn from **dev** products only, with the same mix.

**How a trap works:**
- **Colour trap:** one option is the same design in another colour. The other is a different design in the anchor's exact colour.
- **Photo trap:** one option is the same design in a room photo. The other is a different design photographed in the same style as the anchor.
- In both cases, choosing the design match is correct.

**Procedure:**
1. Each rater reads sections 1–3 (5 minutes) and does the pack alone in one sitting (target about 5 minutes).
2. The study lead collects the exports in one folder and runs:

   ```bash
   npm run vision:calibration -- --pack tools/annotate/packs/calibration-fixture.json --labels <folder>
   ```

3. The command reports:
   - time per question kind (median and 90th percentile);
   - Fleiss κ for triplets and same-thing checks;
   - ordinal Krippendorff α for 1–5 ratings;
   - ambiguous questions;
   - design-over-colour and design-over-photo rates;
   - attention-check accuracy per rater;
   - minutes per rater for the full round.
4. **Gates** (any failure → revise the guidelines or questions and re-run with new questions):

   | Check | Gate |
   | --- | --- |
   | Triplet κ | ≥ 0.40 |
   | 1–5 rating α | ≥ 0.60, else ratings are reported but not used as a gate |
   | Design over colour | ≥ 80% |
   | Design over photo style | ≥ 80% |
   | Attention checks | ≥ 90% per rater; a rater below this is re-briefed or replaced |
   | Ambiguous questions | ≤ 20% |

5. Ambiguous questions are read together *after* everyone has exported, to fix wording. Answers are never changed.

**Dry run** (`npm run vision:calibration -- --simulate`, 4 simulated raters, analysis check only):
- triplet κ 0.43, rating α 0.77;
- design over colour 83%, over photo style 56%, so the photo-style warning fired as designed;
- attention checks 100%.

The analysis and the tool were also run on a real browser export.

## 6. Workload recommendation

`workload()` multiplies each measured median time by the planned volume and adds 15% for breaks and re-reading. Sittings are at most 45 minutes. Planned volumes per rater: 300 triplets, 300 pairs, 80 same-thing checks, 200 attribute sets.

The simulated times (about 6 s per triplet, 5 s per pair, 8 s per same-thing check, 16 s per attribute set) give **about 140 minutes per rater, in 4 sittings.** These are not measurements of people: the real numbers come from the calibration round. Recommendation until then:

| If the calibration shows… | Then |
| --- | --- |
| ≤ 150 min per rater | Run as planned: 3 raters do everything, 3–4 sittings over a week. |
| 150–240 min | Keep triplets, same-thing checks and pairs at 3 raters. Each product's attributes go to **2** raters (each rater does about ⅔), and pairs drop to 200. |
| > 240 min, or raters drop out | Cut triplets to 200 and pairs to 150, which keeps at least 30 per stratum. Recruit a 4th rater so that every item still has 3 votes. |
| Relevance (Stage 2) | Sized after pooling (about 11–20 pairs per query × the queries). Each pair needs 2 graders, 3 when they disagree by 2 or more. |

Fewer questions per rater are better than tired raters: attention-check accuracy and time per answer are tracked per sitting, and a sitting with failed checks is redone.
