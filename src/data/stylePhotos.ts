/**
 * Room photos for the first-launch style picker, one per style. They ship
 * inside the app (assets/styles) so the picker works instantly and offline.
 * Original AI-generated images made for CureAvo.
 *
 * Order here is the order shown in the grid.
 */
export const STYLE_PHOTOS: { tag: string; source: number }[] = [
  { tag: 'modern', source: require('../../assets/styles/modern.jpg') },
  { tag: 'mid-century', source: require('../../assets/styles/mid-century.jpg') },
  { tag: 'scandinavian', source: require('../../assets/styles/scandinavian.jpg') },
  { tag: 'minimal', source: require('../../assets/styles/minimal.jpg') },
  { tag: 'coastal', source: require('../../assets/styles/coastal.jpg') },
  { tag: 'bohemian', source: require('../../assets/styles/bohemian.jpg') },
  { tag: 'industrial', source: require('../../assets/styles/industrial.jpg') },
  { tag: 'farmhouse', source: require('../../assets/styles/farmhouse.jpg') },
  { tag: 'classic', source: require('../../assets/styles/classic.jpg') },
];

/** Photo for a style, if it has one. */
export function stylePhoto(tag: string): number | undefined {
  return STYLE_PHOTOS.find((s) => s.tag === tag)?.source;
}
