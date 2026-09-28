import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { SpatialHash } from "../src/game/SpatialHash.js";

test("SpatialHash: inserts, updates and removes objects across 3D cells", () => {
  const grid = new SpatialHash(500);
  const jetA = { id: "jetA", team: "player", radius: 15 };
  const jetB = { id: "jetB", team: "enemy", radius: 15 };

  grid.insert(jetA, new T.Vector3(100, 200, 300), 15);
  grid.insert(jetB, new T.Vector3(2500, 1000, 3500), 15);

  assert.equal(grid.cells.size, 2);

  // Update position
  grid.update(jetA, new T.Vector3(120, 210, 310));
  assert.equal(grid.cells.size, 2);

  // Move across cell boundary
  grid.update(jetA, new T.Vector3(1200, 210, 310));
  assert.equal(grid.cells.size, 2);

  // Query sphere
  const nearby = grid.querySphere(new T.Vector3(1200, 200, 300), 100);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].id, "jetA");

  // Query out of range
  const far = grid.querySphere(new T.Vector3(0, 0, 0), 100);
  assert.equal(far.length, 0);

  // Remove
  grid.remove(jetA);
  assert.equal(grid.querySphere(new T.Vector3(1200, 200, 300), 100).length, 0);
  assert.equal(grid.cells.size, 1);
});

test("SpatialHash: swept-segment query detects projectile hits accurately", () => {
  const grid = new SpatialHash(400);
  const target = { id: "enemy1", team: "enemy", radius: 10 };
  grid.insert(target, new T.Vector3(500, 500, 500), 10);

  // Bullet passing directly through target
  const p0 = new T.Vector3(500, 500, 200);
  const p1 = new T.Vector3(500, 500, 800);
  const hits = grid.querySegment(p0, p1, 5);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, "enemy1");

  // Bullet missing by wide margin
  const miss0 = new T.Vector3(1500, 500, 200);
  const miss1 = new T.Vector3(1500, 500, 800);
  const missHits = grid.querySegment(miss0, miss1, 5);
  assert.equal(missHits.length, 0);
});
