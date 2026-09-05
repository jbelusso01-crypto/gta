/* ==========================================================================
   world.js - ciclo dia/noite, ceu, servicos da cidade (lojas, hospital,
   delegacia, oficina) e itens colecionaveis.
   ========================================================================== */
'use strict';
var G = window.G;

G.world = {
  time: 9.5,            /* hora do dia 0..24 */
  daySpeed: 1 / 90,     /* 1 minuto real ~ 1.5 h de jogo */
  night: false,
  sun: null, hemi: null, sky: null, stars: null, sunSprite: null,
  hospital: { x: 0, z: 0 }, policeStation: { x: 0, z: 0 },
  services: [],

  init(scene, renderer) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x5b6b46, 0.85);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110;
    sc.near = 1; sc.far = 420;
    this.sun.shadow.bias = -0.0009;
    scene.add(this.sun); scene.add(this.sun.target);

    /* domo do ceu */
    const geo = new THREE.SphereGeometry(1400, 20, 14);
    const mat = new THREE.MeshBasicMaterial({ map: G.TEX.sky, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    /* estrelas */
    const sg = new THREE.BufferGeometry();
    const n = 500, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * 6.283, ph = Math.acos(G.rnd(-0.05, 1));
      arr[i * 3] = Math.sin(ph) * Math.cos(th) * 1200;
      arr[i * 3 + 1] = Math.cos(ph) * 1200;
      arr[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 1200;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    /* sol / lua */
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: G.TEX.spark, color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    this.sunSprite.scale.setScalar(160);
    scene.add(this.sunSprite);

    this.placeServices(scene);
  },

  /* ---------------------------------------------------------- servicos */
  placeServices(scene) {
    const C = G.CITY, P = C.P;
    const S = (type, i, j, name, color) => {
      const b = G.blockAt(i, j);
      const x = (i + 0.5) * P, z = (j + 0.5) * P - C.BLOCK / 2 - C.RW * 0.32;
      const s = { type, x, z, name, color, r: type === 'paynspray' ? 6.5 : 4.2, cd: 0 };
      this.services.push(s);
      /* marcador cilindrico */
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(s.r * 0.8, s.r * 0.8, 7, 18, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      );
      m.position.set(x, 3.5, z);
      scene.add(m);
      s.mesh = m;
      /* placa */
      const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.5, 0.4),
        new THREE.MeshBasicMaterial({ color }));
      sign.position.set(x, 5.4, z - 1.2);
      scene.add(sign);
      return s;
    };
    S('ammunation', 1, -1, 'Casa de Armas', 0xff8c3a);
    S('ammunation', -5, 4, 'Casa de Armas', 0xff8c3a);
    S('paynspray', -2, 2, 'Oficina', 0x38d68a);
    S('paynspray', 5, -4, 'Oficina', 0x38d68a);
    S('food', 2, 2, 'Lanchonete', 0xff5c8a);
    S('food', -4, -3, 'Lanchonete', 0xff5c8a);
    S('food', 6, 5, 'Lanchonete', 0xff5c8a);
    S('save', -1, -2, 'Casa Segura', 0xffd23f);
    const hosp = S('hospital', 3, 0, 'Hospital', 0xff4d4d);
    const pol = S('police', -3, -1, 'Delegacia', 0x4aa3ff);
    this.hospital = { x: hosp.x, z: hosp.z + 8 };
    this.policeStation = { x: pol.x, z: pol.z + 8 };
  },

  serviceAt(x, z) {
    for (const s of this.services) {
      if (G.dist2(x, z, s.x, s.z) < s.r * s.r) return s;
    }
    return null;
  },

  /* -------------------------------------------------------------- update */
  update(dt, px, pz) {
    this.time = (this.time + dt * this.daySpeed * 24 / 60) % 24;
    const t = this.time;
    /* 0 = meia-noite. Elevacao do sol */
    const ang = (t / 24) * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin((t - 6) / 12 * Math.PI);          /* +1 ao meio-dia */
    const day = G.clamp(elev * 1.5 + 0.15, 0, 1);
    this.night = elev < -0.05;

    this.sun.position.set(px + Math.cos(ang) * 200, 60 + elev * 190, pz + Math.sin(ang) * 90 + 60);
    this.sun.target.position.set(px, 0, pz);
    this.sun.intensity = 0.1 + day * 0.95;
    this.sun.color.setHSL(0.11, G.clamp(0.55 - day * 0.35, 0.05, 0.6), G.clamp(0.5 + day * 0.35, 0.35, 0.9));
    this.hemi.intensity = 0.16 + day * 0.42;
    this.hemi.color.setHSL(0.58, 0.45, G.clamp(0.28 + day * 0.34, 0.14, 0.68));
    this.hemi.groundColor.setHSL(0.22, 0.3, 0.12 + day * 0.2);

    /* ceu e neblina */
    const hz = new THREE.Color();
    if (elev > 0.25) hz.setHex(0x9fc9ea);
    else if (elev > -0.02) hz.setHex(0xe89a5c);
    else hz.setHex(0x0d1426);
    const skyTint = new THREE.Color().setHSL(0.58, 0.5, G.clamp(0.12 + day * 0.85, 0.08, 1));
    this.sky.material.color.copy(skyTint);
    this.sky.position.set(px, 0, pz);
    this.stars.position.set(px, 0, pz);
    this.stars.material.opacity = G.clamp(-elev * 1.6, 0, 0.9);
    this.stars.rotation.y += dt * 0.004;

    this.sunSprite.position.set(
      px + Math.cos(ang) * 900, Math.max(-200, elev * 800), pz + Math.sin(ang) * 400 + 200);
    this.sunSprite.material.color.setHex(elev > 0 ? 0xfff2c0 : 0xdde6ff);
    this.sunSprite.scale.setScalar(elev > 0 ? 170 : 90);

    this.scene.background = hz.clone().lerp(skyTint, 0.35);
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(hz.getHex(), 180, 620);
    this.scene.fog.color.copy(hz).lerp(skyTint, 0.4);
    this.scene.fog.near = this.night ? 90 : 200;
    this.scene.fog.far = this.night ? 400 : 700;

    /* janelas acesas + postes */
    const lit = G.clamp((0.12 - elev) * 2.2, 0, 1);
    for (const m of G.windowMats) m.emissiveIntensity = lit * 0.6;
    if (G.oceanMesh) {
      G.oceanMesh.material.map.offset.y = (G.oceanMesh.material.map.offset.y + dt * 0.02) % 1;
      G.oceanMesh.material.map.offset.x = Math.sin(performance.now() / 4000) * 0.02;
    }
    /* pulsa os marcadores */
    const k = 0.22 + Math.sin(performance.now() / 400) * 0.07;
    for (const s of this.services) {
      s.mesh.material.opacity = k;
      s.mesh.rotation.y += dt * 0.5;
      s.cd -= dt;
    }
  },

  clock() {
    const h = Math.floor(this.time), m = Math.floor((this.time % 1) * 60);
    return G.pad2(h) + ':' + G.pad2(m);
  }
};

/* ======================================================================== */
/*                              COLECIONAVEIS                                */
/* ======================================================================== */
G.pickups = {
  list: [], scene: null,
  init(scene) {
    this.scene = scene;
    /* itens fixos espalhados pelo mapa */
    const C = G.CITY;
    for (let i = 0; i < 26; i++) {
      const p = G.randomRoadPoint();
      this.drop('cash', p.x + G.rnd(-6, 6), p.z + G.rnd(-6, 6), G.rndi(40, 160), null, true);
    }
    const guns = ['pistol', 'uzi', 'shotgun', 'rifle', 'sniper', 'grenade', 'bat'];
    for (let i = 0; i < guns.length * 2; i++) {
      const b = G.pick(G.blocks.filter(x => x.district !== 'beach'));
      this.drop('weapon', b.x + G.rnd(-25, 25), b.z + G.rnd(-25, 25), 0, guns[i % guns.length], true);
    }
    for (let i = 0; i < 10; i++) {
      const b = G.pick(G.blocks);
      this.drop(G.chance(0.5) ? 'health' : 'armor', b.x + G.rnd(-20, 20), b.z + G.rnd(-20, 20), 0, null, true);
    }
  },
  drop(type, x, z, value, weaponId, permanent) {
    let mesh;
    if (type === 'weapon' || type === 'ammo') {
      mesh = G.makeWeaponModel(weaponId || 'pistol');
      mesh.scale.setScalar(1.6);
    } else {
      mesh = G.makePickup(type);
    }
    mesh.position.set(x, G.groundHeight(x, z) + 0.9, z);
    this.scene.add(mesh);
    this.list.push({ type, x, z, v: value, w: weaponId, mesh, permanent, t: 0, life: permanent ? Infinity : 60, respawn: 0 });
  },
  update(dt, px, pz) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.mesh.visible = true; }
        continue;
      }
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = G.groundHeight(p.x, p.z) + 0.9 + Math.sin(p.t * 3) * 0.14;
      if (!p.permanent) {
        p.life -= dt;
        if (p.life <= 0) { this.scene.remove(p.mesh); this.list.splice(i, 1); continue; }
      }
      const r = G.player.inCar ? 3.4 : 1.7;
      if (G.dist2(p.x, p.z, px, pz) < r * r) this.collect(p, i);
    }
  },
  collect(p, i) {
    switch (p.type) {
      case 'cash':
        G.player.money += p.v; G.stats.earned += p.v;
        G.toast('+ ' + G.money(p.v)); G.Audio.cash(); break;
      case 'health':
        if (G.player.hp >= G.player.maxHp) return;
        G.player.heal(50); G.toast('Vida restaurada'); G.Audio.pickup(); break;
      case 'armor':
        if (G.player.armor >= 100) return;
        G.player.armor = 100; G.toast('Colete'); G.Audio.pickup(); break;
      case 'weapon': {
        const W = G.WEAPONS[p.w];
        const ammo = p.w === 'grenade' ? 4 : (p.w === 'bat' ? 1 : W.mag * 3);
        G.player.giveWeapon(p.w, ammo);
        G.toast(W.name + (p.w === 'bat' ? '' : ' + ' + ammo + ' balas'));
        G.Audio.pickup(); break;
      }
      case 'ammo': {
        const W = G.WEAPONS[p.w];
        G.player.weapons[p.w] += W.mag * 2;
        G.toast('Municao ' + W.name); G.Audio.pickup(); break;
      }
    }
    if (p.permanent) { p.mesh.visible = false; p.respawn = 45; }
    else { this.scene.remove(p.mesh); this.list.splice(i, 1); }
  }
};
