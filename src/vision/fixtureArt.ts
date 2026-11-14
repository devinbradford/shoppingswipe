/**
 * Our own drawn furniture (simple SVG), for the calibration dry run and the annotation tool
 * before any retailer image may be used. Every design is a handful of numbers, so "same design,
 * different colour", "same design, room photo" and "different design, same colour" can be built
 * on purpose. Pure and seeded.
 */
import { createRng, hashSeed, type Rng } from '@/recommendation/random';
import { LABELS_VERSION, type Question, type QuestionPack, type ShownImage } from './schema';

export type ArtKind = 'cabinet' | 'sofa' | 'table';
export type ArtBase = 'tapered-legs' | 'straight-legs' | 'plinth' | 'sled';

export interface ArtDesign {
  id: string;
  kind: ArtKind;
  /** Body width and height in a 200×150 box. */
  w: number;
  h: number;
  /** Corner rounding 0–1. */
  round: number;
  base: ArtBase;
  legH: number;
  /** Fronts on a cabinet, cushions on a sofa, 0 on a table. */
  divisions: number;
}

export interface ArtShot {
  design: ArtDesign;
  colour: string;
  scene: 'studio' | 'room';
}

export const ART_COLOURS = { walnut: '#7a5235', oak: '#c49a6c', black: '#2b2b2b', white: '#ecece6', sage: '#8f9e86', rust: '#a4553a' } as const;
const WALLS = ['#e9e1d3', '#d9e0dc', '#efe6e0'];

export function randomDesign(rng: Rng, id: string, kind?: ArtKind): ArtDesign {
  const k = kind ?? (['cabinet', 'sofa', 'table'] as const)[Math.floor(rng() * 3)]!;
  const bases: ArtBase[] = k === 'sofa' ? ['straight-legs', 'plinth', 'tapered-legs'] : ['tapered-legs', 'straight-legs', 'plinth', 'sled'];
  return {
    id,
    kind: k,
    w: 110 + Math.round(rng() * 70),
    h: k === 'table' ? 8 + Math.round(rng() * 10) : 40 + Math.round(rng() * 35),
    round: Math.round(rng() * 10) / 10,
    base: bases[Math.floor(rng() * bases.length)]!,
    legH: 8 + Math.round(rng() * 30),
    divisions: k === 'table' ? 0 : 1 + Math.floor(rng() * 4),
  };
}

/** Same design with small size changes (what a sibling model or a near look-alike looks like). */
export function nudge(rng: Rng, d: ArtDesign, id: string): ArtDesign {
  return { ...d, id, w: Math.round(d.w * (0.94 + rng() * 0.12)), h: Math.round(d.h * (0.94 + rng() * 0.12)) };
}

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

export function drawSvg({ design: d, colour, scene }: ArtShot): string {
  const W = 240;
  const H = 180;
  const floor = 150;
  const x = (W - d.w) / 2;
  const baseH = d.base === 'plinth' ? 6 : d.legH;
  const top = floor - baseH - d.h;
  const r = d.round * Math.min(d.h, 30) * 0.5;
  const dark = shade(colour, 0.7);
  const parts: string[] = [];
  if (scene === 'studio') parts.push(`<rect width="${W}" height="${H}" fill="#f7f7f5"/>`);
  else {
    const wall = WALLS[d.w % WALLS.length]!;
    parts.push(`<rect width="${W}" height="${H}" fill="${wall}"/>`, `<rect y="${floor}" width="${W}" height="${H - floor}" fill="${shade(wall, 0.82)}"/>`);
    parts.push(`<rect x="20" y="22" width="34" height="44" fill="none" stroke="${shade(wall, 0.6)}" stroke-width="3"/>`);
    parts.push(`<rect x="196" y="${floor - 40}" width="16" height="40" fill="${shade(wall, 0.7)}"/><circle cx="204" cy="${floor - 52}" r="16" fill="#6f8a64"/>`);
  }
  if (d.base === 'plinth') parts.push(`<rect x="${x + 6}" y="${floor - 6}" width="${d.w - 12}" height="6" fill="${dark}"/>`);
  else if (d.base === 'sled') parts.push(`<path d="M${x + 10} ${floor} V${floor - d.legH} H${x + d.w - 10} V${floor}" fill="none" stroke="${dark}" stroke-width="4"/>`);
  else
    for (const lx of [x + 8, x + d.w - 12]) {
      parts.push(
        d.base === 'tapered-legs'
          ? `<path d="M${lx} ${floor - d.legH} h5 l-1.5 ${d.legH} h-2 z" fill="${dark}"/>`
          : `<rect x="${lx}" y="${floor - d.legH}" width="4" height="${d.legH}" fill="${dark}"/>`,
      );
    }
  if (d.kind === 'sofa') {
    parts.push(`<rect x="${x}" y="${top}" width="${d.w}" height="${d.h}" rx="${r + 4}" fill="${colour}"/>`);
    parts.push(`<rect x="${x - 6}" y="${top + d.h * 0.3}" width="14" height="${d.h * 0.7}" rx="${r}" fill="${shade(colour, 0.9)}"/>`);
    parts.push(`<rect x="${x + d.w - 8}" y="${top + d.h * 0.3}" width="14" height="${d.h * 0.7}" rx="${r}" fill="${shade(colour, 0.9)}"/>`);
    const cw = (d.w - 16) / d.divisions;
    for (let i = 0; i < d.divisions; i++)
      parts.push(`<rect x="${x + 8 + i * cw + 1}" y="${top + d.h * 0.45}" width="${cw - 2}" height="${d.h * 0.3}" rx="${r * 0.6}" fill="${shade(colour, 1.08)}"/>`);
  } else if (d.kind === 'table') {
    parts.push(`<rect x="${x}" y="${top}" width="${d.w}" height="${d.h}" rx="${r}" fill="${colour}"/>`);
  } else {
    parts.push(`<rect x="${x}" y="${top}" width="${d.w}" height="${d.h}" rx="${r}" fill="${colour}"/>`);
    const fw = d.w / d.divisions;
    for (let i = 0; i < d.divisions; i++) {
      parts.push(`<rect x="${x + i * fw + 3}" y="${top + 4}" width="${fw - 6}" height="${d.h - 8}" rx="${r * 0.5}" fill="none" stroke="${dark}" stroke-width="1.5"/>`);
      parts.push(`<circle cx="${x + i * fw + fw / 2}" cy="${top + 12}" r="2" fill="${dark}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * A calibration pack drawn only from our own art:
 *   12 triplets (design similarity), 3 colour traps, 3 photo traps, 2 gold triplets (attention
 *   checks), 4 pairs (1–5), 2 same-thing checks (1 of them gold), 2 attribute sets (28 in all).
 * Ground truth for traps and gold is known by construction; ordinary triplets have a constructed
 * "expected" answer that is used only to sanity-check the tool, never as a label. The design match
 * sits in b or c at random (balanced stored answers); the tool also swaps left/right per rater.
 */
export function makeCalibrationPack(seed = 1): { pack: QuestionPack; expected: Record<string, string> } {
  const rng = createRng(hashSeed(`calibration-art:${seed}`));
  const colourNames = Object.keys(ART_COLOURS) as (keyof typeof ART_COLOURS)[];
  const colour = () => ART_COLOURS[colourNames[Math.floor(rng() * colourNames.length)]!];
  const otherColour = (c: string) => {
    const others = Object.values(ART_COLOURS).filter((x) => x !== c);
    return others[Math.floor(rng() * others.length)]!;
  };
  let n = 0;
  const img = (shot: ArtShot): ShownImage => ({ productId: `art-${shot.design.id}-${shot.colour.slice(1)}-${shot.scene}`, src: svgDataUri(drawSvg(shot)) });
  const design = (kind?: ArtKind) => randomDesign(rng, `d${n++}`, kind);
  /** A different design of the same kind that differs clearly in base and proportions. */
  const contrast = (d: ArtDesign) => {
    // Bounded: after 50 tries, force the base to differ.
    let o = design(d.kind);
    for (let t = 0; t < 50 && (o.base === d.base || Math.abs(o.w - d.w) < 20); t++) o = design(d.kind);
    if (o.base === d.base) o = { ...o, base: d.base === 'plinth' ? 'tapered-legs' : 'plinth' };
    return o;
  };
  const questions: Question[] = [];
  const expected: Record<string, string> = {};
  /** Puts the design match in b or c at random, so stored answers are balanced (agreement statistics need that). */
  const triplet = (id: string, anchor: ShownImage, match: ShownImage, other: ShownImage, stratum: 'random' | 'colour-trap' | 'photo-trap' | 'gold', gold: boolean) => {
    const flip = rng() < 0.5;
    const right = flip ? 'c' : 'b';
    questions.push({ kind: 'triplet', id, anchor, b: flip ? other : match, c: flip ? match : other, stratum, ...(gold ? { gold: right } : {}) });
    expected[id] = right;
  };

  for (let i = 0; i < 12; i++) {
    const a = design();
    const c1 = colour();
    const sim = nudge(rng, a, `d${n++}`);
    const diff = contrast(a);
    const id = `cal-t${i}`;
    triplet(id, img({ design: a, colour: c1, scene: 'studio' }), img({ design: sim, colour: colour(), scene: 'studio' }), img({ design: diff, colour: colour(), scene: 'studio' }), 'random', false);
  }
  for (let i = 0; i < 3; i++) {
    const a = design();
    const c1 = colour();
    const id = `cal-colour${i}`;
    // b: same design in another colour; c: a different design in the anchor's colour.
    triplet(id, img({ design: a, colour: c1, scene: 'studio' }), img({ design: nudge(rng, a, `d${n++}`), colour: otherColour(c1), scene: 'studio' }), img({ design: contrast(a), colour: c1, scene: 'studio' }), 'colour-trap', true);
  }
  for (let i = 0; i < 3; i++) {
    const a = design();
    const c1 = colour();
    const id = `cal-photo${i}`;
    // b: same design in a room photo; c: a different design photographed like the anchor (studio).
    triplet(id, img({ design: a, colour: c1, scene: 'studio' }), img({ design: nudge(rng, a, `d${n++}`), colour: c1, scene: 'room' }), img({ design: contrast(a), colour: c1, scene: 'studio' }), 'photo-trap', true);
  }
  for (let i = 0; i < 2; i++) {
    const a = design('cabinet');
    const c1 = colour();
    const id = `cal-gold${i}`;
    // b is the very same picture; c is a different kind of furniture.
    triplet(id, img({ design: a, colour: c1, scene: 'studio' }), img({ design: a, colour: c1, scene: 'studio' }), img({ design: design('sofa'), colour: otherColour(c1), scene: 'studio' }), 'gold', true);
  }
  for (let i = 0; i < 4; i++) {
    const a = design();
    const close = i % 2 === 0;
    const id = `cal-p${i}`;
    questions.push({ kind: 'pair', id, a: img({ design: a, colour: colour(), scene: 'studio' }), b: img({ design: close ? nudge(rng, a, `d${n++}`) : contrast(a), colour: colour(), scene: 'studio' }), stratum: 'random' });
    expected[id] = close ? '4-5' : '1-2';
  }
  {
    const a = design();
    const c1 = colour();
    const shot = { design: a, colour: c1, scene: 'studio' as const };
    questions.push({ kind: 'same', id: 'cal-s0', a: img(shot), b: img(shot), stratum: 'gold', gold: 'same-photo' });
    expected['cal-s0'] = 'same-photo';
    questions.push({ kind: 'same', id: 'cal-s1', a: img(shot), b: img({ ...shot, colour: otherColour(c1) }), stratum: 'same-design-diff-colour' });
    expected['cal-s1'] = 'same-design-diff-colour';
  }
  for (let i = 0; i < 2; i++) {
    const a = design();
    questions.push({ kind: 'attributes', id: `cal-a${i}`, product: img({ design: a, colour: colour(), scene: i ? 'room' : 'studio' }) });
    expected[`cal-a${i}`] = a.base === 'plinth' ? 'base:plinth' : a.base === 'sled' ? 'base:sled' : 'base:legs';
  }
  return {
    pack: { version: LABELS_VERSION, id: `calibration-fixture-${seed}`, title: 'Calibration (drawn furniture, practice)', purpose: 'calibration', questions },
    expected,
  };
}
