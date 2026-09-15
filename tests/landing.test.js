import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { parseHTML } from "linkedom";
import { IAF_BASES, getNearestIAFBase } from "../src/game/GeoWorld.js";
import { World, BASE } from "../src/game/World.js";
import { Jet } from "../src/game/Jet.js";
import { Game } from "../src/game/Game.js";
import { UI } from "../src/ui/UI.js";
import { FREE_FLIGHT } from "../src/game/Missions.js";

test("IAF_BASES: contains all 14 strategic airbases and operational airfields", () => {
  assert.equal(IAF_BASES.length, 14);

  const baseIds = IAF_BASES.map((b) => b.id);
  assert.ok(baseIds.includes("ambala_afb"));
  assert.ok(baseIds.includes("hindan_afb"));
  assert.ok(baseIds.includes("gwalior_afb"));
  assert.ok(baseIds.includes("pathankot_afb"));
  assert.ok(baseIds.includes("halwara_afb"));
  assert.ok(baseIds.includes("bareilly_afb"));
  assert.ok(baseIds.includes("uttarlai_afb"));
  assert.ok(baseIds.includes("naliya_afb"));
  assert.ok(baseIds.includes("awantipora_afb"));
  assert.ok(baseIds.includes("thoise_afb"));
  assert.ok(baseIds.includes("udhampur_afb"));
  assert.ok(baseIds.includes("sirsa_afb"));
  assert.ok(baseIds.includes("jamnagar_afb"));
  assert.ok(baseIds.includes("base_runway09"));

  for (const base of IAF_BASES) {
    assert.ok(base.id && typeof base.id === "string");
    assert.ok(base.name && typeof base.name === "string");
    assert.ok(base.shortName && typeof base.shortName === "string");
    assert.ok(typeof base.x === "number");
    assert.ok(typeof base.z === "number");
    assert.ok(typeof base.elevation === "number" && base.elevation >= 30);
    assert.ok(base.runwayLength >= 2000);
    assert.ok(base.runwayWidth >= 100);
    assert.ok(base.squadron && typeof base.squadron === "string");
  }
});

test("GeoWorld: getNearestIAFBase accurately finds closest airbase", () => {
  // Near Ambala (x: 18000, z: -25000)
  const nearAmbala = getNearestIAFBase(18200, -25100);
  assert.ok(nearAmbala.base);
  assert.equal(nearAmbala.base.id, "ambala_afb");
  assert.ok(nearAmbala.distance < 500);

  // Near Siachen / Thoise (x: 17000, z: -56000)
  const nearThoise = getNearestIAFBase(17500, -56200);
  assert.ok(nearThoise.base);
  assert.equal(nearThoise.base.id, "thoise_afb");
  assert.ok(nearThoise.distance < 600);
});

test("Jet: landing gear mechanics and visibility toggle correctly", () => {
  const jet = new Jet("player");
  assert.equal(jet.gearDown, true);
  assert.equal(jet.isLanded, false);

  // Toggle gear UP
  const upState = jet.toggleGear();
  assert.equal(upState, false);
  assert.equal(jet.gearDown, false);
  if (jet.model?.userData?.gearGroup) {
    assert.equal(jet.model.userData.gearGroup.visible, false);
  }

  // Toggle gear DOWN
  const downState = jet.toggleGear();
  assert.equal(downState, true);
  assert.equal(jet.gearDown, true);
  if (jet.model?.userData?.gearGroup) {
    assert.equal(jet.model.userData.gearGroup.visible, true);
  }

  // Set gear directly
  jet.setGear(false);
  assert.equal(jet.gearDown, false);
});

test("World: getRunwayAt detects runway boundaries and collision exemption", () => {
  const scene = new T.Scene();
  const world = new World(scene);

  // Over Ambala runway center (x: 18000, z: -25000)
  const rwAmbala = world.getRunwayAt(18000, -25000);
  assert.ok(rwAmbala);
  assert.equal(rwAmbala.base.id, "ambala_afb");
  assert.equal(rwAmbala.elevation, 42);

  // Outside runway bounds
  const offRunway = world.getRunwayAt(18000, -32000);
  assert.equal(offRunway, null);

  // Over Home base Runway 09 (x: -4200, z: -12500)
  const rwHome = world.getRunwayAt(BASE.x, BASE.z);
  assert.ok(rwHome);

  // Runway collision check: with gear down, touching runway surface is NOT a collision
  const onRunwayPos = new T.Vector3(18000, rwAmbala.elevation + 2.5, -25000);
  const collWithGear = world.collision(onRunwayPos, true, true);
  assert.equal(collWithGear, false);
});

test("Game: landAtBase and approachBase dispatch and rearm jet correctly", () => {
  const g = Object.create(Game.prototype);
  const player = new Jet("player");
  player.hp = 25; // damaged
  const scene = new T.Scene();

  Object.assign(g, {
    player,
    scene,
    camera: new T.PerspectiveCamera(),
    cannonLeft: 100,
    missilesLeft: 1,
    flaresLeft: 2,
    stats: { rearms: 0 },
    expandedMapMode: false,
    ui: {
      message() {},
      showPause() {},
      closePanel() {}
    },
    audio: {
      playLock() {}
    },
    notify() {}
  });

  // 1. Dispatch landing at Ambala AFB
  g.landAtBase("ambala_afb");
  assert.equal(g.player.isLanded, true);
  assert.equal(g.player.gearDown, true);
  assert.equal(g.player.currentBase, "ambala_afb");
  assert.equal(g.player.position.x, 18000);
  assert.equal(g.player.speed, 0);
  assert.equal(g.expandedMapMode, true);

  // Assert full repair & rearm
  assert.equal(g.player.hp, g.player.maxHp);
  assert.ok(g.cannonLeft >= 1000);
  assert.ok(g.missilesLeft >= 6);
  assert.ok(g.flaresLeft >= 20);

  // 2. Dispatch approach at Thoise Siachen AFB
  g.approachBase("thoise_afb");
  assert.equal(g.player.isLanded, false);
  assert.equal(g.player.gearDown, true);
  assert.equal(g.player.position.x, 17000);
  assert.ok(g.player.speed > 100);
  assert.equal(g.expandedMapMode, true);
});

test("UI: showAirbaseLandingModal renders all 14 bases and landing action dispatches correctly", () => {
  const { window, document } = parseHTML('<html><body><canvas id="world"></canvas><main id="app"></main></body></html>');
  Object.assign(globalThis, { window, document, innerWidth: 1366, innerHeight: 768, devicePixelRatio: 1, localStorage: { setItem() {}, getItem() { return null; } } });
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}), set: () => true });
  window.HTMLCanvasElement.prototype.getContext = () => context;
  const settings = { input: 'keyboard', quality: 'medium', sensitivity: .8, difficulty: 'easy' };
  const ui = new UI(document.getElementById('app'), settings);

  let landedAt = null, approachedAt = null;
  const game = {
    player: { position: new T.Vector3(0, 1500, 5000), currentBase: null },
    landAtBase(id) { landedAt = id; },
    approachBase(id) { approachedAt = id; },
    audio: { play() {} }
  };
  ui.attach(game);

  // Open Landing Modal
  ui.showAirbaseLandingModal();
  assert.equal(ui.modalType, "landing");
  const cards = document.querySelectorAll(".airbase-card");
  assert.equal(cards.length, 14);

  // Click Touchdown at Ambala
  const landBtn = document.querySelector('[data-base-land="ambala_afb"]');
  assert.ok(landBtn);
  landBtn.click();
  assert.equal(landedAt, "ambala_afb");

  // Re-open and Click Approach at Thoise
  ui.showAirbaseLandingModal();
  const approachBtn = document.querySelector('[data-base-approach="thoise_afb"]');
  assert.ok(approachBtn);
  approachBtn.click();
  assert.equal(approachedAt, "thoise_afb");
});
