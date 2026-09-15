import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  JET_MODELS,
  LIVERIES,
  MODIFICATIONS,
  computeJetStats,
  DEFAULT_PLAYER_CONFIG,
  loadPlayerJetConfig,
  savePlayerJetConfig
} from "../src/game/JetConfigs.js";
import { createJet, Jet } from "../src/game/Jet.js";
import { updateFlight } from "../src/game/FlightPhysics.js";

test("JetConfigs: contains all 5 distinct fighter jet models with valid base stats", () => {
  const models = ["x17", "su57", "f22", "vajra9", "a10x"];
  for (const id of models) {
    const m = JET_MODELS[id];
    assert.ok(m, `Model ${id} should exist`);
    assert.ok(m.name, `Model ${id} has name`);
    assert.ok(m.code, `Model ${id} has code`);
    assert.ok(m.role, `Model ${id} has role`);
    assert.ok(m.baseStats.speedKmh > 1000, `Model ${id} has realistic supersonic/subsonic speed`);
    assert.ok(m.baseStats.armor >= 80, `Model ${id} has base armor >= 80`);
    assert.ok(m.baseStats.missiles >= 4, `Model ${id} has missiles >= 4`);
    assert.ok(m.baseStats.cannon >= 1000, `Model ${id} has cannon >= 1000`);
    assert.ok(m.geometry.wingType, `Model ${id} has wingType defined`);
  }
});

test("JetConfigs: contains all 5 tactical liveries with valid colors and physical materials", () => {
  const skins = ["grey", "stealth", "desert", "arctic", "gold"];
  for (const id of skins) {
    const l = LIVERIES[id];
    assert.ok(l, `Livery ${id} should exist`);
    assert.ok(l.name, `Livery ${id} has name`);
    assert.ok(typeof l.bodyColor === "number", `Livery ${id} has valid body color hex`);
    assert.ok(l.metalness >= 0 && l.metalness <= 1, `Livery ${id} has bounded metalness`);
    assert.ok(l.roughness >= 0 && l.roughness <= 1, `Livery ${id} has bounded roughness`);
  }
});

test("JetConfigs: computeJetStats accurately compounds model base stats with performance modifications", () => {
  // Baseline X-17
  const baseStats = computeJetStats("x17", {
    engine: "standard",
    aerodynamics: "balanced",
    armor: "standard",
    weapons: "tactical"
  });
  assert.equal(baseStats.maxHp, 100);
  assert.equal(baseStats.missiles, 6);
  assert.equal(baseStats.cannon, 1200);

  // Tuned SU-57 with Overdrive & Titanium Armor
  const su57Stats = computeJetStats("su57", {
    engine: "overdrive",
    aerodynamics: "clipped_speed",
    armor: "titanium",
    weapons: "gunship"
  });
  assert.ok(su57Stats.maxSpeedKmh > 2350, "Overdrive and clipped wings increase top speed");
  assert.equal(su57Stats.maxHp, 165, "125 base + 40 titanium = 165 HP");
  assert.equal(su57Stats.missiles, 10, "8 base + 2 gunship = 10 missiles");

  // Lightweight Vajra-9 with Carbon Composite and Canard Vortex
  const vajraStats = computeJetStats("vajra9", {
    engine: "thrust_vector",
    aerodynamics: "canard_vortex",
    armor: "composite",
    weapons: "tactical"
  });
  assert.equal(vajraStats.maxHp, 75, "90 base - 15 composite = 75 HP");
  assert.ok(vajraStats.turnMult > 1.5, "High agility multiplier from canards, vectoring, and light airframe");
});

test("JetConfigs: loadPlayerJetConfig fallback to default if localStorage is absent or corrupted", () => {
  const cfg = loadPlayerJetConfig();
  assert.ok(cfg.modelId, "Returns default modelId");
  assert.ok(cfg.liveryId, "Returns default liveryId");
  assert.ok(cfg.modifications, "Returns default modifications");
});

test("createJet: generates valid 3D hierarchies for all 5 fighter jet models", () => {
  const models = ["x17", "su57", "f22", "vajra9", "a10x"];
  for (const modelId of models) {
    const jetMesh = createJet("player", false, modelId, "stealth");
    assert.ok(jetMesh instanceof T.Group, `Jet ${modelId} is a Three.js Group`);
    assert.ok(jetMesh.children.length > 5, `Jet ${modelId} has full fuselage, wings, elevators, engines`);
    assert.ok(jetMesh.userData.flames.length >= 2, `Jet ${modelId} has afterburner flames`);
    assert.ok(jetMesh.userData.elevators.length >= 2, `Jet ${modelId} has elevators`);

    if (modelId === "su57" || modelId === "vajra9") {
      assert.ok(jetMesh.userData.canards.length >= 2, `Jet ${modelId} has animated canards`);
    }
  }
});

test("Jet: instantiates with proper stats and supports real-time customization rebuilding", () => {
  const playerJet = new Jet("player", false, {
    modelId: "vajra9",
    liveryId: "gold",
    modifications: { engine: "thrust_vector", armor: "composite" }
  });

  assert.equal(playerJet.modelId, "vajra9");
  assert.equal(playerJet.liveryId, "gold");
  assert.equal(playerJet.hp, 75);
  assert.ok(playerJet.turnRateMultiplier > 1.2);

  const wingTips = playerJet.getWingTips();
  assert.ok(wingTips.left instanceof T.Vector3);
  assert.ok(wingTips.right instanceof T.Vector3);

  // Switch to A-10X Heavy Armor with Titanium
  playerJet.applyCustomization({
    modelId: "a10x",
    liveryId: "desert",
    modifications: { armor: "titanium", weapons: "armor_piercing" }
  });

  assert.equal(playerJet.modelId, "a10x");
  assert.equal(playerJet.liveryId, "desert");
  assert.equal(playerJet.maxHp, 200, "160 base + 40 titanium = 200 HP");
  assert.equal(playerJet.stats.cannonDamage, 29, "22 base + 7 armor-piercing = 29 cannon damage");
});

test("FlightPhysics: jet turnMult and speedMult affect angular damping and acceleration", () => {
  const agileJet = new Jet("player", false, {
    modelId: "vajra9",
    modifications: { engine: "thrust_vector", aerodynamics: "canard_vortex" }
  });
  const heavyJet = new Jet("player", false, {
    modelId: "a10x",
    modifications: { engine: "standard", armor: "titanium" }
  });

  const dummyInput = {
    keys: new Set(["ArrowRight", "ShiftLeft"]),
    mouse: { x: 0, y: 0 },
    boost: true,
    touchActive: false,
    levelTimer: 0
  };
  const settings = { input: "keyboard", sensitivity: 1 };

  updateFlight(agileJet, dummyInput, 0.1, settings);
  updateFlight(heavyJet, dummyInput, 0.1, settings);

  // Agile jet should have much higher roll angular velocity due to high turnMult
  assert.ok(
    Math.abs(agileJet.angular.z) > Math.abs(heavyJet.angular.z),
    "Agile Vajra-9 turns and rolls faster than heavy A-10X"
  );
});
