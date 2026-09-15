import * as T from "three";

/**
 * Geopolitical World Airspace Database and Spatial Query Engine.
 * Referenced from real Earth satellite and GIS coordinates (South Asia, Middle East, Central Asia).
 * 62 real surveyed cities, capitals, and strategic military airbases with exact Latitude & Longitude.
 */

export const CITIES = [
  // ==========================================
  // 🇮🇳 INDIA — NORTH, WEST & CENTRAL REGIONS
  // ==========================================
  { id: "delhi", name: "New Delhi", country: "India", state: "Delhi NCR", lat: 28.6139, lon: 77.2090, x: 28000, z: -14000, population: "32M", militaryBase: true, icon: "🏛️" },
  { id: "mumbai", name: "Mumbai", country: "India", state: "Maharashtra", lat: 19.0760, lon: 72.8777, x: 8000, z: 46000, population: "21M", militaryBase: true, icon: "⚓" },
  { id: "jaipur", name: "Jaipur", country: "India", state: "Rajasthan", lat: 26.9124, lon: 75.7873, x: 22000, z: -2000, population: "4M", militaryBase: false, icon: "🏰" },
  { id: "jodhpur", name: "Jodhpur", country: "India", state: "Rajasthan", lat: 26.2389, lon: 73.0243, x: 10000, z: 6000, population: "1.5M", militaryBase: true, icon: "🏰" },
  { id: "jaisalmer", name: "Jaisalmer", country: "India", state: "Rajasthan", lat: 26.9157, lon: 70.9083, x: 2000, z: 4000, population: "0.2M", militaryBase: true, icon: "🏜️" },
  { id: "bikaner", name: "Bikaner", country: "India", state: "Rajasthan", lat: 28.0229, lon: 73.3119, x: 8000, z: -6000, population: "0.8M", militaryBase: true, icon: "🏰" },
  { id: "udaipur", name: "Udaipur", country: "India", state: "Rajasthan", lat: 24.5854, lon: 73.7125, x: 12000, z: 16000, population: "0.6M", militaryBase: false, icon: "🌊" },
  { id: "amritsar", name: "Amritsar", country: "India", state: "Punjab", lat: 31.6340, lon: 74.8723, x: 4000, z: -25000, population: "1.8M", militaryBase: true, icon: "🛕" },
  { id: "chandigarh", name: "Chandigarh", country: "India", state: "Punjab / Haryana", lat: 30.7333, lon: 76.7794, x: 20000, z: -23000, population: "1.2M", militaryBase: false, icon: "🏛️" },
  { id: "srinagar", name: "Srinagar", country: "India", state: "Jammu & Kashmir", lat: 34.0837, lon: 74.7973, x: 8000, z: -46000, population: "1.6M", militaryBase: true, icon: "🏔️" },
  { id: "jammu", name: "Jammu", country: "India", state: "Jammu & Kashmir", lat: 32.7266, lon: 74.8570, x: 5000, z: -35000, population: "0.7M", militaryBase: true, icon: "🏔️" },
  { id: "leh", name: "Leh Ladakh", country: "India", state: "Ladakh", lat: 34.1526, lon: 77.5771, x: 18000, z: -52000, population: "0.1M", militaryBase: true, icon: "🏔️" },
  { id: "ahmedabad", name: "Ahmedabad", country: "India", state: "Gujarat", lat: 23.0225, lon: 72.5714, x: 12000, z: 24000, population: "8.5M", militaryBase: false, icon: "🏙️" },
  { id: "bhuj", name: "Bhuj", country: "India", state: "Gujarat", lat: 23.2420, lon: 69.6669, x: -500, z: 20000, population: "0.3M", militaryBase: true, icon: "⚓" },
  { id: "surat", name: "Surat", country: "India", state: "Gujarat", lat: 21.1702, lon: 72.8311, x: 10000, z: 36000, population: "6.5M", militaryBase: false, icon: "🏙️" },
  { id: "agra", name: "Agra", country: "India", state: "Uttar Pradesh", lat: 27.1767, lon: 78.0081, x: 32000, z: -10000, population: "2.1M", militaryBase: false, icon: "🕌" },
  { id: "lucknow", name: "Lucknow", country: "India", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462, x: 38000, z: -8000, population: "3.8M", militaryBase: false, icon: "🏛️" },
  { id: "varanasi", name: "Varanasi", country: "India", state: "Uttar Pradesh", lat: 25.3176, lon: 82.9739, x: 42000, z: -3000, population: "1.5M", militaryBase: false, icon: "🛕" },
  { id: "bhopal", name: "Bhopal", country: "India", state: "Madhya Pradesh", lat: 23.2599, lon: 77.4126, x: 26000, z: 12000, population: "2.4M", militaryBase: false, icon: "🌊" },
  { id: "pune", name: "Pune", country: "India", state: "Maharashtra", lat: 18.5204, lon: 73.8567, x: 12000, z: 52000, population: "7.2M", militaryBase: true, icon: "🏙️" },
  { id: "dehradun", name: "Dehradun", country: "India", state: "Uttarakhand", lat: 30.3165, lon: 78.0322, x: 26000, z: -27000, population: "0.9M", militaryBase: false, icon: "🌲" },
  { id: "shimla", name: "Shimla", country: "India", state: "Himachal Pradesh", lat: 31.1048, lon: 77.1734, x: 22000, z: -31000, population: "0.2M", militaryBase: false, icon: "🏔️" },

  // ==========================================
  // 🇮🇳 STRATEGIC INDIAN AIR FORCE BASES (IAF)
  // ==========================================
  { id: "ambala_afb", name: "Ambala Air Base", country: "India", state: "Haryana", lat: 30.3752, lon: 76.7821, x: 18000, z: -25000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "hindan_afb", name: "Hindan Air Base", country: "India", state: "Uttar Pradesh", lat: 28.7077, lon: 77.3601, x: 29000, z: -15000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "gwalior_afb", name: "Gwalior Air Base", country: "India", state: "Madhya Pradesh", lat: 26.2183, lon: 78.1828, x: 28000, z: 2000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "pathankot_afb", name: "Pathankot Air Base", country: "India", state: "Punjab", lat: 32.2689, lon: 75.6375, x: 7000, z: -33000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "halwara_afb", name: "Halwara Air Base", country: "India", state: "Punjab", lat: 30.7483, lon: 75.6333, x: 12000, z: -24000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "bareilly_afb", name: "Bareilly Air Base", country: "India", state: "Uttar Pradesh", lat: 28.3670, lon: 79.4304, x: 36000, z: -16000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "uttarlai_afb", name: "Uttarlai Air Base", country: "India", state: "Rajasthan", lat: 25.8167, lon: 71.4833, x: 0, z: 8000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "naliya_afb", name: "Naliya Air Base", country: "India", state: "Gujarat", lat: 23.2500, lon: 68.8333, x: -3000, z: 22000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "awantipora_afb", name: "Awantipora Air Base", country: "India", state: "Jammu & Kashmir", lat: 33.9167, lon: 74.9667, x: 9000, z: -44000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "thoise_afb", name: "Thoise Siachen Air Base", country: "India", state: "Ladakh", lat: 34.6500, lon: 77.4167, x: 17000, z: -56000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "udhampur_afb", name: "Udhampur Air Base", country: "India", state: "Jammu & Kashmir", lat: 32.9167, lon: 75.1500, x: 8000, z: -36000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "sirsa_afb", name: "Sirsa Air Base", country: "India", state: "Haryana", lat: 29.5333, lon: 75.0167, x: 12000, z: -18000, population: "Base", militaryBase: true, icon: "🎖️" },

  // ==========================================
  // 🇵🇰 PAKISTAN & AIR BASES
  // ==========================================
  { id: "lahore", name: "Lahore", country: "Pakistan", state: "Punjab", lat: 31.5204, lon: 74.3587, x: -7000, z: -26000, population: "13M", militaryBase: true, icon: "🕌" },
  { id: "karachi", name: "Karachi", country: "Pakistan", state: "Sindh", lat: 24.8607, lon: 67.0011, x: -18000, z: 14000, population: "16M", militaryBase: true, icon: "⚓" },
  { id: "hyderabad_pak", name: "Hyderabad", country: "Pakistan", state: "Sindh", lat: 25.3960, lon: 68.3578, x: -16000, z: 20000, population: "2.2M", militaryBase: false, icon: "🏙️" },
  { id: "islamabad", name: "Islamabad", country: "Pakistan", state: "Federal Capital", lat: 33.6844, lon: 73.0479, x: -9000, z: -45000, population: "2M", militaryBase: true, icon: "🏛️" },
  { id: "rawalpindi", name: "Rawalpindi", country: "Pakistan", state: "Punjab", lat: 33.5651, lon: 73.0169, x: -9000, z: -42000, population: "2.3M", militaryBase: true, icon: "🎖️" },
  { id: "peshawar", name: "Peshawar", country: "Pakistan", state: "Khyber Pakhtunkhwa", lat: 34.0151, lon: 71.5249, x: -17000, z: -46000, population: "2.3M", militaryBase: true, icon: "🏔️" },
  { id: "quetta", name: "Quetta", country: "Pakistan", state: "Balochistan", lat: 30.1798, lon: 66.9750, x: -25000, z: -18000, population: "1.1M", militaryBase: false, icon: "⛰️" },
  { id: "gwadar", name: "Gwadar", country: "Pakistan", state: "Balochistan", lat: 25.1216, lon: 62.3254, x: -38000, z: 18000, population: "0.2M", militaryBase: true, icon: "⚓" },
  { id: "multan", name: "Multan", country: "Pakistan", state: "Punjab", lat: 30.1575, lon: 71.5249, x: -12000, z: -16000, population: "2.1M", militaryBase: false, icon: "🕌" },
  { id: "faisalabad", name: "Faisalabad", country: "Pakistan", state: "Punjab", lat: 31.4504, lon: 73.1350, x: -10000, z: -22000, population: "3.5M", militaryBase: false, icon: "🏙️" },
  { id: "sialkot", name: "Sialkot", country: "Pakistan", state: "Punjab", lat: 32.4945, lon: 74.5229, x: -2000, z: -32000, population: "0.7M", militaryBase: true, icon: "🏙️" },
  { id: "sargodha_afb", name: "Sargodha Air Base", country: "Pakistan", state: "Punjab", lat: 32.0836, lon: 72.6711, x: -12000, z: -30000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "kamra_afb", name: "Kamra PAC Air Base", country: "Pakistan", state: "Punjab", lat: 33.8697, lon: 72.4011, x: -11000, z: -44000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "jacobabad_afb", name: "Jacobabad Air Base", country: "Pakistan", state: "Sindh", lat: 28.2833, lon: 68.4500, x: -17000, z: -5000, population: "Base", militaryBase: true, icon: "🎖️" },

  // ==========================================
  // 🇦🇪 UAE, 🇴🇲 OMAN & 🇶🇦 GULF
  // ==========================================
  { id: "dubai", name: "Dubai", country: "United Arab Emirates", state: "Dubai", lat: 25.2048, lon: 55.2708, x: -62000, z: 22000, population: "3.6M", militaryBase: true, icon: "🏙️" },
  { id: "sharjah", name: "Sharjah", country: "United Arab Emirates", state: "Sharjah", lat: 25.3463, lon: 55.4209, x: -61000, z: 20000, population: "1.8M", militaryBase: false, icon: "🏙️" },
  { id: "abudhabi", name: "Abu Dhabi", country: "United Arab Emirates", state: "Abu Dhabi", lat: 24.4539, lon: 54.3773, x: -74000, z: 29000, population: "1.8M", militaryBase: true, icon: "👑" },
  { id: "aldhafra_afb", name: "Al Dhafra Air Base", country: "United Arab Emirates", state: "Abu Dhabi", lat: 24.2483, lon: 54.5478, x: -73000, z: 32000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "alain", name: "Al Ain", country: "United Arab Emirates", state: "Abu Dhabi", lat: 24.2075, lon: 55.7447, x: -68000, z: 32000, population: "0.8M", militaryBase: true, icon: "🏜️" },
  { id: "muscat", name: "Muscat", country: "Oman", state: "Muscat", lat: 23.5880, lon: 58.3829, x: -52000, z: 36000, population: "1.7M", militaryBase: true, icon: "⚓" },
  { id: "doha", name: "Doha", country: "Qatar", state: "Ad Dawhah", lat: 25.2854, lon: 51.5310, x: -82000, z: 24000, population: "2.4M", militaryBase: true, icon: "🏙️" },
  { id: "aludeid_afb", name: "Al Udeid Air Base", country: "Qatar", state: "Ad Dawhah", lat: 25.1172, lon: 51.3150, x: -84000, z: 25000, population: "Base", militaryBase: true, icon: "🎖️" },

  // ==========================================
  // 🏔️ CENTRAL ASIA & REGIONAL GATEWAYS
  // ==========================================
  { id: "kabul", name: "Kabul Sector", country: "Afghanistan", state: "Kabul", lat: 34.5553, lon: 69.2075, x: -24000, z: -52000, population: "4.5M", militaryBase: true, icon: "🏔️" },
  { id: "kandahar", name: "Kandahar Sector", country: "Afghanistan", state: "Kandahar", lat: 31.6289, lon: 65.7372, x: -32000, z: -28000, population: "0.6M", militaryBase: true, icon: "⛰️" },
  { id: "kashgar", name: "Kashgar Sector", country: "China", state: "Xinjiang", lat: 39.4677, lon: 75.9898, x: 12000, z: -68000, population: "0.7M", militaryBase: true, icon: "🏔️" },
  { id: "hotan_afb", name: "Hotan Air Base", country: "China", state: "Xinjiang", lat: 37.0386, lon: 79.8650, x: 28000, z: -64000, population: "Base", militaryBase: true, icon: "🎖️" },
  { id: "kathmandu", name: "Kathmandu", country: "Nepal", state: "Bagmati", lat: 27.7172, lon: 85.3240, x: 48000, z: -16000, population: "1.5M", militaryBase: false, icon: "🏔️" },
  { id: "pokhara", name: "Pokhara", country: "Nepal", state: "Gandaki", lat: 28.2096, lon: 83.9856, x: 44000, z: -18000, population: "0.5M", militaryBase: false, icon: "🏔️" }
];

// International border surveyed points [x, z]
const BORDER_INDIA_PAKISTAN = [
  [-1000, 32000],  // Sir Creek / Rann of Kutch
  [-200, 18000],   // Gujarat / Sindh border
  [400, 6000],     // Rajasthan / Sindh border
  [-1000, -6000],  // Thar Desert boundary
  [-800, -18000],  // Punjab Border (South of Sutlej)
  [500, -28000],   // Wagah / Amritsar-Lahore border line
  [1200, -38000],  // Jammu Sector
  [3000, -52000],  // Line of Control / Pir Panjal
  [8000, -62000]   // Northern Karakoram junction
];

const BORDER_INDIA_CHINA = [
  [8000, -62000],
  [22000, -60000],
  [36000, -56000]
];

const BORDER_UAE_OMAN = [
  [-68000, 15000],
  [-59000, 24000],
  [-54000, 31000]
];

export const INTERNATIONAL_BORDERS = [
  { id: "ind-pak", name: "India — Pakistan International Border", points: BORDER_INDIA_PAKISTAN, color: "#ffaa44" },
  { id: "ind-chn", name: "India — China Line of Actual Control", points: BORDER_INDIA_CHINA, color: "#ff4444" },
  { id: "uae-omn", name: "UAE — Oman Border", points: BORDER_UAE_OMAN, color: "#44ddff" }
];

export const BIOMES = {
  HIMALAYAN_SNOW: {
    id: "himalayan_snow",
    name: "Himalayas & Karakoram Glaciers",
    icon: "🏔️",
    terrainType: "alpine_snow",
    elevationBand: "3,500M – 6,200M",
    temp: "Sub-Zero (-12°C)",
    fogTint: 0x90b5cb
  },
  FERTILE_PLAINS: {
    id: "fertile_plains",
    name: "Indo-Gangetic Alluvial Plains",
    icon: "🌾",
    terrainType: "plains",
    elevationBand: "180M – 350M",
    temp: "Sub-Tropical (28°C)",
    fogTint: 0x7fa28d
  },
  THAR_DESERT: {
    id: "thar_desert",
    name: "Great Thar Desert & Cholistan Dunes",
    icon: "🏜️",
    terrainType: "sand_dunes",
    elevationBand: "60M – 240M",
    temp: "Arid Desert (42°C)",
    fogTint: 0xb5a082
  },
  BALOCHISTAN_PLATEAU: {
    id: "balochistan_plateau",
    name: "Balochistan Plateau & Makran Range",
    icon: "⛰️",
    terrainType: "rocky_scrub",
    elevationBand: "800M – 2,100M",
    temp: "Arid Continental (32°C)",
    fogTint: 0x968c78
  },
  ARABIAN_SEA: {
    id: "arabian_sea",
    name: "Arabian Sea & Coastal Estuaries",
    icon: "🌊",
    terrainType: "open_ocean",
    elevationBand: "Sea Level (0M)",
    temp: "Maritime (29°C)",
    fogTint: 0x5a90a2
  },
  GULF_COAST: {
    id: "gulf_coast",
    name: "Persian Gulf Megacity & Dunes",
    icon: "🏙️",
    terrainType: "gulf_urban",
    elevationBand: "5M – 120M",
    temp: "Coastal Arid (38°C)",
    fogTint: 0xa8a294
  }
};

export function getBiomeAt(x, z) {
  if (z < -42000) return BIOMES.HIMALAYAN_SNOW;
  if (z > 36000 && x < 5000) return BIOMES.ARABIAN_SEA;
  if (x < -48000) return BIOMES.GULF_COAST;
  if (x < -18000 && z > -35000) return BIOMES.BALOCHISTAN_PLATEAU;
  if (x > -14000 && x < 20000 && z > -12000 && z < 26000) return BIOMES.THAR_DESERT;
  return BIOMES.FERTILE_PLAINS;
}

export function getGPSCoordinates(x, z) {
  // Origin (0, 0) is around 26.5° N, 71.5° E
  // 1 degree latitude ~= 111 km (111000m)
  // 1 degree longitude ~= 100 km (100000m)
  const lat = 26.5 - z / 111000;
  const lon = 71.5 + x / 100000;

  const latDeg = Math.floor(Math.abs(lat));
  const latMin = Math.floor((Math.abs(lat) - latDeg) * 60);
  const latSec = Math.floor(((Math.abs(lat) - latDeg) * 60 - latMin) * 60);
  const latDir = lat >= 0 ? "N" : "S";

  const lonDeg = Math.floor(Math.abs(lon));
  const lonMin = Math.floor((Math.abs(lon) - lonDeg) * 60);
  const lonSec = Math.floor(((Math.abs(lon) - lonDeg) * 60 - lonMin) * 60);
  const lonDir = lon >= 0 ? "E" : "W";

  return {
    lat,
    lon,
    latString: `${latDeg}° ${latMin}' ${latSec}" ${latDir}`,
    lonString: `${lonDeg}° ${lonMin}' ${lonSec}" ${lonDir}`,
    formatted: `${latDeg}°${latMin.toString().padStart(2, "0")}'${latDir}, ${lonDeg}°${lonMin.toString().padStart(2, "0")}'${lonDir}`
  };
}

function getBorderXAtZ(z) {
  const pts = BORDER_INDIA_PAKISTAN;
  if (z >= pts[0][1]) return pts[0][0];
  if (z <= pts[pts.length - 1][1]) return pts[pts.length - 1][0];

  for (let i = 0; i < pts.length - 1; i++) {
    const z1 = pts[i][1];
    const z2 = pts[i + 1][1];
    if (z <= z1 && z >= z2) {
      const t = (z - z1) / (z2 - z1);
      return pts[i][0] + t * (pts[i + 1][0] - pts[i][0]);
    }
  }
  return 0;
}

export function getAirspaceAt(x, z) {
  if (z > 44000 && x < 4000) {
    return { country: "International Airspace", code: "INTL", state: "Arabian Sea (International Waters)", flag: "🌊" };
  }

  if (x < -48000) {
    if (z > 28000 && x > -65000) {
      return { country: "Oman", code: "OMN", state: "Muscat Governorate", flag: "🇴🇲" };
    }
    if (x < -78000) {
      return { country: "Qatar", code: "QAT", state: "Doha Sector", flag: "🇶🇦" };
    }
    return { country: "United Arab Emirates", code: "UAE", state: "Dubai / Gulf Airspace", flag: "🇦🇪" };
  }

  if (z < -60000) {
    return { country: "China", code: "CHN", state: "Xinjiang Autonomous Region", flag: "🇨🇳" };
  }

  if (x > 40000 && z < -12000 && z > -25000) {
    return { country: "Nepal", code: "NPL", state: "Kathmandu / Himalayas", flag: "🇳🇵" };
  }

  if (x < -22000 && z < -42000) {
    return { country: "Afghanistan", code: "AFG", state: "Kabul / Hindu Kush Sector", flag: "🇦🇫" };
  }

  const borderX = getBorderXAtZ(z);
  const distToBorder = Math.abs(x - borderX);
  const isBorderZone = distToBorder < 5000;

  if (x >= borderX) {
    let state = "Rajasthan";
    if (z < -48000 && x > 14000) state = "Ladakh";
    else if (z < -34000) state = "Jammu & Kashmir";
    else if (z < -16000) state = x < 15000 ? "Punjab" : "Punjab / Haryana";
    else if (z < 12000) {
      if (x > 24000 && z < -5000) state = "Delhi NCR";
      else if (x > 28000) state = "Uttar Pradesh";
      else state = "Rajasthan";
    } else if (z < 36000) {
      state = "Gujarat";
    } else {
      state = "Maharashtra";
    }

    return {
      country: "India",
      code: "IND",
      state,
      flag: "🇮🇳",
      distToBorder,
      isBorderZone
    };
  } else {
    let state = "Sindh";
    if (z < -36000) state = "Khyber Pakhtunkhwa";
    else if (z < -14000) {
      if (z < -40000 && x > -11000) state = "Federal Capital";
      else state = "Punjab";
    } else if (x < -20000) state = "Balochistan";
    else state = "Sindh";

    return {
      country: "Pakistan",
      code: "PAK",
      state,
      flag: "🇵🇰",
      distToBorder,
      isBorderZone
    };
  }
}

export function getNearestCity(x, z) {
  let nearest = null;
  let minDistSq = Infinity;
  for (const city of CITIES) {
    const dx = x - city.x;
    const dz = z - city.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < minDistSq) {
      minDistSq = dSq;
      nearest = city;
    }
  }
  return {
    city: nearest,
    distance: Math.sqrt(minDistSq)
  };
}

export function checkBoundaryCrossing(oldPos, newPos) {
  if (!oldPos || !newPos) return null;
  const oldAir = getAirspaceAt(oldPos.x, oldPos.z);
  const newAir = getAirspaceAt(newPos.x, newPos.z);

  if (oldAir.country !== newAir.country) {
    return {
      crossed: true,
      fromCountry: oldAir.country,
      fromState: oldAir.state,
      fromCode: oldAir.code,
      toCountry: newAir.country,
      toState: newAir.state,
      toCode: newAir.code,
      flag: newAir.flag
    };
  }
  return null;
}

export function create3DBorderBeacons(scene) {
  const group = new T.Group();
  group.name = "border_beacons";

  const pillarMat = new T.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.75 });
  const beaconMat = new T.MeshBasicMaterial({ color: 0xffeedd });

  const p1 = new T.Vector3();
  const p2 = new T.Vector3();

  for (const border of INTERNATIONAL_BORDERS) {
    const pts = border.points;
    for (let i = 0; i < pts.length; i++) {
      const [px, pz] = pts[i];
      const beacon = new T.Mesh(new T.CylinderGeometry(15, 30, 2500, 6), pillarMat);
      beacon.position.set(px, 1250, pz);
      group.add(beacon);

      const lightSphere = new T.Mesh(new T.SphereGeometry(45, 8, 8), beaconMat);
      lightSphere.position.set(px, 2500, pz);
      group.add(lightSphere);

      if (i < pts.length - 1) {
        const next = pts[i + 1];
        p1.set(px, 180, pz);
        p2.set(next[0], 180, next[1]);

        const lineGeo = new T.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new T.LineBasicMaterial({ color: border.id === "ind-pak" ? 0xffbb44 : 0x44ddff, linewidth: 3 });
        const line = new T.Line(lineGeo, lineMat);
        group.add(line);

        const segDist = Math.hypot(next[0] - px, next[1] - pz);
        const postSteps = Math.min(12, Math.floor(segDist / 3500));
        for (let s = 1; s < postSteps; s++) {
          const frac = s / postSteps;
          const fx = px + (next[0] - px) * frac;
          const fz = pz + (next[1] - pz) * frac;
          const postLight = new T.Mesh(new T.SphereGeometry(22, 6, 6), beaconMat);
          postLight.position.set(fx, 140, fz);
          group.add(postLight);
        }
      }
    }
  }

  scene.add(group);
  return group;
}

export function getApproachingLocation(pos, forwardVec, speed = 250) {
  if (!pos || !forwardVec) return null;
  const fwdLen = Math.hypot(forwardVec.x, forwardVec.z) || 1;
  const fx = forwardVec.x / fwdLen;
  const fz = forwardVec.z / fwdLen;

  let bestCity = null;
  let bestDist = Infinity;
  let originCity = null;
  let originDist = Infinity;

  for (const city of CITIES) {
    const dx = city.x - pos.x;
    const dz = city.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 10) continue;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const dot = fx * dirX + fz * dirZ;

    if (dot > 0.65 && dist < 95000) {
      if (dist < bestDist) {
        bestDist = dist;
        bestCity = city;
      }
    } else if (dot < -0.65 && dist < originDist) {
      originDist = dist;
      originCity = city;
    }
  }

  if (!bestCity) {
    let fallbackCity = null;
    let fallbackDist = Infinity;
    for (const city of CITIES) {
      const dx = city.x - pos.x;
      const dz = city.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const dot = (dx * fx + dz * fz) / (dist || 1);
      if (dot > 0.2 && dist < fallbackDist && dist < 110000) {
        fallbackDist = dist;
        fallbackCity = city;
      }
    }
    bestCity = fallbackCity;
    bestDist = fallbackDist;
  }

  if (!bestCity) return null;

  const currentSpeed = Math.max(speed, 60);
  const etaSec = Math.round(bestDist / currentSpeed);
  const etaMin = Math.floor(etaSec / 60);
  const etaRemSec = etaSec % 60;

  return {
    destination: bestCity,
    distanceMeters: bestDist,
    distanceKm: (bestDist / 1000).toFixed(1),
    etaSeconds: etaSec,
    formattedETA: `${etaMin.toString().padStart(2, "0")}:${etaRemSec.toString().padStart(2, "0")}`,
    origin: originCity || getNearestCity(pos.x, pos.z).city
  };
}

export const IAF_BASES = [
  {
    id: "ambala_afb",
    name: "Ambala Air Force Station",
    shortName: "Ambala AFB",
    code: "VIAM",
    state: "Haryana",
    country: "India",
    x: 18000,
    z: -25000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "No. 17 Golden Arrows (Dassault Rafale) & No. 5 Daggers (SEPECAT Jaguar)",
    callsign: "AMBALA TOWER",
    icon: "🎖️"
  },
  {
    id: "hindan_afb",
    name: "Hindan Air Force Station",
    shortName: "Hindan AFB",
    code: "VIDX",
    state: "Delhi NCR / UP",
    country: "India",
    x: 29000,
    z: -15000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2400,
    runwayWidth: 110,
    squadron: "No. 81 Skylords (Boeing C-17 Globemaster III) & Strategic Air Defense",
    callsign: "HINDAN CONTROL",
    icon: "🎖️"
  },
  {
    id: "gwalior_afb",
    name: "Gwalior (Maharajpur) Air Base",
    shortName: "Gwalior AFB",
    code: "VIGR",
    state: "Madhya Pradesh",
    country: "India",
    x: 28000,
    z: 2000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "No. 1 Tigers & No. 7 Battleaxes (Dassault Mirage 2000)",
    callsign: "GWALIOR TOWER",
    icon: "🎖️"
  },
  {
    id: "pathankot_afb",
    name: "Pathankot Air Force Station",
    shortName: "Pathankot AFB",
    code: "VIPK",
    state: "Punjab",
    country: "India",
    x: 7000,
    z: -33000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2000,
    runwayWidth: 100,
    squadron: "No. 26 Warriors & No. 125 Helicopter Unit (AH-64E Apache)",
    callsign: "PATHANKOT CONTROL",
    icon: "🎖️"
  },
  {
    id: "halwara_afb",
    name: "Halwara Air Force Station",
    shortName: "Halwara AFB",
    code: "VIHX",
    state: "Punjab",
    country: "India",
    x: 12000,
    z: -24000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2100,
    runwayWidth: 100,
    squadron: "No. 220 Desert Tigers (Sukhoi Su-30MKI)",
    callsign: "HALWARA TOWER",
    icon: "🎖️"
  },
  {
    id: "bareilly_afb",
    name: "Bareilly Air Force Station",
    shortName: "Bareilly AFB",
    code: "VIBY",
    state: "Uttar Pradesh",
    country: "India",
    x: 36000,
    z: -16000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "No. 24 Hunting Hawks (Sukhoi Su-30MKI Wing)",
    callsign: "BAREILLY CONTROL",
    icon: "🎖️"
  },
  {
    id: "uttarlai_afb",
    name: "Uttarlai Air Force Station",
    shortName: "Uttarlai AFB",
    code: "VIUT",
    state: "Rajasthan (Barmer)",
    country: "India",
    x: 0,
    z: 8000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "No. 4 Oorials & Underground Alert Scramble Facility",
    callsign: "UTTARLAI TOWER",
    icon: "🎖️"
  },
  {
    id: "naliya_afb",
    name: "Naliya Air Force Station",
    shortName: "Naliya AFB",
    code: "VNLX",
    state: "Gujarat (Kutch)",
    country: "India",
    x: -3000,
    z: 22000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2000,
    runwayWidth: 100,
    squadron: "Kutch Border Air Defense & Forward Strike Wing",
    callsign: "NALIYA CONTROL",
    icon: "🎖️"
  },
  {
    id: "awantipora_afb",
    name: "Awantipora Air Force Station",
    shortName: "Awantipora AFB",
    code: "VIAW",
    state: "Jammu & Kashmir",
    country: "India",
    x: 9000,
    z: -44000,
    elevation: 120,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "Kashmir Valley Strategic Air Defense Wing",
    callsign: "AWANTIPORA TOWER",
    icon: "🎖️"
  },
  {
    id: "thoise_afb",
    name: "Thoise Siachen Air Base",
    shortName: "Thoise AFB",
    code: "VI57",
    state: "Ladakh (Siachen)",
    country: "India",
    x: 17000,
    z: -56000,
    elevation: 180,
    runwayHeading: 0,
    runwayLength: 2400,
    runwayWidth: 100,
    squadron: "World's Highest Combat Airbase · Siachen Lifeline",
    callsign: "THOISE TOWER",
    icon: "🏔️"
  },
  {
    id: "udhampur_afb",
    name: "Udhampur Air Force Station",
    shortName: "Udhampur AFB",
    code: "VIUX",
    state: "Jammu & Kashmir",
    country: "India",
    x: 8000,
    z: -36000,
    elevation: 65,
    runwayHeading: 0,
    runwayLength: 2000,
    runwayWidth: 100,
    squadron: "Northern Air Command Headquarters Wing",
    callsign: "UDHAMPUR CONTROL",
    icon: "🎖️"
  },
  {
    id: "sirsa_afb",
    name: "Sirsa Air Force Station",
    shortName: "Sirsa AFB",
    code: "VISA",
    state: "Haryana",
    country: "India",
    x: 12000,
    z: -18000,
    elevation: 42,
    runwayHeading: 0,
    runwayLength: 2100,
    runwayWidth: 100,
    squadron: "No. 21 Wing · Western Combat Air Patrol",
    callsign: "SIRSA TOWER",
    icon: "🎖️"
  },
  {
    id: "jamnagar_afb",
    name: "Jamnagar Air Force Station",
    shortName: "Jamnagar AFB",
    code: "VAJM",
    state: "Gujarat",
    country: "India",
    x: -1000,
    z: 25000,
    elevation: 38,
    runwayHeading: 0,
    runwayLength: 2200,
    runwayWidth: 100,
    squadron: "No. 6 Dragons (Jaguar Maritime Strike Squadron)",
    callsign: "JAMNAGAR TOWER",
    icon: "🎖️"
  },
  {
    id: "base_runway09",
    name: "Runway 09 Forward Operating Base",
    shortName: "Runway 09 (Home Base)",
    code: "SKBK",
    state: "Rajasthan Desert Sector",
    country: "India",
    x: -4200,
    z: -12500,
    elevation: 38,
    runwayHeading: 0,
    runwayLength: 2400,
    runwayWidth: 140,
    squadron: "Skybreak Tactical Interceptor Squadron",
    callsign: "TALON BASE",
    icon: "⭐"
  }
];

export function getNearestIAFBase(x, z) {
  let nearest = null;
  let minDist = Infinity;
  for (const base of IAF_BASES) {
    const dist = Math.hypot(x - base.x, z - base.z);
    if (dist < minDist) {
      minDist = dist;
      nearest = base;
    }
  }
  return { base: nearest, distance: minDist };
}
