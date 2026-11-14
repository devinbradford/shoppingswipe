/**
 * Visual-intelligence evaluation schemas (V3 Milestone 1, Stage 1): the evaluation manifest,
 * annotation questions, rater answers and the export format. Versioned so labels collected
 * today stay readable later. Pure types and validators; no app code depends on this.
 *
 * Ground truth comes only from human raters. Nothing a model produces is ever stored as a label.
 */

export const MANIFEST_VERSION = 1;
export const LABELS_VERSION = 1;

/** One catalog product as the evaluation sees it: ids, the photo address and grouping keys only. */
export interface CatalogItem {
  id: string;
  retailerId: string;
  subcategoryId: string;
  categoryId: string;
  styleTags: string[];
  material: string;
  color: string;
  /** Address of the first photo (never the image itself). */
  photoUrl: string;
  /** The retailer product page this listing belongs to (colour/size variants share it). */
  pagePath: string;
  /** Content hash of the photo, once measured (Stage 2); absent in Stage 1. */
  imageHash?: string;
  /** 'cutout' | 'scene' when the photo has been measured; null when not yet. */
  photoKind?: 'cutout' | 'scene' | null;
}

export type HardCase = 'default-modern' | 'no-material' | 'multi-colour' | 'shared-photo';

export interface ManifestItem extends CatalogItem {
  groupId: string;
  split: Split;
  hard: HardCase[];
  /** Why it was sampled: a type quota slot, or as the partner of another sampled product. */
  reason: 'quota' | 'colour-variant-partner' | 'same-photo-partner';
  partnerOf?: string;
}

export type Split = 'dev' | 'test';

export interface RelatedGroup {
  id: string;
  members: string[];
  /** Which rules joined members: same photo address, same image hash, same retailer page, confirmed duplicate. */
  reasons: GroupReason[];
}

export type GroupReason = 'same-photo-url' | 'same-image-hash' | 'same-retailer-page' | 'confirmed-duplicate';

export interface Manifest {
  version: number;
  createdFrom: { snapshot: string; snapshotDate: string; products: number };
  seed: number;
  quotas: Record<string, number>;
  /** Share of groups (by product count) targeted for the protected test split. */
  testShare: number;
  items: ManifestItem[];
  /** Related-product groups that touch the sample (whole groups, so leakage can be checked). */
  groups: RelatedGroup[];
  counts: { dev: number; test: number };
  /** SHA-256 of the canonical JSON of everything above. */
  hash: string;
}

// ---------------------------------------------------------------------------------------------
// Annotation questions and answers
// ---------------------------------------------------------------------------------------------

/** What a pair or triplet is meant to probe (for per-stratum reporting). */
export type Stratum =
  | 'similar-design-diff-store'
  | 'different-design-same-type'
  | 'similar-look-diff-material'
  | 'same-material-diff-silhouette'
  | 'same-design-diff-colour'
  | 'studio-vs-room'
  | 'near-duplicate'
  | 'cross-type-language'
  | 'random'
  | 'colour-trap'
  | 'photo-trap'
  | 'gold';

/** Image to show: an address (Stage 2, loaded straight from the store's CDN) or a data URI (fixtures). */
export interface ShownImage {
  productId: string;
  src: string;
}

export type Question =
  | { kind: 'triplet'; id: string; anchor: ShownImage; b: ShownImage; c: ShownImage; stratum: Stratum; gold?: 'b' | 'c' }
  | { kind: 'pair'; id: string; a: ShownImage; b: ShownImage; stratum: Stratum }
  | { kind: 'same'; id: string; a: ShownImage; b: ShownImage; stratum: Stratum; gold?: SameAnswer }
  | { kind: 'attributes'; id: string; product: ShownImage }
  | { kind: 'relevance'; id: string; query: ShownImage; candidate: ShownImage };

export type SameAnswer = 'same-photo' | 'same-design-diff-colour' | 'same-design-diff-photo' | 'different' | 'cant-tell';

export const ATTRIBUTE_VOCAB = {
  silhouette: ['rectilinear', 'softened', 'rounded', 'sculptural'],
  visualWeight: ['light', 'medium', 'heavy'],
  base: ['legs', 'plinth', 'sled', 'pedestal', 'none-visible'],
  finish: ['matte', 'satin', 'gloss', 'mixed'],
  woodTone: ['light', 'mid', 'dark', 'none'],
  texture: ['smooth', 'woven', 'tactile', 'upholstered'],
  ornament: [1, 2, 3, 4],
  photoKind: ['cutout', 'scene', 'mixed'],
  wholeVisible: ['yes', 'partly', 'no'],
} as const;

export interface AttributeAnswer {
  silhouette?: (typeof ATTRIBUTE_VOCAB.silhouette)[number];
  visualWeight?: (typeof ATTRIBUTE_VOCAB.visualWeight)[number];
  base?: (typeof ATTRIBUTE_VOCAB.base)[number];
  finish?: (typeof ATTRIBUTE_VOCAB.finish)[number];
  woodTone?: (typeof ATTRIBUTE_VOCAB.woodTone)[number];
  texture?: (typeof ATTRIBUTE_VOCAB.texture)[number];
  ornament?: (typeof ATTRIBUTE_VOCAB.ornament)[number];
  photoKind?: (typeof ATTRIBUTE_VOCAB.photoKind)[number];
  wholeVisible?: (typeof ATTRIBUTE_VOCAB.wholeVisible)[number];
  /** Free words for the design language ("japandi", "chunky farmhouse"). */
  language?: string;
}

export type AnswerValue =
  | { kind: 'triplet'; choice: 'b' | 'c' | 'cant-tell' }
  | { kind: 'pair'; rating: 1 | 2 | 3 | 4 | 5 | null }
  | { kind: 'same'; choice: SameAnswer }
  | { kind: 'attributes'; value: AttributeAnswer }
  | { kind: 'relevance'; grade: 0 | 1 | 2 | 3 | null };

export interface Answer {
  questionId: string;
  value: AnswerValue;
  /** 1 = unsure … 3 = sure. */
  confidence: 1 | 2 | 3;
  /** Time from the question appearing to the answer, ms. */
  ms: number;
  /** Position in this rater's order (questions are shuffled per rater). */
  order: number;
  /** True when left/right were swapped on screen for this rater (answers are stored un-swapped). */
  swapped: boolean;
  at: string;
}

export interface QuestionPack {
  version: number;
  id: string;
  title: string;
  /** 'calibration' | 'dev' | 'test' | 'fixture'. A test pack is only ever shown, never used to tune. */
  purpose: 'calibration' | 'dev' | 'test' | 'fixture';
  questions: Question[];
}

export interface LabelExport {
  version: number;
  packId: string;
  rater: string;
  startedAt: string;
  finishedAt: string | null;
  answers: Answer[];
}

/** Returns problems with an export (empty when valid). */
export function validateExport(e: LabelExport, pack: QuestionPack): string[] {
  const problems: string[] = [];
  if (e.version !== LABELS_VERSION) problems.push(`version ${e.version} (expected ${LABELS_VERSION})`);
  if (e.packId !== pack.id) problems.push(`pack ${e.packId} (expected ${pack.id})`);
  if (!e.rater.trim()) problems.push('missing rater');
  const byId = new Map(pack.questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  for (const a of e.answers) {
    const q = byId.get(a.questionId);
    if (!q) problems.push(`unknown question ${a.questionId}`);
    else if (q.kind !== a.value.kind) problems.push(`${a.questionId}: answer kind ${a.value.kind} for a ${q.kind} question`);
    if (seen.has(a.questionId)) problems.push(`${a.questionId}: answered twice`);
    seen.add(a.questionId);
    if (!(a.ms >= 0)) problems.push(`${a.questionId}: bad time`);
    if (![1, 2, 3].includes(a.confidence)) problems.push(`${a.questionId}: bad confidence`);
  }
  return problems;
}
