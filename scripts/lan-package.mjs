import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { resolve, relative, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PROTOCOL_VERSION, RELEASE_VERSION } from '../src/shared/Protocol.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.env.SKYBREAK_LAN_OUTPUT || join(root, 'qa-artifacts/skybreak-lan-release'));
if (!await stat(join(root, 'dist/index.html')).catch(() => null)) throw Error('Run npm run build first. The LAN package uses the already-tested production build.');
const previous = await readdir(output).catch(() => []);
if (previous.length) {
  const priorManifest = JSON.parse(await readFile(join(output, 'package-manifest.json'), 'utf8').catch(() => '{}'));
  if (priorManifest.name !== 'Skybreak LAN') throw Error('Output folder is not an existing Skybreak LAN package. Choose an empty SKYBREAK_LAN_OUTPUT folder.');
  const known = new Set(['package-manifest.json', ...(priorManifest.files || []).map(file => file.path)]);
  async function checkManaged(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, item.name);
      if (item.isDirectory()) await checkManaged(path);
      else if (!item.isFile() || !known.has(relative(output, path).replaceAll('\\', '/'))) throw Error('Output folder contains unmanaged files. Choose an empty SKYBREAK_LAN_OUTPUT folder.');
    }
  }
  await checkManaged(output);
  for (const file of priorManifest.files || []) {
    const path = resolve(output, file.path);
    if (path.startsWith(output + sep)) await rm(path, { force: true });
  }
  await rm(join(output, 'package-manifest.json'), { force: true });
}
await mkdir(output, { recursive: true });
await cp(join(root, 'dist'), join(output, 'dist'), { recursive: true });
await cp(join(root, 'START_SKYBREAK_LAN.cmd'), join(output, 'START_SKYBREAK_LAN.cmd'));
const bundle = await build({
  stdin: { contents: `import { resolve } from 'node:path'; import { launchLan } from './server/lan-launcher.js'; launchLan({directory:resolve(__dirname,'dist')}).catch(error=>{console.error(error.message);process.exitCode=1;});`, resolveDir: root },
  outfile: join(output, 'skybreak-lan.cjs'), bundle: true, platform: 'node', target: 'node22', format: 'cjs', metafile: true,
  external: ['bufferutil', 'utf-8-validate'], legalComments: 'eof', logOverride: { 'empty-import-meta': 'silent' },
});
await writeFile(join(output, 'START_SKYBREAK_LAN.sh'), '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nnode skybreak-lan.cjs\n', { mode: 0o755 });
await cp(join(root, 'LAN_PLAY_GUIDE.md'), join(output, 'README.md'));
await cp(join(root, 'PLAYING_GUIDE_HINGLISH.md'), join(output, 'PLAYING_GUIDE_HINGLISH.md'));
await cp(join(root, 'CONTROLS_GUIDE.md'), join(output, 'CONTROLS_GUIDE.md'));
const sourceManifest = await readFile(join(root, 'evidence/upgrade40/source-manifest.json')).catch(() => null);
if (sourceManifest) await writeFile(join(output, 'source-manifest.json'), sourceManifest);
const packages = new Set(['three']);
for (const file of Object.keys(bundle.metafile.inputs)) {
  const match = file.replaceAll('\\', '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (match) packages.add(match[1]);
}
await mkdir(join(output, 'licenses'), { recursive: true });
for (const name of packages) {
  const folder = join(root, 'node_modules', name);
  for (const file of await readdir(folder).catch(() => [])) {
    if (/^(license|licence|copying|notice)/i.test(file) && (await stat(join(folder, file))).isFile()) await cp(join(folder, file), join(output, 'licenses', `${name.replaceAll('/', '_')}-${file}`));
  }
}
const files = [];
async function inventory(folder) {
  for (const item of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, item.name);
    if (item.isDirectory()) await inventory(path);
    else if (item.isFile() && item.name !== 'package-manifest.json') { const data = await readFile(path); files.push({ path: relative(output, path).replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }); }
  }
}
await inventory(output);
let revision = 'unavailable';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
const manifest = { name: 'Skybreak LAN', version: RELEASE_VERSION, protocol: PROTOCOL_VERSION, builtAt: new Date().toISOString(), sourceRevision: revision, sourceManifestSha256: sourceManifest ? createHash('sha256').update(sourceManifest).digest('hex') : null, revisionNote: 'Source revision identifies local HEAD; source-manifest and package file hashes identify the actual packaged working build.', minimumNodeMajor: 22, assetsOffline: true, internetRequiredAfterSetup: false, operatingSystem: 'Windows/macOS/Linux with Node.js', files };
await writeFile(join(output, 'package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Uncompressed ZIP avoids a platform-specific zip executable or post-setup dependency download.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => { for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0; });
function crc32(data) { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
const entries = [...files.map(file => file.path), 'package-manifest.json'], local = [], central = []; let offset = 0;
for (const path of entries) {
  const name = Buffer.from(`skybreak-lan/${path}`), data = await readFile(join(output, path)), crc = crc32(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
  local.push(header, name, data); central.push(record, name); offset += header.length + name.length + data.length;
}
const directoryBytes = Buffer.concat(central), ending = Buffer.alloc(22); ending.writeUInt32LE(0x06054b50); ending.writeUInt16LE(entries.length, 8); ending.writeUInt16LE(entries.length, 10); ending.writeUInt32LE(directoryBytes.length, 12); ending.writeUInt32LE(offset, 16);
await writeFile(`${output}.zip`, Buffer.concat([...local, directoryBytes, ending]));
console.log(JSON.stringify({ package: output, zip: `${output}.zip`, protocol: PROTOCOL_VERSION, files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), verification: 'Run verify:lan against this package; two physical LAN devices remain a separate acceptance gate.' }, null, 2));
