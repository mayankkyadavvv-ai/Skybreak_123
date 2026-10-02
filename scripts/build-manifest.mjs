import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Deliberate public inputs only: never enumerate credentials or local QA artifacts.
export const BUILD_INPUTS = ['src', 'server', 'scripts', 'public', 'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'site.config.js', 'vercel.json', 'Dockerfile.match', 'START_SKYBREAK_LAN.cmd', 'LAN_PLAY_GUIDE.md', 'PLAYING_GUIDE_HINGLISH.md', 'CONTROLS_GUIDE.md'];
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const inventoryDigest = files => sha256(JSON.stringify(files));

export async function inventory(root, paths, exclude = new Set()) {
  const files = [];
  async function visit(path) {
    const name = relative(root, path).replaceAll('\\', '/');
    if (exclude.has(name)) return;
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw Error(`Build inventory refuses symlink: ${name}`);
    if (info.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry));
    } else if (info.isFile()) {
      const bytes = await readFile(path);
      files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
    } else throw Error(`Unsupported build input: ${name}`);
  }
  for (const path of paths) await visit(resolve(root, path));
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export async function recordBuild({ root, directory = join(root, 'dist'), inputs = BUILD_INPUTS } = {}) {
  const source = await inventory(root, inputs);
  const assets = await inventory(directory, ['.'], new Set(['build-manifest.json']));
  let revision = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const manifest = { schema: 1, builtAt: new Date().toISOString(), sourceRevision: revision,
    revisionNote: 'HEAD at build time; sourceDigest identifies the actual public working inputs, including uncommitted changes. Asset hashes apply only to this build.',
    sourceDigest: inventoryDigest(source), assetsDigest: inventoryDigest(assets), source, assets };
  await writeFile(join(directory, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export async function verifyBuild({ root, directory = join(root, 'dist'), inputs = BUILD_INPUTS } = {}) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(directory, 'build-manifest.json'), 'utf8')); }
  catch { throw Error('Build manifest missing or invalid. Run npm run build before packaging.'); }
  if (manifest.schema !== 1 || !Array.isArray(manifest.source) || !Array.isArray(manifest.assets)) throw Error('Unsupported build manifest. Run npm run build.');
  const source = await inventory(root, inputs), assets = await inventory(directory, ['.'], new Set(['build-manifest.json']));
  if (inventoryDigest(manifest.source) !== manifest.sourceDigest || inventoryDigest(source) !== manifest.sourceDigest) throw Error('Source changed after the build. Run npm run build before packaging.');
  if (inventoryDigest(manifest.assets) !== manifest.assetsDigest || inventoryDigest(assets) !== manifest.assetsDigest) throw Error('Built assets changed after verification. Run npm run build before packaging.');
  return manifest;
}
