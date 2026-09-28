/**
 * SpatialHash - 3D Spatial Partitioning Grid for high-performance collision detection.
 * Replaces O(N*M) pairwise checks with O(1) cell queries and swept-capsule traversal.
 */
import * as T from "three";
import { pointSegmentDistance } from "./math.js";

export class SpatialHash {
  constructor(cellSize = 600) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map(); // "x,y,z" -> Set of objects
    this.objectData = new Map(); // object -> { key, x, y, z, radius }
    this._candidateSet = new Set();
    this._v0 = new T.Vector3();
  }

  _getKey(x, y, z) {
    const cx = Math.floor(x * this.invCellSize);
    const cy = Math.floor(y * this.invCellSize);
    const cz = Math.floor(z * this.invCellSize);
    return `${cx},${cy},${cz}`;
  }

  insert(obj, pos, radius = 5) {
    if (!obj || !pos) return;
    this.remove(obj);

    const key = this._getKey(pos.x, pos.y, pos.z);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(obj);

    this.objectData.set(obj, {
      key,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      radius
    });
  }

  update(obj, pos, radius = null) {
    if (!obj || !pos) return;
    const data = this.objectData.get(obj);
    if (!data) {
      this.insert(obj, pos, radius || 5);
      return;
    }

    const newKey = this._getKey(pos.x, pos.y, pos.z);
    data.x = pos.x;
    data.y = pos.y;
    data.z = pos.z;
    if (radius !== null) data.radius = radius;

    if (newKey !== data.key) {
      const oldCell = this.cells.get(data.key);
      if (oldCell) {
        oldCell.delete(obj);
        if (oldCell.size === 0) this.cells.delete(data.key);
      }
      let newCell = this.cells.get(newKey);
      if (!newCell) {
        newCell = new Set();
        this.cells.set(newKey, newCell);
      }
      newCell.add(obj);
      data.key = newKey;
    }
  }

  remove(obj) {
    const data = this.objectData.get(obj);
    if (!data) return;
    const cell = this.cells.get(data.key);
    if (cell) {
      cell.delete(obj);
      if (cell.size === 0) this.cells.delete(data.key);
    }
    this.objectData.delete(obj);
  }

  clear() {
    this.cells.clear();
    this.objectData.clear();
    this._candidateSet.clear();
  }

  /**
   * Query all objects within a spherical radius.
   */
  querySphere(center, radius, outResults = []) {
    outResults.length = 0;
    this._candidateSet.clear();

    const minX = Math.floor((center.x - radius) * this.invCellSize);
    const maxX = Math.floor((center.x + radius) * this.invCellSize);
    const minY = Math.floor((center.y - radius) * this.invCellSize);
    const maxY = Math.floor((center.y + radius) * this.invCellSize);
    const minZ = Math.floor((center.z - radius) * this.invCellSize);
    const maxZ = Math.floor((center.z + radius) * this.invCellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (!cell) continue;
          for (const obj of cell) {
            if (this._candidateSet.has(obj)) continue;
            this._candidateSet.add(obj);

            const d = this.objectData.get(obj);
            if (!d) continue;

            const dx = d.x - center.x;
            const dy = d.y - center.y;
            const dz = d.z - center.z;
            const totalR = radius + d.radius;
            if (dx * dx + dy * dy + dz * dz <= totalR * totalR) {
              outResults.push(obj);
            }
          }
        }
      }
    }
    return outResults;
  }

  /**
   * Swept-segment collision query for high-velocity projectiles (bullets, missiles).
   * Tests candidates whose bounding radius overlaps the segment [p0, p1].
   */
  querySegment(p0, p1, padding = 0, outResults = []) {
    outResults.length = 0;
    this._candidateSet.clear();

    const minX = Math.floor((Math.min(p0.x, p1.x) - padding) * this.invCellSize);
    const maxX = Math.floor((Math.max(p0.x, p1.x) + padding) * this.invCellSize);
    const minY = Math.floor((Math.min(p0.y, p1.y) - padding) * this.invCellSize);
    const maxY = Math.floor((Math.max(p0.y, p1.y) + padding) * this.invCellSize);
    const minZ = Math.floor((Math.min(p0.z, p1.z) - padding) * this.invCellSize);
    const maxZ = Math.floor((Math.max(p0.z, p1.z) + padding) * this.invCellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const cell = this.cells.get(`${x},${y},${z}`);
          if (!cell) continue;
          for (const obj of cell) {
            if (this._candidateSet.has(obj)) continue;
            this._candidateSet.add(obj);

            const d = this.objectData.get(obj);
            if (!d) continue;

            this._v0.set(d.x, d.y, d.z);
            const dist = pointSegmentDistance(this._v0, p0, p1);
            if (dist <= d.radius + padding) {
              outResults.push(obj);
            }
          }
        }
      }
    }
    return outResults;
  }
}
