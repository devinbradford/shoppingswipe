/**
 * Visual-intelligence evaluation schemas (V3 Milestone 1, Stage 1): the evaluation manifest,
 * annotation questions, rater answers and the export format. Versioned so labels collected
 * today stay readable later. Pure types and validators; no app code depends on this.
 *
 * Ground truth comes only from human raters. Nothing a model produces is ever stored as a label.
 */

export const MANIFEST_VERSION = 1;
/** 2 (Stage 1.5): triplets and pairs ask about structure, overall aesthetic, or both (no v1 labels were ever collected). */
export const LABELS_VERSION = 2;

/**
 * What a similarity judgment is about.
 *   structure  silhouette, proportions, curves and edges, legs/base, construction, design language.
 *              Ignores colour, finish, photography, lighting and background.
 *   aesthetic  the overall look a shopper responds to: structure AND colour, wood tone, finish,
 *              material appearance, texture, visual weight and character. Still ignores the
 *              photography (background, lighting, room vs cut-out).
 */
export type Dimension = 'structure' | 'aesthetic';
export const DIMENSIONS: readonly Dimension[] = ['structure', 'aesthetic'];
export type TripletChoice = 'b' | 'c' | 'cant-tell';
export type Rating = 1 | 2 | 3 | 4 | 5;

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
  /** Triplet: one option has the anchor's shape in another colour, the other a different shape in the anchor's colour. */
  | 'shape-vs-colour'
  /** Triplet: both options are the anchor's design; one keeps its finish, the other changes finish (same colour family). */
  | 'finish-only'
  /** Triplet: the same design photographed differently vs a different design photographed like the anchor. */
  | 'photo-style'
  /** Triplet: a near-identical design vs a clear mismatch, all in one colour. */
  | 'near-identical'
  /** Pairs built to pull the two dimensions apart. */
  | 'same-shape-diff-colour'
  | 'same-colour-diff-shape'
  | 'same-design-diff-finish'
  /** Attention checks (identical photo vs a different kind of furniture). */
  | 'gold';

/** Image to show: an address (Stage 2, loaded straight from the store's CDN) or a data URI (fixtures). */
export interface ShownImage {
  productId: string;
  src: string;
}

export type Question =
  | {
      kind: 'triplet';
      id: string;
      anchor: ShownImage;
      b: ShownImage;
      c: ShownImage;
      stratum: Stratum;
      /** Which judgments this screen asks for (both = one screen, two answers). */
      ask: readonly Dimension[];
      /** Known-by-construction answers, per dimension (traps and attention checks only). Stripped from packs sent to raters. */
      gold?: Partial<Record<Dimension, 'b' | 'c'>>;
    }
  | { kind: 'pair'; id: string; a: ShownImage; b: ShownImage; stratum: Stratum; ask: readonly Dimension[] }
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
  /** One field per asked dimension (structure / aesthetic). */
  | { kind: 'triplet'; structure?: TripletChoice; aesthetic?: TripletChoice }
  /** 1–5 per asked dimension; null = can't tell. */
  | { kind: 'pair'; structure?: Rating | null; aesthetic?: Rating | null }
  | { kind: 'same'; choice: SameAnswer }
  | { kind: 'attributes'; value: AttributeAnswer }
  | { kind: 'relevance'; grade: 0 | 1 | 2 | 3 | null };

export interface Answer {
  questionId: string;
  value: AnswerValue;
  /** 1 = unsure … 3 = sure (one per screen, covering every answer on it). */
  confidence: 1 | 2 | 3;
  /** Time from the screen appearing (images loaded) to the last answer on it, ms. */
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

/** The answer for one dimension, or undefined when that dimension wasn't asked. */
export function answerFor(value: AnswerValue, d: Dimension): TripletChoice | Rating | null | undefined {
  if (value.kind === 'triplet' || value.kind === 'pair') return value[d];
  return undefined;
}

/**
 * The pack as sent to raters: same questions and ids, without the answer key, and with every
 * stratum shown as 'random' so the file says nothing about what a screen is testing.
 */
export function raterCopy(pack: QuestionPack): QuestionPack {
  return {
    ...pack,
    questions: pack.questions.map((q): Question => {
      if (q.kind === 'triplet') {
        const { gold: _gold, ...rest } = q;
        return { ...rest, stratum: 'random' };
      }
      if (q.kind === 'same') {
        const { gold: _gold, ...rest } = q;
        return { ...rest, stratum: 'random' };
      }
      if (q.kind === 'pair') return { ...q, stratum: 'random' };
      return q;
    }),
  };
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
    if (q && (q.kind === 'triplet' || q.kind === 'pair') && q.kind === a.value.kind) {
      const v = a.value as Partial<Record<Dimension, unknown>>;
      for (const d of DIMENSIONS) {
        if (q.ask.includes(d) && v[d] === undefined) problems.push(`${a.questionId}: ${d} not answered`);
        if (!q.ask.includes(d) && v[d] !== undefined) problems.push(`${a.questionId}: ${d} answered but not asked`);
      }
    }
    if (!(a.ms >= 0)) problems.push(`${a.questionId}: bad time`);
    if (![1, 2, 3].includes(a.confidence)) problems.push(`${a.questionId}: bad confidence`);
  }
  return problems;
}
