/// <reference types="node" />
/**
 * Writes the calibration pack v2 (CureAvo's own drawn furniture; no retailer images):
 *   tools/annotate/packs/calibration-v2.json        full pack WITH the answer key (for analysis only)
 *   tools/annotate/packs/calibration-v2.notes.json  construction notes (which option is the match)
 *   tools/annotate/packs/calibration-v2.rater.js    rater copy WITHOUT the key, loaded by index.html
 *   tools/annotate/cureavo-calibration-v2.html      ONE self-contained file to send to raters
 *
 *   npm run vision:fixture-pack [-- --seed 1]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { makeCalibrationPack } from '../../src/vision/fixtureArt';
import { raterCopy } from '../../src/vision/schema';

const i = process.argv.indexOf('--seed');
const seed = i >= 0 ? Number(process.argv[i + 1]) : 1;
const { pack, expected } = makeCalibrationPack(seed);
const rater = raterCopy(pack);
const raterJs = `window.ANNOTATE_PACKS = (window.ANNOTATE_PACKS || []).concat([${JSON.stringify(rater)}]);\n`;
mkdirSync('tools/annotate/packs', { recursive: true });
writeFileSync('tools/annotate/packs/calibration-v2.json', `${JSON.stringify(pack)}\n`);
writeFileSync('tools/annotate/packs/calibration-v2.notes.json', `${JSON.stringify(expected, null, 1)}\n`);
writeFileSync('tools/annotate/packs/calibration-v2.rater.js', raterJs);

// Standalone copy: the tool with the rater pack inlined (works when emailed or downloaded alone).
const tag = '<script src="packs/calibration-v2.rater.js"></script>';
const html = readFileSync('tools/annotate/index.html', 'utf8');
if (!html.includes(tag)) throw new Error('index.html no longer loads the v2 rater pack');
writeFileSync('tools/annotate/cureavo-calibration-v2.html', html.replace(tag, () => `<script>\n${raterJs}</script>`).replace('<title>CureAvo labelling</title>', '<title>CureAvo calibration</title>'));

const judgments = pack.questions.reduce((n, q) => n + (q.kind === 'triplet' || q.kind === 'pair' ? q.ask.length : 1), 0);
console.log(`${pack.id}: ${pack.questions.length} screens, ${judgments} judgments`);
console.log('wrote tools/annotate/packs/calibration-v2.{json,notes.json,rater.js} and tools/annotate/cureavo-calibration-v2.html');
