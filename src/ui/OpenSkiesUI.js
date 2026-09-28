import { bindingLabel } from '../game/InputActions.js';
import { SQUADRON_ORDERS } from '../game/SquadronAI.js';
import { escapeHTML as esc } from './Accessibility.js';

export function battleHUD(game) {
  const phase = game.openSkies.snapshot();
  const allies = game.allies.map(jet => {
    const hp = Math.max(0, Math.min(100, Math.round(jet.hp / jet.maxHp * 100)));
    return `<li class="${jet.alive ? '' : 'wingman-lost'}"><div><b>○ ${esc(jet.callsign)}</b><span>${jet.alive ? hp + '%' : 'LOST'}</span></div><meter min="0" max="100" value="${jet.alive ? hp : 0}" aria-label="${esc(jet.callsign)} health">${hp}%</meter><small>${jet.alive ? `${SQUADRON_ORDERS[jet.order]} · ${esc(jet.aiState)}` : 'Mission can continue'}</small></li>`;
  }).join('');
  const target = game.target?.alive ? game.target : null;
  return `<div class="battle-phase"><b>PHASE ${phase.phase}/3</b><span>${phase.remaining}/${phase.waveTotal} active</span></div><p>${phase.state === 'recovery' ? `Regroup · next wave in ${phase.recovery}s` : esc(phase.name)}</p><ul class="wingmen">${allies}</ul><div class="battle-target">◇ ${target ? `${esc(target.callsign)} · ${Math.round(target.hp / target.maxHp * 100)}%` : 'No target selected'}</div>${target?.combatRole === 'ace' ? `<meter class="ace-health" min="0" max="${target.maxHp}" value="${target.hp}" aria-label="VIPER health"></meter>` : ''}`;
}

export function squadronPanel(game) {
  const key = action => esc(bindingLabel(action, game.settings));
  const alive = game.allies.filter(jet => jet.alive).length;
  return `<p>Flight is paused while you choose. Orders apply to both surviving wingmen (${alive}/2). Target: <b>${esc(game.target?.alive ? game.target.callsign : 'none')}</b>.</p><div class="stack-buttons squadron-orders">
    <button data-order="cover" ${alive ? '' : 'disabled'}><kbd>${key('command1')}</kbd><span><b>Cover me</b><small>Intercept threats near your aircraft.</small></span></button>
    <button data-order="attack" ${alive && game.target?.alive ? '' : 'disabled'}><kbd>${key('command2')}</kbd><span><b>Attack my target</b><small>Keep attacking this hostile; resume cover when it is gone.</small></span></button>
    <button data-order="regroup" ${alive ? '' : 'disabled'}><kbd>${key('command3')}</kbd><span><b>Regroup</b><small>Return to formation and match your speed.</small></span></button>
  </div><p class="panel-footnote">${key('teamComms')} / Esc closes. Keyboard: Tab and Enter. Controller: D-pad up/down, A confirm, B back. Number shortcuts work only inside this panel. Multiplayer retains its own quick commands.</p>`;
}

export function battleGuide(settings) {
  const key = action => `<kbd>${esc(bindingLabel(action, settings))}</kbd>`;
  return `<section class="open-skies-guide"><h3>Open Skies · squadron briefing</h3><p>Three waves: 3 patrol fighters, 4 reinforcements, then VIPER. Two wingmen persist through the battle. A wingman loss reduces your medal; losing your aircraft ends the sortie.</p><ol class="learn-steps"><li><b>Steer</b><span>${key('pitchUp')} nose up · ${key('pitchDown')} nose down. ${key('rollLeft')} / ${key('rollRight')} banks and turns in Assisted mode; separate yaw is optional. Release to level. Gentler Open Skies steering is on by default in Assisted mode; turn it off in Settings → Controls for the original response. ${key('throttleUp')} / ${key('throttleDown')} sets power and holds it. ${key('levelFlight')} recovers toward level flight.</span></li><li><b>Select and lock</b><span>${key('targetNext')} cycles hostiles. Keep the selected diamond near the reticle for 1.4 seconds until LOCKED; press ${key('missile')} once per launch. ${key('cannon')} fires cannon. Friendly aircraft use cyan circles; hostiles use red diamonds (green when locked).</span></li><li><b>Defend</b><span>${key('flare')} deploys flares after an incoming missile warning. Turn away, then return during the attacker's recovery. VIPER has limited missiles and visible lock/launch cues.</span></li><li><b>Lead the wing</b><span>${key('teamComms')} opens squadron orders. Choose Cover me, Attack my target or Regroup. Touch the WING button; controller View/Back also opens it. The battle pauses while choosing.</span></li></ol><p>Medal: completion 50 + accuracy 20 + damage avoided 20 + wingmen 10. Silver ≥65, Gold ≥85; completion is required. Zero shots earns zero accuracy points. Mission XP and medal bonus are awarded once. Restart keeps this sortie’s seed and difficulty. Start a new sortie to use a changed enemy difficulty. Clear midday lighting applies to this sortie; your sky preference returns afterward.</p><button data-action="battle-tutorial">Restart guided hints</button></section>`;
}

export function tutorialHint(step, settings) {
  const key = action => esc(bindingLabel(action, settings));
  const hints = [
    ['STEER', `${key('pitchUp')} nose up · ${key('pitchDown')} nose down. Release to level. Use roll to turn. On touch, drag the left stick up to climb.`],
    ['TARGET', `${key('targetNext')} selects a hostile. Touch NEXT TARGET or use controller X.`],
    ['LOCK & FIRE', `Keep the hostile diamond in the reticle until LOCKED. ${key('missile')} launches; ${key('cannon')} fires.`],
    ['SQUADRON', `${key('teamComms')} or WING opens orders. Try Cover me or Regroup. ${key('flare')} counters incoming missiles.`],
  ];
  const hint = hints[Math.min(3, step)];
  return `<b>FLIGHT COACH ${step + 1}/4 · ${hint[0]}</b><p>${hint[1]}</p><div><button data-action="battle-hint-next">${step === 3 ? 'Done' : 'Next tip'}</button><button data-action="battle-hint-skip">Skip hints</button></div>`;
}

export function battleDebrief(game) {
  const result = game.battleResult, b = result.breakdown;
  return `<div class="battle-medal" data-medal="${result.medal.toLowerCase().replace(' ', '-')}"><span>${esc(result.medal.toUpperCase())}</span><strong>${result.points}<small>/100</small></strong><p>${result.personalBest ? 'NEW PERSONAL BEST' : result.best ? `Best on ${esc(result.difficulty || game.settings.difficulty)}: ${result.best.points}/100 · ${esc(result.best.medal)}` : 'Complete the sortie to establish a personal best.'}</p></div>
    <div class="result-stats medal-breakdown"><div><span>COMPLETION</span><b>${b.completion}/50</b></div><div><span>ACCURACY · ${result.accuracy}%</span><b>${b.accuracy}/20</b></div><div><span>DAMAGE · ${result.damage} HP</span><b>${b.protection}/20</b></div><div><span>WINGMEN · ${result.survivors}/2</span><b>${b.wingmen}/10</b></div></div><p class="panel-footnote">${result.success ? `+500 mission XP · +${result.bonusXP} medal XP. ` : ''}Silver ≥65 · Gold ≥85. Damage is cumulative, including repaired damage. Accuracy combines cannon shots and missiles; zero shots = 0 accuracy points. Seed ${result.seed}.</p><button data-action="battle-replay-seed">Replay same encounter seed</button>`;
}
