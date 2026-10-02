// Reproducible real-WebGL evidence collection. Screenshots still require human visual review.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { browserPartyJourney } from './browser-party-journey.mjs';

const origin = process.env.SKYBREAK_QA_URL || 'http://localhost:4173';
const label = (process.env.SKYBREAK_QA_LABEL || 'candidate').replace(/[^a-z0-9_-]/gi, '_');
const out = resolve(process.env.SKYBREAK_QA_OUTPUT || `qa-artifacts/upgrade40/${label}`);
const sampleSeconds = Math.max(0, Math.min(900, Number(process.env.SKYBREAK_QA_SECONDS || 600)));
const viewports = process.env.SKYBREAK_QA_VIEWPORTS ? JSON.parse(process.env.SKYBREAK_QA_VIEWPORTS) : [[1366, 768], [1920, 1080], [1024, 600], [390, 844], [844, 390], [740, 360]];
const quick = process.env.SKYBREAK_QA_QUICK === '1';
const preset = process.env.SKYBREAK_QA_PRESET || 'medium', seed = 4422;
await mkdir(out, { recursive: true });
let revision = 'unavailable'; try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const report = { label, origin, started: new Date().toISOString(), status: 'running', revision, environment: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 1024 ** 3), node: process.version }, configuration: { preset, seed, dpr: 1, quick, sampleSeconds, warmUpSeconds: 5, emulatedMobile: true }, console: [], errors: [], checks: [], layouts: [], captures: [], samples: [], restarts: [], unverified: ['human screenshot review and visual-readability judgement', 'physical laptop/mobile GPU performance', 'physical controller and touchscreen feel', 'audible audio and microphone capture', 'two-network human co-op/PvP session', 'two physical LAN devices with internet disconnected', 'two humans using actual split-screen controllers'] };
let browser, activePage;
function check(condition, label, detail) { report.checks.push({ label, passed: !!condition, detail }); if (!condition) report.errors.push(label); }
const percentile = (values, quantile) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))]; };

try {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES; if (!modules) throw Error('Playwright is unavailable. Install it as documented in UPGRADE40_QA.md.'); ({ chromium } = await import(pathToFileURL(`${modules}/playwright-core/index.mjs`).href)); }
  report.launchErrors = [];
  const choices = process.env.SKYBREAK_BROWSER_PATH ? [{ executablePath: process.env.SKYBREAK_BROWSER_PATH }] : process.env.SKYBREAK_BROWSER_CHANNEL ? [{ channel: process.env.SKYBREAK_BROWSER_CHANNEL }] : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  for (const choice of choices) {
    try { browser = await chromium.launch({ ...choice, headless: process.env.HEADED !== '1', timeout: 15000 }); report.browserLaunch = choice; break; }
    catch (error) { report.launchErrors.push({ choice, error: error.message.split('\n')[0] }); }
  }
  if (!browser) { report.status = 'blocked'; throw Error('No usable local Chrome/Edge/Chromium. No rendered evidence or frame-time measurements were collected.'); }
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 900, isMobile: width < 900 });
    await context.addInitScript(preset => localStorage.setItem('skybreak-settings', JSON.stringify({ quality: preset, adaptiveQuality: false, reducedMotion: true, device: 'keyboard', controlsVersion: 5 })), preset);
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(`${width}x${height}: ${error.message}`));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) { const item = { viewport: `${width}x${height}`, type: message.type(), text: message.text().slice(0, 3000) }; if (report.console.length < 200) report.console.push(item); if (message.type() === 'error') report.errors.push(item.text); } });
    page.on('requestfailed', request => report.errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`));
    const capture = async name => { const file = `${name}-${width}x${height}.png`; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.screenshot({ path: join(out, file) }); const actual = await page.evaluate(() => ({ state: window.game?.state, timeOfDay: window.game?.atmosphere?.timeOfDay, weather: window.game?.atmosphere?.weather, camera: window.game?.cam?.mode })); report.captures.push({ viewport: [width, height], name, path: file, actual }); await writeFile(join(out, 'acceptance-progress.json'), JSON.stringify(report, null, 2) + '\n'); };
    const start = Date.now(); const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 }); check(response?.ok(), 'Game page serves successfully', { width, status: response?.status() });
    if (!report.build) { const buildResponse = await page.request.get(origin.replace(/\/$/, '') + '/build-manifest.json'); if (buildResponse.ok()) { const build = await buildResponse.json(); report.build = { sourceRevision: build.sourceRevision, sourceDigest: build.sourceDigest, assetsDigest: build.assetsDigest }; } }
    await page.waitForFunction(() => window.game?.state === 'menu', null, { timeout: 45000 });
    if (width >= 1024) check(await page.evaluate(() => document.querySelector('#orientation-gate')?.hidden), 'Desktop viewport never shows the rotate-phone gate');
    report.renderer = await page.evaluate(() => { const gl = window.game.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { userAgent: navigator.userAgent, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), webglVersion: gl.getParameter(gl.VERSION), devicePixelRatio, contextLost: gl.isContextLost() }; });
    report.renderer.software = /swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(report.renderer.renderer || '');
    check(!report.renderer.contextLost, 'Real WebGL context is active', report.renderer);
    if (report.renderer.software) report.unverified.push('Hardware-GPU benchmark: current WebGL renderer is software.');
    await page.evaluate(preset => { Object.assign(window.game.settings, { quality: preset, adaptiveQuality: false, difficulty: 'easy', device: 'keyboard', flightMode: 'assisted', keyboardInvert: false, gamepadInvert: false, reducedMotion: true }); window.game.applySettings(); }, preset);
    report.layouts.push({ viewport: [width, height], timeToMenuMs: Date.now() - start, ...(await page.evaluate(() => ({ documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, bodyTextLength: document.body.innerText.trim().length, errorOverlay: !!document.querySelector('vite-error-overlay,[data-nextjs-dialog]') }))) });
    await capture('menu');
    for (const [action, name] of [['settings', 'settings'], ['hangar', 'hangar']]) {
      const button = page.locator(`[data-action="${action}"]`).first(); if (await button.count()) { await button.click({ noWaitAfter: true }); await page.waitForFunction(type => type === 'hangar' ? window.game.state === 'hangar' && !!document.getElementById('hangar-modal') : window.game.ui.modalType === type, action); await capture(name); await page.keyboard.press('Escape'); await page.evaluate(() => { if (window.game.state !== 'menu') window.game.menu(); }); }
    }
    await page.evaluate(seed => window.game.start(2, { seed }), seed); await page.waitForTimeout(500); await capture('open-skies');
    report.layouts.push(await page.evaluate(() => { const selectors = ['#battle-wing', '#battle-coach', '#hud', '.battle-actions', '#radio', '#weapons']; return { viewport: [innerWidth, innerHeight], screen: 'open-skies', documentOverflow: document.documentElement.scrollWidth > innerWidth + 1, boxes: selectors.flatMap(selector => { const element = document.querySelector(selector); if (!element || !element.getClientRects().length) return []; const r = element.getBoundingClientRect(); return [{ selector, x: r.x, y: r.y, width: r.width, height: r.height }]; }) }; }));
    const weaponBounds = await page.evaluate(() => {
      const panel = document.querySelector('.hud-weapons');
      if (!panel?.getClientRects().length) return { visible: false, clipped: [] };
      const box = panel.getBoundingClientRect();
      return { visible: true, clipped: [...panel.querySelectorAll('.weapon>span,.weapon>strong,.flare-line')].filter(el => el.getClientRects().length).filter(el => { const r = el.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1 || el.scrollWidth > el.clientWidth + 1; }).map(el => el.textContent.trim()) };
    });
    check(!weaponBounds.clipped.length, 'Visible weapon values stay inside their panel', { viewport: [width, height], ...weaponBounds });
    const touchOverlaps = await page.evaluate(() => {
      const visible = element => element.getClientRects().length && getComputedStyle(element).display !== 'none';
      const targets = [...document.querySelectorAll('#touch-stick,.touch-throttle,.touch-actions button')].filter(visible);
      const panels = [...document.querySelectorAll('.hud-weapons,.hud-bottom-left,#radio,.audio-subtitle,.battle-coach,.threat-awareness,.battle-wing,#toast')].filter(visible);
      const hits = [];
      for (const panel of panels) for (const target of targets) { const a = panel.getBoundingClientRect(), b = target.getBoundingClientRect(); if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) hits.push({ panel: panel.id || panel.className, target: target.id || target.dataset.touch || target.className }); }
      for (let i = 0; i < targets.length; i++) for (const other of targets.slice(i + 1)) { const target = targets[i], a = target.getBoundingClientRect(), b = other.getBoundingClientRect(); if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) hits.push({ target: target.id || target.dataset.touch || target.className, otherTarget: other.id || other.dataset.touch || other.className }); }
      return hits;
    });
    check(touchOverlaps.length === 0, 'Default HUD panels leave touch targets unobscured', { viewport: [width,height], overlaps: touchOverlaps });
    const orders = page.locator('[data-action="squadron"]').first();
    if (!(width === 390 && height === 844) && await orders.count()) { await orders.click({ noWaitAfter: true }); await capture('orders'); const regroup = page.locator('[data-order="regroup"]').first(); if (await regroup.count()) await regroup.click({ noWaitAfter: true }); }
    const orientationMobile = width === 390 && height === 844;
    if (!orientationMobile) { await page.evaluate(() => { window.game.menu(); window.game.start(3); }); await page.waitForTimeout(250); }
    if (!quick || (width === viewports[0][0] && height === viewports[0][1])) {
    const pitchStart = await page.evaluate(() => window.game.player.forward.y);
    await page.keyboard.down('ArrowUp');
    try { await page.waitForFunction(start => window.game.player.forward.y > start + .003, pitchStart); } finally { await page.keyboard.up('ArrowUp'); }
    const pitchUp = await page.evaluate(() => window.game.player.forward.y);
    await page.keyboard.down('ArrowDown');
    try { await page.waitForFunction(up => window.game.player.forward.y < up - .003, pitchUp); } finally { await page.keyboard.up('ArrowDown'); }
    const pitchDown = await page.evaluate(() => window.game.player.forward.y);
    check(pitchUp > pitchStart, 'Arrow Up raises nose', { viewport: [width, height], pitchStart, pitchUp });
    check(pitchDown < pitchUp, 'Arrow Down lowers nose', { viewport: [width, height], pitchUp, pitchDown });
    await page.evaluate(() => window.game.resetPracticePosition());
    const throttleStart = await page.evaluate(() => window.game.player.throttle);
    await page.keyboard.down('w');
    try { await page.waitForFunction(start => window.game.player.throttle > start + .01, throttleStart); } finally { await page.keyboard.up('w'); }
    const throttleHold = await page.evaluate(() => window.game.player.throttle); await page.waitForTimeout(300); const throttleRelease = await page.evaluate(() => window.game.player.throttle);
    check(throttleHold > throttleStart && Math.abs(throttleHold - throttleRelease) < 0.015, 'Throttle increases and holds on release', { throttleStart, throttleHold, throttleRelease });
    // Use the actual input listener, lock accumulation and weapon system.
    await page.evaluate(() => window.game.prepareTrainingLesson('targeting'));
    await page.waitForFunction(() => window.game.lock >= 1.4, null, { timeout: 30000 });
    const missileStart = await page.evaluate(() => ({ ammo: window.game.missilesLeft, shots: window.game.stats.missiles }));
    await page.keyboard.down('e'); await page.keyboard.down('e'); await page.keyboard.up('e');
    const missileEnd = await page.evaluate(() => ({ ammo: window.game.missilesLeft, shots: window.game.stats.missiles }));
    check(missileEnd.ammo === missileStart.ammo - 1 && missileEnd.shots === missileStart.shots + 1, 'E fires exactly one locked missile, including repeat keydown', { missileStart, missileEnd });
    await page.keyboard.press('Escape');
    const pausedAmmo = await page.evaluate(() => window.game.missilesLeft);
    await page.keyboard.press('e');
    check(await page.evaluate(() => window.game.missilesLeft) === pausedAmmo, 'E cannot fire through a pause menu');
    await page.evaluate(() => { window.game.menu(); window.game.start(3); });
    if (width === viewports[0][0] && height === viewports[0][1]) {
      await page.keyboard.press('Escape');
      await page.locator('[data-action="menu"]').click({ noWaitAfter: true });
      await page.locator('[data-action="multiplayer"]').first().click({ noWaitAfter: true });
      await page.locator('#mp-offline-duel-btn').click({ noWaitAfter: true });
      check(await page.evaluate(() => window.game.mission.duel && window.game.enemies.length === 1), 'Friends offline Ace Duel starts the selected mode');
      await page.keyboard.press('Escape');
      await page.locator('[data-action="restart"]').click({ noWaitAfter: true });
      check(await page.evaluate(() => window.game.mission.duel && window.game.enemies.length === 1), 'Offline Ace Duel Restart retains one hostile');
      await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click({ noWaitAfter: true });
      await page.locator('[data-action="multiplayer"]').first().click({ noWaitAfter: true });
      await page.locator('#mp-offline-free-btn').click({ noWaitAfter: true });
      await page.keyboard.press('Escape'); await page.locator('[data-action="restart"]').click({ noWaitAfter: true });
      check(await page.evaluate(() => window.game.mission.freeFlight && !window.game.openSkies && !window.game.operation && window.game.enemies.length === 0), 'Friends Free Flight and Restart cannot restore the previous battle');
    }
    }
    for (const mode of ['chase', 'cockpit', 'cinematic']) { await page.evaluate(mode => { window.game.cam.mode = mode; }, mode); await page.waitForTimeout(300); await capture(mode); }
    if (width === viewports[0][0] && height === viewports[0][1]) {
      for (const [time, weather] of [['midday', 'clear'], ['sunset', 'clear'], ['midday', 'cloudy']]) {
        await page.evaluate(({ time, weather }) => { const g = window.game; g.resetPracticePosition(); g.cam.mode = 'chase'; g.atmosphere.setTimeOfDay(time); g.atmosphere.setWeather(weather); }, { time, weather });
        await page.waitForTimeout(400); await capture(`lighting-${time}-${weather}`);
      }
      if (!quick) {
      report.restartResources = [];
      for (let cycle = 0; cycle < 10; cycle++) { await page.evaluate(seed => { const g = window.game; g.menu(); g.start(2, { seed }); }, seed); await page.waitForTimeout(200); report.restartResources.push({ cycle: cycle + 1, snapshot: await page.evaluate(() => window.game.getPerformanceSnapshot()) }); }
      await page.evaluate(seed => { window.game.menu(); window.game.start(2, { seed }); }, seed); await page.waitForTimeout(5000);
      await page.evaluate(() => { window.__qaFrameTimes = []; window.__qaLastFrame = null; window.__qaRunning = true; const sample = time => { if (!window.__qaRunning) return; if (window.__qaLastFrame !== null) window.__qaFrameTimes.push(time - window.__qaLastFrame); window.__qaLastFrame = time; if (window.__qaFrameTimes.length > 100000) window.__qaFrameTimes.shift(); requestAnimationFrame(sample); }; requestAnimationFrame(sample); });
      for (let elapsed = 0; elapsed < sampleSeconds; elapsed += 5) {
        await page.waitForTimeout(Math.min(5, sampleSeconds - elapsed) * 1000);
        const sample = await page.evaluate(() => ({ ...window.game.getPerformanceSnapshot(), state: window.game.state, elapsed: window.game.elapsed, heap: performance.memory?.usedJSHeapSize ?? null })); report.samples.push(sample);
        if (!['playing', 'intro'].includes(sample.state)) { report.restarts.push({ atSeconds: elapsed + 5, reason: sample.state, automated: true }); await page.evaluate(seed => { window.game.menu(); window.game.start(2, { seed }); }, seed); }
        if (elapsed % 30 === 0) console.log(`Browser ${label}: ${Math.min(elapsed + 5, sampleSeconds)}/${sampleSeconds}s sampled; state=${sample.state}`);
      }
      const frameTimes = await page.evaluate(() => { window.__qaRunning = false; return window.__qaFrameTimes; });
      report.frameTime = { samples: frameTimes.length, p50ms: percentile(frameTimes, 0.5), p95ms: percentile(frameTimes, 0.95), p99ms: percentile(frameTimes, 0.99), longestMs: frameTimes.length ? Math.max(...frameTimes) : null, note: 'Real requestAnimationFrame intervals; automated battle restarts are listed separately. This is not a human-completed sortie.' };
      await capture('post-sample');
      }
    }
    if (width === 390 && height === 844) {
      check(await page.evaluate(() => window.game.state === 'menu' && document.querySelector('#orientation-gate')?.hidden), 'Portrait main menu remains usable without an orientation gate');
      await page.evaluate(() => { const game = window.game; const start = game.start.bind(game); game.__qaStartCount = 0; game.start = (...args) => { game.__qaStartCount += 1; return start(...args); }; });
      await page.locator('[data-action="play"]').click({ noWaitAfter: true });
      const launch = page.locator('[data-action="launch-flight"]');
      if (await launch.count()) await launch.click({ noWaitAfter: true });
      await page.waitForFunction(() => !document.querySelector('#orientation-gate')?.hidden);
      const blocked = await page.evaluate(() => ({ state: window.game.state, gateHidden: document.querySelector('#orientation-gate')?.hidden, input: { touchActive: window.game.input.touchActive, fire: window.game.input.fire, boost: window.game.input.boost, brake: window.game.input.touchBrake, mouse: { ...window.game.input.mouse } } }));
      check(blocked.state !== 'playing' && !blocked.gateHidden, 'Portrait flight launch is blocked behind the rotate-phone gate', blocked);
      check(!blocked.input.touchActive && !blocked.input.fire && !blocked.input.boost && !blocked.input.brake && blocked.input.mouse.x === 0 && blocked.input.mouse.y === 0, 'Portrait gate leaves touch flight input neutral', blocked.input);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => document.querySelector('#orientation-gate')?.hidden && window.game.state === 'playing');
      const landscapeStartCount = await page.evaluate(() => ({ state: window.game.state, starts: window.game.__qaStartCount }));
      check(landscapeStartCount.state === 'playing' && landscapeStartCount.starts === 1, 'Landscape return starts the pending flight exactly once', landscapeStartCount);
      await page.evaluate(() => { window.game.menu(); window.game.ui.showSettings('controls'); });
      await page.locator('[data-action="touch-layout"]').click({ noWaitAfter: true });
      await page.locator('[data-layout-control="missile"]').focus();
      await page.keyboard.press('ArrowLeft');
      await page.locator('#touch-save').click({ noWaitAfter: true });
      await page.evaluate(() => { window.game.menu(); window.game.start(3); });
      const moved = await page.evaluate(() => ({ custom: document.getElementById('touch-controls').dataset.customLayout, left: document.querySelector('[data-touch="missile"]').style.left }));
      check(moved.custom === 'true' && !!moved.left, 'Touch editor Save changes the actual flight buttons', moved);
      await capture('custom-touch');
      await page.evaluate(() => { window.game.menu(); window.game.ui.showSettings('controls'); });
      await page.locator('[data-action="touch-layout"]').click({ noWaitAfter: true });
      await page.locator('#touch-reset').click({ noWaitAfter: true });
      await page.locator('#touch-save').click({ noWaitAfter: true });
      check(await page.evaluate(() => document.getElementById('touch-controls').dataset.customLayout === 'false'), 'Touch editor Reset and Save restore responsive controls');

      await page.evaluate(() => { window.game.menu(); window.game.start(3); });
      const touchStick = page.locator('#touch-stick');
      const touchMissile = page.locator('[data-touch="missile"]');
      await touchStick.waitFor({ state: 'visible' });
      const visibleBox = async (locator, label) => {
        const box = await locator.boundingBox();
        if (!box) throw new Error(`${label} is visible but has no bounding box in flight state`);
        return box;
      };
      const touchSession = await context.newCDPSession(page);
      const touchPoint = (id, x, y, force = 1) => ({ id, x, y, radiusX: 1, radiusY: 1, force });
      const stickBox = await visibleBox(touchStick, '#touch-stick');
      const stickCenter = { x: stickBox.x + stickBox.width / 2, y: stickBox.y + stickBox.height / 2 };
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(41, stickCenter.x, stickCenter.y)] });
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(41, stickBox.x + stickBox.width * .8, stickBox.y + stickBox.height * .25)] });
      await page.waitForTimeout(100);
      const stickHeld = await page.evaluate(() => ({ active: window.game.input.touchActive, mouse: { ...window.game.input.mouse } }));
      check(stickHeld.active && (Math.abs(stickHeld.mouse.x) > .1 || Math.abs(stickHeld.mouse.y) > .1), 'Touch stick pointer events steer the active flight input', stickHeld);
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const stickReleased = await page.evaluate(() => ({ active: window.game.input.touchActive, mouse: { ...window.game.input.mouse } }));
      check(!stickReleased.active && stickReleased.mouse.x === 0 && stickReleased.mouse.y === 0, 'Touch stick pointer release clears steering input', stickReleased);

      await page.evaluate(() => window.game.prepareTrainingLesson('targeting'));
      await page.waitForFunction(() => window.game.lock >= 1.4, null, { timeout: 30000 });
      await touchMissile.waitFor({ state: 'visible' });
      const missileStart = await page.evaluate(() => ({ ammo: window.game.missilesLeft, shots: window.game.stats.missiles }));
      const missileBox = await visibleBox(touchMissile, '[data-touch="missile"]');
      const missilePoint = { x: missileBox.x + missileBox.width / 2, y: missileBox.y + missileBox.height / 2 };
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(42, missilePoint.x, missilePoint.y)] });
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const missileEnd = await page.evaluate(() => ({ ammo: window.game.missilesLeft, shots: window.game.stats.missiles }));
      check(missileEnd.ammo === missileStart.ammo - 1 && missileEnd.shots === missileStart.shots + 1, 'Touch missile pointer events fire exactly one locked missile', { missileStart, missileEnd });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => !document.querySelector('#orientation-gate')?.hidden && window.game.state === 'paused');
      const portraitFlight = await page.evaluate(() => ({ state: window.game.state, orientationPaused: window.game.ui.orientationPaused, input: { touchActive: window.game.input.touchActive, fire: window.game.input.fire, boost: window.game.input.boost, brake: window.game.input.touchBrake, mouse: { ...window.game.input.mouse } } }));
      check(portraitFlight.orientationPaused && portraitFlight.state === 'paused', 'Portrait rotation pauses active flight safely', portraitFlight);
      check(!portraitFlight.input.touchActive && !portraitFlight.input.fire && !portraitFlight.input.boost && !portraitFlight.input.brake && portraitFlight.input.mouse.x === 0 && portraitFlight.input.mouse.y === 0, 'Portrait rotation clears all held flight input', portraitFlight.input);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => document.querySelector('#orientation-gate')?.hidden && window.game.state === 'playing');
      check(await page.evaluate(() => !window.game.ui.orientationPaused && window.game.state === 'playing'), 'Landscape return resumes only the orientation-paused flight');
    }
    if (width === 740 && height === 360) {
      await page.evaluate(() => { window.game.menu(); window.game.start(3); });
      const compactTouch = await page.evaluate(() => { const visible = e => e?.getClientRects().length && getComputedStyle(e).display !== 'none'; const ids = ['#touch-stick','.touch-throttle','[data-touch="fire"]','[data-touch="missile"]']; const boxes = ids.map(selector => { const e = document.querySelector(selector); if (!visible(e)) return { selector, visible: false }; const r = e.getBoundingClientRect(); return { selector, visible: true, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }); return { overflow: document.documentElement.scrollWidth > innerWidth + 1, boxes }; });
      check(!compactTouch.overflow, 'Short landscape viewport has no horizontal overflow', compactTouch);
      check(compactTouch.boxes.every(box => box.visible && box.x >= 0 && box.y >= 0 && box.right <= 740 && box.bottom <= 360), 'Short landscape touch controls stay inside the viewport', compactTouch);
      const visibleBoxes = compactTouch.boxes.filter(box => box.visible);
      check(visibleBoxes.length === new Set(visibleBoxes.map(box => `${box.x},${box.y},${box.right},${box.bottom}`)).size, 'Short landscape primary touch controls do not share the same bounds', compactTouch);
    }
    await context.close(); activePage = null;
  }
  const page = await browser.newPage();
  report.publicPages = [];
  for (const route of ['/about', '/help', '/privacy', '/terms', '/storage']) { const response = await page.goto(origin.replace(/\/$/, '') + route); report.publicPages.push({ route, status: response?.status() }); check(response?.status() === 200, `Public page ${route} loads`); }
  for (const layout of report.layouts) { check(!layout.documentOverflow, 'Viewport has no horizontal document overflow', layout); if ('errorOverlay' in layout) check(!layout.errorOverlay && layout.bodyTextLength > 50, 'Meaningful menu with no framework overlay', layout); }
  if (process.env.SKYBREAK_QA_PARTY === '1') {
    report.partyJourney = await browserPartyJourney(browser, origin, out);
    check(report.partyJourney.status === 'passed-automated', 'Browser create/join/ready/flight/reload-resume/leave journey', report.partyJourney);
  }
  report.status = report.errors.length ? 'failed' : 'passed-automated';
} catch (error) { if (activePage && !activePage.isClosed()) { try { await activePage.screenshot({ path: join(out, 'failure.png'), timeout: 10000 }); report.captures.push({ name: 'failure', path: 'failure.png' }); } catch {} } if (report.status !== 'blocked') report.status = browser ? 'failed' : 'blocked'; report.errors.push(error.message); }
finally { await browser?.close(); report.finished = new Date().toISOString(); await writeFile(join(out, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ status: report.status, label, report: join(out, 'acceptance.json'), renderer: report.renderer, captures: report.captures.length, errors: report.errors })); }
if (report.status !== 'passed-automated') process.exitCode = report.status === 'blocked' ? 2 : 1;
