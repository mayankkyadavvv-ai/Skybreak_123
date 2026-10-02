import { escapeHTML } from './Accessibility.js';

export function currentActivity(game) {
  return game.multiplayer?.active ? game.activitySnapshot : game.activity?.snapshot?.();
}

export function activitySummary(activity, playerId) {
  if (!activity) return 'No activity running.';
  if (activity.state === 'countdown') return `${activity.name} · starts in ${activity.countdown}s`;
  if (activity.state === 'complete') return `${activity.name} · complete · open Activities for results`;
  if (activity.state === 'cancelled') return activity.reason || 'Activity cancelled.';
  const pilot = activity.participants.find(p => p.id === String(playerId));
  const progress = activity.type === 'race' ? `GATES ${pilot?.checkpoint || 0}/${activity.gates.length}`
    : activity.type === 'formation' ? `FORMATION ${(pilot?.formationSeconds || 0).toFixed(1)}s` : `SCORE ${pilot?.score || 0}`;
  return `${activity.objective} · ${progress} · ${Math.ceil(activity.remaining)}s left`;
}

export function activityResultsMarkup(activity, names = new Map()) {
  if (!activity?.results) return '';
  return `<h3>${escapeHTML(activity.name)} results</h3><table class="activity-results"><thead><tr><th>Rank</th><th>Pilot</th><th>Result</th><th>Status</th></tr></thead><tbody>${activity.results.map(row => `<tr><td>${row.rank}</td><td>${escapeHTML(names.get(row.id) || row.id)}</td><td>${activity.type === 'race' ? row.elapsed == null ? `${row.checkpoint}/6 gates` : `${row.elapsed.toFixed(2)}s` : row.score}</td><td>${escapeHTML(row.status)}</td></tr>`).join('')}</tbody></table><p>${escapeHTML(activity.rewards)}</p>`;
}
