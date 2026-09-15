/**
 * Skybreak Aerospace - Fighter Jet Catalog & Modification System
 * Defines 5 airframes, 5 tactical liveries, performance mods, and stat calculations.
 */

export const JET_MODELS = {
  x17: {
    id: "x17",
    name: "X-17 Kestrel",
    code: "X-17",
    role: "Multirole Strike Fighter",
    country: "Global Defense Coalition",
    description: "Versatile twin-engine multirole fighter with delta wings and forward LERX. Outstanding balance of speed, dogfight agility, and weapon capacity.",
    baseStats: {
      speedKmh: 2120,
      agility: 78,
      armor: 100,
      missiles: 6,
      cannon: 1200,
      flares: 20,
      speedMult: 1.0,
      turnMult: 1.0,
      boostMult: 1.0,
      cannonDamage: 14
    },
    geometry: {
      wingType: "delta",
      engineCount: 2,
      canards: false,
      tailType: "twin_canted",
      nozzles: "round",
      dorsalEngines: false,
      wingSpan: 16,
      bodyLength: 18
    }
  },
  su57: {
    id: "su57",
    name: "SU-57S Ghost",
    code: "SU-57S",
    role: "Heavy Air-Superiority Fighter",
    country: "Air Dominance Command",
    description: "Twin thrust-vectoring heavy fighter with blended wing-body, movable LEVCONs, and central stinger tail. Devastating afterburner thrust and expanded missile payload.",
    baseStats: {
      speedKmh: 2350,
      agility: 82,
      armor: 125,
      missiles: 8,
      cannon: 1000,
      flares: 24,
      speedMult: 1.08,
      turnMult: 1.06,
      boostMult: 1.20,
      cannonDamage: 15
    },
    geometry: {
      wingType: "blended_flanker",
      engineCount: 2,
      canards: true,
      tailType: "twin_wide",
      nozzles: "vector_round",
      dorsalEngines: false,
      wingSpan: 18,
      bodyLength: 20
    }
  },
  f22: {
    id: "f22",
    name: "F-22R Phantom",
    code: "F-22R",
    role: "5th Gen Stealth Interceptor",
    country: "Skybreak Tactical Wing",
    description: "Diamond delta wings with faceted radar-absorbent chined fuselage, canted V-tails, and 2D rectangular vectoring nozzles. Blistering Mach 2.2+ cruise and instant radar lock.",
    baseStats: {
      speedKmh: 2550,
      agility: 85,
      armor: 95,
      missiles: 6,
      cannon: 1000,
      flares: 22,
      speedMult: 1.18,
      turnMult: 1.12,
      boostMult: 1.25,
      cannonDamage: 14
    },
    geometry: {
      wingType: "diamond_stealth",
      engineCount: 2,
      canards: false,
      tailType: "v_tail",
      nozzles: "rect_2d",
      dorsalEngines: false,
      wingSpan: 15.2,
      bodyLength: 18.5
    }
  },
  vajra9: {
    id: "vajra9",
    name: "Vajra-9 (Tejas Mk2)",
    code: "VAJRA-9",
    role: "Lightweight Agile Dogfighter",
    country: "Indian Air Force Aero Lab",
    description: "Tailless compound delta wing with active all-moving close-coupled canards and a high-thrust single turbofan. Supreme roll rate, lightning pitch-up, and dogfight mastery.",
    baseStats: {
      speedKmh: 2050,
      agility: 98,
      armor: 90,
      missiles: 6,
      cannon: 1100,
      flares: 22,
      speedMult: 0.98,
      turnMult: 1.28,
      boostMult: 1.15,
      cannonDamage: 14
    },
    geometry: {
      wingType: "compound_delta",
      engineCount: 1,
      canards: true,
      tailType: "single_large",
      nozzles: "single_round",
      dorsalEngines: false,
      wingSpan: 13.5,
      bodyLength: 16.5
    }
  },
  a10x: {
    id: "a10x",
    name: "A-10X Thunderstrike",
    code: "A-10X",
    role: "Close Air Support / Heavy Armor",
    country: "Heavy Strike Division",
    description: "Rugged straight high-lift wings, dual high-mounted dorsal turbofan nacelles, and dual vertical H-tail. Houses a devastating 30mm rotary nose cannon and reinforced titanium armor tub.",
    baseStats: {
      speedKmh: 1680,
      agility: 64,
      armor: 160,
      missiles: 4,
      cannon: 2000,
      flares: 30,
      speedMult: 0.82,
      turnMult: 0.88,
      boostMult: 0.94,
      cannonDamage: 22
    },
    geometry: {
      wingType: "straight_heavy",
      engineCount: 2,
      canards: false,
      tailType: "h_tail",
      nozzles: "dorsal_pods",
      dorsalEngines: true,
      wingSpan: 19.5,
      bodyLength: 17.5
    }
  }
};

export const LIVERIES = {
  grey: {
    id: "grey",
    name: "Air Superiority Grey",
    tag: "TACTICAL MILITARY",
    swatch: "#6b7a8d",
    bodyColor: 0x647080,
    darkColor: 0x242a32,
    stripeColor: 0xff6600, // IAF Saffron accent
    metalColor: 0x76808f,
    glassColor: 0x98b4cc,
    metalness: 0.72,
    roughness: 0.40
  },
  stealth: {
    id: "stealth",
    name: "Stealth Midnight",
    tag: "RADAR ABSORBENT",
    swatch: "#181a1f",
    bodyColor: 0x16181d,
    darkColor: 0x0c0e12,
    stripeColor: 0x00e5ff, // Cyberpunk Cyan
    metalColor: 0x303640,
    glassColor: 0x00e5ff,
    metalness: 0.88,
    roughness: 0.28
  },
  desert: {
    id: "desert",
    name: "Desert Mirage",
    tag: "TACTICAL CAMO",
    swatch: "#ba9b72",
    bodyColor: 0xb5966a,
    darkColor: 0x5a4832,
    stripeColor: 0xd97706, // Amber accent
    metalColor: 0x8a7050,
    glassColor: 0xffe29a,
    metalness: 0.50,
    roughness: 0.55
  },
  arctic: {
    id: "arctic",
    name: "Arctic Blizzard",
    tag: "HIMALAYAN SLATE",
    swatch: "#d8e2ec",
    bodyColor: 0xdbe3ec,
    darkColor: 0x485a6f,
    stripeColor: 0x38bdf8, // Ice blue accent
    metalColor: 0x9fb3c8,
    glassColor: 0xbfeaff,
    metalness: 0.60,
    roughness: 0.35
  },
  gold: {
    id: "gold",
    name: "Ace Gold & Crimson",
    tag: "CHAMPION SQUADRON",
    swatch: "#eab308",
    bodyColor: 0x1f1c19,
    darkColor: 0xd97706, // Gold metallic
    stripeColor: 0xef4444, // Crimson red
    metalColor: 0xf59e0b,
    glassColor: 0xfde047,
    metalness: 0.90,
    roughness: 0.20
  }
};

export const MODIFICATIONS = {
  engine: {
    title: "Propulsion & Engine",
    options: {
      standard: {
        id: "standard",
        name: "Factory Turbofan",
        desc: "Balanced fuel-air mixture and standard turbine spool",
        speedBonus: 0,
        boostBonus: 0,
        turnBonus: 0
      },
      overdrive: {
        id: "overdrive",
        name: "Afterburner Overdrive",
        desc: "+18% Top Speed & +25% Afterburner acceleration",
        speedBonus: 0.18,
        boostBonus: 0.25,
        turnBonus: -0.04
      },
      thrust_vector: {
        id: "thrust_vector",
        name: "3D Thrust-Vectoring Nozzles",
        desc: "+20% Pitch/Yaw responsiveness for rapid dogfight turns",
        speedBonus: 0.02,
        boostBonus: 0.08,
        turnBonus: 0.20
      }
    }
  },
  aerodynamics: {
    title: "Aerodynamics & Wings",
    options: {
      balanced: {
        id: "balanced",
        name: "Balanced Combat Airfoil",
        desc: "Factory standard lift-to-drag profile",
        speedBonus: 0,
        turnBonus: 0
      },
      clipped_speed: {
        id: "clipped_speed",
        name: "Supersonic Swept Wingtips",
        desc: "Reduces supersonic wave drag, +10% maximum cruising velocity",
        speedBonus: 0.10,
        turnBonus: -0.06
      },
      canard_vortex: {
        id: "canard_vortex",
        name: "Canard Vortex Generators",
        desc: "Enhances airflow over wings at high AoA, +16% turning authority",
        speedBonus: -0.04,
        turnBonus: 0.16
      }
    }
  },
  armor: {
    title: "Airframe & Armor",
    options: {
      standard: {
        id: "standard",
        name: "Aviation Aluminum-Lithium",
        desc: "Standard factory airframe weight and durability",
        hpBonus: 0,
        turnBonus: 0
      },
      composite: {
        id: "composite",
        name: "Carbon-Kevlar Ultralight",
        desc: "Significantly lowers airframe mass, +12% roll agility, -15 HP",
        hpBonus: -15,
        turnBonus: 0.12
      },
      titanium: {
        id: "titanium",
        name: "Reinforced Titanium Armor",
        desc: "+40 HP protection against cannon flak and direct missile blast",
        hpBonus: 40,
        turnBonus: -0.08
      }
    }
  },
  weapons: {
    title: "Weapons & Munitions",
    options: {
      tactical: {
        id: "tactical",
        name: "Standard Tactical Loadout",
        desc: "Optimal balance of 20mm rotary cannon, IR missiles, and flares",
        missilesBonus: 0,
        cannonBonus: 0,
        flaresBonus: 0,
        cannonDmgBonus: 0
      },
      gunship: {
        id: "gunship",
        name: "Heavy Missile Pylons",
        desc: "+2 Guided IR Missiles, +6 Flares, slightly reduced cannon ammo",
        missilesBonus: 2,
        cannonBonus: -200,
        flaresBonus: 6,
        cannonDmgBonus: 0
      },
      armor_piercing: {
        id: "armor_piercing",
        name: "30mm Armor-Piercing Cannon",
        desc: "+35% Cannon Damage per hit, +600 rounds, -2 missiles",
        missilesBonus: -2,
        cannonBonus: 600,
        flaresBonus: 4,
        cannonDmgBonus: 7
      }
    }
  }
};

export const DEFAULT_PLAYER_CONFIG = {
  modelId: "x17",
  liveryId: "grey",
  modifications: {
    engine: "standard",
    aerodynamics: "balanced",
    armor: "standard",
    weapons: "tactical"
  }
};

export function computeJetStats(modelId = "x17", mods = {}) {
  const model = JET_MODELS[modelId] || JET_MODELS.x17;
  const engMod = MODIFICATIONS.engine?.options?.[mods?.engine] || MODIFICATIONS.engine.options.standard;
  const aeroMod = MODIFICATIONS.aerodynamics?.options?.[mods?.aerodynamics] || MODIFICATIONS.aerodynamics.options.balanced;
  const armMod = MODIFICATIONS.armor?.options?.[mods?.armor] || MODIFICATIONS.armor.options.standard;
  const wpnMod = MODIFICATIONS.weapons?.options?.[mods?.weapons] || MODIFICATIONS.weapons.options.tactical;

  const speedMult = Math.max(0.7, model.baseStats.speedMult + (engMod.speedBonus || 0) + (aeroMod.speedBonus || 0));
  const turnMult = Math.max(0.6, model.baseStats.turnMult + (engMod.turnBonus || 0) + (aeroMod.turnBonus || 0) + (armMod.turnBonus || 0));
  const boostMult = Math.max(0.7, model.baseStats.boostMult + (engMod.boostBonus || 0));

  const maxHp = Math.max(50, model.baseStats.armor + (armMod.hpBonus || 0));
  const maxSpeedKmh = Math.round(model.baseStats.speedKmh * speedMult);
  const missiles = Math.max(2, model.baseStats.missiles + (wpnMod.missilesBonus || 0));
  const cannon = Math.max(400, model.baseStats.cannon + (wpnMod.cannonBonus || 0));
  const flares = Math.max(10, model.baseStats.flares + (wpnMod.flaresBonus || 0));
  const cannonDamage = Math.max(10, model.baseStats.cannonDamage + (wpnMod.cannonDmgBonus || 0));
  const agility = Math.round(model.baseStats.agility * turnMult);

  return {
    model,
    maxHp,
    maxSpeedKmh,
    speedMult,
    turnMult,
    boostMult,
    missiles,
    cannon,
    flares,
    cannonDamage,
    agility
  };
}

const STORAGE_KEY = "skybreak_jet_config_v1";

export function loadPlayerJetConfig() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_PLAYER_CONFIG };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PLAYER_CONFIG };
    const parsed = JSON.parse(raw);
    if (!JET_MODELS[parsed.modelId]) parsed.modelId = DEFAULT_PLAYER_CONFIG.modelId;
    if (!LIVERIES[parsed.liveryId]) parsed.liveryId = DEFAULT_PLAYER_CONFIG.liveryId;
    parsed.modifications = {
      ...DEFAULT_PLAYER_CONFIG.modifications,
      ...(parsed.modifications || {})
    };
    return parsed;
  } catch (err) {
    return { ...DEFAULT_PLAYER_CONFIG };
  }
}

export function savePlayerJetConfig(config) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (err) {
    return false;
  }
}
