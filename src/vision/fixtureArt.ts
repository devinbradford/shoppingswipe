/**
 * Our own drawn furniture (simple SVG), for the calibration dry run and the annotation tool
 * before any retailer image may be used. Every design is a handful of numbers, so "same design,
 * different colour", "same design, room photo" and "different design, same colour" can be built
 * on purpose. Pure and seeded.
 */
import { createRng, hashSeed, type Rng } from '@/recommendation/random';
import { DIMENSIONS, LABELS_VERSION, type Dimension, type Question, type QuestionPack, type ShownImage, type Stratum } from './schema';

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

export type ArtFinish = 'matte' | 'gloss' | 'woodgrain';

export interface ArtShot {
  design: ArtDesign;
  colour: string;
  scene: 'studio' | 'room';
  /** Surface finish drawn over the body (default matte). */
  finish?: ArtFinish;
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

export function drawSvg({ design: d, colour, scene, finish = 'matte' }: ArtShot): string {
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
  if (finish !== 'matte') {
    // Clipped to the body, so the finish never changes the silhouette.
    parts.push(`<clipPath id="body"><rect x="${x}" y="${top}" width="${d.w}" height="${d.h}" rx="${d.kind === 'sofa' ? r + 4 : r}"/></clipPath>`);
    if (finish === 'gloss')
      parts.push(
        `<g clip-path="url(#body)"><rect x="${x}" y="${top}" width="${d.w}" height="${Math.max(3, d.h * 0.28)}" fill="#ffffff" opacity="0.38"/>` +
          `<path d="M${x + d.w * 0.15} ${top + d.h} L${x + d.w * 0.32} ${top} h${d.w * 0.08} L${x + d.w * 0.23} ${top + d.h} z" fill="#ffffff" opacity="0.22"/></g>`,
      );
    else {
      const lines: string[] = [];
      const step = Math.max(3, d.h / 7);
      for (let yy = top + step / 2, i = 0; yy < top + d.h; yy += step, i++)
        lines.push(`<path d="M${x} ${yy} q${d.w / 4} ${i % 2 ? 3 : -3} ${d.w / 2} 0 t${d.w / 2} 0" fill="none" stroke="${shade(colour, 0.62)}" stroke-width="1.1" opacity="0.75"/>`);
      parts.push(`<g clip-path="url(#body)">${lines.join('')}</g>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`;
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Calibration pack v2 (Stage 1.5), drawn only from CureAvo's own SVG furniture. 17 screens, 30
 * judgments; most screens ask BOTH structure and overall look (one look, two answers):
 *
 *   shape-vs-colour ×3   same shape in another colour  vs  different shape in the anchor's colour
 *                         structure: shape match (known) · overall look: no right answer (measured)
 *   finish-only ×2       same design, same finish  vs  same design, different finish (same colour)
 *                         overall look: same finish (known) · structure: "can't tell" expected
 *   photo-style ×2       same design in a room photo  vs  different design photographed like the anchor
 *                         both: the same design (photography is ignored for both)
 *   near-identical ×1    near-identical design  vs  clear mismatch, all one colour → both agree
 *   attention ×2         the identical picture  vs  a different kind of furniture
 *   single-question ×2   one structure-only and one look-only triplet (to time one question vs two)
 *   pairs ×3 (1–5 both)  same shape/other colour · same colour/other shape · same design/other finish
 *   same-thing ×1        identical photo (attention check)
 *   attributes ×1        one product described (times the attribute task)
 *
 * The match sits in b or c at random; the tool also swaps left/right per rater. `expected` is a
 * construction note for checking the tool, never a label.
 */
export function makeCalibrationPack(seed = 1): { pack: QuestionPack; expected: Record<string, string> } {
  const rng = createRng(hashSeed(`calibration-v2:${seed}`));
  const palette = Object.values(ART_COLOURS);
  const colour = () => palette[Math.floor(rng() * palette.length)]!;
  const otherColour = (c: string) => {
    const others = palette.filter((x) => x !== c);
    return others[Math.floor(rng() * others.length)]!;
  };
  let n = 0;
  const img = (shot: ArtShot): ShownImage => ({
    productId: `art-${shot.design.id}-${shot.colour.slice(1)}-${shot.scene}-${shot.finish ?? 'matte'}`,
    src: svgDataUri(drawSvg(shot)),
  });
  const design = (kind?: ArtKind) => randomDesign(rng, `d${n++}`, kind);
  const near = (d: ArtDesign) => nudge(rng, d, `d${n++}`);
  /** A different design of the same kind that differs clearly in base and width. */
  const contrast = (d: ArtDesign) => {
    let o = design(d.kind);
    for (let t = 0; t < 50 && (o.base === d.base || Math.abs(o.w - d.w) < 20); t++) o = design(d.kind);
    if (o.base === d.base) o = { ...o, base: d.base === 'plinth' ? 'tapered-legs' : 'plinth' };
    return o;
  };
  const questions: Question[] = [];
  const expected: Record<string, string> = {};
  const triplet = (id: string, anchor: ShownImage, match: ShownImage, other: ShownImage, stratum: Stratum, ask: readonly Dimension[], goldFor: readonly Dimension[]) => {
    const pos = rng() < 0.5 ? 'b' : 'c';
    const gold = goldFor.length ? Object.fromEntries(goldFor.map((d) => [d, pos])) : undefined;
    questions.push({ kind: 'triplet', id, anchor, b: pos === 'b' ? match : other, c: pos === 'b' ? other : match, stratum, ask, ...(gold ? { gold } : {}) });
    expected[id] = `match=${pos}`;
  };
  const BOTH = DIMENSIONS;

  for (let i = 0; i < 3; i++) {
    const a = design();
    const c1 = colour();
    triplet(`v2-shape${i}`, img({ design: a, colour: c1, scene: 'studio' }), img({ design: near(a), colour: otherColour(c1), scene: 'studio' }), img({ design: contrast(a), colour: c1, scene: 'studio' }), 'shape-vs-colour', BOTH, ['structure']);
  }
  const finishes: [string, ArtFinish, ArtFinish][] = [
    [ART_COLOURS.walnut, 'woodgrain', 'gloss'],
    [ART_COLOURS.black, 'matte', 'gloss'],
  ];
  finishes.forEach(([c1, keep, change], i) => {
    const a = design('cabinet');
    a.h = Math.max(a.h, 50); // tall enough for the finish to be clearly visible
    triplet(`v2-finish${i}`, img({ design: a, colour: c1, scene: 'studio', finish: keep }), img({ design: near(a), colour: c1, scene: 'studio', finish: keep }), img({ design: near(a), colour: c1, scene: 'studio', finish: change }), 'finish-only', BOTH, ['aesthetic']);
  });
  for (let i = 0; i < 2; i++) {
    const a = design();
    const c1 = colour();
    triplet(`v2-photo${i}`, img({ design: a, colour: c1, scene: 'studio' }), img({ design: near(a), colour: c1, scene: 'room' }), img({ design: contrast(a), colour: c1, scene: 'studio' }), 'photo-style', BOTH, BOTH);
  }
  {
    const a = design();
    const c1 = colour();
    triplet('v2-near0', img({ design: a, colour: c1, scene: 'studio' }), img({ design: near(a), colour: c1, scene: 'studio' }), img({ design: contrast(a), colour: c1, scene: 'studio' }), 'near-identical', BOTH, []);
  }
  for (let i = 0; i < 2; i++) {
    const a = design('cabinet');
    const c1 = colour();
    const shot = { design: a, colour: c1, scene: 'studio' as const };
    triplet(`v2-attn${i}`, img(shot), img(shot), img({ design: design('sofa'), colour: otherColour(c1), scene: 'studio' }), 'gold', BOTH, BOTH);
  }
  for (const d of DIMENSIONS) {
    const a = design();
    triplet(`v2-single-${d}`, img({ design: a, colour: colour(), scene: 'studio' }), img({ design: near(a), colour: colour(), scene: 'studio' }), img({ design: contrast(a), colour: colour(), scene: 'studio' }), 'random', [d], []);
  }
  {
    const a = design();
    const c1 = colour();
    questions.push({ kind: 'pair', id: 'v2-pair-shape', a: img({ design: a, colour: c1, scene: 'studio' }), b: img({ design: near(a), colour: otherColour(c1), scene: 'studio' }), stratum: 'same-shape-diff-colour', ask: BOTH });
    expected['v2-pair-shape'] = 'structure ≥ look';
    const b = design();
    const c2 = colour();
    questions.push({ kind: 'pair', id: 'v2-pair-colour', a: img({ design: b, colour: c2, scene: 'studio' }), b: img({ design: contrast(b), colour: c2, scene: 'studio' }), stratum: 'same-colour-diff-shape', ask: BOTH });
    expected['v2-pair-colour'] = 'look ≥ structure';
    const c = design('cabinet');
    questions.push({ kind: 'pair', id: 'v2-pair-finish', a: img({ design: c, colour: ART_COLOURS.oak, scene: 'studio', finish: 'woodgrain' }), b: img({ design: near(c), colour: ART_COLOURS.oak, scene: 'studio', finish: 'gloss' }), stratum: 'same-design-diff-finish', ask: BOTH });
    expected['v2-pair-finish'] = 'look ≤ structure';
  }
  {
    const shot = { design: design(), colour: colour(), scene: 'studio' as const };
    questions.push({ kind: 'same', id: 'v2-same0', a: img(shot), b: img(shot), stratum: 'gold', gold: 'same-photo' });
    expected['v2-same0'] = 'same-photo';
  }
  {
    const a = design();
    questions.push({ kind: 'attributes', id: 'v2-attr0', product: img({ design: a, colour: ART_COLOURS.oak, scene: 'room', finish: 'woodgrain' }) });
    expected['v2-attr0'] = `base≈${a.base}`;
  }
  // Neutral ids (c01…), so nothing visible to a rater names what a screen tests.
  const rename = new Map(questions.map((q, i) => [q.id, `c${String(i + 1).padStart(2, '0')}`]));
  for (const q of questions) q.id = rename.get(q.id)!;
  const notes = Object.fromEntries(Object.entries(expected).map(([k, v]) => [rename.get(k)!, `${k}: ${v}`]));
  return {
    expected: notes,
    pack: { version: LABELS_VERSION, id: `calibration-v2-${seed}`, title: 'Calibration (drawn furniture): structure and overall look', purpose: 'calibration', questions },
  };
}
