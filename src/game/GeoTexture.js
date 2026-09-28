import * as T from "three";
import { CITIES, INTERNATIONAL_BORDERS, IAF_BASES } from "./GeoWorld.js";

/**
 * Generates a high-resolution (2048x2048) satellite map texture for 3D terrain.
 * Referenced from real Earth satellite geography:
 * - Himalayan glaciers & Karakoram snow in the north
 * - Indus Basin (Indus, Jhelum, Chenab, Ravi, Sutlej) & Ganga-Yamuna river systems
 * - Narmada, Tapi & Sabarmati rivers flowing into Gulf of Khambhat
 * - Great Thar & Cholistan desert sand dune fields
 * - Rann of Kutch white salt marsh flats
 * - Arabian Sea coastlines & turquoise coastal shallows
 * - Major highway networks & 62 surveyed city footprints with night lights
 * - Military airfield runway tarmac surfaces and threshold markings
 */
function createGeoTexture(width = 2048, height = 2048) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // World coordinates mapping: minX = -85000, maxX = 45000, minZ = -75000, maxZ = 55000
  const minX = -85000, maxX = 45000, minZ = -75000, maxZ = 55000;
  const toX = (wx) => ((wx - minX) / (maxX - minX)) * width;
  const toY = (wz) => ((wz - minZ) / (maxZ - minZ)) * height;

  // 1. Base Geographic Biome Gradients (High Contrast, Vivid Natural Tones)
  const baseGrad = ctx.createLinearGradient(0, 0, width, height);
  baseGrad.addColorStop(0, "#364e3a");    // Himalayan pine foothills
  baseGrad.addColorStop(0.24, "#486e39"); // Punjab & Haryana agricultural green
  baseGrad.addColorStop(0.48, "#dfb568"); // Thar & Sindh golden desert
  baseGrad.addColorStop(0.78, "#af8e5c"); // Semi-arid scrubland
  baseGrad.addColorStop(1, "#18424e");    // Coastal shallows
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Himalayan Snow Peaks, Glaciers & Rocky Moraines (Far North)
  const mountainGrad = ctx.createLinearGradient(0, 0, 0, height * 0.28);
  mountainGrad.addColorStop(0, "rgba(255, 255, 255, 0.98)");   // Brilliant alpine snowpack
  mountainGrad.addColorStop(0.38, "rgba(215, 235, 255, 0.90)"); // Glacial ice blue
  mountainGrad.addColorStop(0.70, "rgba(70, 80, 92, 0.78)");    // Sharp granite rock ridges
  mountainGrad.addColorStop(1, "rgba(54, 78, 58, 0)");           // Pine tree line fade
  ctx.fillStyle = mountainGrad;
  ctx.fillRect(0, 0, width, height * 0.28);

  // Glacial striations & craggy ridge textures in the Himalayas
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.lineWidth = 4;
  for (let i = 0; i < 45; i++) {
    const rx = toX(-25000 + (i * 1700) % 70000);
    const ry = toY(-75000 + (i * 950) % 25000);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + 60 + ((i * 37) % 80), ry + 15 + ((i * 23) % 40));
    ctx.stroke();
  }

  // 3. Thar & Cholistan Desert Sand Dunes (Transverse & Barchan Waves)
  ctx.fillStyle = "rgba(235, 198, 128, 0.55)";
  for (let i = 0; i < 110; i++) {
    const rx = toX(-14000 + (i * 980) % 36000);
    const ry = toY(-10000 + (i * 720) % 36000);
    const rw = 50 + (i % 7) * 15;
    const rh = 18 + (i % 5) * 6;
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, Math.PI / 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. White Salt Flats of the Great Rann of Kutch (Gujarat / Sindh border)
  const kutchX = toX(-3000);
  const kutchY = toY(22000);
  const kutchGrad = ctx.createRadialGradient(kutchX, kutchY, 10, kutchX, kutchY, 160);
  kutchGrad.addColorStop(0, "rgba(255, 255, 252, 0.95)"); // Pure white crystalline salt
  kutchGrad.addColorStop(0.35, "rgba(245, 248, 245, 0.88)");
  kutchGrad.addColorStop(0.70, "rgba(220, 224, 215, 0.65)");
  kutchGrad.addColorStop(1, "rgba(180, 185, 175, 0)");
  ctx.fillStyle = kutchGrad;
  ctx.beginPath();
  ctx.ellipse(kutchX, kutchY, 185, 95, -Math.PI / 10, 0, Math.PI * 2);
  ctx.fill();

  // Fine polygonal salt-crust crack striations
  ctx.strokeStyle = "rgba(205, 210, 202, 0.42)";
  ctx.lineWidth = 1.5;
  for (let s = 0; s < 32; s++) {
    const sx = kutchX + (Math.sin(s * 1.7) * 125);
    const sy = kutchY + (Math.cos(s * 2.3) * 65);
    ctx.strokeRect(sx, sy, 18 + (s % 5) * 6, 14 + (s % 4) * 4);
  }

  // 5. Ocean & Arabian Sea Coastline (South-West)
  ctx.fillStyle = "#123440";
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(toX(4000), height);
  ctx.bezierCurveTo(toX(-2000), toY(40000), toX(-14000), toY(35000), toX(-28000), toY(32000));
  ctx.bezierCurveTo(toX(-45000), toY(30000), toX(-68000), toY(26000), 0, toY(24000));
  ctx.closePath();
  ctx.fill();

  // Coastline turquoise shallow water fringe
  ctx.strokeStyle = "rgba(75, 190, 200, 0.55)";
  ctx.lineWidth = 18;
  ctx.stroke();

  // Coastline breaking surf foam fringe
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Coastal Islands in the Arabian Sea (Beaches, Rocky bluffs & vegetation)
  const islands = [
    { x: -18000, y: 46000, rx: 38, ry: 24, rot: 0.4 },
    { x: -11000, y: 52000, rx: 32, ry: 20, rot: -0.3 },
    { x: -25000, y: 43000, rx: 28, ry: 18, rot: 0.2 },
    { x: -6000, y: 45000, rx: 26, ry: 16, rot: -0.5 }
  ];

  for (const isl of islands) {
    const ix = toX(isl.x);
    const iy = toY(isl.y);
    // Turquoise shallow reef halo
    ctx.fillStyle = "rgba(64, 198, 208, 0.42)";
    ctx.beginPath();
    ctx.ellipse(ix, iy, isl.rx + 16, isl.ry + 12, isl.rot, 0, Math.PI * 2);
    ctx.fill();

    // Breaking surf foam ring around island
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(ix, iy, isl.rx + 2, isl.ry + 2, isl.rot, 0, Math.PI * 2);
    ctx.stroke();

    // Sandy golden perimeter beach
    ctx.fillStyle = "#d8c494";
    ctx.beginPath();
    ctx.ellipse(ix, iy, isl.rx, isl.ry, isl.rot, 0, Math.PI * 2);
    ctx.fill();

    // Coastal greenery & rocky ridge core
    ctx.fillStyle = "#557d4a";
    ctx.beginPath();
    ctx.ellipse(ix, iy, isl.rx * 0.72, isl.ry * 0.68, isl.rot, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6b6255";
    ctx.beginPath();
    ctx.ellipse(ix, iy, isl.rx * 0.38, isl.ry * 0.34, isl.rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Real River Systems
  // A. Indus River winding from Kashmir down to Arabian Sea delta
  ctx.strokeStyle = "rgba(42, 120, 145, 0.88)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(toX(-6000), toY(-55000));
  ctx.bezierCurveTo(toX(-12000), toY(-38000), toX(-14000), toY(-22000), toX(-15500), toY(-8000));
  ctx.bezierCurveTo(toX(-15000), toY(6000), toX(-17000), toY(18000), toX(-19500), toY(32000));
  ctx.stroke();

  // Green agricultural floodplains along the Indus
  ctx.strokeStyle = "rgba(70, 135, 60, 0.38)";
  ctx.lineWidth = 32;
  ctx.stroke();

  // B. Jhelum & Chenab Rivers
  ctx.strokeStyle = "rgba(42, 120, 145, 0.75)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(toX(6000), toY(-44000));
  ctx.bezierCurveTo(toX(0), toY(-36000), toX(-6000), toY(-28000), toX(-14000), toY(-22000));
  ctx.stroke();

  // C. Sutlej & Ravi Rivers (Punjab Basin)
  ctx.beginPath();
  ctx.moveTo(toX(18000), toY(-32000));
  ctx.bezierCurveTo(toX(10000), toY(-26000), toX(2000), toY(-22000), toX(-12000), toY(-16000));
  ctx.stroke();

  // D. Ganga River Corridor (Himalayas through Delhi/Agra/Varanasi)
  ctx.strokeStyle = "rgba(45, 118, 138, 0.8)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(toX(26000), toY(-32000));
  ctx.bezierCurveTo(toX(28000), toY(-20000), toX(32000), toY(-12000), toX(42000), toY(-3000));
  ctx.stroke();

  // E. Yamuna River (Passing Delhi & Agra)
  ctx.strokeStyle = "rgba(42, 112, 130, 0.72)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(toX(24000), toY(-28000));
  ctx.bezierCurveTo(toX(27000), toY(-16000), toX(29000), toY(-12000), toX(35000), toY(-6000));
  ctx.stroke();

  // F. Narmada River (Flowing west across Gujarat into Gulf of Khambhat)
  ctx.strokeStyle = "rgba(45, 120, 140, 0.75)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(toX(32000), toY(18000));
  ctx.bezierCurveTo(toX(22000), toY(22000), toX(14000), toY(26000), toX(6000), toY(30000));
  ctx.stroke();

  // G. Sabarmati River (Passing Ahmedabad)
  ctx.beginPath();
  ctx.moveTo(toX(14000), toY(18000));
  ctx.bezierCurveTo(toX(12000), toY(24000), toX(10000), toY(28000), toX(8000), toY(32000));
  ctx.stroke();

  // 7. Agricultural Mosaic Patterns across Punjab, Haryana & Indus Valley
  ctx.strokeStyle = "rgba(85, 145, 75, 0.22)";
  ctx.lineWidth = 1.5;
  for (let gx = toX(-16000); gx < toX(36000); gx += 35) {
    ctx.beginPath();
    ctx.moveTo(gx, toY(-32000));
    ctx.lineTo(gx, toY(-10000));
    ctx.stroke();
  }
  for (let gy = toY(-32000); gy < toY(-10000); gy += 35) {
    ctx.beginPath();
    ctx.moveTo(toX(-16000), gy);
    ctx.lineTo(toX(36000), gy);
    ctx.stroke();
  }

  // 8. Globe Highway / Flight Corridor Networks
  const HIGHWAYS = [
    // Golden Quadrilateral & Northern Corridors
    ["delhi", "jaipur"],
    ["jaipur", "jodhpur"],
    ["jodhpur", "jaisalmer"],
    ["jaisalmer", "uttarlai_afb"],
    ["delhi", "chandigarh"],
    ["chandigarh", "ambala_afb"],
    ["ambala_afb", "ludhiana"],
    ["ludhiana", "jalandhar"],
    ["jalandhar", "amritsar"],
    ["amritsar", "pathankot_afb"],
    ["pathankot_afb", "jammu"],
    ["jammu", "srinagar"],
    ["srinagar", "leh"],
    ["leh", "thoise_afb"],
    ["delhi", "agra"],
    ["agra", "gwalior_afb"],
    ["gwalior_afb", "bhopal"],
    ["agra", "kanpur"],
    ["kanpur", "lucknow"],
    ["lucknow", "varanasi"],
    ["delhi", "bareilly_afb"],
    ["delhi", "dehradun"],
    ["chandigarh", "shimla"],
    ["jaipur", "ajmer"],
    ["ajmer", "udaipur"],
    ["udaipur", "ahmedabad"],
    ["ahmedabad", "vadodara"],
    ["vadodara", "surat"],
    ["surat", "mumbai"],
    ["mumbai", "pune"],
    ["ahmedabad", "rajkot"],
    ["rajkot", "jamnagar_afb"],
    ["jamnagar_afb", "bhuj"],
    ["bhuj", "naliya_afb"],

    // Pakistan Corridors
    ["lahore", "sargodha_afb"],
    ["sargodha_afb", "faisalabad"],
    ["faisalabad", "multan"],
    ["lahore", "gujranwala"],
    ["gujranwala", "rawalpindi"],
    ["rawalpindi", "islamabad"],
    ["islamabad", "kamra_afb"],
    ["kamra_afb", "peshawar"],
    ["multan", "bahawalpur"],
    ["bahawalpur", "sukkur"],
    ["sukkur", "jacobabad_afb"],
    ["sukkur", "hyderabad_pak"],
    ["hyderabad_pak", "karachi"],
    ["karachi", "masroor_afb"],
    ["karachi", "gwadar"],
    ["multan", "quetta"],

    // Gulf Highway Corridors
    ["dubai", "sharjah"],
    ["dubai", "abudhabi"],
    ["abudhabi", "aldhafra_afb"],
    ["abudhabi", "alain"],
    ["dubai", "muscat"],
    ["abudhabi", "doha"]
  ];

  ctx.strokeStyle = "rgba(235, 218, 175, 0.32)";
  ctx.lineWidth = 2.5;
  for (const [c1Id, c2Id] of HIGHWAYS) {
    const c1 = CITIES.find((c) => c.id === c1Id);
    const c2 = CITIES.find((c) => c.id === c2Id);
    if (c1 && c2) {
      ctx.beginPath();
      ctx.moveTo(toX(c1.x), toY(c1.z));
      ctx.lineTo(toX(c2.x), toY(c2.z));
      ctx.stroke();
    }
  }

  // 9. Military Airbase Runway Strips on Satellite Texture (IAF Bases + Cities)
  const allAirfields = [
    ...IAF_BASES.map((b) => ({ x: b.x, z: b.z, heading: b.runwayHeading || 0 })),
    ...CITIES.filter((c) => c.militaryBase).map((c) => ({ x: c.x, z: c.z, heading: 0 }))
  ];

  for (const af of allAirfields) {
    const ax = toX(af.x);
    const ay = toY(af.z);

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(((af.heading || 0) * Math.PI) / 180);

    // Dark high-contrast asphalt runway strip
    ctx.fillStyle = "#121417";
    ctx.fillRect(-5, -24, 10, 48);

    // Runway apron / taxiway
    ctx.fillStyle = "#1e2227";
    ctx.fillRect(4, -10, 8, 20);

    // Bright white runway threshold piano keys
    ctx.fillStyle = "#ffffff";
    for (let k = -3; k <= 3; k += 2) {
      ctx.fillRect(k, -22, 1, 4);
      ctx.fillRect(k, 18, 1, 4);
    }

    // Bright white centerline markings
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 18);
    ctx.stroke();
    ctx.setLineDash([]);

    // Yellow taxiway threshold bars
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -18);
    ctx.lineTo(4, -18);
    ctx.moveTo(-4, 18);
    ctx.lineTo(4, 18);
    ctx.stroke();

    ctx.restore();
  }

  // 10. Urban City Footprints and Night Lights
  for (const city of CITIES) {
    const cx = toX(city.x);
    const cy = toY(city.z);
    const isMega = city.population.includes("M") && parseInt(city.population) > 5;
    const rad = isMega ? 30 : city.militaryBase ? 16 : 14;

    // Urban grey asphalt footprint
    const cityGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
    cityGrad.addColorStop(0, "rgba(80, 90, 100, 0.92)");
    cityGrad.addColorStop(0.7, "rgba(100, 110, 120, 0.65)");
    cityGrad.addColorStop(1, "rgba(100, 110, 120, 0)");
    ctx.fillStyle = cityGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();

    // City center amber night lights glow
    ctx.fillStyle = city.militaryBase ? "rgba(255, 180, 80, 0.95)" : "rgba(255, 225, 140, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, city.militaryBase ? 3.5 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Secondary suburban light specks
    const speckCount = isMega ? 18 : 8;
    for (let s = 0; s < speckCount; s++) {
      const sx = cx + (Math.sin(s * 1.9) * rad * 0.72);
      const sy = cy + (Math.cos(s * 1.6) * rad * 0.72);
      ctx.fillStyle = "rgba(255, 235, 170, 0.7)";
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  // 11. International Border Markings & Floodlight Line on Terrain
  for (const border of INTERNATIONAL_BORDERS) {
    ctx.strokeStyle = border.id === "ind-pak" ? "rgba(255, 185, 65, 0.75)" : "rgba(255, 110, 85, 0.6)";
    ctx.lineWidth = 4;
    ctx.setLineDash(border.id === "ind-pak" ? [] : [12, 8]); // Indo-Pak continuous illuminated fence
    ctx.beginPath();
    for (let i = 0; i < border.points.length; i++) {
      const [bx, bz] = border.points[i];
      const sx = toX(bx);
      const sy = toY(bz);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Create and configure Three.js texture
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS = T.ClampToEdgeWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.anisotropy = 8;

  return texture;
}

export {
  createGeoTexture
};
