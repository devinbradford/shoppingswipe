/**
 * Onboarding rooms → starting taste. Pure: no React, no I/O.
 *
 * Each room photo carries weighted attributes (how clearly it shows walnut, curves,
 * rattan…). A Love adds those weights, a Pass subtracts half of them (disliking a
 * room may be about one thing in it). The result seeds the taste model as gentle,
 * capped starting guesses that real product swipes soon outweigh, and names the
 * few traits the answers clearly agree on for the "Your taste" screen.
 */

/** Attributes products can carry too, so they seed ranking. Keys match the model's features. */
export type RoomFeatureKind = 'style' | 'color' | 'material';
/** Attributes only rooms show (no product carries them yet): reveal wording only. */
export type RoomOnlyKind = 'wood' | 'shape';

export interface RoomProfile {
  id: string;
  /** Bump when the photo or its attributes change, so old answers are known to be about the old photo. */
  version: number;
  /** The style this room is shown as, e.g. "mid-century". */
  style: string;
  /** Weights 0–1: 1 = defining, 0.3 = present. */
  attributes: Partial<Record<RoomFeatureKind | RoomOnlyKind, Record<string, number>>>;
}

export interface RoomAnswer {
  roomId: string;
  version: number;
  love: boolean;
  /** Epoch ms. */
  at: number;
}

export interface SeedFeature {
  /** Model feature key, e.g. "material:walnut". */
  key: string;
  /** Starting lean (log-odds), capped at ±SEED_CAP. */
  mean: number;
  /** Starting evidence, in keeps (negative = against), capped at ±SEED_EVIDENCE_CAP. */
  evidence: number;
}

export interface RoomTrait {
  key: string;
  label: string;
  /** "Walnut or oak in 3 of the 4 rooms you loved." */
  reason: string;
}

export interface RoomReveal {
  loved: number;
  answered: number;
  likes: RoomTrait[];
  /** At most one clear "not for you", or null. */
  dislike: RoomTrait | null;
}

const PASS_FACTOR = 0.5;
const SEED_SCALE = 0.4;
export const SEED_CAP = 0.8;
export const SEED_EVIDENCE_CAP = 1.5;
/** Below this net score an attribute doesn't seed anything. */
const SEED_MIN = 0.3;
/** A room "shows" an attribute when its weight is at least this. */
const SHOWS = 0.5;

const SEEDING_KINDS: readonly RoomFeatureKind[] = ['style', 'color', 'material'];
const ALL_KINDS: readonly (RoomFeatureKind | RoomOnlyKind)[] = ['style', 'color', 'material', 'wood', 'shape'];

/** Answers that still refer to a known room and its current photo (latest answer per room wins). */
export function currentAnswers(answers: readonly RoomAnswer[], rooms: readonly RoomProfile[]): RoomAnswer[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const latest = new Map<string, RoomAnswer>();
  for (const a of answers) {
    const room = byId.get(a.roomId);
    if (!room || room.version !== a.version) continue;
    latest.set(a.roomId, a);
  }
  return [...latest.values()];
}

/** Net score per attribute key ("material:walnut"): Σ weight × (+1 love, −0.5 pass). */
export function roomScores(answers: readonly RoomAnswer[], rooms: readonly RoomProfile[]): Map<string, number> {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const scores = new Map<string, number>();
  for (const a of currentAnswers(answers, rooms)) {
    const room = byId.get(a.roomId)!;
    for (const kind of ALL_KINDS) {
      for (const [value, w] of Object.entries(room.attributes[kind] ?? {})) {
        const key = `${kind}:${value}`;
        scores.set(key, (scores.get(key) ?? 0) + w * (a.love ? 1 : -PASS_FACTOR));
      }
    }
  }
  return scores;
}

/** Starting guesses for the taste model: capped, and only for attributes products can carry. */
export function roomSeeds(answers: readonly RoomAnswer[], rooms: readonly RoomProfile[]): SeedFeature[] {
  const out: SeedFeature[] = [];
  for (const [key, score] of roomScores(answers, rooms)) {
    const kind = key.slice(0, key.indexOf(':')) as RoomFeatureKind;
    if (!SEEDING_KINDS.includes(kind) || Math.abs(score) < SEED_MIN) continue;
    const clamp = (v: number, cap: number) => Math.max(-cap, Math.min(cap, v));
    out.push({ key, mean: clamp(SEED_SCALE * score, SEED_CAP), evidence: clamp(score, SEED_EVIDENCE_CAP) });
  }
  return out.sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean) || a.key.localeCompare(b.key));
}

/** Styles of the loved rooms (kept in sync with the account as "style picks"). */
export function lovedStyles(answers: readonly RoomAnswer[], rooms: readonly RoomProfile[]): string[] {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  return [
    ...new Set(
      currentAnswers(answers, rooms)
        .filter((a) => a.love)
        .map((a) => byId.get(a.roomId)!.style),
    ),
  ];
}

const COLOR_LABELS: Record<string, string> = {
  cream: 'Cream and ivory',
  oatmeal: 'Warm neutrals',
  walnut: 'Rich browns',
  charcoal: 'Soft greys',
  sage: 'Soft greens',
  olive: 'Deep greens',
  navy: 'Blues',
  rust: 'Rust and ochre',
  terracotta: 'Terracotta reds',
  blush: 'Blush tones',
  black: 'Black accents',
  white: 'Crisp white',
};
const MATERIAL_LABELS: Record<string, string> = {
  boucle: 'Bouclé',
  velvet: 'Velvet',
  leather: 'Leather',
  marble: 'Marble',
  travertine: 'Travertine and stone',
  walnut: 'Walnut',
  oak: 'Oak',
  pine: 'Reclaimed and rustic wood',
  rattan: 'Rattan and cane',
  steel: 'Metal',
  glass: 'Glass',
  wool: 'Wool',
  jute: 'Jute and natural fibres',
  linen: 'Linen',
};
const WOOD_LABELS: Record<string, string> = { light: 'Light wood', mid: 'Mid-tone wood', dark: 'Dark wood' };
const SHAPE_LABELS: Record<string, string> = {
  curved: 'Soft, curved shapes',
  tailored: 'Tailored, clean lines',
  substantial: 'Big, comfortable pieces',
};

export function traitLabel(key: string): string {
  const [kind, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  const titled = value.charAt(0).toUpperCase() + value.slice(1);
  switch (kind) {
    case 'style':
      return titled;
    case 'color':
      return COLOR_LABELS[value] ?? titled;
    case 'material':
      return MATERIAL_LABELS[value] ?? titled;
    case 'wood':
      return WOOD_LABELS[value] ?? titled;
    case 'shape':
      return SHAPE_LABELS[value] ?? titled;
    default:
      return titled;
  }
}

const roomsWord = (n: number) => (n === 1 ? 'room' : 'rooms');

/**
 * What the answers clearly agree on. A like needs at least two loved rooms showing it
 * and more loved than passed rooms showing it; a dislike needs two passed rooms and
 * no loved one. Never more than three likes: eight swipes are a first read.
 */
export function roomReveal(answers: readonly RoomAnswer[], rooms: readonly RoomProfile[], maxLikes = 3): RoomReveal {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const current = currentAnswers(answers, rooms);
  const loved = current.filter((a) => a.love);
  const passed = current.filter((a) => !a.love);
  const shows = (a: RoomAnswer, key: string) => {
    const [kind, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const attrs = byId.get(a.roomId)!.attributes[kind as RoomFeatureKind | RoomOnlyKind];
    return (attrs?.[value] ?? 0) >= SHOWS;
  };
  const scores = roomScores(answers, rooms);
  const likes: (RoomTrait & { score: number; kind: string })[] = [];
  let dislike: (RoomTrait & { score: number }) | null = null;
  for (const [key, score] of scores) {
    const inLoved = loved.filter((a) => shows(a, key)).length;
    const inPassed = passed.filter((a) => shows(a, key)).length;
    const kind = key.slice(0, key.indexOf(':'));
    if (score > 0 && inLoved >= 2 && inLoved > inPassed) {
      likes.push({
        key,
        kind,
        score,
        label: traitLabel(key),
        reason: `In ${inLoved} of the ${loved.length} ${roomsWord(loved.length)} you loved.`,
      });
    } else if (score < 0 && inPassed >= 2 && inLoved === 0 && (!dislike || score < dislike.score)) {
      dislike = {
        key,
        score,
        label: traitLabel(key),
        reason: `You passed on all ${inPassed} ${roomsWord(inPassed)} with it.`,
      };
    }
  }
  // Strongest first, but at most one per kind so the summary isn't three shades of the same thing.
  likes.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const picked: RoomTrait[] = [];
  const kinds = new Set<string>();
  for (const t of likes) {
    if (picked.length >= maxLikes) break;
    if (kinds.has(t.kind)) continue;
    kinds.add(t.kind);
    picked.push({ key: t.key, label: t.label, reason: t.reason });
  }
  return {
    loved: loved.length,
    answered: current.length,
    likes: picked,
    dislike: dislike ? { key: dislike.key, label: dislike.label, reason: dislike.reason } : null,
  };
}
