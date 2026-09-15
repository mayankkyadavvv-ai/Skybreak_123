const MISSIONS = [
  { id: 0, name: "Air Patrol", code: "OPERATION 01", region: "TALON RIDGE", brief: "Hostile aircraft have crossed the northern ridge. Clear the airspace and bring your aircraft home.", objective: "Destroy 3 hostile fighters", fighters: 3, bombers: 0, allies: 0, tag: "PATROL", estimate: "3–5 MIN" },
  { id: 1, name: "Intercept", code: "OPERATION 02", region: "SABLE COAST", brief: "Two bombers are closing on the coastal airbase. Eliminate the bombers before they reach the runway, then clear their escorts.", objective: "Stop 2 bombers and destroy 2 escorts", fighters: 2, bombers: 2, allies: 0, tag: "TIME CRITICAL", estimate: "3–6 MIN" },
  { id: 2, name: "Open Skies", code: "OPERATION 03", region: "AEGIS STRAIT", brief: "Join two allied fighters against a hostile squadron. Protect your wing and secure the strait.", objective: "Destroy 8 hostile fighters · survive", fighters: 8, bombers: 0, allies: 2, tag: "AIR BATTLE", estimate: "5–8 MIN" }
];
const FREE_FLIGHT = {
  id: 3,
  name: "Free Flight",
  code: "PRACTICE MODE",
  region: "OPEN COAST",
  brief: "First time flying? Learn flight controls at your own pace. No enemies, no time limits. Ground collisions automatically reset you to a safe altitude.",
  objective: "Free flight & flight control practice",
  fighters: 0,
  bombers: 0,
  allies: 0,
  freeFlight: true,
  tag: "NO ENEMIES",
  estimate: "NO TIME LIMIT"
};
const FLIGHT_MODES = [FREE_FLIGHT, ...MISSIONS];
function getMission(id) {
  return FLIGHT_MODES.find((mission) => mission.id === id) || FREE_FLIGHT;
}
function missionStatus(enemies, player, base) {
  if (!player.alive) return "failed";
  if (enemies.some((e) => e.bomber && e.alive && e.position.distanceTo(base) < 850)) return "base-lost";
  if (enemies.length && enemies.every((e) => !e.alive)) return "complete";
  return "active";
}
export {
  MISSIONS,
  FREE_FLIGHT,
  FLIGHT_MODES,
  getMission,
  missionStatus
};
