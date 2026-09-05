/* ==========================================================================
   weapons.js - arsenal, hitscan, projeteis, explosoes e particulas.
   ========================================================================== */
'use strict';
var G = window.G;

G.WEAPONS = {
  fist: { id: 'fist', name: 'Punhos', slot: 1, melee: true, dmg: 14, rate: 0.42, range: 2.3, icon: '&#128074;' },
  bat: { id: 'bat', name: 'Taco', slot: 1, melee: true, dmg: 34, rate: 0.6, range: 2.9, icon: '&#127955;' },
  pistol: { id: 'pistol', name: 'Pistola', slot: 2, dmg: 26, rate: 0.28, range: 120, spread: 0.012, mag: 17, auto: false, sound: 'pistol', two: false, icon: '&#128299;' },
  uzi: { id: 'uzi', name: 'Uzi', slot: 3, dmg: 14, rate: 0.075, range: 90, spread: 0.05, mag: 30, auto: true, sound: 'uzi', two: false, icon: '&#128299;' },
  shotgun: { id: 'shotgun', name: 'Escopeta', slot: 4, dmg: 13, pellets: 8, rate: 0.85, range: 45, spread: 0.11, mag: 8, auto: false, sound: 'shotgun', two: true, icon: '&#128299;' },
  rifle: { id: 'rifle', name: 'Fuzil', slot: 5, dmg: 30, rate: 0.11, range: 150, spread: 0.022, mag: 30, auto: true, sound: 'rifle', two: true, icon: '&#128299;' },
  sniper: { id: 'sniper', name: 'Sniper', slot: 6, dmg: 130, rate: 1.3, range: 400, spread: 0.0015, mag: 6, auto: false, sound: 'sniper', two: true, zoom: 4.5, icon: '&#128299;' },
  grenade: { id: 'grenade', name: 'Granada', slot: 7, throw: true, dmg: 150, rate: 1.0, radius: 11, mag: 1, icon: '&#128163;' }
};
G.WEAPON_ORDER = ['fist', 'bat', 'pistol', 'uzi', 'shotgun', 'rifle', 'sniper', 'grenade'];

/* ======================================================================== */
/*                              PARTICULAS                                   */
/* ======================================================================== */
G.FX = {
  pool: [], idx: 0, tracers: [], scene: null, lights: [], lightIdx: 0,

  init(scene) {
    this.scene = scene;
    const sparkMat = () => new THREE.SpriteMaterial({
      map: G.TEX.spark, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    });
    for (let i = 0; i < 220; i++) {
      const s = new THREE.Sprite(sparkMat());
      s.visible = false; s.userData = { life: 0 };
      scene.add(s); this.pool.push(s);
    }
    this.smokeMat = new THREE.SpriteMaterial({ map: G.TEX.smoke, depthWrite: false, transparent: true, opacity: 0.5, color: 0x888888 });
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(this.smokeMat.clone());
      s.visible = false; s.userData = { life: 0, smoke: true };
      scene.add(s); this.pool.push(s);
    }
    /* poucas luzes reaproveitadas para clarao de tiro/explosao */
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa44, 0, 30);
      scene.add(l); this.lights.push(l);
    }
    const tracerGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
    tracerGeo.rotateX(Math.PI / 2);
    this.tracerGeo = tracerGeo;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(tracerGeo, this.tracerMat.clone());
      m.visible = false; scene.add(m); this.tracers.push(m);
    }
    this.tIdx = 0;
  },
  spawn(x, y, z, color, size, life, vx, vy, vz, smoke) {
    let s = null;
    for (let k = 0; k < 30; k++) {
      const c = this.pool[this.idx = (this.idx + 1) % this.pool.length];
      if (!c.visible && (!!c.userData.smoke === !!smoke)) { s = c; break; }
    }
    if (!s) s = this.pool[this.idx];
    s.visible = true;
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.material.color.setHex(color);
    s.material.opacity = 1;
    s.userData.life = s.userData.max = life;
    s.userData.v = { x: vx || 0, y: vy || 0, z: vz || 0 };
    s.userData.size = size;
    return s;
  },
  flash(x, y, z, color, intensity, dist) {
    const l = this.lights[this.lightIdx = (this.lightIdx + 1) % this.lights.length];
    l.position.set(x, y, z);
    l.color.setHex(color); l.intensity = intensity; l.distance = dist || 25;
    l.userData.decay = 1;
  },
  tracer(from, to) {
    const m = this.tracers[this.tIdx = (this.tIdx + 1) % this.tracers.length];
    const d = new THREE.Vector3().subVectors(to, from);
    const len = d.length();
    if (len < 0.1) return;
    m.visible = true;
    m.position.copy(from).addScaledVector(d, 0.5);
    m.scale.set(1, 1, len);
    m.lookAt(to);
    m.material.opacity = 0.9;
    m.userData.life = 0.06;
  },
  muzzle(x, y, z) {
    this.spawn(x, y, z, 0xffd27a, 1.5, 0.06, 0, 0, 0);
    this.flash(x, y, z, 0xffbb55, 2.2, 18);
  },
  blood(x, y, z, dx, dz) {
    for (let i = 0; i < 6; i++) {
      this.spawn(x, y, z, 0xaa1111, G.rnd(0.2, 0.45), G.rnd(0.3, 0.6),
        dx * 2 + G.rnd(-2, 2), G.rnd(1, 4), dz * 2 + G.rnd(-2, 2));
    }
  },
  impact(x, y, z) {
    for (let i = 0; i < 5; i++) {
      this.spawn(x, y, z, 0xffd090, G.rnd(0.15, 0.35), G.rnd(0.15, 0.4),
        G.rnd(-4, 4), G.rnd(1, 5), G.rnd(-4, 4));
    }
    this.spawn(x, y, z, 0x999999, 0.9, 0.5, 0, 1.2, 0, true);
  },
  explosionFX(x, y, z, r) {
    this.flash(x, y + 2, z, 0xffaa33, 8, r * 5);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283, sp = G.rnd(3, 16);
      this.spawn(x, y + 1, z, G.pick([0xffdd66, 0xff8822, 0xff4411]), G.rnd(1.2, 3.2), G.rnd(0.45, 0.95),
        Math.cos(a) * sp, G.rnd(3, 12), Math.sin(a) * sp);
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, sp = G.rnd(1, 7);
      this.spawn(x, y + 2, z, 0x555555, G.rnd(3, 6), G.rnd(1.2, 2.4),
        Math.cos(a) * sp, G.rnd(2, 6), Math.sin(a) * sp, true);
    }
  },
  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      const k = u.life / u.max;
      s.position.x += u.v.x * dt; s.position.y += u.v.y * dt; s.position.z += u.v.z * dt;
      u.v.y -= (u.smoke ? -1.2 : 14) * dt;
      u.v.x *= 0.96; u.v.z *= 0.96;
      if (s.position.y < 0.05 && !u.smoke) { s.position.y = 0.05; u.v.y = Math.abs(u.v.y) * 0.3; u.v.x *= 0.6; u.v.z *= 0.6; }
      s.material.opacity = u.smoke ? k * 0.5 : k;
      s.scale.setScalar(u.size * (u.smoke ? (2 - k) : (0.4 + k * 0.6)));
    }
    for (const m of this.tracers) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      m.material.opacity = Math.max(0, m.userData.life / 0.06) * 0.9;
      if (m.userData.life <= 0) m.visible = false;
    }
    for (const l of this.lights) {
      if (l.intensity > 0) l.intensity = Math.max(0, l.intensity - dt * 14);
    }
  }
};

/* ======================================================================== */
/*                               RAYCAST                                     */
/* ======================================================================== */
const _tmpBoxes = [];
/* marcha o raio pelo mundo; retorna o primeiro alvo atingido */
G.rayHit = function (ox, oy, oz, dx, dy, dz, maxD, ignore) {
  const step = 0.55;
  let best = null;
  /* alvos dinamicos: pedestres e veiculos (teste de esfera) */
  const tryTargets = (px, py, pz, t) => {
    for (const p of G.peds.list) {
      if (p === ignore || p.dead || !p.active) continue;
      const dxx = p.x - px, dzz = p.z - pz, dyy = (p.y + 1.0) - py;
      if (dxx * dxx + dzz * dzz + dyy * dyy < 0.42) {
        return { type: 'ped', obj: p, x: px, y: py, z: pz, dist: t, head: py > p.y + 1.5 };
      }
    }
    const hl = G.police.heli;
    if (hl && hl.active && hl.dead <= 0) {
      const hx = px - hl.x, hy = py - (hl.y + 1.2), hz = pz - hl.z;
      if (hx * hx + hy * hy + hz * hz < 12) {
        return { type: 'heli', obj: hl, x: px, y: py, z: pz, dist: t };
      }
    }
    for (const v of G.vehicles.list) {
      if (v === ignore || !v.active) continue;
      if (Math.abs(px - v.x) + Math.abs(pz - v.z) > 6) continue;
      const s = Math.sin(-v.a), c = Math.cos(-v.a);
      const lx = (px - v.x) * c - (pz - v.z) * s;
      const lz = (px - v.x) * s + (pz - v.z) * c;
      if (Math.abs(lx) < v.hw && Math.abs(lz) < v.hl && py < v.y + 1.9 && py > v.y) {
        return { type: 'vehicle', obj: v, x: px, y: py, z: pz, dist: t };
      }
    }
    return null;
  };
  for (let t = 0.6; t < maxD; t += step) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    if (py <= G.groundHeight(px, pz)) return { type: 'ground', x: px, y: 0.03, z: pz, dist: t };
    const hit = tryTargets(px, py, pz, t);
    if (hit) return hit;
    /* estatico */
    G.grid.query(px, pz, 0.6, _tmpBoxes);
    for (const b of _tmpBoxes) {
      if (px > b.x1 && px < b.x2 && pz > b.z1 && pz < b.z2 && py < (b.h === undefined ? 90 : b.h)) {
        return { type: 'world', x: px, y: py, z: pz, dist: t };
      }
    }
  }
  return best;
};

/* ======================================================================== */
/*                                DISPARO                                    */
/* ======================================================================== */
G.Combat = {
  /* origem/direcao em coordenadas de mundo */
  fire(shooter, W, ox, oy, oz, dx, dy, dz) {
    const pellets = W.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      let rx = dx, ry = dy, rz = dz;
      const sp = W.spread || 0;
      if (sp) {
        rx += G.rnd(-sp, sp); ry += G.rnd(-sp * 0.7, sp * 0.7); rz += G.rnd(-sp, sp);
        const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
      }
      const hit = G.rayHit(ox, oy, oz, rx, ry, rz, W.range, shooter);
      const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z)
        : new THREE.Vector3(ox + rx * W.range, oy + ry * W.range, oz + rz * W.range);
      if (i === 0 || pellets < 4) G.FX.tracer(new THREE.Vector3(ox, oy, oz), end);
      if (!hit) continue;
      if (hit.type === 'ped') {
        const dmg = W.dmg * (hit.head ? 2.6 : 1);
        G.peds.damage(hit.obj, dmg, shooter, rx, rz);
        G.FX.blood(hit.x, hit.y, hit.z, rx, rz);
        G.Audio.hitFlesh();
      } else if (hit.type === 'vehicle') {
        G.vehicles.damage(hit.obj, W.dmg * 0.55, shooter);
        G.FX.impact(hit.x, hit.y, hit.z);
      } else if (hit.type === 'heli') {
        G.police.damageHeli(W.dmg * 0.8);
        G.FX.impact(hit.x, hit.y, hit.z);
      } else {
        G.FX.impact(hit.x, hit.y, hit.z);
      }
      /* jogador atingido */
      if (hit.type === 'ped' && hit.obj.isPlayerProxy) G.player.damage(W.dmg);
    }
    G.FX.muzzle(ox + dx * 0.7, oy + dy * 0.7, oz + dz * 0.7);
  },

  /* disparo de NPC contra o jogador (mais simples e com dispersao maior) */
  npcFire(shooter, dmg, spread, targetX, targetY, targetZ, ox, oy, oz) {
    let dx = targetX - ox, dy = targetY - oy, dz = targetZ - oz;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    dx += G.rnd(-spread, spread); dy += G.rnd(-spread * 0.5, spread * 0.5); dz += G.rnd(-spread, spread);
    const n = Math.hypot(dx, dy, dz); dx /= n; dy /= n; dz /= n;
    const hit = G.rayHit(ox, oy, oz, dx, dy, dz, 90, shooter);
    const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z)
      : new THREE.Vector3(ox + dx * 90, oy + dy * 90, oz + dz * 90);
    G.FX.tracer(new THREE.Vector3(ox, oy, oz), end);
    G.FX.muzzle(ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6);
    const px = G.player.x, py = G.player.y + 1.0, pz = G.player.z;
    /* teste direto contra o jogador ao longo do raio */
    for (let t = 1; t < 90; t += 0.5) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (hit && t > hit.dist) break;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py) + (z - pz) * (z - pz);
      if (d2 < 0.5) {
        if (G.player.inCar) { G.vehicles.damage(G.player.car, dmg * 0.6, shooter); G.player.damage(dmg * 0.35); }
        else { G.player.damage(dmg); G.FX.blood(x, y, z, dx, dz); }
        break;
      }
    }
    if (hit) {
      if (hit.type === 'ped') { G.peds.damage(hit.obj, dmg, shooter, dx, dz); G.FX.blood(hit.x, hit.y, hit.z, dx, dz); }
      else if (hit.type === 'vehicle') G.vehicles.damage(hit.obj, dmg * 0.5, shooter);
      else G.FX.impact(hit.x, hit.y, hit.z);
    }
  },

  explode(x, y, z, radius, dmg, source) {
    G.FX.explosionFX(x, y, z, radius);
    G.Audio.explosion(G.clamp(1.4 - G.dist(x, z, G.player.x, G.player.z) / 140, 0.05, 1));
    G.camShake(G.clamp(1.6 - G.dist(x, z, G.player.x, G.player.z) / 90, 0, 1.4));
    for (const p of G.peds.list) {
      if (!p.active || p.dead) continue;
      const d = G.dist(x, z, p.x, p.z);
      if (d < radius) G.peds.damage(p, dmg * (1 - d / radius), source, (p.x - x) / (d || 1), (p.z - z) / (d || 1));
    }
    for (const v of G.vehicles.list) {
      if (!v.active) continue;
      const d = G.dist(x, z, v.x, v.z);
      if (d < radius * 1.2) G.vehicles.damage(v, dmg * (1 - d / (radius * 1.2)), source);
    }
    const hl = G.police.heli;
    if (hl && hl.active && hl.dead <= 0) {
      const dh = Math.hypot(hl.x - x, hl.y - y, hl.z - z);
      if (dh < radius * 1.4) G.police.damageHeli(dmg * (1 - dh / (radius * 1.4)));
    }
    const dp = G.dist(x, z, G.player.x, G.player.z);
    if (dp < radius) G.player.damage(dmg * 0.7 * (1 - dp / radius));
  }
};

/* --------------------------------------------------------------- granadas */
G.Grenades = {
  list: [],
  throwOne(x, y, z, vx, vy, vz, owner) {
    const m = G.makeWeaponModel('grenade');
    m.position.set(x, y, z);
    G.scene.add(m);
    this.list.push({ m, x, y, z, vx, vy, vz, t: 2.6, owner });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t -= dt;
      g.vy -= 22 * dt;
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      const gh = G.groundHeight(g.x, g.z) + 0.12;
      if (g.y < gh) { g.y = gh; g.vy = -g.vy * 0.35; g.vx *= 0.6; g.vz *= 0.6; }
      g.m.position.set(g.x, g.y, g.z);
      g.m.rotation.x += dt * 6; g.m.rotation.z += dt * 4;
      if (g.t <= 0) {
        G.Combat.explode(g.x, g.y, g.z, G.WEAPONS.grenade.radius, G.WEAPONS.grenade.dmg, g.owner);
        G.scene.remove(g.m);
        this.list.splice(i, 1);
      }
    }
  }
};
