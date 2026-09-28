import * as T from "three";

/**
 * SpeedEffects: Manages high-speed aerodynamic rush streaks,
 * transonic sonic boom audio, and cloud-entry moisture condensation.
 */
class SpeedEffects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.streakCount = 240;

    // Buffer for peripheral speed streaks
    const geo = new T.BufferGeometry();
    this.positions = new Float32Array(this.streakCount * 6); // 2 vertices per line
    this.colors = new Float32Array(this.streakCount * 6);
    this.offsets = [];

    const streakColor = new T.Color(0x88eeff);
    for (let i = 0; i < this.streakCount; i++) {
      // Cylindrical distribution around camera forward axis
      const theta = Math.random() * Math.PI * 2;
      const radius = 12 + Math.random() * 45;
      const z = -20 - Math.random() * 85;
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius;
      const len = 8 + Math.random() * 22;

      this.offsets.push({ x, y, z, len, radius, theta, speedMult: 0.8 + Math.random() * 0.4 });

      const idx = i * 6;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;
      this.positions[idx + 3] = x;
      this.positions[idx + 4] = y;
      this.positions[idx + 5] = z - len;

      const alpha = 0.2 + Math.random() * 0.5;
      for (let v = 0; v < 2; v++) {
        this.colors[idx + v * 3] = streakColor.r * alpha;
        this.colors[idx + v * 3 + 1] = streakColor.g * alpha;
        this.colors[idx + v * 3 + 2] = streakColor.b * alpha;
      }
    }

    geo.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new T.BufferAttribute(this.colors, 3));

    this.mat = new T.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: T.AdditiveBlending,
      depthWrite: false
    });

    this.lines = new T.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);

    // Sonic boom state tracking
    this.wasSupersonic = false;
    this.sonicBoomTimer = 0;

    // Cloud condensation density (0 to 1)
    this.cloudMoisture = 0;
  }

  setQuality(count,intensity=1){this.activeCount=Math.min(this.streakCount,count);this.intensity=intensity;this.lines.geometry.setDrawRange(0,this.activeCount*2);}

  update(dt, player, camera, audioManager, world) {
    if (!player || !player.alive) {
      this.mat.opacity = 0;
      return;
    }

    const speed = player.speed || 0;
    const kmh = speed * 3.6;
    const isSupersonic = speed > 335; // Mach 1 threshold (~1206 km/h)
    const isLowAlt = player.position.y < 220;
    const isBoosting = player.boost;

    // Sonic boom trigger when transitioning from subsonic to supersonic
    if (isSupersonic && !this.wasSupersonic && speed > 340) {
      this.sonicBoomTimer = 0.8;
      if (audioManager?.play) {
        audioManager.play("explosion", { distance: 150 });
      }
    }
    this.wasSupersonic = isSupersonic;

    // Speed streaks intensity
    // Appears during boost, supersonic flight, or high-speed low-altitude passes
    let targetOpacity = 0;
    if (isBoosting) {
      targetOpacity = 0.75;
    } else if (kmh > 1050) {
      targetOpacity = Math.min(0.65, (kmh - 1050) / 450);
    } else if (isLowAlt && kmh > 750) {
      targetOpacity = Math.min(0.55, (kmh - 750) / 350 * (1 - player.position.y / 220));
    }

    targetOpacity*=this.intensity ?? 1;
    this.mat.opacity += (targetOpacity - this.mat.opacity) * Math.min(1, dt * 6);

    // Position streak lines around camera orientation
    if (this.mat.opacity > 0.01) {
      this.lines.visible = true;
      this.lines.position.copy(camera.position);
      this.lines.quaternion.copy(camera.quaternion);

      const posArr = this.positions;
      for (let i = 0; i < (this.activeCount ?? this.streakCount); i++) {
        const off = this.offsets[i];
        off.z += (speed * 0.45 * off.speedMult + 180) * dt;
        if (off.z > 5) {
          off.z = -85 - Math.random() * 35;
          const theta = Math.random() * Math.PI * 2;
          const r = 14 + Math.random() * 45;
          off.x = Math.cos(theta) * r;
          off.y = Math.sin(theta) * r;
        }

        const idx = i * 6;
        posArr[idx] = off.x;
        posArr[idx + 1] = off.y;
        posArr[idx + 2] = off.z;
        posArr[idx + 3] = off.x;
        posArr[idx + 4] = off.y;
        posArr[idx + 5] = off.z - off.len * (1 + speed / 250);
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
    } else {
      this.lines.visible = false;
    }

    // Cloud penetration moisture detection
    // Lower Cumulus Deck sits between 2400m and 3800m
    const targetMoisture = world?.cloudDensityAt?.(player.position) || 0;
    this.cloudMoisture += (targetMoisture - this.cloudMoisture) * Math.min(1, dt * 2.5);
  }

  dispose() {
    if (this.lines) {
      this.scene.remove(this.lines);
      this.lines.geometry.dispose();
      this.mat.dispose();
    }
  }
}

export { SpeedEffects };
