import { normalizeTouchLayout } from '../game/Settings.js';

const selectors = { stick: '#touch-stick', throttle: '.touch-throttle', fire: '[data-touch="fire"]', missile: '[data-touch="missile"]', flare: '[data-touch="flare"]', boost: '[data-touch="boost"]', brake: '[data-touch="brake"]', gear: '[data-touch="gear"]', camera: '[data-touch="camera"]', pause: '[data-touch="pause"]' };
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const overlaps = (a, b) => a.left < b.left + b.width + 6 && a.left + a.width + 6 > b.left && a.top < b.top + b.height + 6 && a.top + a.height + 6 > b.top;

export function resolveTouchLayout(raw, width, height) {
  const layout = normalizeTouchLayout(raw), placed = [], result = {};
  if (!layout.customized && layout.handedness === 'right' && layout.scale === 1) return result;
  for (const [id, p] of Object.entries(layout.positions)) {
    const base = id === 'stick' ? [height <= 520 ? 92 : 98, height <= 520 ? 92 : 98] : id === 'throttle' ? [61, height <= 520 ? 112 : 146] : [61, 46];
    const button = id !== 'stick' && id !== 'throttle';
    const w = Math.min(width - 16, Math.max(button ? 58 : id === 'throttle' ? 64 : 44, base[0] * layout.scale)), h = Math.min(height - 16, Math.max(44, base[1] * layout.scale));
    const fit = (x, y) => ({ left: clamp(x - w / 2, 8, width - w - 8), top: clamp(y - h / 2, 8, height - h - 8), width: w, height: h });
    // Old left-handed saves already contain mirrored custom positions.
    const x = (layout.handedness === 'left' && !layout.customized ? 1 - p.x : p.x) * width, y = p.y * height;
    let rect = fit(x, y);
    if (placed.some(other => overlaps(rect, other))) {
      let best = null, distance = Infinity;
      for (let cy = h / 2 + 8; cy <= height - h / 2 - 8; cy += 12) for (let cx = w / 2 + 8; cx <= width - w / 2 - 8; cx += 12) {
        const candidate = fit(cx, cy), d = (cx - x) ** 2 + (cy - y) ** 2;
        if (d < distance && !placed.some(other => overlaps(candidate, other))) { best = candidate; distance = d; }
      }
      if (best) rect = best;
    }
    result[id] = rect; placed.push(rect);
  }
  return result;
}

export function applyTouchLayout(root, layout, width, height) {
  const controls = root?.querySelector('#touch-controls'); if (!controls) return;
  const positions = resolveTouchLayout(layout, width, height);
  controls.dataset.customLayout = Object.keys(positions).length ? 'true' : 'false';
  for (const [id, selector] of Object.entries(selectors)) {
    const element = controls.querySelector(selector); if (!element) continue;
    for (const name of ['position','left','top','right','bottom','width','height','transform']) element.style.removeProperty(name);
    const rect = positions[id]; if (!rect) continue;
    Object.assign(element.style, { position: 'absolute', left: rect.left + 'px', top: rect.top + 'px', right: 'auto', bottom: 'auto', width: rect.width + 'px', height: rect.height + 'px', transform: 'none' });
  }
}
