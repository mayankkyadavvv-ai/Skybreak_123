import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCockpit } from '../src/game/Cockpit.js';

function dispose(cockpit) {
  cockpit.group.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
  cockpit.texture?.dispose();
}

test('cockpit refreshes target, ammo and flight values when a new sortie resets elapsed time', () => {
  const cockpit = createCockpit(), jet = { position: { y: 1200 }, speed: 200, hp: 100, maxHp: 100 };
  cockpit.update(jet, { target: 'TRAINING DRONE', ammunition: 5 }, 120);
  jet.speed = 240;
  const fresh = cockpit.update(jet, { target: null, ammunition: 6 }, 0);
  assert.equal(fresh.target, 'NO TARGET');
  assert.equal(fresh.ammunition, 6);
  assert.equal(fresh.speed, 864);
  assert.equal(cockpit.update(jet, {}, .05), fresh, 'ordinary frames still reuse the throttled texture');
  dispose(cockpit);
});

test('seated camera sees the whole MFD above the viewport edge without coaming occlusion', () => {
  const cockpit = createCockpit(), screen = cockpit.group.getObjectByName('instrument_screen');
  cockpit.group.updateMatrixWorld(true);
  for (const [width, height] of [[1366, 768], [1920, 1080], [1024, 600], [390, 844], [844, 390]]) {
    const camera = new T.PerspectiveCamera(cockpit.pose.fov, width / height, cockpit.pose.near, 200);
    camera.position.copy(cockpit.pose.eye); camera.lookAt(0, 0, -150); camera.updateMatrixWorld(true);
    for (const y of [-.18, 0, .18]) for (const x of [-.59, 0, .59]) {
      const point = new T.Vector3(x, y, 0).applyMatrix4(screen.matrixWorld);
      const projected = point.clone().project(camera);
      assert.ok(projected.y > -.9 && projected.y < 1, `MFD clipped vertically at ${width}x${height}`);
      const ray = new T.Raycaster(camera.position, point.clone().sub(camera.position).normalize());
      assert.equal(ray.intersectObjects(cockpit.group.children, true)[0]?.object, screen, 'coaming must not obscure instrument text');
    }
  }
  dispose(cockpit);
});
