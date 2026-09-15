import * as T from "three";
import { forward } from "./math.js";
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

export function createJet(team = "player", bomber = false, modelId = "x17", liveryId = "grey", mods = {}) {
  const g = new T.Group();
  const modelDef = JET_MODELS[modelId] || JET_MODELS.x17;
  const livery = LIVERIES[liveryId] || LIVERIES.grey;

  // Materials
  let bodyMat, darkMat, stripeMat, metalMat, glassMat;
  if (team === "enemy") {
    bodyMat = new T.MeshStandardMaterial({ color: 0x5a6358, metalness: 0.65, roughness: 0.45 });
    darkMat = new T.MeshStandardMaterial({ color: 0x1c211b, metalness: 0.75, roughness: 0.4 });
    stripeMat = new T.MeshStandardMaterial({ color: 0xd93838, metalness: 0.4, roughness: 0.35 });
    metalMat = new T.MeshStandardMaterial({ color: 0x6e736c, metalness: 0.85, roughness: 0.28 });
    glassMat = new T.MeshStandardMaterial({ color: 0xc87070, metalness: 0.82, roughness: 0.12 });
  } else if (team === "ally") {
    bodyMat = new T.MeshStandardMaterial({ color: 0x586b7c, metalness: 0.70, roughness: 0.40 });
    darkMat = new T.MeshStandardMaterial({ color: 0x17212b, metalness: 0.78, roughness: 0.35 });
    stripeMat = new T.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.38, roughness: 0.38 });
    metalMat = new T.MeshStandardMaterial({ color: 0x768594, metalness: 0.85, roughness: 0.28 });
    glassMat = new T.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.82, roughness: 0.12 });
  } else {
    bodyMat = new T.MeshStandardMaterial({ color: livery.bodyColor, metalness: livery.metalness, roughness: livery.roughness });
    darkMat = new T.MeshStandardMaterial({ color: livery.darkColor, metalness: Math.min(1, livery.metalness + 0.08), roughness: livery.roughness * 0.85 });
    stripeMat = new T.MeshStandardMaterial({ color: livery.stripeColor, metalness: 0.42, roughness: 0.36 });
    metalMat = new T.MeshStandardMaterial({ color: livery.metalColor || 0x76808f, metalness: 0.88, roughness: 0.25 });
    glassMat = new T.MeshStandardMaterial({ color: livery.glassColor || 0x98b4cc, metalness: 0.85, roughness: 0.10 });
  }

  const elevators = [];
  const canards = [];
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

    } else if (modelId === "f22") {
      // Diamond Stealth Wings
      g.add(poly([[side * 0.9, -3.5], [side * 7.6, 2.5], [side * 6.2, 5.2], [side * 1.0, 3.2]], 0.24, bodyMat));
      g.add(poly([[side * 6.0, 2.0], [side * 7.6, 2.5], [side * 6.2, 5.2], [side * 5.0, 4.6]], 0.26, stripeMat));

      // Trapezoidal All-Moving Elevators
      const elev = poly([[side * 0.9, 4.8], [side * 4.6, 6.8], [side * 3.6, 8.4], [side * 0.7, 7.2]], 0.18, bodyMat);
      g.add(elev);
      elevators.push(elev);

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

    } else if (modelId === "a10x") {
      // Straight High-Lift Heavy Wings
      g.add(poly([[side * 0.9, -1.2], [side * 9.8, -0.6], [side * 9.5, 2.6], [side * 0.9, 2.4]], 0.34, bodyMat));
      g.add(poly([[side * 8.4, -0.6], [side * 9.8, -0.6], [side * 9.5, 2.6], [side * 8.2, 2.6]], 0.36, stripeMat));

      // Horizontal Tailplane
      const elev = poly([[side * 0.6, 5.6], [side * 4.8, 5.6], [side * 4.8, 7.6], [side * 0.6, 7.6]], 0.22, bodyMat);
      g.add(elev);
      elevators.push(elev);

    } else {
      // Default X-17 Delta
      g.add(poly([[side * 0.8, -3], [side * 8, 3.5], [side * 7, 5], [side * 1, 3.1]], 0.26, bodyMat));
      g.add(poly([[side * 6.8, 2.8], [side * 8, 3.5], [side * 7, 5], [side * 6, 4.6]], 0.29, stripeMat));
      const elev = poly([[side * 0.8, 4.5], [side * 4.4, 6.7], [side * 3.7, 8.1], [side * 0.6, 7]], 0.18, bodyMat);
      g.add(elev);
      elevators.push(elev);
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

      // Triple underwing heavy weapon racks
      for (let j = 0; j < 3; j++) {
        const m = mesh(new T.CylinderGeometry(0.16, 0.16, 3.2, 8), metalMat, side * (2.8 + j * 1.4), -0.7, 1.0 + j * 0.2);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }

    } else if (modelId === "vajra9") {
      // Single engine belly air-intake & side pylons
      const intake = mesh(new T.BoxGeometry(0.85, 0.75, 2.8), darkMat, side * 1.1, -0.4, -0.8);
      intake.rotation.y = -side * 0.12;
      g.add(intake);

      // Underwing missile racks
      for (let j = 0; j < 3; j++) {
        const m = mesh(new T.CylinderGeometry(0.12, 0.12, 2.6, 6), metalMat, side * (2.2 + j * 1.1), -0.6, 1.2 + j * 0.3);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      }

    } else {
      // Twin nacelles for X-17, SU-57, F-22
      const nacelleX = modelId === "su57" ? side * 1.75 : side * 0.86;
      const engine = mesh(new T.CylinderGeometry(0.65, 0.72, 4.5, 14, 1, false), metalMat, nacelleX, -0.15, 5.5);
      engine.rotation.x = Math.PI / 2;
      g.add(engine);

      if (modelId === "f22") {
        // Rectangular 2D Stealth Vectoring Nozzles
        const nozzle = mesh(new T.BoxGeometry(1.2, 0.75, 1.2), darkMat, nacelleX, -0.15, 7.8);
        g.add(nozzle);
      } else {
        // Round Nozzles
        const nozzle = mesh(new T.CylinderGeometry(0.56, 0.65, 0.8, 14, 1, true), darkMat, nacelleX, -0.15, 7.8);
        nozzle.rotation.x = Math.PI / 2;
        g.add(nozzle);
      }

      // Air Intakes
      const intake = mesh(new T.BoxGeometry(0.96, 0.9, 2.5), darkMat, side * 1.7, -0.42, -0.5);
      intake.rotation.y = -side * 0.12;
      g.add(intake);

      // Missiles on pylons
      const missileCount = modelId === "su57" ? 4 : 3;
      for (let j = 0; j < missileCount; j++) {
        const m = mesh(new T.CylinderGeometry(0.12, 0.12, 2.7, 6), metalMat, side * (2.4 + j * 1.15), -0.65, 1.2 + j * 0.3);
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

    // Single Central Large Turbofan Engine & Nozzle
    const engine = mesh(new T.CylinderGeometry(0.82, 0.88, 4.4, 16, 1, false), metalMat, 0, -0.1, 5.4);
    engine.rotation.x = Math.PI / 2;
    g.add(engine);

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
    color: 0xf2f8ff,
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
      color: 0xffffff,
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

  // 1. Nose landing gear
  const noseStrut = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.2, 6), strutMat);
  noseStrut.position.set(0, -0.9, -5.2);
  const noseWheel = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.25, 8), wheelMat);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.45, -5.2);
  gearGroup.add(noseStrut, noseWheel);

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

  g.userData = { flames, elevators, canards, vaporCone, muzzleLight, gearGroup, modelId, liveryId, shockDiamonds, exhaustLight, wingVapor, wingVaporMat };
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (bomber) g.scale.set(1.85, 1.3, 1.55);
  return g;
}

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
    this.position = this.model.position;
    this.quaternion = this.model.quaternion;
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

    // Landing Gear & Touchdown State
    this.gearDown = true;
    this.isLanded = false;
    this.landedElev = 38;
    this.currentBase = null;
  }

  toggleGear() {
    if (this.isLanded) return this.gearDown;
    this.gearDown = !this.gearDown;
    if (this.model?.userData?.gearGroup) {
      this.model.userData.gearGroup.visible = this.gearDown;
    }
    return this.gearDown;
  }

  setGear(down) {
    this.gearDown = Boolean(down);
    if (this.model?.userData?.gearGroup) {
      this.model.userData.gearGroup.visible = this.gearDown;
    }
  }

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
    this._wingLeft.set(-span, 0, 3.5).applyQuaternion(this.quaternion).add(this.position);
    this._wingRight.set(span, 0, 3.5).applyQuaternion(this.quaternion).add(this.position);
    return { left: this._wingLeft, right: this._wingRight };
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

    // Dispose old mesh geometry/materials
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
        else o.material?.dispose?.();
      }
    });

    if (parent) parent.remove(this.model);

    // Build new 3D model
    this.model = createJet(this.team, this.bomber, this.modelId, this.liveryId, this.modifications);
    this.model.position.copy(oldPos);
    this.model.quaternion.copy(oldQuat);
    this.position = this.model.position;
    this.quaternion = this.model.quaternion;

    if (parent) parent.add(this.model);

    this.maxHp = this.bomber ? 160 : this.stats.maxHp;
    this.hp = Math.min(this.hp, this.maxHp);
  }

  animate(t, boost = false, pitch = 0, roll = 0, speed = 245, firing = false) {
    const u = this.model.userData;
    if (!u) return;

    if (u.flames) {
      u.flames.forEach((f, i) => {
        f.visible = !(this.isLanded && this.throttle < .05);
        f.scale.set(1, boost ? 1.6 + Math.sin(t * 58 + i) * 0.2 : 0.72 + this.throttle * 0.7, 1);
        f.material.color.setHex(boost ? (i % 2 ? 11526143 : 16740908) : i % 2 ? 12775167 : 6458367);
      });
    }

    if (u.shockDiamonds) {
      const showDiamonds = boost || this.throttle > 0.82;
      const diaOpacity = boost ? 0.85 + Math.sin(t * 60) * 0.15 : this.throttle > 0.82 ? 0.45 : 0;
      u.shockDiamonds.forEach((dia, i) => {
        dia.material.opacity = diaOpacity;
        if (showDiamonds) {
          const pulse = 1.0 + Math.sin(t * 45 + i * 1.5) * 0.12;
          dia.scale.set(0.85 * pulse, 0.85 * pulse, 1.4 * pulse);
        }
      });
    }

    if (u.exhaustLight) {
      if (boost) {
        u.exhaustLight.intensity = 3.2 + Math.sin(t * 40) * 0.5;
        u.exhaustLight.color.setHex(0x5599ff);
      } else if (this.throttle > 0.7) {
        u.exhaustLight.intensity = (this.throttle - 0.7) * 3.0;
        u.exhaustLight.color.setHex(0xffaa44);
      } else {
        u.exhaustLight.intensity = 0;
      }
    }

    if (u.wingVaporMat) {
      const gPull = Math.abs(pitch);
      const isHighG = gPull > 0.38 && speed > 150;
      if (isHighG) {
        const vaporIntensity = Math.min(0.52, (gPull - 0.38) * 1.6 + Math.abs(roll) * 0.15);
        u.wingVaporMat.opacity = vaporIntensity * (0.85 + Math.sin(t * 24) * 0.15);
      } else {
        u.wingVaporMat.opacity = 0;
      }
    }

    if (u.elevators) {
      u.elevators.forEach((e, i) => {
        e.rotation.x = pitch * 0.17 + roll * (i ? 1 : -1) * 0.14;
      });
    }

    if (u.canards) {
      u.canards.forEach((c, i) => {
        c.rotation.x = -pitch * 0.22 + roll * (i ? 1 : -1) * 0.12;
      });
    }

    if (u.vaporCone) {
      const kmh = speed * 3.6;
      if (kmh > 1080) {
        const intensity = Math.min(0.72, (kmh - 1080) / 380) * (0.85 + Math.sin(t * 35) * 0.15);
        u.vaporCone.material.opacity = intensity;
      } else {
        u.vaporCone.material.opacity = 0;
      }
    }

    if (u.gearGroup) {
      u.gearGroup.visible = Boolean(this.gearDown);
    }

    if (u.muzzleLight) {
      u.muzzleLight.intensity = firing ? (Math.random() > 0.3 ? 4.5 : 1.5) : 0;
    }
  }
}
