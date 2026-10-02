import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { normalizeTouchLayout } from '../src/game/Settings.js';
import { applyTouchLayout, resolveTouchLayout } from '../src/ui/TouchLayout.js';

test('saved custom touch controls stay in the viewport and do not overlap after resize or scale', () => {
  for (const [width, height] of [[390,844],[844,390],[1366,768]]) for (const scale of [.8,1,1.4]) {
    const layout = normalizeTouchLayout({ customized: true, scale, positions: { missile: { x: .83, y: .7 }, pause: { x: 1, y: 0 } } });
    const boxes = Object.values(resolveTouchLayout(layout, width, height));
    assert.equal(boxes.length, 10);
    for (const [i, a] of boxes.entries()) {
      assert.ok(a.left >= 8 && a.top >= 8 && a.left + a.width <= width - 8 + .001 && a.top + a.height <= height - 8 + .001);
      for (const b of boxes.slice(i + 1)) assert.ok(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top, 'touch targets must not overlap');
    }
  }
});

test('touch settings change actual controls, survive normalization and reset back to responsive defaults', () => {
  const { document } = parseHTML('<div id="root"><div id="touch-controls"><div id="touch-stick"></div><label class="touch-throttle"></label><div class="touch-actions">'+['fire','missile','flare','boost','brake','gear','camera','pause'].map(id=>`<button data-touch="${id}"></button>`).join('')+'</div></div></div>');
  const root = document.getElementById('root'), controls = root.querySelector('#touch-controls');
  const saved = normalizeTouchLayout({ positions: { missile: { x: .5, y: .5 } } });
  applyTouchLayout(root, saved, 390, 844);
  assert.equal(controls.dataset.customLayout, 'true');
  assert.equal(root.querySelector('[data-touch="missile"]').style.left, '164.5px');
  applyTouchLayout(root, JSON.parse(JSON.stringify(saved)), 844, 390);
  assert.equal(root.querySelector('[data-touch="missile"]').style.left, '391.5px');
  const mirrored = resolveTouchLayout({ handedness: 'left' }, 844, 390);
  assert.ok(mirrored.stick.left > 600);
  applyTouchLayout(root, normalizeTouchLayout(), 844, 390);
  assert.equal(controls.dataset.customLayout, 'false');
  assert.ok(!root.querySelector('[data-touch="missile"]').style.left);
});
