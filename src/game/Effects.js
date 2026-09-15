import * as T from "three";

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.capacity = 2600;
    this.particles = Array.from({ length: this.capacity }, () => ({
      p: new T.Vector3(),
      v: new T.Vector3(),
      life: 0,
      max: 1,
      color: new T.Color(),
      size: 1
    }));
    this.cursor = 0;
    const geo = new T.BufferGeometry();
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    geo.setAttribute("position", new T.BufferAttribute(this.positions, 3));
    geo.setAttribute("color", new T.BufferAttribute(this.colors, 3));
    geo.setAttribute("size", new T.BufferAttribute(this.sizes, 1));
    this.geometry = geo;
    const mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: T.AdditiveBlending,
      vertexShader: `attribute float size;
      varying vec3 vColor;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vColor=color;
        vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mv;
        #include <logdepthbuf_vertex>
        gl_PointSize=clamp(size*550.0/max(1.0,-mv.z),0.0,110.0);
      }`,
      fragmentShader: `varying vec3 vColor;
      #include <logdepthbuf_pars_fragment>
      void main(){
        float r=length(gl_PointCoord-0.5)*2.0;
        if(r>1.0)discard;
        #include <logdepthbuf_fragment>
        gl_FragColor=vec4(vColor,(1.0-smoothstep(0.18,1.0,r))*0.85);
      }`
    });
    this.points = new T.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.quality = 1;
    this.smokePool=Array.from({length:500},()=>({p:new T.Vector3(),v:new T.Vector3(),life:0,max:1,size:1,dark:false}));
    this.smokeCursor=0;
    const sg=new T.BufferGeometry();
    this.smokePositions=new Float32Array(1500);this.smokeSizes=new Float32Array(500);this.smokeOpacity=new Float32Array(500);this.smokeTone=new Float32Array(500);
    sg.setAttribute('position',new T.BufferAttribute(this.smokePositions,3));sg.setAttribute('size',new T.BufferAttribute(this.smokeSizes,1));sg.setAttribute('opacity',new T.BufferAttribute(this.smokeOpacity,1));sg.setAttribute('tone',new T.BufferAttribute(this.smokeTone,1));
    this.smokeGeometry=sg;
    const sm=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.NormalBlending,
      vertexShader:`attribute float size;attribute float opacity;attribute float tone;varying float a;varying float t;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){a=opacity;t=tone;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*650./max(1.,-mv.z),0.,180.);
      #include <logdepthbuf_vertex>
      }`,
      fragmentShader:`varying float a;varying float t;
      #include <logdepthbuf_pars_fragment>
      void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      #include <logdepthbuf_fragment>
      float soft=pow(1.-r,1.3);gl_FragColor=vec4(mix(vec3(.72,.77,.8),vec3(.09,.085,.08),t),soft*a);}`});
    const smokePoints=new T.Points(sg,sm);smokePoints.frustumCulled=false;scene.add(smokePoints);


    // 3D Expanding Explosion Shockwaves pool
    this.shockwaves = [];
    const ringGeo = new T.RingGeometry(0.94, 1.06, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
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
  }

  emit(pos, vel, color = 16753477, size = 20, life = 0.6) {
    const p = this.particles[this.cursor++ % this.capacity];
    p.p.copy(pos);
    p.v.copy(vel);
    p.color.set(color);
    p.size = size;
    p.life = p.max = life;
  }

  shockwave(pos, maxRadius = 180, color = 0xffaa44) {
    if (!this.shockwaves || this.shockwaves.length === 0) return;
    const sw = this.shockwaves.find((s) => s.life <= 0) || this.shockwaves[0];
    sw.mesh.position.copy(pos);
    sw.mesh.visible = true;
    sw.mat.color.set(color);
    sw.life = sw.maxLife = 0.65;
    sw.maxRadius = maxRadius;
    sw.mesh.scale.set(1.5, 1.5, 1.5);
    sw.mat.opacity = 0.85;
  }

  burst(pos, count = 45, size = 24) {
    if (count >= 30) {
      this.shockwave(pos, size * 5.5, 0xffaa44);
      for(let i=0;i<18;i++) this.smoke(pos,true,size*(1+Math.random()));
    }
    for (let i = 0; i < count * this.quality; i++) {
      this.emit(
        pos,
        new T.Vector3((Math.random() - 0.5) * 100, (Math.random() - 0.25) * 90, (Math.random() - 0.5) * 100),
        i % 3 ? 16751927 : 16772532,
        size * (0.5 + Math.random()),
        0.5 + Math.random() * 1.8
      );
    }
  }

  smoke(pos, dark=false, size=14) {
    const p=this.smokePool[this.smokeCursor++%this.smokePool.length];
    p.p.copy(pos);p.v.set((Math.random()-.5)*3,4+Math.random()*3,(Math.random()-.5)*3);
    p.life=p.max=dark?3.8:2.4;p.size=size;p.dark=dark;
  }
  tireSmoke(pos,velocity) {
    for(let i=0;i<18;i++) {this.smoke(pos,false,5+Math.random()*8);const p=this.smokePool[(this.smokeCursor-1)%this.smokePool.length];p.v.addScaledVector(velocity,.15);p.v.y=1+Math.random();}
  }

  contrail(pos, size = 14, life = 0.9) {
    this.emit(pos, new T.Vector3(0, 0, 0), 0xddeeff, size, life);
  }

  update(dt) {
    this.smokePool.forEach((p,i)=>{
      p.life=Math.max(0,p.life-dt);
      const f=p.life/p.max;
      p.p.addScaledVector(p.v,dt);
      this.smokePositions.set([p.p.x,p.p.y,p.p.z],i*3);
      this.smokeSizes[i]=p.life>0?p.size*(1+(1-f)*3):0;
      this.smokeOpacity[i]=Math.min(1,(1-f)*8)*f*.7;
      this.smokeTone[i]=p.dark?1:0;
    });
    for(const a of Object.values(this.smokeGeometry.attributes))a.needsUpdate=true;

    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life > 0) {
        p.p.addScaledVector(p.v, dt);
        p.v.multiplyScalar(Math.exp(-0.6 * dt));
        const idx = i * 3;
        this.positions[idx] = p.p.x;
        this.positions[idx + 1] = p.p.y;
        this.positions[idx + 2] = p.p.z;
        const f = p.life / p.max;
        this.colors[idx] = p.color.r * f;
        this.colors[idx + 1] = p.color.g * f;
        this.colors[idx + 2] = p.color.b * f;
        this.sizes[i] = p.size * (1 + (1 - f) * 1.5);
      } else {
        this.sizes[i] = 0;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;

    // Update 3D shockwave rings
    if (this.shockwaves) {
      for (const sw of this.shockwaves) {
        if (sw.life > 0) {
          sw.life -= dt;
          const progress = 1 - Math.max(0, sw.life / sw.maxLife);
          // Ease-out expansion
          const r = Math.max(2, sw.maxRadius * Math.sin(progress * Math.PI * 0.5));
          sw.mesh.scale.set(r, r, r);
          sw.mat.opacity = Math.max(0, (sw.life / sw.maxLife) * 0.85);
          if (sw.life <= 0) sw.mesh.visible = false;
        }
      }
    }
  }

  clear() {
    this.particles.forEach((p) => (p.life = 0));
    this.smokePool.forEach(p=>p.life=0);
    if (this.shockwaves) {
      this.shockwaves.forEach((sw) => {
        sw.life = 0;
        sw.mesh.visible = false;
      });
    }
    this.update(0);
  }
}

export {
  Effects
};
