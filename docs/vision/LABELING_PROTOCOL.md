# Labelling protocol (human ground truth), version 2

These labels come only from people. No model's output is ever stored as a label, used to pick "correct" answers, or shown to raters. Model judgments are scored against the labels and never become ground truth.

Version 2 (Stage 1.5) separates two kinds of visual similarity. No labels were collected under version 1, so nothing needs converting.

## 1. Two kinds of similarity

| | **Structure** | **Overall look** (stored as `aesthetic`) |
| --- | --- | --- |
| Question | "Is it built the same way?" | "Would the same person be drawn to both?" |
| Counts | Silhouette and proportions; curves, edges and corners; legs, base and how the piece meets the floor; construction (doors, drawers, cushions, arms); design language | All of structure, **plus** colour, wood tone, finish (matte, gloss, grain), material appearance, texture, visual weight and overall character |
| Ignored | Colour, wood tone, finish, texture, and all photography | Photography only: background, room or cut-out, lighting, angle, props, store photo style |

Why both:
- CureAvo needs to know what *appeals* to a shopper, and that is the overall look.
- Structure is the narrower, more objective question. Comparing the two shows whether a model judges design or just colour.
- Colour is already in the catalog data (`color`, `material`), so a model must beat that text on the overall look to earn its place.

## 2. Raters

- At least **3 independent raters**: Devin plus two people outside the project, ideally one with a furniture or interiors eye.
- Each rater gets a code (R1, R2, …), and only the code goes into exports. No names or emails.
- **Independence:**
  - raters must not discuss answers until everyone has exported;
  - nobody sees another rater's answers;
  - nobody who has seen model results for a question labels it.
- **Devin's knowledge:** Devin knows what the calibration pack tests (this document describes it). His answers are therefore less independent. The calibration report is read both with and without R1, and a third outside rater makes the round stronger.
- **Blinding:**
  - raters see pictures only, with no title, store, price, tags or product id;
  - question order and left/right positions are shuffled per rater;
  - the file raters receive contains no answer key and nothing that names what a screen is testing;
  - "can't tell" is always available.

## 3. Screens and answers

| Screen | What the rater does | Stored as (`LABELS_VERSION` 2) |
| --- | --- | --- |
| Triplet, both dimensions | Top picture plus Left and Right: "STRUCTURE: which is closer?" then "OVERALL LOOK: which is closer?" (Left / Right / Can't tell each), then Next | `{ kind: 'triplet', structure, aesthetic }` |
| Triplet, one dimension | Only one of the two rows | `{ kind: 'triplet', structure }` or `{ … aesthetic }` |
| Pair, both dimensions | Two pictures: "STRUCTURE: how similar, 1–5?" and "OVERALL LOOK: how similar, 1–5?" (1 nothing alike · 2 little in common · 3 same family, clearly different · 4 very close · 5 almost the same; or Can't tell) | `{ kind: 'pair', structure, aesthetic }` (null = can't tell) |
| Same thing | Same photo / Same design, other colour / Same design, other photo / Different / Can't tell | `{ kind: 'same', choice }` |
| Attributes | Silhouette, visual weight, base, finish, wood tone, texture, ornament 1–4, photo kind, whole product visible, free design-language words | `{ kind: 'attributes', value }` |
| Relevance (Stage 2, pooled retrieval) | "If someone loved the left piece, how good a suggestion is the right one?" 0–3; judged on the **overall look** | `{ kind: 'relevance', grade }` |

- One confidence per screen (Unsure / Fairly sure / Sure) and the time from images loaded to Next.
- Each question declares which dimensions it asks (`ask`). `validateExport` rejects an answer that skips an asked dimension or answers one that wasn't asked.

**Rules of thumb for raters:**
- Go with your first honest reading; don't zoom in hunting for differences.
- If both options are equally close, or equally far, choose **Can't tell**. That is useful information.
- On a structure question, if two pieces are the same design in different colours or finishes, they **are** the same structure.
- On an overall-look question, a different colour or finish **does** count, but a room photo vs a white background **does not**.
- Never look products up while labelling.

## 4. Measuring both without doubling the work

| Choice | Why |
| --- | --- |
| **One screen, two answers.** Every triplet and pair asks structure, then overall look, about the same pictures. | Looking at and taking in the pictures is most of the time. The second answer is expected to cost about 30–50% more, not 100%. The calibration pack measures this directly with one-question screens (`dualCost`). |
| **Structure always asked first, overall look second** (fixed order) | The narrower question first keeps the two definitions distinct. A changing order would add confusion for little gain at this scale. |
| **Half the triplets are built to pull the dimensions apart** (same shape/other colour vs other shape/same colour; same design/other finish) | Only items where people's two answers *differ* show which kind of similarity a model follows (the "divergent" set). Random triplets mostly agree on both. |
| **Attributes once per product, not per pair** | Finish, wood tone, texture and visual weight are recorded once for each of the 200 products, with no pairwise cost. |
| **Retrieval relevance on the overall look only** | Retrieval exists to show shoppers things they'll like. A separate structure-relevance pool would double the largest task. |
| **Fallback** | If calibration shows raters give the same answer for both on built-to-differ items more than 90% of the time, the dimensions aren't being separated. Switch to two separate blocks in separate sittings, with fewer items. |

**Full-round plan per rater** (`FULL_ROUND_SCREENS`):
- 300 two-question triplet screens;
- 250 two-question pair screens (was 300 single pairs);
- 80 same-thing checks;
- 200 attribute sets.

The minutes come from the calibration round (section 6), never from estimates.

## 5. Aggregation (by the tools, never by hand)

- **Per dimension, separately:** majority with more than 50% of votes and at least 2 votes. The result is "ambiguous" when there is no majority, or when "can't tell" is the most common answer. Ambiguous items are excluded and counted.
- **Divergent triplets:** both dimensions have a clear majority and point to different options. These are reported separately, because they show whether a model follows structure or overall look.
- **Ratings:** the mean of at least 2 per dimension.
- **Relevance:** the median rounded down; left unjudged when fewer than 2 raters graded it.

## 6. Calibration round (before any real labelling)

**Pack:** `calibration-v2-1`, drawn entirely from CureAvo's own SVG furniture. It has 17 screens and **30 judgments**.

| Screens | Built so that… | Known answer? |
| --- | --- | --- |
| 3 shape vs colour | one option has the anchor's shape in another colour; the other has a different shape in the anchor's colour | structure: the shape match. Overall look: no right answer; this measures how much colour drives taste |
| 2 finish only | all three share design and colour; one option keeps the anchor's finish (wood grain or matte), the other changes it (gloss) | overall look: the same finish. Structure: "can't tell" expected |
| 2 photography | the same design in a room photo vs a different design photographed like the anchor | both: the same design |
| 1 near-identical | a nearly identical design vs a clear mismatch, all in one colour | both agree (no gate) |
| 2 attention checks | the identical picture vs a different kind of furniture | both: the identical picture |
| 2 one-question triplets | one structure-only and one look-only (timing comparison) | no |
| 3 contrast pairs (1–5, both) | same shape/other colour; same colour/other shape; same design/other finish | direction: structure ≥ look, look ≥ structure, structure ≥ look |
| 1 same thing (identical) | attention check | same photo |
| 1 attribute set | times the attribute task | no |

**Gates** (from `npm run vision:calibration -- --labels <folder>`):

| Check | Gate |
| --- | --- |
| Structure triplet κ and overall-look triplet κ | ≥ 0.40 each |
| 1–5 rating α, per dimension | ≥ 0.60, else reported but not used as a gate |
| Structure picks shape over colour | ≥ 80% |
| Overall look notices a finish change | ≥ 80% |
| Photography ignored (structure and look) | ≥ 80% each |
| Contrast pairs rated in the expected direction | ≥ 70% |
| Same answer for both on built-to-differ items | warning above 90% (see the fallback) |
| Attention checks | ≥ 90% per rater |
| Ambiguous judgments | ≤ 20% |

**If a gate fails:** revise the guidelines or questions and run a new pack with new questions; never re-use the same items. Ambiguous items are discussed only after everyone has exported, and answers are never changed.

**What has been checked** (tool behaviour only, not people):
- Unit tests cover every gate with constructed answer sheets.
- A scripted browser run of the standalone file at desktop and phone widths found that every intended answer arrived correctly through the real buttons, with per-rater left/right swaps.
- `npm run vision:calibration -- --tool-check` shows the report catches a colour-led sheet and an always-"b" sheet.

None of these are observations of people, and no calibration result exists yet.

**Instructions for Devin and the raters:** `docs/vision/CALIBRATION_INSTRUCTIONS.md`.
