const validDifficulty = value => ['easy', 'medium', 'hard'].includes(value);
const bounded = (value, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
export function normalizeOpenSkiesProgress(value) {
  const best = {};
  for (const [difficulty, record] of Object.entries(value?.best || {})) {
    if (!validDifficulty(difficulty) || !record || !['Bronze', 'Silver', 'Gold'].includes(record.medal)) continue;
    best[difficulty] = { points: Math.round(bounded(record.points, 100)), medal: record.medal, elapsed: bounded(record.elapsed, 86400), seed: Number(record.seed) >>> 0 };
  }
  return { version: 1, best, completed: Array.isArray(value?.completed) ? value.completed.filter(id => typeof id === 'string').map(id => id.slice(0, 100)).slice(-32) : [] };
}

export function recordOpenSkiesResult(manager, instanceId, result, difficulty = 'easy') {
  const profile = manager.profile;
  const progress = profile.openSkies = normalizeOpenSkiesProgress(profile.openSkies);
  if (!instanceId || !result || !validDifficulty(difficulty)) return { awarded: false, personalBest: false };
  const best = progress.best[difficulty];
  if (progress.completed.includes(instanceId)) return { awarded: false, personalBest: false, best };
  progress.completed.push(instanceId); progress.completed = progress.completed.slice(-32);
  const points = Math.round(bounded(result.points, 100));
  const elapsed = bounded(result.elapsed, 86400);
  const personalBest = result.success && (!best || points > best.points || points === best.points && elapsed < best.elapsed);
  if (personalBest) progress.best[difficulty] = { points, elapsed, medal: result.medal, seed: Number(result.seed) >>> 0 };
  if (result.success) {
    manager.recordMissionWin('OPEN SKIES');
    manager.awardXP(bounded(result.bonusXP, 400), `${result.medal.toUpperCase()} MEDAL`);
  }
  manager.saveProfile();
  return { awarded: !!result.success, personalBest: !!personalBest, best: progress.best[difficulty] };
}

/** Generated/adaptive and campaign records never enter standard Open Skies leaderboards. */
export function recordOperationResult(manager, instanceId, result, source = 'custom') {
  if (!instanceId || !result || !['escort', 'intercept', 'base-defence', 'strike-support'].includes(result.template)) return { awarded: false };
  const profile = manager.profile;
  const previous = profile.operations && profile.operations.version === 1 ? profile.operations : {};
  const applied = Array.isArray(previous.applied) ? previous.applied.filter(id => typeof id === 'string').slice(-64) : [];
  if (applied.includes(instanceId)) return { awarded: false };
  const best = previous.best && typeof previous.best === 'object' ? { ...previous.best } : {};
  const difficulty = ['easy', 'medium', 'hard'].includes(result.preset?.difficulty) ? result.preset.difficulty : 'easy';
  const category = source === 'campaign' ? 'campaign' : result.category === 'custom-fixed' ? 'custom-fixed' : 'custom-adaptive';
  const key = `${result.template}:${difficulty}:${category}`;
  const elapsed = bounded(result.elapsed, 3600);
  if (result.success && (!best[key] || elapsed < best[key].elapsed)) best[key] = { elapsed, seed: Number(result.seed) >>> 0, template: result.template, category };
  profile.operations = { version: 1, applied: [...applied, instanceId].slice(-64), best };
  // Game.finish grants its usual mission completion once; this stores records only.
  manager.saveProfile(); return { awarded: false, recorded: true, best: best[key], category };
}
