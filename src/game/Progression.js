import { normalizeOpenSkiesProgress } from './OpenSkiesProgress.js';
/**
 * Progression.js - Pilot Career & Progression System for Skybreak
 * Implements 8 Indian Air Force-inspired ranks, XP gain tracking, unlocks, and statistics.
 */

export const RANKS = [
  {
    level: 1,
    name: "Flight Cadet",
    code: "CDT",
    minXP: 0,
    nextXP: 500,
    insignia: "★",
    unlockType: "jet",
    unlockId: "x17",
    unlockName: "X-17 Kestrel",
    unlockDesc: "Standard issue multirole tactical fighter"
  },
  {
    level: 2,
    name: "Flying Officer",
    code: "FG OFFR",
    minXP: 500,
    nextXP: 1200,
    insignia: "★―",
    unlockType: "jet",
    unlockId: "su57",
    unlockName: "SU-57S Ghost & Overdrive Turbofan",
    unlockDesc: "Heavy air-superiority fighter with thrust-vectoring"
  },
  {
    level: 3,
    name: "Flight Lieutenant",
    code: "FLT LT",
    minXP: 1200,
    nextXP: 2200,
    insignia: "★★",
    unlockType: "livery",
    unlockId: "desert",
    unlockName: "Desert Mirage Livery",
    unlockDesc: "Tactical desert camouflage scheme"
  },
  {
    level: 4,
    name: "Squadron Leader",
    code: "SQN LDR",
    minXP: 2200,
    nextXP: 3500,
    insignia: "★★―",
    unlockType: "jet",
    unlockId: "f22",
    unlockName: "F-22R Phantom & Armor Tub",
    unlockDesc: "5th-gen stealth interceptor with 2D nozzles"
  },
  {
    level: 5,
    name: "Wing Commander",
    code: "WG CDR",
    minXP: 3500,
    nextXP: 5200,
    insignia: "★★★",
    unlockType: "jet",
    unlockId: "vajra9",
    unlockName: "Vajra-9 (Tejas Mk2)",
    unlockDesc: "Supreme agility tailless compound delta fighter"
  },
  {
    level: 6,
    name: "Group Captain",
    code: "GP CAPT",
    minXP: 5200,
    nextXP: 7500,
    insignia: "★★★―",
    unlockType: "livery",
    unlockId: "arctic",
    unlockName: "Arctic Blizzard Livery & 3D Nozzles",
    unlockDesc: "Himalayan tactical slate camouflage"
  },
  {
    level: 7,
    name: "Air Commodore",
    code: "AIR CMDE",
    minXP: 7500,
    nextXP: 10500,
    insignia: "◆★★",
    unlockType: "jet",
    unlockId: "a10x",
    unlockName: "A-10X Thunderstrike & 30mm Cannon",
    unlockDesc: "Close air support heavy armor gunship"
  },
  {
    level: 8,
    name: "Air Marshal",
    code: "AIR MSHL",
    minXP: 10500,
    nextXP: 10500,
    insignia: "◆★★★",
    unlockType: "livery",
    unlockId: "gold",
    unlockName: "Ace Gold & Crimson Livery",
    unlockDesc: "Prestigious championship squadron commander livery"
  }
];

const DEFAULT_PROFILE = {
  callsign: "Garuda-1",
  xp: 0,
  kills: 0,
  missileKills: 0,
  cannonKills: 0,
  landings: 0,
  flaresUsed: 0,
  missionsWon: 0,
  distanceFlownKm: 0,
  flightTimeSec: 0,
  shotsFired: 0,
  shotsHit: 0
};

const STORAGE_KEY = "skybreak_pilot_profile_v1";

export class ProgressionManager {
  constructor() {
    this.profile = this.loadProfile();
    this.listeners = {
      xp: [],
      levelUp: []
    };
  }

  loadProfile() {
    try {
      if (typeof localStorage !== "undefined") {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid profile');
          const profile = { ...DEFAULT_PROFILE, ...parsed };
          for (const [key, value] of Object.entries(DEFAULT_PROFILE)) {
            if (typeof value === 'number') profile[key] = Number.isFinite(profile[key]) ? Math.max(0, Math.min(1e12, profile[key])) : value;
          }
          profile.callsign = typeof profile.callsign === 'string' ? profile.callsign.slice(0, 16) : DEFAULT_PROFILE.callsign;
          profile.openSkies = normalizeOpenSkiesProgress(profile.openSkies);
          return profile;
        }
      }
    } catch {
      // Fallback on error
    }
    return { ...DEFAULT_PROFILE, openSkies: normalizeOpenSkiesProgress() };
  }

  saveProfile() {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      }
    } catch {
      // Storage unavailable or disabled
    }
  }

  setCallsign(newCallsign) {
    if (!newCallsign || typeof newCallsign !== "string") return;
    this.profile.callsign = newCallsign.trim().slice(0, 16);
    this.saveProfile();
  }

  getRankForXP(xp) {
    let rank = RANKS[0];
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (xp >= RANKS[i].minXP) {
        rank = RANKS[i];
        break;
      }
    }
    return rank;
  }

  getCurrentRank() {
    return this.getRankForXP(this.profile.xp);
  }

  getRankProgress() {
    const rank = this.getCurrentRank();
    if (rank.level === RANKS.length) {
      return { rank, percent: 100, current: rank.minXP, target: rank.minXP };
    }
    const current = this.profile.xp - rank.minXP;
    const span = rank.nextXP - rank.minXP;
    const percent = Math.min(100, Math.max(0, (current / span) * 100));
    return { rank, percent, current: this.profile.xp, target: rank.nextXP };
  }

  isUnlocked(category, itemId) {
    if (!itemId) return true;
    if (itemId === "x17" || itemId === "grey" || itemId === "standard") return true;

    const currentRank = this.getCurrentRank();
    for (const r of RANKS) {
      if (r.unlockId === itemId) {
        return currentRank.level >= r.level;
      }
    }
    return true;
  }

  awardXP(amount, reason = "COMBAT ACTION") {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const prevRank = this.getCurrentRank();
    this.profile.xp += amount;
    const newRank = this.getCurrentRank();

    const leveledUp = newRank.level > prevRank.level;
    this.saveProfile();

    const event = {
      amount,
      reason,
      totalXP: this.profile.xp,
      leveledUp,
      prevRank,
      newRank
    };

    this.listeners.xp.forEach(fn => {
      try { fn(event); } catch {}
    });

    if (leveledUp) {
      this.listeners.levelUp.forEach(fn => {
        try { fn(event); } catch {}
      });
    }

    return event;
  }

  recordKill(weaponType = "cannon") {
    this.profile.kills++;
    if (weaponType === "missile") {
      this.profile.missileKills++;
      return this.awardXP(200, "MISSILE KILL +200 XP");
    } else {
      this.profile.cannonKills++;
      return this.awardXP(150, "CANNON KILL +150 XP");
    }
  }

  recordLanding(baseName = "AIRBASE") {
    this.profile.landings++;
    return this.awardXP(300, "TOUCHDOWN @ " + baseName + " +300 XP");
  }

  recordMissionWin(missionTitle = "SORTIE") {
    this.profile.missionsWon++;
    return this.awardXP(500, missionTitle + " ACCOMPLISHED +500 XP");
  }

  recordFlareDeflection() {
    this.profile.flaresUsed++;
    return this.awardXP(50, "MISSILE DEFLECTED +50 XP");
  }

  addFlightDistance(meters) {
    this.profile.distanceFlownKm += meters / 1000;
  }

  onXPAward(callback) {
    this.listeners.xp.push(callback);
  }

  onLevelUp(callback) {
    this.listeners.levelUp.push(callback);
  }
}

export const progression = new ProgressionManager();
