import { disposeObject } from "./Resources.js";
import { FLAGSHIP_ASSET, loadJetAsset } from "./JetAsset.js";
import * as T from "three";
import { forward } from "./math.js";
import { createCockpit } from "./Cockpit.js";
import { buildAircraftLOD, batchAircraftDetails } from "./AircraftLOD.js";
import { aircraftDetail } from "./SurfaceDetail.js";
import { JET_MODELS, LIVERIES, computeJetStats, DEFAULT_PLAYER_CONFIG } from "./JetConfigs.js";

function poly(points, depth, material) {
  const s = new T.Shape();
  s.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach((p) => s.lineTo(...p));
  s.closePath();
  const geo = new T.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.15, bevelSegments: 1, steps: 1 });
  geo.rotateX(Math.PI / 2);
  return new T.Mesh(geo, material);
}

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new T.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
}

function createControlSurface(x, y, z, width, chord, thickness, rotY = 0, rotZ = 0, mat) {
  const pivot = new T.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = rotY;
  pivot.rotation.z = rotZ;
  const geo = new T.BoxGeometry(width, thickness, chord);
  geo.translate(0, 0, chord * 0.5);
  const m = new T.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  pivot.add(m);
  return pivot;
}

function createRudderSurface(x, y, z, height, chord, thickness, rotY = 0, rotZ = 0, mat) {
  const pivot = new T.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = rotY;
  pivot.rotation.z = rotZ;
  const geo = new T.BoxGeometry(thickness, height, chord);
  geo.translate(0, height * 0.5, chord * 0.5);
  const m = new T.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  pivot.add(m);
  return pivot;
}

let _panelTexture = null;
function getAircraftPanelTexture() {
  if (_panelTexture) return _panelTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 512, 512);

  // Technical Panel Line Grooves
  ctx.strokeStyle = "#383838";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 64); ctx.lineTo(512, 64);
  ctx.moveTo(0, 128); ctx.lineTo(512, 128);
  ctx.moveTo(0, 256); ctx.lineTo(512, 256);
  ctx.moveTo(0, 384); ctx.lineTo(512, 384);
  ctx.moveTo(0, 448); ctx.lineTo(512, 448);
  for (let x = 32; x < 512; x += 48) {
    ctx.moveTo(x, 0); ctx.lineTo(x, 512);
  }
  ctx.stroke();

  // Avionics / Maintenance Hatches
  ctx.fillStyle = "#686868";
  const hatches = [
    [72, 80, 40, 28], [180, 80, 56, 32], [320, 80, 44, 28],
    [72, 280, 48, 36], [190, 280, 60, 40], [330, 280, 50, 32],
    [120, 400, 36, 24], [260, 400, 42, 28], [380, 400, 36, 24]
  ];
  for (const [hx, hy, hw, hh] of hatches) {
    ctx.strokeRect(hx, hy, hw, hh);
    ctx.fillRect(hx + 2, hy + 2, hw - 4, hh - 4);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(hx + 4, hy + 4, 2, 2);
    ctx.fillRect(hx + hw - 6, hy + 4, 2, 2);
    ctx.fillRect(hx + 4, hy + hh - 6, 2, 2);
    ctx.fillRect(hx + hw - 6, hy + hh - 6, 2, 2);
    ctx.fillStyle = "#686868";
  }

  // Flush Rivets
  ctx.fillStyle = "#2c2c2c";
  for (let y = 16; y < 512; y += 32) {
    for (let x = 8; x < 512; x += 12) {
      if (x % 48 !== 0 && y % 64 !== 0) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  _panelTexture = new T.CanvasTexture(canvas);
  _panelTexture.wrapS = T.RepeatWrapping;
  _panelTexture.wrapT = T.RepeatWrapping;
  _panelTexture.repeat.set(3, 3);
  return _panelTexture;
}

function applyAviationRimLighting(mat) {
  if (!mat) return;
  const originalCompile=mat.onBeforeCompile;
  mat.onBeforeCompile = (shader,renderer) => {
    originalCompile?.(shader,renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      #ifdef USE_NORMAL
        // Subtle aerodynamic Fresnel rim highlight ensuring aircraft silhouette pops against clouds, sky & night
        float vRim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewPosition)));
        vRim = pow(vRim, 3.2) * 0.28;
        gl_FragColor.rgb += vec3(0.52, 0.74, 0.98) * vRim * (1.0 - roughness * 0.45);
      #endif
      `
    );
  };
}

export function createJet(team = "player", bomber = false, modelId = "x17", liveryId = "grey", mods = {}) {
  const g = new T.Group();
  const modelDef = JET_MODELS[modelId] || JET_MODELS.x17;
  const livery = LIVERIES[liveryId] || LIVERIES.grey;
  const panelBump = getAircraftPanelTexture();

  // Materials
  let bodyMat, darkMat, stripeMat, metalMat, glassMat, titaniumHeatMat;
  if (team === "enemy") {
    bodyMat = new T.MeshStandardMaterial({ color: 0x24282f, metalness: 0.70, roughness: 0.35, bumpMap: panelBump, bumpScale: 0.04 });
    darkMat = new T.MeshStandardMaterial({ color: 0x111418, metalness: 0.80, roughness: 0.30, bumpMap: panelBump, bumpScale: 0.03 });
    stripeMat = new T.MeshStandardMaterial({ color: 0xff2020, metalness: 0.45, roughness: 0.30 });
    metalMat = new T.MeshStandardMaterial({ color: 0x9298a0, metalness: 0.88, roughness: 0.22 });
    glassMat = new T.MeshStandardMaterial({ color: 0xeb3434, metalness: 0.88, roughness: 0.10, transparent: true, opacity: 0.88 });
    titaniumHeatMat = new T.MeshStandardMaterial({ color: 0x364254, metalness: 0.92, roughness: 0.25, bumpMap: panelBump, bumpScale: 0.03 });
  } else if (team === "ally") {
    bodyMat = new T.MeshStandardMaterial({ color: 0xd2d9e2, metalness: 0.65, roughness: 0.38, bumpMap: panelBump, bumpScale: 0.04 });
    darkMat = new T.MeshStandardMaterial({ color: 0x182436, metalness: 0.75, roughness: 0.32, bumpMap: panelBump, bumpScale: 0.03 });
    stripeMat = new T.MeshStandardMaterial({ color: 0x1e88e5, metalness: 0.45, roughness: 0.32 });
    metalMat = new T.MeshStandardMaterial({ color: 0x8aa0b4, metalness: 0.88, roughness: 0.22 });
    glassMat = new T.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.88, roughness: 0.10, transparent: true, opacity: 0.88 });
    titaniumHeatMat = new T.MeshStandardMaterial({ color: 0x3b4c62, metalness: 0.92, roughness: 0.25, bumpMap: panelBump, bumpScale: 0.03 });
  } else {
    bodyMat = new T.MeshStandardMaterial({ color: livery.bodyColor, metalness: livery.metalness, roughness: livery.roughness, bumpMap: panelBump, bumpScale: 0.04 });
    darkMat = new T.MeshStandardMaterial({ color: livery.darkColor, metalness: Math.min(1, livery.metalness + 0.08), roughness: livery.roughness * 0.85, bumpMap: panelBump, bumpScale: 0.03 });
    stripeMat = new T.MeshStandardMaterial({ color: livery.stripeColor, metalness: 0.42, roughness: 0.36 });
    metalMat = new T.MeshStandardMaterial({ color: livery.metalColor || 0x76808f, metalness: 0.88, roughness: 0.25 });
    glassMat = new T.MeshStandardMaterial({ color: livery.glassColor || 0x98b4cc, metalness: 0.85, roughness: 0.10, transparent: true, opacity: 0.88 });
    titaniumHeatMat = new T.MeshStandardMaterial({ color: 0x3e4e66, metalness: 0.92, roughness: 0.24, bumpMap: panelBump, bumpScale: 0.03 });
  }

  glassMat.metalness=.05;glassMat.roughness=.14;glassMat.opacity=.62;glassMat.depthWrite=false;glassMat.envMapIntensity=1.25;
  if(modelId==='x17'){bodyMat.roughness=Math.max(.48,bodyMat.roughness);bodyMat.metalness=Math.min(.48,bodyMat.metalness);bodyMat.bumpScale=.018;}
  aircraftDetail(bodyMat);
  applyAviationRimLighting(bodyMat);
  applyAviationRimLighting(darkMat);
  applyAviationRimLighting(metalMat);
  applyAviationRimLighting(titaniumHeatMat);

  const elevators = [];
  const canards = [];
  const ailerons = [];
  const rudders = [];
  const flames = [];

  // ==========================================
  // 1. FUSELAGE GENERATION ACCORDING TO MODEL
  // ==========================================
  let sections = [];
  if (modelId === "su57") {
    sections = [
      [-10.5, 0.08, 0.08],
      [-7.5, 0.95, 0.55],
      [-3.5, 1.8, 0.75],
      [1.5, 2.2, 0.85],
      [5.5, 1.9, 0.60],
      [8.5, 1.0, 0.40]
    ];
  } else if (modelId === "f22") {
    sections = [
      [-11, 0.05, 0.05],
      [-7.5, 0.85, 0.60],
      [-3.0, 1.5, 0.85],
      [1.8, 1.7, 0.92],
      [5.8, 1.4, 0.60],
      [8.0, 0.7, 0.35]
    ];
  } else if (modelId === "vajra9") {
    sections = [
      [-9.0, 0.08, 0.08],
      [-6.5, 0.75, 0.60],
      [-2.8, 1.3, 0.85],
      [1.2, 1.45, 0.90],
      [4.8, 1.2, 0.65],
      [7.0, 0.6, 0.45]
    ];
  } else if (modelId === "a10x") {
    sections = [
      [-9.5, 0.15, 0.15],
      [-6.8, 0.90, 0.85],
      [-2.5, 1.35, 1.15],
      [1.5, 1.40, 1.20],
      [5.2, 1.15, 0.95],
      [7.8, 0.70, 0.65]
    ];
  } else {
    // Default X-17
    sections = [
      [-10, 0.08, 0.08],
      [-7, 0.8, 0.65],
      [-3, 1.4, 0.9],
      [2, 1.6, 1],
      [6, 1.3, 0.65],
      [8, 0.6, 0.4]
    ];
  }

  const verts = [], inds = [];
  sections.forEach(([z, w, h]) => {
    for (let j = 0; j < 8; j++) {
      const a = (j * Math.PI) / 4;
      verts.push(Math.cos(a) * w, Math.sin(a) * h, z);
    }
  });
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < 8; j++) {
      const a = i * 8 + j, b = i * 8 + ((j + 1) % 8), c = a + 8, d = b + 8;
      inds.push(a, c, b, b, c, d);
    }
  }
  inds.push(0, 2, 4, 0, 4, 6, 40, 44, 42, 40, 46, 44);
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(verts, 3));
  geo.setIndex(inds);
  geo.computeVertexNormals();
  g.add(mesh(geo, bodyMat));

  // Canopy
  const canopyZ = modelId === "vajra9" ? -2.8 : modelId === "f22" ? -3.5 : -3.3;
  const canopy = mesh(new T.SphereGeometry(1, 20, 12), glassMat, 0, modelId === "a10x" ? 1.05 : 0.94, canopyZ);
  canopy.scale.set(modelId === "su57" ? 0.92 : 0.85, 0.82, modelId === "f22" ? 2.6 : 2.4);
  g.add(canopy);

  // Canopy Structural Frame Arch
  const frameArch = mesh(new T.BoxGeometry(modelId === "su57" ? 1.72 : 1.58, 0.08, 0.16), darkMat, 0, modelId === "a10x" ? 1.45 : 1.35, canopyZ - 0.5);
  frameArch.rotation.x = -0.15;
  g.add(frameArch);

  const cockpit=createCockpit();
  const cockpitGroup=cockpit.group;
  g.add(cockpitGroup);

  // A-10X 30mm Rotary Cannon Protrusion
  if (modelId === "a10x") {
    const cannonBarrel = mesh(new T.CylinderGeometry(0.26, 0.26, 3.2, 12), metalMat, -0.35, -0.4, -9.8);
    cannonBarrel.rotation.x = Math.PI / 2;
    g.add(cannonBarrel);
  }

  // SU-57 Tail Stinger Boom
  if (modelId === "su57") {
    const stinger = mesh(new T.BoxGeometry(0.65, 0.45, 3.8), darkMat, 0, -0.05, 9.2);
    g.add(stinger);
  }

  // ==========================================
  // 2. WINGS & CONTROL SURFACES
  // ==========================================
  for (const side of [-1, 1]) {
    if (modelId === "su57") {
      // Blended Flanker Wings with wide root and LERX
      g.add(poly([[side * 1.0, -4.5], [side * 9.2, 3.8], [side * 8.0, 5.4], [side * 1.2, 3.4]], 0.28, bodyMat));
      g.add(poly([[side * 7.8, 3.2], [side * 9.2, 3.8], [side * 8.0, 5.4], [side * 6.8, 4.9]], 0.30, stripeMat));
      
      // Active Movable Canards / LEVCONs
      const can = poly([[side * 0.9, -6.8], [side * 3.4, -4.5], [side * 2.8, -3.2], [side * 0.8, -3.8]], 0.18, bodyMat);
      g.add(can);
      canards.push(can);

      // Tail Elevators
      const elev = poly([[side * 1.2, 4.8], [side * 5.0, 7.2], [side * 4.2, 8.8], [side * 0.9, 7.5]], 0.20, bodyMat);
      g.add(elev);
      elevators.push(elev);

      // Articulated Wing Trailing-Edge Aileron
      const aileron = createControlSurface(side * 6.5, 0, 4.2, 2.4, 0.85, 0.18, side * -0.18, 0, stripeMat);
      g.add(aileron);
      ailerons.push(aileron);

    } else if (modelId === "f22") {
      // Diamond Stealth Wings
      g.add(poly([[side * 0.9, -3.5], [side * 7.6, 2.5], [side * 6.2, 5.2], [side * 1.0, 3.2]], 0.24, bodyMat));
      g.add(poly([[side * 6.0, 2.0], [side * 7.6, 2.5], [side * 6.2, 5.2], [side * 5.0, 4.6]], 0.26, stripeMat));

      // Trapezoidal All-Moving Elevators
      const elev = poly([[side * 0.9, 4.8], [side * 4.6, 6.8], [side * 3.6, 8.4], [side * 0.7, 7.2]], 0.18, bodyMat);
      g.add(elev);
      elevators.push(elev);

      // Articulated Wing Trailing-Edge Aileron
      const aileron = createControlSurface(side * 5.4, 0, 3.4, 2.2, 0.8, 0.16, side * -0.15, 0, stripeMat);
      g.add(aileron);
      ailerons.push(aileron);

    } else if (modelId === "vajra9") {
      // Compound Tailless Delta Wing
      g.add(poly([[side * 0.7, -3.0], [side * 6.8, 3.8], [side * 6.2, 5.6], [side * 0.8, 4.8]], 0.24, bodyMat));
      g.add(poly([[side * 5.6, 3.2], [side * 6.8, 3.8], [side * 6.2, 5.6], [side * 5.2, 5.0]], 0.26, stripeMat));

      // Close-Coupled Active Forward Canards
      const can = poly([[side * 0.7, -5.2], [side * 3.0, -3.8], [side * 2.5, -2.6], [side * 0.6, -3.2]], 0.16, bodyMat);
      g.add(can);
      canards.push(can);

      // Wing-trailing Elevons
      const elev = poly([[side * 1.0, 4.5], [side * 5.4, 5.2], [side * 4.8, 6.6], [side * 0.8, 5.9]], 0.18, bodyMat);
      g.add(elev);
      elevators.push(elev);

      // Outboard Articulated High-Roll Aileron
      const aileron = createControlSurface(side * 5.0, 0, 4.2, 2.0, 0.8, 0.16, side * -0.16, 0, stripeMat);
      g.add(aileron);
      ailerons.push(aileron);

    } else if (modelId === "a10x") {
      // Straight High-Lift Heavy Wings
      g.add(poly([[side * 0.9, -1.2], [side * 9.8, -0.6], [side * 9.5, 2.6], [side * 0.9, 2.4]], 0.34, bodyMat));
      g.add(poly([[side * 8.4, -0.6], [side * 9.8, -0.6], [side * 9.5, 2.6], [side * 8.2, 2.6]], 0.36, stripeMat));

      // Horizontal Tailplane
      const elev = poly([[side * 0.6, 5.6], [side * 4.8, 5.6], [side * 4.8, 7.6], [side * 0.6, 7.6]], 0.22, bodyMat);
      g.add(elev);
      elevators.push(elev);

      // Long-Span Articulated Flap / Aileron
      const aileron = createControlSurface(side * 6.8, 0, 2.4, 2.8, 0.8, 0.18, 0, 0, stripeMat);
      g.add(aileron);
      ailerons.push(aileron);

    } else {
      // Default X-17 Delta
      g.add(poly([[side * 0.8, -3], [side * 8, 3.5], [side * 7, 5], [side * 1, 3.1]], 0.26, bodyMat));
      g.add(poly([[side * 6.8, 2.8], [side * 8, 3.5], [side * 7, 5], [side * 6, 4.6]], 0.29, stripeMat));
      const elev = poly([[side * 0.8, 4.5], [side * 4.4, 6.7], [side * 3.7, 8.1], [side * 0.6, 7]], 0.18, bodyMat);
      g.add(elev);
      elevators.push(elev);

      // Articulated Delta Wing Aileron
      const aileron = createControlSurface(side * 5.6, 0, 3.8, 2.2, 0.8, 0.16, side * -0.20, 0, stripeMat);
      g.add(aileron);
      ailerons.push(aileron);
    }

    // ==========================================
    // 3. VERTICAL FINS / EMPENNAGE
    // ==========================================
    if (modelId === "vajra9") {
      // Single centerline large tail fin handled outside loop
    } else if (modelId === "a10x") {
      // H-tail: twin vertical stabilizers mounted at the tips of horizontal stabilizer
      const hfs = new T.Shape();
      hfs.moveTo(0, 0);
      hfs.lineTo(-0.8, 3.2);
      hfs.lineTo(-2.8, 0.2);
      hfs.lineTo(-2.4, -0.3);
      hfs.closePath();
      const hfg = new T.ExtrudeGeometry(hfs, { depth: 0.2, bevelEnabled: false });
      hfg.rotateY(Math.PI / 2);
      const hfin = new T.Mesh(hfg, bodyMat);
      hfin.position.set(side * 4.6, 0.2, 5.8);
      g.add(hfin);

      // Articulated H-Tail Twin Rudder
      const rud = createRudderSurface(side * 4.6, 0.35, 5.8, 2.2, 0.65, 0.14, 0, 0, stripeMat);
      g.add(rud);
      rudders.push(rud);

    } else if (modelId === "f22") {
      // 28-degree canted V-tails
      const fs = new T.Shape();
      fs.moveTo(0, 0);
      fs.lineTo(-1.1, 4.0);
      fs.lineTo(-4.2, 0.4);
      fs.lineTo(-3.2, -0.4);
      fs.closePath();
      const fg = new T.ExtrudeGeometry(fs, { depth: 0.18, bevelEnabled: false });
      fg.rotateY(Math.PI / 2);
      const fin = new T.Mesh(fg, bodyMat);
      fin.rotation.z = -side * 0.48; // Heavily canted
      fin.position.set(side * 1.5, 0.3, 4.4);
      g.add(fin);

      // Articulated Canted V-Tail Rudder
      const rud = createRudderSurface(side * 1.5, 0.4, 4.4, 2.4, 0.7, 0.14, 0, -side * 0.48, stripeMat);
      g.add(rud);
      rudders.push(rud);

    } else if (modelId === "su57") {
      // Wide-spaced outward-canted twin rudders
      const fs = new T.Shape();
      fs.moveTo(0, 0);
      fs.lineTo(-1.2, 3.8);
      fs.lineTo(-4.0, 0.4);
      fs.lineTo(-3.0, -0.4);
      fs.closePath();
      const fg = new T.ExtrudeGeometry(fs, { depth: 0.18, bevelEnabled: false });
      fg.rotateY(Math.PI / 2);
      const fin = new T.Mesh(fg, bodyMat);
      fin.rotation.z = -side * 0.35;
      fin.position.set(side * 1.8, 0.4, 4.6);
      g.add(fin);

      // Articulated Twin Rudder
      const rud = createRudderSurface(side * 1.8, 0.5, 4.6, 2.4, 0.7, 0.14, 0, -side * 0.35, stripeMat);
      g.add(rud);
      rudders.push(rud);

    } else {
      // Default X-17 twin canted fins
      const fs = new T.Shape();
      fs.moveTo(0, 0);
      fs.lineTo(-1, 3.7);
      fs.lineTo(-4, 0.3);
      fs.lineTo(-3, -0.4);
      fs.closePath();
      const fg = new T.ExtrudeGeometry(fs, { depth: 0.18, bevelEnabled: false });
      fg.rotateY(Math.PI / 2);
      const fin = new T.Mesh(fg, bodyMat);
      fin.rotation.z = -side * 0.27;
      fin.position.set(side * 1.1, 0.4, 4.2);
      g.add(fin);

      // Articulated Twin Rudder
      const rud = createRudderSurface(side * 1.1, 0.5, 4.2, 2.3, 0.7, 0.14, 0, -side * 0.27, stripeMat);
      g.add(rud);
      rudders.push(rud);
    }

    // ==========================================
    // 4. ENGINES, INTAKES & PYLONS
    // ==========================================
    if (modelId === "a10x") {
      // High-mounted Dorsal Turbofan Pods
      const pod = mesh(new T.CylinderGeometry(0.85, 0.92, 4.2, 16, 1, false), darkMat, side * 1.6, 1.6, 2.5);
      pod.rotation.x = Math.PI / 2;
      g.add(pod);

      const podFan = mesh(new T.CylinderGeometry(0.78, 0.78, 0.4, 16, 1, true), metalMat, side * 1.6, 1.6, 0.3);
      podFan.rotation.x = Math.PI / 2;
      g.add(podFan);

      const podNozzle = mesh(new T.CylinderGeometry(0.72, 0.82, 0.8, 16, 1, true), metalMat, side * 1.6, 1.6, 4.8);
      podNozzle.rotation.x = Math.PI / 2;
      g.add(podNozzle);

      // Pylon struts to fuselage
      const strut = mesh(new T.BoxGeometry(0.9, 0.2, 1.8), bodyMat, side * 0.95, 1.1, 2.5);
      strut.rotation.z = side * 0.4;
      g.add(strut);

      // Triple underwing heavy weapon pylons with launch rails
      for (let j = 0; j < 3; j++) {
        const px = side * (2.8 + j * 1.4);
        const pz = 1.0 + j * 0.2;
        const pylon = mesh(new T.BoxGeometry(0.10, 0.26, 2.2), bodyMat, px, -0.48, pz);
        g.add(pylon);
        const rail = mesh(new T.BoxGeometry(0.14, 0.08, 2.8), darkMat, px, -0.60, pz);
        g.add(rail);
        const m = mesh(new T.CylinderGeometry(0.16, 0.16, 3.2, 8), metalMat, px, -0.74, pz);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }

    } else if (modelId === "vajra9") {
      // Single engine belly air-intake with boundary layer splitter plate
      const splitter = mesh(new T.BoxGeometry(0.08, 0.75, 2.8), darkMat, side * 0.72, -0.4, -0.8);
      g.add(splitter);
      const intake = mesh(new T.BoxGeometry(0.85, 0.75, 2.8), darkMat, side * 1.1, -0.4, -0.8);
      intake.rotation.y = -side * 0.12;
      g.add(intake);

      // Underwing aerodynamic pylons with launch rails
      for (let j = 0; j < 3; j++) {
        const px = side * (2.2 + j * 1.1);
        const pz = 1.2 + j * 0.3;
        const pylon = mesh(new T.BoxGeometry(0.08, 0.20, 1.8), bodyMat, px, -0.42, pz);
        g.add(pylon);
        const rail = mesh(new T.BoxGeometry(0.12, 0.07, 2.2), darkMat, px, -0.52, pz);
        g.add(rail);
        const m = mesh(new T.CylinderGeometry(0.12, 0.12, 2.6, 6), metalMat, px, -0.64, pz);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }

    } else {
      // Twin nacelles for X-17, SU-57, F-22
      const nacelleX = modelId === "su57" ? side * 1.75 : side * 0.86;
      const engine = mesh(new T.CylinderGeometry(0.65, 0.72, 4.5, 14, 1, false), metalMat, nacelleX, -0.15, 5.5);
      engine.rotation.x = Math.PI / 2;
      g.add(engine);

      // Titanium Heat Shield Discoloration Collar ahead of nozzle
      const heatCollar = mesh(new T.CylinderGeometry(0.68, 0.70, 0.75, 14, 1, false), titaniumHeatMat, nacelleX, -0.15, 7.05);
      heatCollar.rotation.x = Math.PI / 2;
      g.add(heatCollar);

      if (modelId === "f22") {
        // Rectangular 2D Stealth Vectoring Nozzles
        const nozzle = mesh(new T.BoxGeometry(1.2, 0.75, 1.2), darkMat, nacelleX, -0.15, 7.8);
        g.add(nozzle);
      } else {
        // Round Variable Geometry Iris Nozzles
        const nozzle = mesh(new T.CylinderGeometry(0.56, 0.65, 0.8, 14, 1, true), darkMat, nacelleX, -0.15, 7.8);
        nozzle.rotation.x = Math.PI / 2;
        g.add(nozzle);
      }

      // Air Intakes with Boundary-Layer Splitter Plates
      const splitter = mesh(new T.BoxGeometry(0.08, 0.88, 2.6), darkMat, side * 1.25, -0.42, -0.5);
      g.add(splitter);
      const intake = mesh(new T.BoxGeometry(0.96, 0.9, 2.5), darkMat, side * 1.7, -0.42, -0.5);
      intake.rotation.y = -side * 0.12;
      g.add(intake);

      // Missiles on aerodynamic pylons with launch rails
      const missileCount = modelId === "su57" ? 4 : 3;
      for (let j = 0; j < missileCount; j++) {
        const px = side * (2.4 + j * 1.15);
        const pz = 1.2 + j * 0.3;
        const pylon = mesh(new T.BoxGeometry(0.08, 0.22, 1.9), bodyMat, px, -0.44, pz);
        g.add(pylon);
        const rail = mesh(new T.BoxGeometry(0.12, 0.08, 2.4), darkMat, px, -0.54, pz);
        g.add(rail);
        const m = mesh(new T.CylinderGeometry(0.12, 0.12, 2.7, 8), metalMat, px, -0.66, pz);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }
    }
  }

  // ==========================================
  // 5. CENTERLINE FIN (FOR VAJRA-9) & SINGLE ENGINE
  // ==========================================
  if (modelId === "vajra9") {
    // Single High-Aspect-Ratio Centerline Tail Fin
    const vfs = new T.Shape();
    vfs.moveTo(0, 0);
    vfs.lineTo(-1.3, 4.6);
    vfs.lineTo(-4.4, 0.4);
    vfs.lineTo(-3.6, -0.4);
    vfs.closePath();
    const vfg = new T.ExtrudeGeometry(vfs, { depth: 0.22, bevelEnabled: false });
    vfg.rotateY(Math.PI / 2);
    const vfin = new T.Mesh(vfg, bodyMat);
    vfin.position.set(0, 0.5, 4.2);
    g.add(vfin);

    // Articulated Centerline Rudder
    const rud = createRudderSurface(0, 0.7, 4.2, 2.8, 0.75, 0.16, 0, 0, stripeMat);
    g.add(rud);
    rudders.push(rud);

    // Single Central Large Turbofan Engine & Nozzle
    const engine = mesh(new T.CylinderGeometry(0.82, 0.88, 4.4, 16, 1, false), metalMat, 0, -0.1, 5.4);
    engine.rotation.x = Math.PI / 2;
    g.add(engine);

    // Titanium Heat Shield Collar on single nozzle
    const heatCollar = mesh(new T.CylinderGeometry(0.80, 0.84, 0.75, 16, 1, false), titaniumHeatMat, 0, -0.1, 7.05);
    heatCollar.rotation.x = Math.PI / 2;
    g.add(heatCollar);

    const nozzle = mesh(new T.CylinderGeometry(0.72, 0.82, 0.9, 16, 1, true), darkMat, 0, -0.1, 7.7);
    nozzle.rotation.x = Math.PI / 2;
    g.add(nozzle);
  }

  // ==========================================
  // 6. AFTERBURNER FLAMES & SUPERSONIC SHOCK DIAMONDS
  // ==========================================
  const shockDiamonds = [];
  const diamondMat = new T.MeshBasicMaterial({
    color: 0xeeffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: T.AdditiveBlending
  });

  if (modelId === "vajra9") {
    // Single Central Flame & Diamonds
    for (let i = 0; i < 2; i++) {
      const f = mesh(
        new T.ConeGeometry(i ? 0.45 : 0.72, i ? 4.2 : 5.4, 12, 1, true),
        new T.MeshBasicMaterial({ color: i ? 12773887 : 5406719, transparent: true, opacity: i ? 0.85 : 0.4, depthWrite: false, blending: T.AdditiveBlending }),
        0,
        -0.1,
        9.6
      );
      f.rotation.x = Math.PI / 2;
      g.add(f);
      flames.push(f);
    }
    for (let d = 0; d < 3; d++) {
      const dia = mesh(new T.OctahedronGeometry(0.24 - d * 0.04, 0), diamondMat, 0, -0.1, 8.4 + d * 0.9);
      dia.scale.set(0.9, 0.9, 1.4);
      g.add(dia);
      shockDiamonds.push(dia);
    }
  } else if (modelId === "a10x") {
    // Dorsal Pod Exhausts
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const f = mesh(
          new T.ConeGeometry(i ? 0.35 : 0.55, i ? 2.8 : 3.8, 12, 1, true),
          new T.MeshBasicMaterial({ color: i ? 12773887 : 5406719, transparent: true, opacity: i ? 0.75 : 0.35, depthWrite: false, blending: T.AdditiveBlending }),
          side * 1.6,
          1.6,
          6.8
        );
        f.rotation.x = Math.PI / 2;
        g.add(f);
        flames.push(f);
      }
      for (let d = 0; d < 2; d++) {
        const dia = mesh(new T.OctahedronGeometry(0.2 - d * 0.04, 0), diamondMat, side * 1.6, 1.6, 5.8 + d * 0.7);
        dia.scale.set(0.85, 0.85, 1.3);
        g.add(dia);
        shockDiamonds.push(dia);
      }
    }
  } else {
    // Twin engine flames & supersonic shock diamonds (X-17, SU-57, F-22)
    for (const side of [-1, 1]) {
      const flameX = modelId === "su57" ? side * 1.75 : side * 0.86;
      for (let i = 0; i < 2; i++) {
        const f = mesh(
          new T.ConeGeometry(i ? 0.32 : 0.55, i ? 3.5 : 4.4, 12, 1, true),
          new T.MeshBasicMaterial({ color: i ? 12773887 : 5406719, transparent: true, opacity: i ? 0.85 : 0.4, depthWrite: false, blending: T.AdditiveBlending }),
          flameX,
          -0.15,
          9.5
        );
        f.rotation.x = Math.PI / 2;
        g.add(f);
        flames.push(f);
      }
      for (let d = 0; d < 3; d++) {
        const dia = mesh(new T.OctahedronGeometry(0.22 - d * 0.035, 0), diamondMat, flameX, -0.15, 8.4 + d * 0.85);
        dia.scale.set(0.85, 0.85, 1.4);
        g.add(dia);
        shockDiamonds.push(dia);
      }
    }
  }

  // Dynamic Afterburner Exhaust Point Light
  const exhaustLight = new T.PointLight(0x5599ff, 0, 32);
  exhaustLight.position.set(0, 0, 9.2);
  g.add(exhaustLight);

  // High-G Wing Condensation Vapor Sheet
  const wingSpan = JET_MODELS[modelId]?.geometry?.wingSpan || 16;
  const wingVaporMat = new T.MeshBasicMaterial({
    color: 0xa6c6d1,
    transparent: true,
    opacity: 0,
    side: T.DoubleSide,
    depthWrite: false
  });
  const wingVapor = mesh(
    new T.PlaneGeometry(wingSpan * 0.72, 4.6, 6, 2),
    wingVaporMat,
    0,
    0.38,
    1.2
  );
  wingVapor.rotation.x = Math.PI / 2;
  g.add(wingVapor);

  // Transonic Mach 1 Aerodynamic Vapor Cone
  const vaporGeo = new T.ConeGeometry(5.6, 4.2, 18, 1, true);
  vaporGeo.rotateX(-Math.PI / 2);
  const vaporCone = mesh(
    vaporGeo,
    new T.MeshBasicMaterial({
      color: 0xb1cbd4,
      transparent: true,
      opacity: 0,
      side: T.DoubleSide,
      depthWrite: false
    }),
    0,
    0.1,
    1.6
  );
  g.add(vaporCone);

  // Dynamic Muzzle Flash Point Light
  const muzzleLight = new T.PointLight(0xffb844, 0, 45);
  muzzleLight.position.set(0, -0.4, -9.5);
  g.add(muzzleLight);

  // Retractable Tricycle Landing Gear (Nose gear + Dual Main gear)
  const gearGroup = new T.Group();
  gearGroup.name = "landing_gear";
  const strutMat = new T.MeshStandardMaterial({ color: 0x4a525a, metalness: 0.85, roughness: 0.3 });
  const wheelMat = new T.MeshStandardMaterial({ color: 0x181818, roughness: 0.9 });

  // 1. Nose landing gear with taxi floodlight
  const noseStrut = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.2, 6), strutMat);
  noseStrut.position.set(0, -0.9, -5.2);
  const noseWheel = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.25, 8), wheelMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.45, -5.2);
  const taxiLight = new T.SpotLight(0xfff6dd, 2.5, 80, Math.PI / 6, 0.45);
  taxiLight.position.set(0, -1.0, -5.4);
  taxiLight.target.position.set(0, -2.5, -45);
  gearGroup.add(noseStrut, noseWheel, taxiLight, taxiLight.target);

  // 2. Left main gear
  const leftStrut = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.3, 6), strutMat);
  leftStrut.position.set(-1.8, -0.95, 1.2);
  const leftWheel = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.3, 8), wheelMat);
  leftWheel.rotation.z = Math.PI / 2;
  leftWheel.position.set(-1.8, -1.55, 1.2);
  gearGroup.add(leftStrut, leftWheel);

  // 3. Right main gear
  const rightStrut = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 1.3, 6), strutMat);
  rightStrut.position.set(1.8, -0.95, 1.2);
  const rightWheel = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.3, 8), wheelMat);
  rightWheel.rotation.z = Math.PI / 2;
  rightWheel.position.set(1.8, -1.55, 1.2);
  gearGroup.add(rightStrut, rightWheel);

  g.add(gearGroup);

  // Navigation & Formation Strobe Lights
  const span = JET_MODELS[modelId]?.geometry?.wingSpan || 16;
  const halfSpan = span * 0.48;
  const navPort = mesh(new T.SphereGeometry(0.15, 6, 6), new T.MeshBasicMaterial({ color: 0xff1818 }), -halfSpan, 0, 3.2);
  const navStbd = mesh(new T.SphereGeometry(0.15, 6, 6), new T.MeshBasicMaterial({ color: 0x18ff38 }), halfSpan, 0, 3.2);
  const strobeMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
  const navTail = mesh(new T.SphereGeometry(0.18, 6, 6), strobeMat, 0, 3.8, 8.2);
  g.add(navPort, navStbd, navTail);
  const navLights = { port: navPort, stbd: navStbd, strobe: navTail };

  // Articulated Dorsal Air Brake Flap
  const airBrakeGeo = new T.BoxGeometry(modelId === "su57" ? 1.4 : 0.9, 0.12, 2.2);
  const airBrakeMesh = new T.Mesh(airBrakeGeo, bodyMat);
  airBrakeMesh.position.set(0, 0.95, 0.8);
  g.add(airBrakeMesh);

  const detailGroup=new T.Group();detailGroup.name='airframe_detail';
  if(modelId==='x17'){
    // Original procedural service panels, fasteners and intake lips.
    for(const side of [-1,1]){
      const lip=mesh(new T.BoxGeometry(.12,.55,2.4),metalMat,side*1.38,-.28,-2.0);detailGroup.add(lip);
      for(let i=0;i<6;i++){const vent=mesh(new T.BoxGeometry(.38,.035,.075),darkMat,side*.73,.72,.2+i*.22);detailGroup.add(vent);}
      const panel=mesh(new T.BoxGeometry(.8,.025,1.2),darkMat,side*2.4,.27,2.3);detailGroup.add(panel);
    }
    const antenna=mesh(new T.BoxGeometry(.065,.35,.5),darkMat,0,1.04,2.3);detailGroup.add(antenna);
    // Deep intake faces, segmented titanium exhaust collars and understated markings.
    const black=new T.MeshStandardMaterial({color:0x060b11,roughness:.92});
    const mark=new T.MeshStandardMaterial({color:0xaec2ca,roughness:.6,metalness:.1});
    for(const side of [-1,1]){
      const intake=mesh(new T.BoxGeometry(.68,.58,.06),black,side*1.2,-.3,-3.24);detailGroup.add(intake);
      const splitter=mesh(new T.BoxGeometry(.065,.57,.8),metalMat,side*1.03,-.28,-2.95);detailGroup.add(splitter);
      const collar=mesh(new T.CylinderGeometry(.61,.54,.95,16,1,true),titaniumHeatMat,side*.86,-.15,7.7);collar.rotation.x=Math.PI/2;detailGroup.add(collar);
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        const petal=mesh(new T.BoxGeometry(.15,.06,.56),metalMat,side*.86+Math.cos(a)*.57,-.15+Math.sin(a)*.57,8.05);petal.rotation.z=a;detailGroup.add(petal);
      }
      const marking=mesh(new T.BoxGeometry(.95,.015,.12),mark,side*3.6,.1,1.85);marking.rotation.y=side*.2;detailGroup.add(marking);
      for(let i=0;i<3;i++){const tick=mesh(new T.BoxGeometry(.12,.018,.48),mark,side*(3.22+i*.23),.12,2.25);detailGroup.add(tick);}
      const door=mesh(new T.BoxGeometry(.55,.04,1.3),bodyMat,side*1.83,-.6,1.22);gearGroup.add(door);
      const link=mesh(new T.BoxGeometry(.06,.7,.08),metalMat,side*1.8,-1.04,1.42);link.rotation.x=.34;gearGroup.add(link);
    }

  }
  batchAircraftDetails(detailGroup);
  g.add(detailGroup);
  const anchors={};for(const [name,position] of Object.entries({wingtip_left:[-(modelDef.geometry.wingSpan || 16)/2,0,3.5],wingtip_right:[(modelDef.geometry.wingSpan || 16)/2,0,3.5],exhaust:[0,0,6],cannon:[0,-.4,-9.5],camera_eye:[0,1.36,-3.95]})){
    const anchor=new T.Object3D();anchor.name=name;anchor.position.fromArray(position);g.add(anchor);anchors[name]=anchor;
  }
  const exteriorGroup=new T.Group();exteriorGroup.name='airframe_exterior';
  for(const child of [...g.children])if(child!==cockpitGroup&&!Object.values(anchors).includes(child))exteriorGroup.add(child);
  g.add(exteriorGroup);
  const lod=modelId==='x17'?buildAircraftLOD(exteriorGroup,bodyMat,modelDef.geometry.wingSpan||16):null;
  if(lod)g.add(lod.middle,lod.far);
  g.userData = { cockpit,cockpitGroup,exteriorGroup,lod,detailGroup,anchors,flames, elevators, canards, ailerons, rudders, vaporCone, muzzleLight, gearGroup, modelId, liveryId, shockDiamonds, exhaustLight, wingVapor, wingVaporMat, navLights, airBrakeMesh };
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (bomber) g.scale.set(1.85, 1.3, 1.55);
  return g;
}

export function disposeJetModel(model){disposeObject(model,new Set([_panelTexture]));}

let counter = 0;
export class Jet {
  constructor(team = "enemy", bomber = false, config = null) {
    this.id = ++counter;
    this.team = team;
    this.bomber = bomber;
    this.modelId = config?.modelId || "x17";
    this.liveryId = config?.liveryId || "grey";
    this.modifications = config?.modifications || { ...DEFAULT_PLAYER_CONFIG.modifications };

    this.stats = computeJetStats(this.modelId, this.modifications);
    this.model = createJet(team, bomber, this.modelId, this.liveryId, this.modifications);
    this.position = this.model.position.clone();
    this.quaternion = this.model.quaternion.clone();
    this.previousPosition = this.position.clone(); this.previousQuaternion = this.quaternion.clone();
    this.renderPosition = this.position.clone(); this.renderQuaternion = this.quaternion.clone();
    this.velocity = new T.Vector3();
    this.angular = new T.Vector3();

    this.speed = 235;
    this.throttle = 0.58;
    this.hp = bomber ? 160 : this.stats.maxHp;
    this.maxHp = this.hp;
    this.alive = true;
    this.deadTime = 0;
    this.fireTimer = 0;
    this.missileTimer = 8 + Math.random() * 9;
    this.evadeTimer = 0;
    this.aiPhase = Math.random() * 6.28;
    this.aiState = "patrol";
    this.flares = 3;
    this.radius = bomber ? 22 : 12;
    this._wingLeft = new T.Vector3();
    this._wingRight = new T.Vector3();
    this._wingTips = {left:this._wingLeft,right:this._wingRight};
    this._exhaust = new T.Vector3();

    // Landing Gear & Touchdown State
    this.gearDown = true;this.gearProgress=1;
    this.isLanded = false;
    this.landedElev = 38;
    this.currentBase = null;
    if(FLAGSHIP_ASSET && this.modelId==='x17' && !this.bomber)void this.loadVisual(FLAGSHIP_ASSET);
  }

  beginStep() { this.previousPosition.copy(this.position); this.previousQuaternion.copy(this.quaternion); }
  resetInterpolation() {
    this.previousPosition.copy(this.position); this.previousQuaternion.copy(this.quaternion);
    this.renderPosition.copy(this.position); this.renderQuaternion.copy(this.quaternion);
    this.model.position.copy(this.position); this.model.quaternion.copy(this.quaternion);
  }
  renderInterpolated(alpha = 1) {
    if (this.previousPosition.distanceToSquared(this.position) > 250000) this.resetInterpolation();
    this.renderPosition.lerpVectors(this.previousPosition,this.position,alpha);
    this.renderQuaternion.copy(this.previousQuaternion).slerp(this.quaternion,alpha);
    this.model.position.copy(this.renderPosition); this.model.quaternion.copy(this.renderQuaternion);
  }

  toggleGear() {
    if (this.isLanded) { this.setGear(true); return true; }
    this.gearDown = !this.gearDown;
    if(this.gearDown && this.model.userData.gearGroup)this.model.userData.gearGroup.visible=true;
    return this.gearDown;
  }

  setGear(down) {
    this.gearDown = Boolean(down);this.gearProgress=this.gearDown?1:0;this.lastGearTime=null;
    this.updateGearVisual();
  }

  updateGearVisual() {
    const gear=this.model?.userData?.gearGroup;if(!gear)return;
    const rest=gear.userData.skybreakGearRest ||= {position:gear.position.clone(),scale:gear.scale.clone()};
    gear.visible=this.gearProgress>.01;
    gear.scale.copy(rest.scale);gear.scale.y*=Math.max(.01,this.gearProgress);
    gear.position.copy(rest.position);gear.position.y+=(1-this.gearProgress)*.4;
  }

  async loadVisual(asset){
    const generation=this.assetGeneration=(this.assetGeneration || 0)+1;
    try{const visual=await loadJetAsset(asset);if(this.disposed || generation!==this.assetGeneration){disposeObject(visual);return false;}
      const parent=this.model.parent;disposeObject(this.model,new Set([_panelTexture]));this.model=visual;parent?.add(visual);this.updateGearVisual();this.resetInterpolation();this.assetError=null;return true;
    }catch(error){this.assetError=error.message;return false;}
  }
  updateVisualLOD(distance){
    const u=this.model.userData,previous=u.lod?.level||'near';
    const level=previous==='far'?(distance<2000?'mid':'far'):previous==='mid'?(distance>2500?'far':distance<600?'near':'mid'):(distance>800?'mid':'near');
    if(u.lod){u.lod.level=level;u.lod.middle.visible=!this.cockpitView&&level==='mid';u.lod.far.visible=!this.cockpitView&&level==='far';}
    if(u.exteriorGroup)u.exteriorGroup.visible=!this.cockpitView&&(!u.lod||level==='near');
    if(u.detailGroup)u.detailGroup.visible=distance<400;
    if(u.cockpitGroup)u.cockpitGroup.visible=this.cockpitView||distance<90;
  }
  setCockpitView(enabled){
    this.cockpitView=!!enabled;const u=this.model.userData;
    this.model.visible=this.alive!==false;
    if(u.exteriorGroup)u.exteriorGroup.visible=!enabled&&(!u.lod||u.lod.level==='near');
    if(u.cockpitGroup)u.cockpitGroup.visible=!!enabled;
    if(u.lod){u.lod.middle.visible=!enabled&&u.lod.level==='mid';u.lod.far.visible=!enabled&&u.lod.level==='far';}
  }
  getCockpitPose(){return this.model.userData.cockpit?.pose;}
  updateCockpit(extra={},now=0){return this.model.userData.cockpit?.update(this,extra,now);}
  setVisualEffects({intensity=1,reducedMotion=false}={}){this.visualIntensity=Math.max(0,Math.min(1,intensity));this.reducedMotion=!!reducedMotion;}

  dispose(){this.disposed=true;this.assetGeneration=(this.assetGeneration || 0)+1;disposeObject(this.model,new Set([_panelTexture]));}
  get forward() {
    return forward(this.quaternion);
  }

  get turnRateMultiplier() {
    return this.stats?.turnMult || 1;
  }

  get speedMultiplier() {
    return this.stats?.speedMult || 1;
  }

  get boostMultiplier() {
    return this.stats?.boostMult || 1;
  }

  getWingTips() {
    const span = (JET_MODELS[this.modelId]?.geometry?.wingSpan || 16) / 2;
    this.getAttachmentPoint('wingtip_left',this._wingLeft.set(-span,0,3.5));
    this.getAttachmentPoint('wingtip_right',this._wingRight.set(span,0,3.5));
    return this._wingTips;
  }

  getAttachmentPoint(name,target) {
    const anchor=this.model.userData.anchors?.[name];
    if(anchor){
      target.set(0,0,0);
      for(let node=anchor;node && node!==this.model;node=node.parent){node.updateMatrix();target.applyMatrix4(node.matrix);}
    }
    return target.multiply(this.model.scale).applyQuaternion(this.quaternion).add(this.position);
  }

  getExhaustPosition() {
    return this.getAttachmentPoint('exhaust',this._exhaust.set(0,0,6));
  }

  applyCustomization(config) {
    if (!config) return;
    this.modelId = config.modelId || this.modelId;
    this.liveryId = config.liveryId || this.liveryId;
    this.modifications = { ...this.modifications, ...(config.modifications || {}) };
    this.stats = computeJetStats(this.modelId, this.modifications);

    const oldPos = this.position.clone();
    const oldQuat = this.quaternion.clone();
    const parent = this.model.parent;

    this.assetGeneration=(this.assetGeneration || 0)+1;
    disposeObject(this.model,new Set([_panelTexture]));

    // Build new 3D model
    this.model = createJet(this.team, this.bomber, this.modelId, this.liveryId, this.modifications);
    this.model.position.copy(oldPos);
    this.model.quaternion.copy(oldQuat);
    this.position = this.model.position.clone();
    this.quaternion = this.model.quaternion.clone();
    this.previousPosition = this.position.clone(); this.previousQuaternion = this.quaternion.clone();
    this.renderPosition = this.position.clone(); this.renderQuaternion = this.quaternion.clone();

    if (parent) parent.add(this.model);

    this.updateGearVisual();
    if(FLAGSHIP_ASSET && this.modelId==='x17' && !this.bomber)void this.loadVisual(FLAGSHIP_ASSET);

    this.maxHp = this.bomber ? 160 : this.stats.maxHp;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  animate(t, boost = false, pitch = 0, roll = 0, speed = 245, firing = false, yaw = 0, airBrake = false) {
    const u = this.model.userData;
    if (!u) return;
    const effectIntensity=this.visualIntensity??1, motionPulse=this.reducedMotion?0:1;

    if (u.flames) {
      u.flames.forEach((f, i) => {
        const isInnerCore = i % 2 !== 0;
        if (boost) {
          f.scale.set(1, 1.85 + Math.sin(t * 60 + i) * 0.12 * motionPulse, 1);
          // Inner core = incandescent cyan-white plasma; Outer sheath = supersonic amber-orange
          f.material.color.setHex(isInnerCore ? 0x99ddff : 0xff7711);
          f.material.opacity = (isInnerCore ? 0.85 : 0.5)*effectIntensity;
        } else {
          const th = this.throttle ?? 0.58;
          f.scale.set(1, 0.6 + th * 0.8, 1);
          f.material.color.setHex(isInnerCore ? 0x55aaff : 0x2266cc);
          f.material.opacity = (.06 + th * .32)*effectIntensity;
        }
      });
    }

    if (u.airBrakeMesh) {
      const targetAngle = (airBrake || this.airBrake) ? -1.15 : 0;
      u.airBrakeMesh.rotation.x += (targetAngle - u.airBrakeMesh.rotation.x) * 0.25;
    }

    if (u.navLights?.strobe) {
      const isStrobeOn = this.reducedMotion?.55:(Math.sin(t * 7.5) > 0.65) ? .9 : .15;
      u.navLights.strobe.material.opacity = isStrobeOn;
    }

    if (u.shockDiamonds) {
      const showDiamonds = boost || this.throttle > 0.82;
      const diaOpacity = boost ? 0.88 + Math.sin(t * 60) * 0.12 : this.throttle > 0.82 ? 0.5 : 0;
      u.shockDiamonds.forEach((dia, i) => {
        dia.material.opacity = diaOpacity*effectIntensity;
        if (showDiamonds) {
          const pulse = 1.0 + Math.sin(t * 45 + i * 1.5) * 0.12;
          dia.scale.set(0.88 * pulse, 0.88 * pulse, 1.45 * pulse);
        }
      });
    }

    if (u.exhaustLight) {
      if (boost) {
        u.exhaustLight.intensity = (2.4 + Math.sin(t * 40) * 0.25*motionPulse)*effectIntensity;
        u.exhaustLight.color.setHex(0x5599ff);
      } else if (this.throttle > 0.7) {
        u.exhaustLight.intensity = (this.throttle - 0.7) * 3.2*effectIntensity;
        u.exhaustLight.color.setHex(0xffaa44);
      } else {
        u.exhaustLight.intensity = 0;
      }
    }

    // High-G Wing Condensation Vapor Sheet
    if (u.wingVaporMat) {
      const gPull = Math.abs(pitch);
      const isHighG = (gPull > 0.32 || Math.abs(roll) > 0.5) && speed > 130;
      if (isHighG) {
        const vaporIntensity = Math.min(0.65, (gPull - 0.32) * 1.8 + Math.abs(roll) * 0.22);
        u.wingVaporMat.opacity = vaporIntensity * (0.85 + Math.sin(t * 26) * 0.15*motionPulse)*effectIntensity;
      } else {
        u.wingVaporMat.opacity = 0;
      }
    }

    // Articulated Ailerons (Roll bank & high-lift flap droop)
    if (u.ailerons) {
      u.ailerons.forEach((a, i) => {
        // i=0 is left wing (side -1), i=1 is right wing (side +1)
        // Rolling right (+roll): right aileron pivots up (-x), left aileron pivots down (+x)
        const rollDeflection = (i === 0 ? 1 : -1) * roll * 0.65;
        const pitchDroop = Math.max(-0.25, Math.min(0.25, -pitch * 0.22));
        a.rotation.x = rollDeflection + pitchDroop;
      });
    }

    // Articulated Vertical Rudders (Yaw pedal & coordinated banking)
    if (u.rudders) {
      u.rudders.forEach((r) => {
        // Yaw deflection around local Y hinge line
        r.rotation.y = -yaw * 0.68 + roll * 0.12;
      });
    }

    // All-Moving Tail Elevators / Stabilators
    if (u.elevators) {
      u.elevators.forEach((e, i) => {
        e.rotation.x = pitch * 0.58 + roll * (i ? 1 : -1) * 0.28;
      });
    }

    // Active Foreplane Canards
    if (u.canards) {
      u.canards.forEach((c, i) => {
        c.rotation.x = -pitch * 0.62 + roll * (i ? 1 : -1) * 0.25;
      });
    }

    // Supersonic Transonic Vapor Cone (Prandtl-Glauert Singularity)
    if (u.vaporCone) {
      const kmh = speed * 3.6;
      if (kmh > 980) {
        const machDist = Math.abs(kmh - 1200);
        const machPeak = Math.max(0, 1.0 - machDist / 260);
        const pulse = 0.88 + Math.sin(t * 38) * 0.12;
        const opacity = (machPeak * 0.75 + Math.max(0, (kmh - 1200) / 800) * 0.25) * pulse;
        u.vaporCone.material.opacity = Math.min(0.48, opacity)*effectIntensity;
        const coneScale = 1.0 + machPeak * 0.35 + Math.sin(t * 30) * 0.05;
        u.vaporCone.scale.set(coneScale, coneScale, 1.0 + Math.min(0.8, (kmh - 980) / 1200));
      } else {
        u.vaporCone.material.opacity = 0;
      }
    }

    if (u.gearGroup) {
      const dt=Math.min(.1,Math.max(0,t-(this.lastGearTime ?? t-1/60)));this.lastGearTime=t;
      this.gearProgress=T.MathUtils.damp(this.gearProgress,this.gearDown?1:0,5,dt);
      this.updateGearVisual();
    }

    if (u.muzzleLight) {
      u.muzzleLight.intensity = firing && !this.reducedMotion ? (Math.random() > 0.3 ? 3.5 : 1.2)*effectIntensity : 0;
    }
  }
}
