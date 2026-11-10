/**
 * The onboarding rooms: one photo per style, each with what it shows (weights 0–1:
 * 1 = defining, 0.3 = present). Attributes use the model's vocabulary (style tags,
 * colour families, materials) so they seed ranking directly; `wood` and `shape`
 * only shape the "Your taste" wording for now.
 *
 * Photos: Devin's chosen onboarding photos (assets/rooms), one per style. To swap
 * one: replace the image, update its attributes to match the new photo, and raise
 * `version` (old answers about the old photo stop counting).
 * Order here is the order shown.
 */
import type { RoomProfile } from '@/recommendation/rooms';

export interface Room extends RoomProfile {
  image: number;
  /** Spoken description for screen readers. */
  alt: string;
}

export const ROOMS: Room[] = [
  {
    id: 'organic-modern',
    version: 2,
    style: 'modern',
    image: require('../../assets/rooms/organic-modern.webp'),
    alt: 'Plaster-walled room with a curved cream bouclé sofa, a low oak coffee table, a fiddle-leaf fig and tall oak-framed windows',
    attributes: {
      style: { modern: 1, minimal: 0.6 },
      color: { cream: 1, oatmeal: 0.8 },
      material: { boucle: 1, oak: 0.8 },
      wood: { light: 0.7 },
      shape: { curved: 1 },
    },
  },
  {
    id: 'mid-century',
    version: 2,
    style: 'mid-century',
    image: require('../../assets/rooms/mid-century.webp'),
    alt: 'Walnut credenza with tapered legs, cognac leather chairs, a cream bouclé sofa, a round ottoman and abstract orange art',
    attributes: {
      style: { 'mid-century': 1, modern: 0.4 },
      color: { walnut: 1, rust: 0.8, cream: 0.6 },
      material: { walnut: 1, leather: 0.9, boucle: 0.5 },
      wood: { dark: 0.8 },
      shape: { tailored: 1 },
    },
  },
  {
    id: 'scandinavian',
    version: 2,
    style: 'scandinavian',
    image: require('../../assets/rooms/scandinavian.webp'),
    alt: 'Bright room with oak floors and window frames, a navy sofa, a bentwood lounge chair in tan leather and a round oak table',
    attributes: {
      style: { scandinavian: 1, minimal: 0.6, 'mid-century': 0.3 },
      color: { navy: 1, white: 0.8, oatmeal: 0.5, walnut: 0.4 },
      material: { oak: 1, leather: 0.6, wool: 0.5 },
      wood: { light: 1 },
      shape: { tailored: 0.8 },
    },
  },
  {
    id: 'coastal',
    version: 2,
    style: 'coastal',
    image: require('../../assets/rooms/coastal.webp'),
    alt: 'Sunroom by the water with a white linen sofa, blue striped pillows and rug, rattan chairs and a woven rattan table',
    attributes: {
      style: { coastal: 1 },
      color: { navy: 1, white: 0.9, oatmeal: 0.5 },
      material: { rattan: 1, linen: 0.6, jute: 0.5 },
      wood: { light: 0.6 },
      shape: { curved: 0.5, substantial: 0.4 },
    },
  },
  {
    id: 'bohemian',
    version: 2,
    style: 'bohemian',
    image: require('../../assets/rooms/bohemian.webp'),
    alt: 'Olive velvet sofa with patterned kilim pillows, a woven pouf, a Persian-style rug, macramé, plants and string lights',
    attributes: {
      style: { bohemian: 1, maximalist: 0.5, vintage: 0.4 },
      color: { olive: 1, rust: 0.7, navy: 0.5, terracotta: 0.5 },
      material: { velvet: 0.8, rattan: 0.7, jute: 0.6, wool: 0.5 },
      wood: { mid: 0.6 },
      shape: { substantial: 0.4, tailored: 0.3 },
    },
  },
  {
    id: 'industrial',
    version: 2,
    style: 'industrial',
    image: require('../../assets/rooms/industrial.webp'),
    alt: 'Moody loft with exposed brick, black wall panels, a cognac leather sofa and a black marble and steel coffee table',
    attributes: {
      style: { industrial: 1, modern: 0.4 },
      color: { walnut: 0.9, black: 0.9, charcoal: 0.5, rust: 0.4 },
      material: { leather: 1, steel: 0.8, marble: 0.7 },
      wood: { dark: 0.6 },
      shape: { tailored: 0.8, substantial: 0.4 },
    },
  },
  {
    id: 'farmhouse',
    version: 2,
    style: 'farmhouse',
    image: require('../../assets/rooms/farmhouse.webp'),
    alt: 'White shiplap room with wood beams, a chunky reclaimed wood coffee table, a jute rug, a gingham sofa and slipcovered chairs',
    attributes: {
      style: { farmhouse: 1, rustic: 0.7 },
      color: { white: 0.8, cream: 0.7, oatmeal: 0.7 },
      material: { pine: 1, jute: 0.8, linen: 0.6, cotton: 0.4 },
      wood: { mid: 0.8 },
      shape: { substantial: 1 },
    },
  },
  {
    id: 'classic',
    version: 2,
    style: 'classic',
    image: require('../../assets/rooms/classic.webp'),
    alt: 'Olive velvet tufted sofa, cream bouclé chairs, a stone coffee table, a gilded mirror over a fireplace and a red Persian-style rug',
    attributes: {
      style: { classic: 1, vintage: 0.5 },
      color: { olive: 1, rust: 0.7, cream: 0.6 },
      material: { velvet: 1, travertine: 0.7, boucle: 0.5, wool: 0.4 },
      wood: { mid: 0.3 },
      shape: { tailored: 0.6, curved: 0.5 },
    },
  },
];

/** Skipping is allowed after this many answers. */
export const ROOMS_BEFORE_SKIP = 4;
