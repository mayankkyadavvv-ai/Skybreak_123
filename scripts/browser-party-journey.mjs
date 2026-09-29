import { join } from 'node:path';

// Two independent browser sessions on the authorized local test service.
// No production endpoint, microphone, relay or human-playtest claim is made.
export async function browserPartyJourney(browser, origin, out) {
  const report = { kind: 'Two automated browser clients, one local service', checks: [], captures: [], errors: [], status: 'running' };
  const contexts = [];
  const check = (ok, label) => { report.checks.push({ label, passed: !!ok }); if (!ok) throw Error(label); };
  try {
    const pages = [];
    for (const pilot of ['Host', 'Guest']) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }); contexts.push(context);
      await context.addInitScript(() => localStorage.setItem('skybreak-settings', JSON.stringify({ quality: 'low', device: 'keyboard', flightMode: 'assisted', keyboardInvert: false, reducedMotion: true, controlsVersion: 5 })));
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      page.on('pageerror', error => report.errors.push(`${pilot}: ${error.message}`));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.game?.state === 'menu', null, { timeout: 60000 });
      await page.locator('[data-action="multiplayer"]').first().click({ noWaitAfter: true });
      await page.waitForFunction(() => window.game.multiplayer.network.sessionReady);
      await page.locator('#mp-pilot-input').fill(`QA ${pilot}`);
      pages.push(page);
    }
    const [host, guest] = pages;
    await host.locator('#mp-create-coop').click({ noWaitAfter: true });
    await host.waitForFunction(() => window.game.multiplayer.roomCode && window.game.ui.modalType === 'lobby');
    const code = await host.evaluate(() => window.game.multiplayer.roomCode);
    await guest.locator('#mp-room-code-input').fill(code);
    await guest.locator('#mp-join-code-btn').click({ noWaitAfter: true });
    await guest.waitForFunction(() => window.game.ui.modalType === 'lobby');
    check(await guest.evaluate(code => window.game.multiplayer.roomCode === code, code), 'Create and join controls put both browsers in the same party');
    await guest.locator('#mp-toggle-ready-btn').click({ noWaitAfter: true });
    await host.locator('#mp-host-start-btn').click({ noWaitAfter: true });
    await Promise.all(pages.map(page => page.waitForFunction(() => window.game.multiplayer.active && window.game.multiplayer.snapshotTick > 30 && window.game.state === 'playing')));
    check(await guest.evaluate(() => {
      const card = document.querySelector('.hud-mission');
      return !!card && !/undefined|0 \/ 0 HOSTILES/.test(card.textContent) && card.textContent.includes('Open Skies Co-op');
    }), 'Online mission card contains real room metadata and no solo 0/0 objective');
    const identity = await guest.evaluate(() => window.game.multiplayer.localId);
    const epoch = await host.evaluate(() => window.game.multiplayer.matchEpoch);
    check(await guest.evaluate(epoch => window.game.multiplayer.matchEpoch === epoch, epoch), 'Both rendered clients share the authoritative match epoch');
    check(await host.evaluate(id => window.game.multiplayer.publicRoster.some(p => p.id === id), identity), 'Host receives the guest identity in the authoritative roster');
    const before = await guest.evaluate(() => window.game.player.forward.y);
    await guest.keyboard.down('ArrowUp');
    try { await guest.waitForFunction(before => window.game.player.forward.y > before + .01, before, { timeout: 10000 }); }
    finally { await guest.keyboard.up('ArrowUp'); }
    check(true, 'Arrow Up steers the predicted aircraft in the live shared match');
    await guest.keyboard.press('Escape');
    check(await guest.locator('[data-action="restart"]').count() === 0, 'Active online pilot menu has no solo Restart action');
    await guest.locator('[data-action="resume"]').click({ noWaitAfter: true });
    for (const [index, page] of pages.entries()) {
      const path = `party-${index ? 'guest' : 'host'}.png`;
      await page.screenshot({ path: join(out, path) }); report.captures.push(path);
    }
    // Reload really closes the old browser socket; sessionStorage is retained.
    await guest.reload({ waitUntil: 'domcontentloaded' });
    await guest.waitForFunction(() => window.game?.state === 'menu', null, { timeout: 60000 });
    await guest.locator('[data-action="multiplayer"]').first().click({ noWaitAfter: true });
    await guest.waitForFunction(({ id, epoch }) => {
      const mp = window.game.multiplayer;
      return mp.localId === id && mp.network.sessionReady && !mp.network.pendingResume &&
        (mp.active && mp.matchEpoch === epoch || window.game.state === 'result' && mp.lastResult?.epoch === epoch);
    }, { id: identity, epoch });
    report.resumeOutcome = await guest.evaluate(() => window.game.multiplayer.active ? 'same in-flight match' : 'same match authoritative debrief');
    check(true, 'Reload resumes the same identity and match or its completed debrief, without a new party');
    if (report.resumeOutcome.includes('debrief')) {
      await host.waitForFunction(epoch => window.game.multiplayer.lastResult?.epoch === epoch, epoch);
      const result = page => page.evaluate(() => { const r = window.game.multiplayer.lastResult; return { epoch: r.epoch, winner: r.winner, scores: r.teamScores, pilots: r.scoreboard.map(p => ({ id: p.id, kills: p.kills, deaths: p.deaths, score: p.score })).sort((a,b) => a.id.localeCompare(b.id)) }; });
      check(JSON.stringify(await result(host)) === JSON.stringify(await result(guest)), 'Both browsers agree on the completed result after reload');
    }
    // A live co-op can end while the browser is reloading or the pilot menu is open.
    // The correct recovery is then its debrief, never resurrecting a completed match.
    if (await guest.evaluate(() => window.game.multiplayer.active)) await guest.keyboard.press('Escape');
    await guest.locator('#mp-post-leave-btn:visible,[data-action="menu"]:visible').first().click({ noWaitAfter: true });
    await guest.waitForFunction(() => !window.game.multiplayer.active && !window.game.multiplayer.roomCode && window.game.state === 'menu');
    check(true, 'Guest can leave through the actual pilot menu or debrief');
    report.status = report.errors.length ? 'failed' : 'passed-automated';
  } catch (error) {
    report.errors.push(error.message); report.status = 'failed';
    for (const [index, context] of contexts.entries()) {
      const path = `party-failure-${index}.png`;
      try { await context.pages()[0]?.screenshot({ path: join(out, path) }); report.captures.push(path); } catch {}
    }
  } finally { for (const context of contexts) await context.close(); }
  return report;
}
