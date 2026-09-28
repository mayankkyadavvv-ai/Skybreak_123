// Optional GPU/browser acceptance. See OPEN_SKIES_UPGRADE.md; no gameplay result is fabricated.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
const origin = process.env.SKYBREAK_QA_URL || 'http://localhost:4173';
const out = 'qa-artifacts/open-skies';
await mkdir(out, { recursive: true });
const report = { origin, started: new Date().toISOString(), status: 'running', environment: { os: os.platform(), cpu: os.cpus()[0]?.model, node: process.version }, errors: [], layouts: [], performance: [], unverified: ['human 6–10 minute mission pacing', 'physical controller/touch feel', 'screen-reader usability'] };
let browser;
try {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (!modules) throw Error('Install the optional playwright package locally to run browser acceptance.');
    ({ chromium } = await import(pathToFileURL(`${modules}/playwright-core/index.mjs`).href));
  }
  report.launchErrors = [];
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { browser = await chromium.launch({ channel, headless: process.env.HEADED !== '1', timeout: 15000 }); break; }
    catch (error) { report.launchErrors.push({ channel: channel || 'bundled-chromium', error: error.message.split('\n')[0] }); }
  }
  if (!browser) { report.status = 'blocked'; throw Error('No usable Chrome/Edge/Chromium executable. GPU playthrough, layouts and FPS are unverified.'); }
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 700, isMobile: width < 700, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.game?.state === 'menu', null, { timeout: 30000 });
    report.renderer = await page.evaluate(() => {
      const gl = window.game.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unavailable', userAgent: navigator.userAgent };
    });
    await page.evaluate(() => window.game.start(2, { seed: 4422 }));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/battle-${width}x${height}.png` });
    report.layouts.push(await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1,
        wing: rect(document.querySelector('#battle-wing')), coach: rect(document.querySelector('#battle-coach')),
        buttons: [...document.querySelectorAll('.battle-actions button')].map(rect) };
    }));
    await page.locator('[data-action="squadron"]').first().click();
    await page.waitForFunction(() => window.game.state === 'paused');
    await page.screenshot({ path: `${out}/orders-${width}x${height}.png` });
    await page.locator('[data-order="regroup"]').click();
    await page.waitForFunction(() => window.game.state === 'playing');
    const control = await page.evaluate(() => ({ x: window.game.player.forward.y, t: window.game.player.throttle }));
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(400); await page.keyboard.up('ArrowUp');
    if (!await page.evaluate(before => window.game.player.forward.y > before, control.x)) throw Error('ArrowUp did not raise the nose');
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(800); await page.keyboard.up('ArrowDown');
    if (!await page.evaluate(() => window.game.player.forward.y < 0)) throw Error('ArrowDown did not lower the nose');
    // Deterministic lifecycle exercise; scripted damage is explicitly separate from a human combat playthrough.
    for (let phase = 0; phase < 3; phase++) {
      await page.evaluate(() => { const g = window.game; for (const jet of g.enemies.filter(j => j.alive)) g.damage(jet, jet.hp, null, 'qa'); });
      if (phase < 2) await page.waitForFunction(p => window.game.openSkies.phase === p, phase + 1, { timeout: 16000 });
      else await page.waitForFunction(() => window.game.state === 'result');
      await page.screenshot({ path: `${out}/phase-${phase + 1}-${width}x${height}.png` });
    }
    const result = await page.evaluate(() => ({ state: window.game.state, result: window.game.battleResult }));
    if (!result.result?.success) throw Error('Scripted three-wave lifecycle did not complete');
    report.scriptedCompletion = result;
    await page.locator('[data-action="battle-replay-seed"]').click();
    await page.waitForFunction(() => window.game.openSkies.seed === 4422 && window.game.state === 'playing');
    // A real-time 30-second rendering sample with player kept in the test area. This is not a gameplay completion claim.
    if (width === 1366) {
      await page.evaluate(() => { window.game.settings.openSkiesGuideSeen = true; });
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(5000);
        report.performance.push(await page.evaluate(() => ({ ...window.game.getPerformanceSnapshot(), state: window.game.state })));
      }
      report.restarts = [];
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => { window.game.menu(); window.game.start(2, { seed: 4422 }); });
        await page.waitForTimeout(150);
        report.restarts.push(await page.evaluate(() => window.game.getPerformanceSnapshot()));
      }
    }
    await context.close();
  }
  report.status = report.errors.length || report.layouts.some(x => x.overflow || x.buttons.some(b => b.height < 44)) ? 'failed' : 'passed';
} catch (error) {
  if (report.status !== 'blocked') report.status = browser ? 'failed' : 'blocked';
  report.errors.push(error.message);
} finally {
  await browser?.close(); report.finished = new Date().toISOString();
  await writeFile(`${out}/acceptance.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, report: `${out}/acceptance.json`, errors: report.errors }));
}
if (report.status !== 'passed') process.exitCode = 1;
