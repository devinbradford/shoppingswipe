/// <reference types="node" />
/**
 * Builds the real-photo timing pilot pack from manifest v2 DEV products (metadata only; no image is
 * opened). Writes tools/annotate/packs/pilot-real-dev-1.json (+ notes).
 *
 *   npm run vision:pilot-pack
 *   npm run vision:pilot-pack -- --release --approval-ref "IMAGE_PERMISSIONS.md A2 (P1, <date>)"
 *       Also writes the standalone rater file. Refused without a recorded P1 approval, because
 *       showing retailer photos to raters is permission P1.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { makePilotPack } from '../../src/vision/pilotPack';
import { raterCopy, type Manifest } from '../../src/vision/schema';

const args = process.argv.slice(2);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const manifest = JSON.parse(readFileSync(value('manifest') ?? 'data/vision-eval/manifest-v2.json', 'utf8')) as Manifest;
const { pack, notes } = makePilotPack(manifest.items, Number(value('seed') ?? 1));
mkdirSync('tools/annotate/packs', { recursive: true });
writeFileSync(`tools/annotate/packs/${pack.id}.json`, `${JSON.stringify(pack, null, 1)}\n`);
writeFileSync(`tools/annotate/packs/${pack.id}.notes.json`, `${JSON.stringify(notes, null, 1)}\n`);
const judgments = pack.questions.reduce((n, q) => n + (q.kind === 'triplet' || q.kind === 'pair' ? q.ask.length : 1), 0);
console.log(`${pack.id}: ${pack.questions.length} screens, ${judgments} judgments, ${new Set(pack.questions.flatMap((q) => JSON.stringify(q).match(/"productId":"[^"]+"/g) ?? [])).size} products (dev only)`);
if (args.includes('--release')) {
  const ref = value('approval-ref');
  if (!ref) {
    console.error('REFUSED: --release needs --approval-ref pointing to the recorded P1 approval in docs/vision/IMAGE_PERMISSIONS.md');
    process.exit(2);
  }
  const tag = '<script src="packs/calibration-v2.rater.js"></script>';
  const html = readFileSync('tools/annotate/index.html', 'utf8');
  const js = `window.ANNOTATE_PACKS = [${JSON.stringify(raterCopy(pack))}];\n`;
  writeFileSync(`tools/annotate/cureavo-${pack.id}.html`, html.replace(tag, () => `<script>\n// Released under: ${ref.replace(/[<>]/g, '')}\n${js}</script>`));
  console.log(`wrote tools/annotate/cureavo-${pack.id}.html (approval: ${ref})`);
} else console.log('Rater file NOT written: showing retailer photos to raters needs permission P1 (use --release --approval-ref once recorded).');
