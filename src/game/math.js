import * as THREE from "three";
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));
function forward(q) {
  return FORWARD.clone().applyQuaternion(q);
}
function heading(q) {
  const f = forward(q);
  return (Math.atan2(f.x, -f.z) * 180 / Math.PI + 360) % 360;
}
function pointSegmentDistance(p, a, b) {
  const d = b.clone().sub(a);
  const t = clamp(p.clone().sub(a).dot(d) / Math.max(d.lengthSq(), 1e-4), 0, 1);
  return p.distanceTo(d.multiplyScalar(t).add(a));
}
function steerQuaternion(q, direction, rate, dt) {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), direction, UP);
  const target = new THREE.Quaternion().setFromRotationMatrix(m);
  q.rotateTowards(target, rate * dt);
}
function rng(seed) {
  return () => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed / 4294967296;
  };
}
export {
  FORWARD,
  UP,
  clamp,
  damp,
  forward,
  heading,
  pointSegmentDistance,
  rng,
  steerQuaternion
};
