import test from "node:test";
import assert from "node:assert/strict";
import { ProgressionManager, RANKS } from "../src/game/Progression.js";

test("Progression: starts at Flight Cadet and calculates ranks correctly", () => {
  const pm = new ProgressionManager();
  pm.profile.xp = 0;

  assert.equal(pm.getCurrentRank().name, "Flight Cadet");
  assert.equal(pm.getCurrentRank().level, 1);

  pm.awardXP(600, "TEST");
  assert.equal(pm.getCurrentRank().name, "Flying Officer");
  assert.equal(pm.getCurrentRank().level, 2);

  pm.awardXP(1800, "TEST");
  assert.equal(pm.getCurrentRank().name, "Squadron Leader");
  assert.equal(pm.getCurrentRank().level, 4);
});

test("Progression: unlocks items according to rank level", () => {
  const pm = new ProgressionManager();
  pm.profile.xp = 0;

  assert.equal(pm.isUnlocked("jet", "x17"), true);
  assert.equal(pm.isUnlocked("jet", "su57"), false);

  pm.awardXP(550, "TEST");
  assert.equal(pm.isUnlocked("jet", "su57"), true);
  assert.equal(pm.isUnlocked("jet", "f22"), false);

  pm.awardXP(2000, "TEST");
  assert.equal(pm.isUnlocked("jet", "f22"), true);
});

test("Progression: triggers event callbacks on XP award and level up", () => {
  const pm = new ProgressionManager();
  pm.profile.xp = 400;

  let xpNotified = null;
  let levelNotified = null;

  pm.onXPAward(e => { xpNotified = e; });
  pm.onLevelUp(e => { levelNotified = e; });

  pm.awardXP(200, "KILL");

  assert.ok(xpNotified);
  assert.equal(xpNotified.amount, 200);
  assert.ok(levelNotified);
  assert.equal(levelNotified.newRank.level, 2);
});
