import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { recordBuild, verifyBuild } from '../scripts/build-manifest.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'skybreak-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'src/game.js'), 'export const version = 1;');
  await writeFile(join(root, 'dist/index.html'), '<main>Skybreak</main>');
  const options = { root, inputs: ['src'] };
  return { ...options, options, manifest: await recordBuild(options) };
}

test('build inventory records the working source and exact output, excluding private files', async t => {
  const { root, options, manifest } = await fixture(t);
  await writeFile(join(root, '.env'), 'SECRET=private-fixture');
  assert.equal((await verifyBuild(options)).sourceDigest, manifest.sourceDigest);
  assert.deepEqual(manifest.source.map(file => file.path), ['src/game.js']);
  assert.deepEqual(manifest.assets.map(file => file.path), ['index.html']);
  assert.doesNotMatch(await readFile(join(root, 'dist/build-manifest.json'), 'utf8'), /private-fixture/);
});

test('LAN provenance rejects stale frontend or server source before packaging', async t => {
  const { root, options } = await fixture(t);
  await writeFile(join(root, 'src/game.js'), 'export const version = 2;');
  await assert.rejects(verifyBuild(options), /Source changed after the build/);
  await recordBuild(options);
  await verifyBuild(options);
});

test('build verification detects altered and extra built assets', async t => {
  const { root, options } = await fixture(t);
  await writeFile(join(root, 'dist/unexpected.js'), 'modified();');
  await assert.rejects(verifyBuild(options), /Built assets changed/);
  await rm(join(root, 'dist/unexpected.js'));
  await writeFile(join(root, 'dist/index.html'), '<main>Stale game</main>');
  await assert.rejects(verifyBuild(options), /Built assets changed/);
});

test('build verification rejects absent or tampered evidence', async t => {
  const { root, options, manifest } = await fixture(t);
  manifest.source[0].sha256 = '0'.repeat(64);
  await writeFile(join(root, 'dist/build-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(verifyBuild(options), /Source changed/);
  await rm(join(root, 'dist/build-manifest.json'));
  await assert.rejects(verifyBuild(options), /manifest missing/);
});

test('public build inventory cannot follow a source symlink outside the project', async t => {
  const { root, options } = await fixture(t);
  await writeFile(join(root, '.env'), 'SECRET=private-fixture');
  await symlink(join(root, '.env'), join(root, 'src/external.js'));
  await assert.rejects(recordBuild(options), /refuses symlink/);
});
