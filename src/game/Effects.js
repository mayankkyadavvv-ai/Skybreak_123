import * as T from "three";
export const CONTRAIL_PALETTE=Object.freeze([0x8ba9b7,0x81b0b5,0x9ebcc4,0x88a7b8]);

/**
 * Effects Engine: Manages particle systems, signature aerodynamic contrails,
 * multi-stage explosions, missile smoke trails, afterburner exhaust glow, and shockwaves.
 */
class Effects {
  constructor(scene) {
    this.scene = scene;
    this.capacity = 4200;
    this.particles = Array.from({ length: this.capacity }, () => ({
      p: new T.Vector3(),
      v: new T.Vector3(),
      life: 0,
      max: 1,
      color: new T.Color(),
      size: 1,
      expandRate: 1.5,
      gravity: 0
    }));
    this.cursor = 0;this.budget=this.capacity;this.intensity=1;

    const geo = new T.BufferGeometry();
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    this.channels=new Float32Array(this.capacity);this.alphas=new Float32Array(this.capacity);this.shapes=new Float32Array(this.capacity);
    geo.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new T.BufferAttribute(this.colors, 3));
    geo.setAttribute("size", new T.BufferAttribute(this.sizes, 1));
    geo.setAttribute("channel",new T.BufferAttribute(this.channels,1));
    geo.setAttribute("alpha",new T.BufferAttribute(this.alphas,1));
    geo.setAttribute("shape",new T.BufferAttribute(this.shapes,1));
    this.geometry = geo;

    const mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: T.AdditiveBlending,
      uniforms:{selectedChannel:{value:1}},
      vertexShader: `
        attribute float size; attribute float channel; attribute float alpha; attribute float shape;
        uniform float selectedChannel;
        varying vec3 vColor; varying float vAlpha; varying float vVisible; varying float vShape;
        void main() {
          vColor = color;vAlpha=alpha;vShape=shape;vVisible=abs(channel-selectedChannel)<.1?1.0:0.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = abs(channel-selectedChannel)<.1 ? clamp(size * 580.0 / max(1.0, -mv.z), 0.0, 100.0) : 0.0;
        }
      `,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha; varying float vVisible; varying float vShape;
        void main() {
          if(vVisible<.5)discard;
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (r > 1.0) discard;
          float alpha = pow(1.0 - r, 1.6) * 0.82;
          // Flares have a four-point star and compact core; aerodynamic trails
          // retain round soft puffs, so the distinction survives monochrome.
          if(vShape>.5){vec2 p=abs(gl_PointCoord-.5);float rays=exp(-min(p.x,p.y)*55.)*(1.-r);alpha=max(alpha*.55,rays*.9);}

          gl_FragColor = vec4(vColor, alpha*vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });

    this.points = new T.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    const smokeMaterial=mat.clone();smokeMaterial.blending=T.NormalBlending;smokeMaterial.uniforms.selectedChannel.value=0;
    this.smokePoints=new T.Points(geo,smokeMaterial);this.smokePoints.frustumCulled=false;scene.add(this.smokePoints);
    this.quality = 1;

    // 3D Expanding Explosion Shockwaves pool
    this.shockwaves = [];
    const ringGeo = new T.RingGeometry(0.8, 1.25, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const swMat = new T.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      const mesh = new T.Mesh(ringGeo, swMat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.shockwaves.push({
        mesh,
        mat: swMat,
        life: 0,
        maxLife: 0.65,
        maxRadius: 180
      });
    }

    // Pre-allocated vector for zero garbage collection
    this._tempV = new T.Vector3();this._tempP=new T.Vector3();this._tempW=new T.Vector3();
  }

  emit(pos, vel, color = 16753477, size = 20, life = 0.6, expandRate = 1.5, gravity = 0, glow = true, shape = 0) {
    if(this.intensity<=0)return;
    const index=this.cursor++ % this.budget;const p = this.particles[index];
    this.channels[index]=glow?1:0;p.glow=glow;this.shapes[index]=shape;
    p.p.copy(pos);
    p.v.copy(vel);
    p.color.set(color);
    p.size = size;
    p.life = p.max = life;
    p.expandRate = expandRate;
    p.gravity = gravity;
  }

  shockwave(pos, maxRadius = 180, color = 0xffaa44) {
    if (this.intensity<=0 || !this.shockwaves || this.shockwaves.length === 0) return;
    const sw = this.shockwaves.find((s) => s.life <= 0) || this.shockwaves[0];
    sw.mesh.position.copy(pos);
    sw.mesh.visible = true;
    sw.mat.color.set(color);
    sw.life = sw.maxLife = 0.65;
    sw.maxRadius = maxRadius;
    sw.mesh.scale.set(1.5, 1.5, 1.5);
    sw.mat.opacity = (this.reducedMotion?.15:.5)*Math.min(1,this.intensity);
  }

  /**
   * Multi-stage high-impact explosion sequence:
   * 1. Instantaneous ionizing flash
   * 2. Expanding 3D shockwave ring
   * 3. Fiery plasma core & tumbling shrapnel
   * 4. Lingering dark smoke plumes
   */
  burst(pos, count = 45, size = 24) {
    // Stage 1: Intense core flash
    if(!this.reducedMotion)this.emit(pos, this._tempV.set(0,0,0), 0xffe3b0, size * 1.8, .08, .5, 0);

    // Stage 2: 3D shockwave ring
    if (count >= 25) {
      this.shockwave(pos, size * 6.5, 0xffbb44);
    }

    const effectiveCount = Math.floor(count * this.quality);
    for (let i = 0; i < effectiveCount; i++) {
      const speed = 25 + Math.random() * 85;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const vx = Math.cos(theta) * Math.cos(phi) * speed;
      const vy = (Math.sin(phi) * 0.8 + 0.3) * speed;
      const vz = Math.sin(theta) * Math.cos(phi) * speed;
      const vel = new T.Vector3(vx, vy, vz);

      if (i % 4 === 0) {
        // Lingering dark smoke billowing upward
        this.emit(
          pos,
          new T.Vector3(vx * 0.15, 6 + Math.random() * 12, vz * 0.15),
          0x282a2e,
          size * (0.8 + Math.random() * 0.8),
          1.6 + Math.random() * 1.4,
          2.6,
          -1.2, false
        );
      } else if (i % 3 === 0) {
        // Fiery golden shrapnel / embers falling with gravity
        this.emit(pos, vel, 0xffd244, size * 0.5, 0.9 + Math.random() * 0.8, 1.2, -18);
      } else {
        // High-temperature fireball burst
        const col = i % 2 === 0 ? 0xff6b1a : 0xff3b11;
        this.emit(pos, vel, col, size * (0.6 + Math.random() * 0.9), 0.5 + Math.random() * 0.7, 2.0, 0);
      }
    }
  }

  smoke(pos, dark = false, size = 14) {
    const vel = new T.Vector3(
      (Math.random() - 0.5) * 6,
      6 + Math.random() * 8,
      (Math.random() - 0.5) * 6
    );
    const color = dark ? 0x222428 : 0x7c858e;
    this.emit(pos, vel, color, size, 1.6 + Math.random() * 0.6, 2.2, 0, false);
  }

  /**
   * Skybreak Signature Aerodynamic Contrail:
   * Uses non-white aerodynamic palette (icy blue / pale teal / cool bluish-grey)
   * Engine combustion glow is emitted separately at the nozzles.
   * Modulates trail length and dissipation based on altitude and airspeed.
   */
  contrail(pos, size = 16, life = 1.0, isBoost = false, altitude = 1500) {
    // Altitude-dependent trail persistence
    // Higher altitude (>5,000m) produces longer, denser stratospheric contrails
    const altFactor = Math.min(2.2, Math.max(0.65, altitude / 4200));
    const finalLife = life * altFactor;

    // Outer Aerodynamic Vortex (Icy Blue / Pale Teal)
    const palette = CONTRAIL_PALETTE;
    const aeroColor = palette[Math.floor(Math.random() * palette.length)];
    const driftVel = this._tempV.set(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.5
    );

    this.emit(pos, driftVel, aeroColor, size * 0.35, finalLife, 2.0, 0, false);


  }

  /**
   * Guided Missile Rocket Motor Smoke Plume & Exhaust Glow
   */
  missileTrail(pos, dir, speed = 400) {
    // Intense incandescent motor exhaust point
    this.emit(pos, this._tempV.set(0,0,0), 0xffc781, 12, 0.09, 0.5, 0);

    // Expanding rocket propellant smoke puff
    const wakeVel = this._tempV.copy(dir).multiplyScalar(-speed * 0.08).add(this._tempW.set(
      (Math.random() - 0.5) * 3,
      1.5 + Math.random() * 2,
      (Math.random() - 0.5) * 3
    ));
    this.emit(pos, wakeVel, 0xa19b89, 10, 1.3, 2.5, 0, false);
  }

  waterWake(pos, vel, speed = 250) {
    const sprayCount = Math.min(5, Math.max(2, Math.floor(speed / 60)));
    for (let i = 0; i < sprayCount; i++) {
      const sprayVel = new T.Vector3(
        (Math.random() - 0.5) * 16,
        3.0 + Math.random() * 7.0,
        (Math.random() - 0.5) * 16
      ).addScaledVector(vel, 0.08);

      const sprayPos = new T.Vector3(
        pos.x + (Math.random() - 0.5) * 8,
        1.5 + Math.random() * 1.5,
        pos.z + (Math.random() - 0.5) * 8
      );

      this.emit(
        sprayPos,
        sprayVel,
        i % 2 === 0 ? 0xffffff : 0xd2edfc,
        22 + Math.random() * 16,
        0.85 + Math.random() * 0.65,
        1.8,
        -9.8, false
      );
    }
  }

  exhaustGlow(pos, vel) {
    const p = new T.Vector3(
      pos.x + (Math.random() - 0.5) * 1.4,
      pos.y + (Math.random() - 0.5) * 1.4,
      pos.z + (Math.random() - 0.5) * 1.4
    );
    const v = new T.Vector3(
      (Math.random() - 0.5) * 1.5,
      2.0 + Math.random() * 2.5,
      (Math.random() - 0.5) * 1.5
    ).addScaledVector(vel, 0.15);
    this.emit(p, v, 0xffd588, 18, 0.22, 1.4, 0);
  }

  update(dt) {
    for (let i = 0; i < this.budget; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life > 0) {
        if (p.gravity !== 0) {
          p.v.y += p.gravity * dt;
        }
        p.p.addScaledVector(p.v, dt);
        p.v.multiplyScalar(Math.exp(-0.6 * dt));

        const idx = i * 3;
        this.positions[idx] = p.p.x;
        this.positions[idx + 1] = p.p.y;
        this.positions[idx + 2] = p.p.z;

        const f = p.life / p.max;
        const luminance=p.glow?2.5:1;
        this.colors[idx]=p.color.r*luminance;this.colors[idx+1]=p.color.g*luminance;this.colors[idx+2]=p.color.b*luminance;
        this.alphas[i]=f*Math.min(1,this.intensity)*(p.glow?1:.5);

        // Smooth aerodynamic wake expansion
        this.sizes[i] = p.size * (1 + (1 - f) * p.expandRate);
      } else {
        this.sizes[i] = 0;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.channel.needsUpdate=true;this.geometry.attributes.alpha.needsUpdate=true;this.geometry.attributes.shape.needsUpdate=true;

    // Update 3D shockwave rings
    if (this.shockwaves) {
      for (const sw of this.shockwaves) {
        if (sw.life > 0) {
          sw.life -= dt;
          const progress = 1 - Math.max(0, sw.life / sw.maxLife);
          // Ease-out expansion
          const r = Math.max(2, sw.maxRadius * Math.sin(progress * Math.PI * 0.5));
          sw.mesh.scale.set(r, r, r);
          sw.mat.opacity = Math.max(0, (sw.life / sw.maxLife) * (this.reducedMotion?.15:.5))*Math.min(1,this.intensity);
          if (sw.life <= 0) sw.mesh.visible = false;
        }
      }
    }
  }

  setReducedMotion(value){this.reducedMotion=!!value;}
  flareBurst(jet){
    const count=Math.max(6,Math.floor(18*this.quality));
    for(let i=0;i<count;i++){
      this._tempV.set((i%2?1:-1)*(28+(i%4)*11),-8-(i%3)*5,38+(i%5)*12).applyQuaternion(jet.quaternion).addScaledVector(jet.velocity,.65);
      this.emit(jet.position,this._tempV,0xffc46c,7,.85+(i%4)*.16,.35,-5,true,1);
    }
  }
  setQuality(budget,intensity=1){this.budget=Math.min(this.capacity,Math.max(1,Math.floor(budget)));this.intensity=intensity;this.quality=this.budget/this.capacity;this.geometry.setDrawRange(0,this.budget);for(let i=this.budget;i<this.capacity;i++){this.particles[i].life=0;this.sizes[i]=0;}if(intensity===0)this.clear();}
  dispose(){this.points.removeFromParent();this.smokePoints.removeFromParent();this.geometry.dispose();this.points.material.dispose();this.smokePoints.material.dispose();const geometries=new Set();for(const sw of this.shockwaves){sw.mesh.removeFromParent();geometries.add(sw.mesh.geometry);sw.mat.dispose();}for(const geo of geometries)geo.dispose();}
  clear() {
    this.particles.forEach((p) => (p.life = 0));
    if (this.shockwaves) {
      this.shockwaves.forEach((sw) => {
        sw.life = 0;
        sw.mesh.visible = false;
      });
    }
    this.update(0);
  }
}

export { Effects };
