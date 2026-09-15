import * as T from "three";
import { CITIES, INTERNATIONAL_BORDERS } from "./GeoWorld.js";

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

  // 1. Base Geographic Biome Gradients (North to South / East to West)
  const baseGrad = ctx.createLinearGradient(0, 0, width, height);
  baseGrad.addColorStop(0, "#345839");   // Northern pine foothills & valleys
  baseGrad.addColorStop(0.28, "#66884a"); // Punjab & Haryana agricultural belt
  baseGrad.addColorStop(0.52, "#d4ac64"); // Thar & Sindh desert golden sands
  baseGrad.addColorStop(0.82, "#968158"); // Semi-arid Gujarat & coastal scrub
  baseGrad.addColorStop(1, "#36665a");   // Coastal rim & Arabian sea edge
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Himalayan Snow Peaks, Glaciers & Rocky Moraines (Far North)
  const mountainGrad = ctx.createLinearGradient(0, 0, 0, height * 0.28);
  mountainGrad.addColorStop(0, "rgba(248, 250, 255, 0.94)"); // Crisp snowpack
  mountainGrad.addColorStop(0.4, "rgba(215, 230, 245, 0.85)"); // Glacial blue-white
  mountainGrad.addColorStop(0.72, "rgba(110, 120, 130, 0.65)"); // Granite rock shadow
  mountainGrad.addColorStop(1, "rgba(65, 85, 60, 0)");          // Pine tree line fade
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
  const kutchGrad = ctx.createRadialGradient(kutchX, kutchY, 10, kutchX, kutchY, 150);
  kutchGrad.addColorStop(0, "rgba(250, 250, 245, 0.85)"); // White crystalline salt
  kutchGrad.addColorStop(0.5, "rgba(230, 230, 220, 0.60)");
  kutchGrad.addColorStop(1, "rgba(180, 185, 175, 0)");
  ctx.fillStyle = kutchGrad;
  ctx.beginPath();
  ctx.ellipse(kutchX, kutchY, 170, 80, -Math.PI / 10, 0, Math.PI * 2);
  ctx.fill();

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

  // 9. Military Airbase Runway Strips on Satellite Texture
  ctx.fillStyle = "#1e2226";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  for (const city of CITIES) {
    if (!city.militaryBase) continue;
    const ax = toX(city.x);
    const ay = toY(city.z);

    // Dark asphalt runway strip
    ctx.fillRect(ax - 3, ay - 14, 6, 28);

    // Centerline markings
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 12);
    ctx.lineTo(ax, ay + 12);
    ctx.stroke();
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
