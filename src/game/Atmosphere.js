import * as T from "three";
import { getBiomeAt } from "./GeoWorld.js";

const _biomeColor = new T.Color();

/**
 * Atmosphere Engine: Manages dynamic Time of Day (Day, Sunset, Night)
 * and Weather systems (Clear, Storm with rain & lightning).
 */

const SKY_PRESETS = {
  day: {
    sunColor: 0xfffaf0,
    sunIntensity: 3.8,
    sunDir: new T.Vector3(-0.6, 0.35, -0.7).normalize(),
    hemiSky: 0xbaddf0,
    hemiGround: 0x526b3f,
    hemiIntensity: 2.0,
    fogColor: 0x8db4c3,
    fogDensity: 39e-6,
    bgColor: 0x8ab8cb,
    skyTop: new T.Vector3(0.12, 0.31, 0.51),
    skyBottom: new T.Vector3(0.66, 0.77, 0.82),
    sunGlow: new T.Vector3(1.0, 0.72, 0.43),
    waterDeep: new T.Vector3(0.015, 0.16, 0.19),
    waterShallow: new T.Vector3(0.38, 0.58, 0.67),
    waterSun: new T.Vector3(1.0, 0.76, 0.45)
  },
  sunset: {
    sunColor: 0xffa751,
    sunIntensity: 4.2,
    sunDir: new T.Vector3(-0.85, 0.12, -0.5).normalize(),
    hemiSky: 0xb56372,
    hemiGround: 0x482a20,
    hemiIntensity: 1.8,
    fogColor: 0x553245,
    fogDensity: 46e-6,
    bgColor: 0x553245,
    skyTop: new T.Vector3(0.24, 0.12, 0.38),
    skyBottom: new T.Vector3(0.98, 0.48, 0.22),
    sunGlow: new T.Vector3(1.0, 0.42, 0.15),
    waterDeep: new T.Vector3(0.12, 0.08, 0.16),
    waterShallow: new T.Vector3(0.85, 0.42, 0.28),
    waterSun: new T.Vector3(1.0, 0.65, 0.3)
  },
  night: {
    sunColor: 0x5a7ca8,
    sunIntensity: 0.8,
    sunDir: new T.Vector3(-0.4, 0.7, -0.6).normalize(),
    hemiSky: 0x141f32,
    hemiGround: 0x050a12,
    hemiIntensity: 0.6,
    fogColor: 0x070d18,
    fogDensity: 32e-6,
    bgColor: 0x070d18,
    skyTop: new T.Vector3(0.015, 0.03, 0.08),
    skyBottom: new T.Vector3(0.05, 0.09, 0.16),
    sunGlow: new T.Vector3(0.65, 0.75, 0.95),
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
    this.timeOfDay = time;
    const preset = SKY_PRESETS[time];

    this.scene.background.setHex(preset.bgColor);
    this.scene.fog.color.setHex(preset.fogColor);
    this.scene.fog.density = preset.fogDensity;

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
      if (wu.sunDir) wu.sunDir.value.copy(preset.sunDir);
    }
  }

  setWeather(w) {
    this.weather = w;
    this.rainPoints.visible = w === "storm";
    if (w === "storm") {
      this.scene.fog.density *= 1.8;
      this.world.sun.intensity *= 0.45;
    } else {
      this.setTimeOfDay(this.timeOfDay);
    }
  }

  triggerLightning(audioManager) {
    this.isFlashing = true;
    this.flashDuration = 0.18;
    this.world.sun.intensity = 8.5;
    this.world.sun.color.setHex(0xe8f4ff);
    this.scene.fog.color.setHex(0xbdd8ff);

    // Play thunder sound if audioManager has it or synthesize thunder rumble
    if (audioManager?.play) {
      audioManager.play("explosion", { distance: 1200 });
    }
  }

  update(dt, camera, playerPos, audioManager) {
    // Weather effects
    if (this.weather === "storm") {
      // Rain movement relative to player/camera
      const pos = this.rainGeo.attributes.position.array;
      for (let i = 0; i < this.rainCount; i++) {
        pos[i * 3 + 1] -= 850 * dt; // Fall speed
        if (pos[i * 3 + 1] < -100) {
          pos[i * 3 + 1] = 300;
          pos[i * 3] = (Math.random() - 0.5) * 600;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
        }
      }
      this.rainGeo.attributes.position.needsUpdate = true;
      this.rainPoints.position.copy(camera.position);

      // Random lightning
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
      // Dynamic regional biome atmospheric lighting & fog tint
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
