/**
 * Keyword rules that sort a feed item into our rooms and product types, and read
 * colour, material and style from its text. Rules now; AI tagging can come later
 * for messy feeds (Devin's call).
 */
import type { CategoryId, SubcategoryId } from '../domain/types';

const TYPE_ROOM: Record<SubcategoryId, CategoryId> = {
  'bed-frames': 'bedroom',
  nightstands: 'bedroom',
  dressers: 'bedroom',
  sofas: 'living-room',
  'accent-chairs': 'living-room',
  'coffee-tables': 'living-room',
  'tv-stands': 'living-room',
  rugs: 'living-room',
  'bar-stools': 'kitchen-dining',
  'dining-tables': 'kitchen-dining',
  'dining-chairs': 'kitchen-dining',
};

export function roomOf(type: SubcategoryId): CategoryId {
  return TYPE_ROOM[type];
}

/**
 * Things we don't show (yet), checked first so "outdoor sofa" or "rug pad" never sneak in.
 * Indoor/outdoor rugs are fine: only rugs that are ONLY for outside are left out.
 */
const OUT_OF_SCOPE: RegExp[] = [
  /\b(patio|garden|poolside|adirondack|hammock|porch swing)\b/,
  /\boutdoor (sofa|sectional|chair|dining|table|furniture|set|lounge)/,
  /\b(kids?'?|children'?s|toddler|nursery|crib|bassinet|youth|bunk bed|play ?room)\b|\bbaby (furniture|crib|bed|room|chair)\b/,
  /\b(dog|cat|pet)s?\b.*\b(bed|sofa|furniture|tree|house)\b|\bpet bed\b/,
  /\b(office|desk|gaming|computer|task|ergonomic) chair\b/,
  /\b(mattress|mattress topper|box spring|bed sheet|duvet|comforter|pillowcase)\b/,
  /\brug pads?\b|\bbath (rug|mat)\b|\bdoor ?mat\b|\btable runners?\b/,
  /\b(slipcover|furniture cover|cushion cover|replacement cushion)\b/,
  /\b(sample|swatch|gift card)\b/,
];

/** Most specific first: "dining chair" before "chair", "bar stool" before "stool". */
const TYPE_RULES: [SubcategoryId, RegExp][] = [
  ['bar-stools', /\b(bar|counter)[- ]?(height )?stools?\b|\bbarstools?\b/],
  ['dining-chairs', /\b(dining|kitchen|side) chairs?\b|\bdining (arm|side)chairs?\b/],
  ['dining-tables', /\b(dining|kitchen|breakfast|pub|bistro) tables?\b|\bdinette\b|\bextendable table\b/],
  ['coffee-tables', /\b(coffee|cocktail) tables?\b/],
  [
    'tv-stands',
    /\b(tv|television|media) (stand|console|cabinet|unit)s?\b|\bentertainment (center|centre|unit)\b|\btv lift\b/,
  ],
  ['nightstands', /\b(night ?stands?|bedside (table|cabinet)s?|night tables?)\b/],
  ['dressers', /\b(dressers?|chests? of drawers|tallboy|lowboy|\d+[- ]drawer chest)\b/],
  [
    'bed-frames',
    /\b(bed ?frames?|platform beds?|canopy beds?|upholstered beds?|panel beds?|sleigh beds?|day ?beds?|storage beds?|four[- ]poster|(queen|king|full|twin) beds?)\b/,
  ],
  ['sofas', /\b(sofas?|couch(es)?|sectionals?|loveseats?|settees?|chesterfield|sleeper)\b/],
  [
    'accent-chairs',
    /\b(accent|arm|lounge|club|slipper|wingback|barrel|swivel|reading|rocking) ?chairs?\b|\barmchairs?\b|\brecliners?\b|\bchaise\b/,
  ],
  [
    'rugs',
    /\b(area |runner |round |shag |braided |jute |wool |washable |vintage |persian |outdoor )?rugs?\b|\brunners?\b(?!.*\btable\b)/,
  ],
];

export type TypeResult = { type: SubcategoryId } | { skip: 'not-our-category' | 'out-of-scope' };

/** Sorts an item by its title first (most reliable), then the retailer's category text. */
export function classifyType(title: string, categoryText: string): TypeResult {
  const t = title.toLowerCase();
  const all = `${t} ${categoryText.toLowerCase()}`;
  // Rugs described as "indoor/outdoor" are welcome; outdoor-only furniture isn't.
  const scopeText = all.replace(/indoor\s*\/?\s*(and |& )?outdoor/g, 'indoor');
  if (OUT_OF_SCOPE.some((re) => re.test(scopeText))) return { skip: 'out-of-scope' };
  for (const source of [t, all]) {
    for (const [type, re] of TYPE_RULES) if (re.test(source)) return { type };
  }
  return { skip: 'not-our-category' };
}

// --- Colour, material, style -------------------------------------------------

/** Mapped onto the app's shared colour words so taste carries across stores. */
const COLOURS: [RegExp, string][] = [
  [/\b(ivory|cream|off[- ]?white|bone|eggshell|alabaster)\b/, 'cream'],
  [/\b(beige|tan|natural|sand|khaki|camel|wheat|taupe|oatmeal|linen|flax|greige)\b/, 'oatmeal'],
  [/\b(charcoal|gr[ae]y|silver|slate|ash|graphite|smoke|pewter)\b/, 'charcoal'],
  [/\b(navy|blue|indigo|denim|teal|aqua|turquoise|marina|cobalt)\b/, 'navy'],
  [/\b(sage|green|seafoam|mint|emerald|jade|spruce|forest)\b/, 'sage'],
  [/\b(olive|moss|khaki green)\b/, 'olive'],
  [/\b(rust|orange|copper|burnt|amber|gold|mustard|yellow|ochre|bronze)\b/, 'rust'],
  [/\b(terra ?cotta|clay|brick|red|burgundy|wine|crimson|maroon|cherry)\b/, 'terracotta'],
  [/\b(blush|pink|rose|coral|peach|mauve|lavender|purple|plum)\b/, 'blush'],
  [/\b(brown|chocolate|espresso|walnut|mocha|coffee|chestnut|cognac|tobacco)\b/, 'walnut'],
  [/\b(black|onyx|jet|ebony)\b/, 'black'],
  [/\b(white|snow|chalk)\b/, 'white'],
];

const MATERIALS: [RegExp, string][] = [
  [/faux fur|faux sheepskin|sheepskin/, 'faux fur'],
  [/\bbouc(l|lé)e?\b/, 'boucle'],
  [/\bvelvet\b/, 'velvet'],
  [/\b(leather|leatherette)\b/, 'leather'],
  [/\bmarble\b/, 'marble'],
  [/\btravertine\b/, 'travertine'],
  [/\bwalnut\b/, 'walnut'],
  [/\boak\b/, 'oak'],
  [/\b(pine|acacia|mango wood|teak|ash wood|solid wood|reclaimed wood)\b/, 'pine'],
  [/\b(rattan|cane|wicker)\b/, 'rattan'],
  [/\b(steel|iron|metal|aluminum|brass)\b/, 'steel'],
  [/\bglass\b/, 'glass'],
  [/\bwool\b/, 'wool'],
  [/\bjute\b/, 'jute'],
  [/\bsisal\b|\bseagrass\b/, 'sisal'],
  [/\bcotton\b/, 'cotton'],
  [/\bviscose\b|\brayon\b/, 'viscose'],
  [/\blinen\b/, 'linen'],
  [/\b(polypropylene|olefin|nylon|polyester|microfiber|performance fabric)\b/, 'polypropylene'],
];

/** The app's shared style words. */
const STYLES: [RegExp, string][] = [
  [/mid[- ]century|retro|atomic|danish modern/, 'mid-century'],
  [/scandinavian|nordic|hygge|scandi/, 'scandinavian'],
  [/persian|oriental|traditional|medallion|kashan|tabriz|heriz|damask|chesterfield|tufted|queen anne/, 'classic'],
  [/\bvintage\b|distressed|antique|overdyed|faded/, 'vintage'],
  [/moroccan|\bboho\b|bohemian|tribal|kilim|tassel|beni ourain|aztec|macrame/, 'bohemian'],
  [/coastal|nautical|beach|seaside|rattan|cane|wicker/, 'coastal'],
  [/farmhouse|plaid|buffalo check|tweed|shiplap|country|cottage|braided/, 'farmhouse'],
  [/rustic|cabin|lodge|reclaimed|live edge|log /, 'rustic'],
  [/industrial|pipe|metal frame|concrete|loft/, 'industrial'],
  [/glam|velvet|maximal|bold pattern|jewel/, 'maximalist'],
  [/\bsolid\b|minimal|simple|clean lines|understated/, 'minimal'],
  [/modern|contemporary|geometric|abstract|sleek/, 'modern'],
];

export function readColour(title: string, colourField: string, description: string): string {
  // Prefer the feed's own field, then "… in <Colour>" at the end of the name, then name, then description.
  const inPart = title.toLowerCase().match(/\bin ([a-z ,/&-]+)$/)?.[1];
  for (const chunk of [colourField, inPart, title, description]) {
    const text = (chunk ?? '').toLowerCase();
    if (!text) continue;
    for (const [re, colour] of COLOURS) if (re.test(text)) return colour;
  }
  // Patterned or unknown: 'multi' (still a usable taste feature).
  return 'multi';
}

export function readMaterial(title: string, description: string): string {
  // The name wins over the description (descriptions often mention other materials).
  for (const chunk of [title, description]) {
    const text = chunk.toLowerCase();
    for (const [re, material] of MATERIALS) if (re.test(text)) return material;
  }
  return '';
}

export function readStyles(title: string, description: string, max = 3): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const out: string[] = [];
  for (const [re, style] of STYLES) if (re.test(text) && !out.includes(style)) out.push(style);
  return (out.length ? out : ['modern']).slice(0, max);
}
