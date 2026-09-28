import * as T from "three";
import { getBiomeAt } from "./GeoWorld.js";

const _biomeColor = new T.Color();

/**
 * Atmosphere Engine: Manages dynamic Time of Day (Day, Sunset, Night)
 * and Weather systems (Clear, Storm with rain & lightning)
 * with physically calibrated Rayleigh/Mie scattering parameters.
 */

const SKY_PRESETS = {
  morning: {
    sunColor: 0xffe2b8,
    sunIntensity: 2.3,
    sunDir: new T.Vector3(0.82, 0.25, 0.5).normalize(),
    moonDir: new T.Vector3(-0.6, 0.45, -0.6).normalize(),
    hemiSky: 0xa8cbee,
    hemiGround: 0x483e36,
    hemiIntensity: 0.95,
    fogColor: 0xa2b6c8,
    fogDensity: 14e-6,
    bgColor: 0xa2b6c8,
    skyTop: new T.Vector3(0.09, 0.25, 0.52),     // Soft dawn blue
    skyBottom: new T.Vector3(0.92, 0.76, 0.68),  // Amber dawn horizon blush
    sunGlow: new T.Vector3(1.0, 0.78, 0.48),     // Warm morning aureole
    waterDeep: new T.Vector3(0.02, 0.14, 0.20),
    waterShallow: new T.Vector3(0.42, 0.55, 0.62),
    waterSun: new T.Vector3(1.0, 0.82, 0.50)
  },
  midday: {
    sunColor: 0xffffff,
    sunIntensity: 2.7,
    sunDir: new T.Vector3(-0.45, 0.82, -0.35).normalize(),
    moonDir: new T.Vector3(0.55, 0.62, 0.55).normalize(),
    hemiSky: 0xbfe2ff,
    hemiGround: 0x424e3c,
    hemiIntensity: 1.05,
    fogColor: 0x8ab8cb,
    fogDensity: 13e-6,
    bgColor: 0x8ab8cb,
    skyTop: new T.Vector3(0.05, 0.22, 0.62),     // Deep crisp azure
    skyBottom: new T.Vector3(0.68, 0.82, 0.90),  // Bright clean horizon
    sunGlow: new T.Vector3(1.0, 0.96, 0.85),     // Intense solar disc
    waterDeep: new T.Vector3(0.012, 0.15, 0.22),
    waterShallow: new T.Vector3(0.35, 0.60, 0.70),
    waterSun: new T.Vector3(1.0, 0.88, 0.65)
  },
  day: {
    // Standard daytime preset
    sunColor: 0xfffbf2,
    sunIntensity: 2.6,
    sunDir: new T.Vector3(-0.55, 0.58, -0.6).normalize(),
    moonDir: new T.Vector3(0.55, 0.62, 0.55).normalize(),
    hemiSky: 0xb8dafc,
    hemiGround: 0x485845,
    hemiIntensity: 1.0,
    fogColor: 0x8ab8cb,
    fogDensity: 14e-6,
    bgColor: 0x8ab8cb,
    skyTop: new T.Vector3(0.07, 0.26, 0.59),
    skyBottom: new T.Vector3(0.68, 0.80, 0.87),
    sunGlow: new T.Vector3(1.0, 0.90, 0.72),
    waterDeep: new T.Vector3(0.015, 0.16, 0.19),
    waterShallow: new T.Vector3(0.38, 0.58, 0.67),
    waterSun: new T.Vector3(1.0, 0.76, 0.45)
  },
  sunset: {
    sunColor: 0xff7e26,
    sunIntensity: 2.8,
    sunDir: new T.Vector3(-0.92, 0.09, -0.38).normalize(),
    moonDir: new T.Vector3(0.55, 0.62, 0.55).normalize(),
    hemiSky: 0xb54e60,
    hemiGround: 0x3d251c,
    hemiIntensity: 0.92,
    fogColor: 0x582c3c,
    fogDensity: 16e-6,
    bgColor: 0x582c3c,
    skyTop: new T.Vector3(0.18, 0.08, 0.32),     // Twilight purple/indigo
    skyBottom: new T.Vector3(0.98, 0.44, 0.16),  // Fiery sunset ember
    sunGlow: new T.Vector3(1.0, 0.40, 0.12),     // Deep amber corona
    waterDeep: new T.Vector3(0.12, 0.08, 0.16),
    waterShallow: new T.Vector3(0.85, 0.42, 0.28),
    waterSun: new T.Vector3(1.0, 0.65, 0.3)
  },
  night: {
    sunColor: 0x7295bc,
    sunIntensity: 0.82,
    sunDir: new T.Vector3(-0.4, 0.7, -0.6).normalize(),
    moonDir: new T.Vector3(0.55, 0.62, 0.55).normalize(),
    hemiSky: 0x121c2e,
    hemiGround: 0x060c14,
    hemiIntensity: 0.48,
    fogColor: 0x070e18,
    fogDensity: 11e-6,
    bgColor: 0x070e18,
    skyTop: new T.Vector3(0.008, 0.016, 0.042),  // Deep cosmic sapphire
    skyBottom: new T.Vector3(0.030, 0.060, 0.10), // Night horizon silhouette
    sunGlow: new T.Vector3(0.68, 0.80, 1.0),     // Pale lunar glow
    waterDeep: new T.Vector3(0.005, 0.02, 0.04),
    waterShallow: new T.Vector3(0.08, 0.14, 0.22),
    waterSun: new T.Vector3(0.7, 0.85, 1.0)
  }
};

class Atmosphere {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.timeOfDay = "day";
    this.weather = "clear";

    // Dynamic lightning
    this.lightningTimer = 4 + Math.random() * 6;
    this.isFlashing = false;
    this.flashDuration = 0;
    this.flashIntensity = 0;

    // Rain particles
    this.rainCount = 1800;
    this.rainGeo = new T.BufferGeometry();
    this.rainPositions = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 600;
      this.rainPositions[i * 3 + 1] = Math.random() * 400;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 600;
    }
    this.rainGeo.setAttribute("position", new T.BufferAttribute(this.rainPositions, 3));
    this.rainMat = new T.PointsMaterial({
      color: 0x99ccff,
      size: 3.5,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    this.rainPoints = new T.Points(this.rainGeo, this.rainMat);
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);
  }

  setTimeOfDay(time) {
    if (!SKY_PRESETS[time]) return;
    this.hasApplied=true;
    this.timeOfDay = time;
    this.world.timeOfDay=time;
    this.world.sunDirection.copy(time === "night" ? SKY_PRESETS[time].moonDir : SKY_PRESETS[time].sunDir);
    const preset = SKY_PRESETS[time];

    this.scene.background.setHex(preset.bgColor);
    this.scene.fog.color.setHex(preset.fogColor);
    this.scene.fog.density = preset.fogDensity;
    if (this.world) this.world.baseFogDensity = preset.fogDensity;

    this.world.sun.color.setHex(preset.sunColor);
    this.world.sun.intensity = preset.sunIntensity;

    if (this.world.hemi) {
      this.world.hemi.color.setHex(preset.hemiSky);
      this.world.hemi.groundColor.setHex(preset.hemiGround);
      this.world.hemi.intensity = preset.hemiIntensity;
    }

    if (this.world.sky?.material?.uniforms) {
      const u = this.world.sky.material.uniforms;
      if (u.sunDir) u.sunDir.value.copy(preset.sunDir);
      if (u.moonDir && preset.moonDir) u.moonDir.value.copy(preset.moonDir);
      if (u.skyTop) u.skyTop.value.copy(preset.skyTop);
      if (u.skyBottom) u.skyBottom.value.copy(preset.skyBottom);
      if (u.sunGlow) u.sunGlow.value.copy(preset.sunGlow);
      if (u.isNight) u.isNight.value = time === "night" ? 1.0 : 0.0;
    }

    if (this.world.water?.material?.uniforms) {
      const wu = this.world.water.material.uniforms;
      if (wu.waterDeep) wu.waterDeep.value.copy(preset.waterDeep);
      if (wu.waterShallow) wu.waterShallow.value.copy(preset.waterShallow);
      if (wu.waterSun) wu.waterSun.value.copy(preset.waterSun);
      if (wu.sunDir) wu.sunDir.value.copy(this.world.sunDirection);
    }

    if (this.world?.clouds) {
      const cloudColors = { morning: 0xffecd6, midday: 0xf6faff, day: 0xf2f7fc, sunset: 0xffa066, night: 0x1a2638 };
      const cloudOpacities = { morning: 0.70, midday: 0.65, day: 0.66, sunset: 0.78, night: 0.42 };
      const cCol = cloudColors[time] || 0xf2f7fc;
      const cOp = cloudOpacities[time] || 0.66;
      for (const c of this.world.clouds) {
        if (c.material) {
          c.material.color.setHex(cCol);
          c.userData.baseOpacity=cOp;
          c.material.opacity = cOp;
        }
      }
    }
    this.applyWeather();
    this.world.onLightingChange?.();
  }

  setWeather(weather) {
    if(!['clear','storm'].includes(weather))return;
    this.weather=weather;this.world.weather=weather;
    this.setTimeOfDay(this.timeOfDay);
  }
  applyWeather() {
    const storm=this.weather==='storm',preset=SKY_PRESETS[this.timeOfDay];
    this.rainPoints.visible=storm;
    this.world.sky.material.uniforms.stormFactor.value=storm?1:0;
    this.world.sun.intensity=preset.sunIntensity*(storm?.55:1);
    this.world.baseFogDensity=preset.fogDensity*(storm?2.2:1);
    this.scene.fog.density=this.world.baseFogDensity;
    if(storm)for(const cloud of this.world.clouds){cloud.material.color.setHex(0x707b8a);cloud.userData.baseOpacity=.82;}
  }
  dispose(){this.rainPoints.removeFromParent();this.rainGeo.dispose();this.rainMat.dispose();}

  triggerLightning(audioManager) {
    this.isFlashing = true;
    this.flashDuration = 0.18;
    this.flashIntensity = 1.0;
    this.world.sun.intensity = 8.5;
    this.world.sun.color.setHex(0xe8f4ff);
    this.scene.fog.color.setHex(0xbdd8ff);

    if (this.world?.sky?.material?.uniforms?.lightningFlash) {
      this.world.sky.material.uniforms.lightningFlash.value = 1.0;
    }

    if (audioManager?.play) {
      audioManager.play("explosion", { distance: 1200 });
    }
  }

  update(dt, camera, playerPos, audioManager) {
    // Fade lightning flash uniform smoothly
    if (this.flashIntensity > 0) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 5.5);
      if (this.world?.sky?.material?.uniforms?.lightningFlash) {
        this.world.sky.material.uniforms.lightningFlash.value = this.flashIntensity;
      }
    }

    // Weather effects
    if (this.weather === "storm") {
      const pos = this.rainGeo.attributes.position.array;
      for (let i = 0; i < this.rainCount; i++) {
        pos[i * 3 + 1] -= 850 * dt;
        if (pos[i * 3 + 1] < -100) {
          pos[i * 3 + 1] = 300;
          pos[i * 3] = (Math.random() - 0.5) * 600;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
        }
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rainPoints.position.copy(camera.position);

      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.triggerLightning(audioManager);
        this.lightningTimer = 5 + Math.random() * 8;
      }

      if (this.isFlashing) {
        this.flashDuration -= dt;
        if (this.flashDuration <= 0) {
          this.isFlashing = false;
          this.setTimeOfDay(this.timeOfDay);
        }
      }
    } else if (playerPos && !this.isFlashing && this.timeOfDay === "day") {
      const biome = getBiomeAt(playerPos.x, playerPos.z);
      if (biome && biome.fogTint) {
        _biomeColor.setHex(biome.fogTint);
        this.scene.fog.color.lerp(_biomeColor, dt * 0.4);
      }
    }
  }
}

export {
  Atmosphere,
  SKY_PRESETS
};
