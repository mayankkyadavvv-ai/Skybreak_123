import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared geometry: allocating a projectile never allocates GPU resources.
export class WeaponVisuals {
  constructor() {
    this.tracerGeo = new T.CylinderGeometry(.3, .3, 38, 5).rotateX(Math.PI / 2);
    this.haloGeo = new T.CylinderGeometry(.72, .42, 44, 5).rotateX(Math.PI / 2);
    this.tracerMat = new T.MeshBasicMaterial({ color: 0xffedac, toneMapped: false });
    this.haloMat = new T.MeshBasicMaterial({ color: 0xffa42b, transparent: true, opacity: .25, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pieces = [new T.CylinderGeometry(.27, .27, 4.8, 10).rotateX(Math.PI / 2), new T.ConeGeometry(.27, 1.3, 10).rotateX(-Math.PI / 2).translate(0, 0, -3.05)];
    for (let i = 0; i < 4; i++) pieces.push(new T.BoxGeometry(1.6, .065, 1.35).translate(.65, 0, 1.6).rotateZ(i * Math.PI / 2));
    this.missileGeo = mergeGeometries(pieces); pieces.forEach(g => g.dispose());
    this.missileMat = new T.MeshStandardMaterial({ color: 0xdce5e9, roughness: .4, metalness: .45 });
    this.motorGeo = new T.ConeGeometry(.55, 7, 8).rotateX(Math.PI / 2).translate(0, 0, 5.8);
    this.motorMat = new T.MeshBasicMaterial({ color: 0x8bdfff, transparent: true, opacity: .82, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  }
  tracer() {
    const mesh = new T.Mesh(this.tracerGeo, this.tracerMat);
    mesh.add(new T.Mesh(this.haloGeo, this.haloMat));
    return mesh;
  }
  missile() {
    const mesh = new T.Mesh(this.missileGeo, this.missileMat);
    const motor = new T.Mesh(this.motorGeo, this.motorMat);
    motor.name = 'rocket-motor'; mesh.add(motor);
    return mesh;
  }
  dispose() {
    for (const resource of [this.tracerGeo, this.haloGeo, this.tracerMat, this.haloMat, this.missileGeo, this.missileMat, this.motorGeo, this.motorMat]) resource.dispose();
  }
}

// Distance-spaced smoke avoids disconnected puffs as the missile accelerates.
export function emitMissileSegment(effects, from, to, dir, speed, scratch = new T.Vector3()) {
  if (!effects?.missileTrail || effects.intensity === 0) return;
  const count = Math.min(8, Math.max(1, Math.ceil(from.distanceTo(to) / 12)));
  for (let i = 1; i <= count; i++) {
    scratch.lerpVectors(from, to, i / count).addScaledVector(dir, -3);
    effects.missileTrail(scratch, dir, speed);
  }
}
