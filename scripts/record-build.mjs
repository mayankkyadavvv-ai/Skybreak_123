import { fileURLToPath } from 'node:url';
import { recordBuild } from './build-manifest.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = await recordBuild({ root });
console.log(`Build recorded: ${manifest.source.length} public inputs, ${manifest.assets.length} assets; source ${manifest.sourceDigest}`);
