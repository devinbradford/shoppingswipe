/// <reference types="node" />
/**
 * Writes the calibration practice pack (our own drawn furniture, no retailer images) for the
 * annotation tool, plus the constructed answers used only to sanity-check the tool.
 *
 *   npm run vision:fixture-pack [-- --seed 1]
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { makeCalibrationPack } from '../../src/vision/fixtureArt';

const i = process.argv.indexOf('--seed');
const seed = i >= 0 ? Number(process.argv[i + 1]) : 1;
const { pack, expected } = makeCalibrationPack(seed);
mkdirSync('tools/annotate/packs', { recursive: true });
writeFileSync('tools/annotate/packs/calibration-fixture.json', `${JSON.stringify(pack)}\n`);
// The tool loads packs by <script>, so it also works from file:// with no server.
writeFileSync('tools/annotate/packs/calibration-fixture.js', `window.ANNOTATE_PACKS = (window.ANNOTATE_PACKS || []).concat([${JSON.stringify(pack)}]);\n`);
writeFileSync('tools/annotate/packs/calibration-fixture.expected.json', `${JSON.stringify(expected, null, 1)}\n`);
const kinds = pack.questions.reduce<Record<string, number>>((m, q) => ({ ...m, [q.kind]: (m[q.kind] ?? 0) + 1 }), {});
console.log(`wrote tools/annotate/packs/calibration-fixture.{json,js} (${pack.questions.length} questions: ${JSON.stringify(kinds)})`);
