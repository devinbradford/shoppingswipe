/**
 * The onboarding rooms: one photo per style, each with what it shows (weights 0–1:
 * 1 = defining, 0.3 = present). Attributes use the model's vocabulary (style tags,
 * colour families, materials) so they seed ranking directly; `wood` and `shape`
 * only shape the "Your taste" wording for now.
 *
 * STAND-INS: these are the original AI-generated style photos made for CureAvo,
 * until the eight licensed interior photos arrive. To swap one in: replace the
 * image, update its attributes to match the new photo, and raise `version`.
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
    version: 1,
    style: 'modern',
    image: require('../../assets/styles/modern.jpg'),
    alt: 'Bright living room with a curved cream bouclé sofa, stone and glass coffee table, and a woven rug',
    attributes: {
      style: { modern: 1, minimal: 0.5 },
      color: { cream: 1, oatmeal: 0.6, white: 0.4 },
      material: { boucle: 1, travertine: 0.7, glass: 0.5, wool: 0.4 },
      wood: { light: 0.3 },
      shape: { curved: 1 },
    },
  },
  {
    id: 'mid-century',
    version: 1,
    style: 'mid-century',
    image: require('../../assets/styles/mid-century.jpg'),
    alt: 'Walnut sideboard with tapered legs, a mustard lounge chair and a globe lamp',
    attributes: {
      style: { 'mid-century': 1, vintage: 0.3 },
      color: { walnut: 1, rust: 0.7, cream: 0.3 },
      material: { walnut: 1, wool: 0.3 },
      wood: { dark: 0.9 },
      shape: { tailored: 1 },
    },
  },
  {
    id: 'scandinavian',
    version: 1,
    style: 'scandinavian',
    image: require('../../assets/styles/scandinavian.jpg'),
    alt: 'Light oak sideboard and round oak coffee table beside a pale linen sofa',
    attributes: {
      style: { scandinavian: 1, minimal: 0.6 },
      color: { oatmeal: 0.8, cream: 0.7, white: 0.4 },
      material: { oak: 1, linen: 0.5, wool: 0.4 },
      wood: { light: 1 },
      shape: { curved: 0.4, tailored: 0.4 },
    },
  },
  {
    id: 'coastal',
    version: 1,
    style: 'coastal',
    image: require('../../assets/styles/coastal.jpg'),
    alt: 'White slipcovered sofa with blue pillows, a rattan chair and a sea painting',
    attributes: {
      style: { coastal: 1 },
      color: { white: 0.8, navy: 0.6, oatmeal: 0.6 },
      material: { rattan: 1, linen: 0.6, jute: 0.5, oak: 0.4 },
      wood: { light: 0.8 },
      shape: { substantial: 0.4, curved: 0.3 },
    },
  },
  {
    id: 'bohemian',
    version: 1,
    style: 'bohemian',
    image: require('../../assets/styles/bohemian.jpg'),
    alt: 'Layered room with a rattan chair and table, rust textiles, plants and a patterned rug',
    attributes: {
      style: { bohemian: 1, vintage: 0.4 },
      color: { rust: 1, terracotta: 0.7, sage: 0.5, oatmeal: 0.4 },
      material: { rattan: 1, jute: 0.5, wool: 0.5 },
      wood: { mid: 0.6 },
      shape: { curved: 0.5 },
    },
  },
  {
    id: 'industrial',
    version: 1,
    style: 'industrial',
    image: require('../../assets/styles/industrial.jpg'),
    alt: 'Cognac leather sofa against exposed brick, with a reclaimed wood and black metal coffee table',
    attributes: {
      style: { industrial: 1, rustic: 0.5 },
      color: { walnut: 0.9, charcoal: 0.6, black: 0.6 },
      material: { leather: 1, steel: 0.8, pine: 0.5 },
      wood: { mid: 0.6, dark: 0.4 },
      shape: { substantial: 0.8 },
    },
  },
  {
    id: 'farmhouse',
    version: 1,
    style: 'farmhouse',
    image: require('../../assets/styles/farmhouse.jpg'),
    alt: 'White linen sofa under wooden ceiling beams, with a chunky rustic wood coffee table',
    attributes: {
      style: { farmhouse: 1, rustic: 0.7 },
      color: { white: 0.8, cream: 0.7, oatmeal: 0.6 },
      material: { pine: 1, linen: 0.7, jute: 0.4 },
      wood: { mid: 0.8 },
      shape: { substantial: 1 },
    },
  },
  {
    id: 'classic',
    version: 1,
    style: 'classic',
    image: require('../../assets/styles/classic.jpg'),
    alt: 'Deep green velvet tufted sofa, a marble table, a dark wood side table and a brass lamp',
    attributes: {
      style: { classic: 1, vintage: 0.4 },
      color: { olive: 1, sage: 0.5, cream: 0.4 },
      material: { velvet: 1, marble: 0.7, walnut: 0.5 },
      wood: { dark: 0.8 },
      shape: { tailored: 0.6, substantial: 0.4 },
    },
  },
];

/** Skipping is allowed after this many answers. */
export const ROOMS_BEFORE_SKIP = 4;
