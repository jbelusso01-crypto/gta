/* ==========================================================================
   vehicles.js - transito, fisica de direcao, dano, explosao e estacionados.
   ========================================================================== */
'use strict';
var G = window.G;

const TRAFFIC_KINDS = ['sedan', 'coupe', 'suv', 'pickup', 'van', 'taxi', 'sedan', 'coupe', 'bus'];

G.vehicles = {
  list: [], scene: null,
  MAX_TRAFFIC: 26, MAX_PARKED: 16,
  LANE: 5.2,

  init(scene) {
    this.scene = scene;
    for (let i = 0; i < this.MAX_TRAFFIC; i++) this.list.push(this.create(G.pick(TRAFFIC_KINDS), 'traffic'));
    for (let i = 0; i < this.MAX_PARKED; i++) this.list.push(this.create(G.pick(TRAFFIC_KINDS), 'parked'));
  },

  create(kind, mode) {
    const mesh = G.makeVehicle(kind);
    this.scene.add(mesh);
    const K = G.VEHICLE_KINDS[kind];
    const v = {
      mesh, kind, mode, K,
      x: 0, y: 0, z: 0, a: 0, speed: 0, steer: 0, vy: 0,
      hp: 100, active: false, burning: 0, wreck: false,
      hw: K.width / 2 + 0.15, hl: (kind === 'bus' ? 5.4 : 2.5),
      node: [0, 0], next: [0, 0], t: 0, wait: 0, wheelSpin: 0,
      roll: 0, pitch: 0, driver: null, siren: false, cop: false,
      lastHitT: 0, honk: 0
    };
    /* motorista simplificado (1 mesh) para os carros de transito */
    const skinC = G.pick([0xe0ac7e, 0xc98d5f, 0x8d5524, 0x5c3a21]);
    const shirtC = G.pick(G.CAR_COLORS);
    const dg = G.mergeGeos([
      G.paint(new THREE.BoxGeometry(0.44, 0.5, 0.28), shirtC),
      G.paint(new THREE.BoxGeometry(0.24, 0.26, 0.24).translate(0, 0.38, 0), skinC)
    ]);
    const d = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    d.position.set(-K.width * 0.22, 1.05, -0.1);
    mesh.add(d);
    v.driverMesh = d;
    mesh.visible = false;
    return v;
  },

  /* -------------------------------------------------------------- spawn */
  placeTraffic(v, px, pz) {
    for (let k = 0; k < 14; k++) {
      const ang = G.rnd(0, 6.283), dist = G.rnd(70, 190);
      const n = G.Nav.nearestNode(px + Math.cos(ang) * dist, pz + Math.sin(ang) * dist);
      const nb = G.Nav.neighbors(n[0], n[1]);
      if (!nb.length) continue;
      v.node = n; v.next = G.pick(nb); v.t = G.rnd(0.1, 0.9);
      this.applyNav(v);
      if (G.dist(v.x, v.z, px, pz) > 55) break;
    }
    v.speed = G.rnd(8, 15);
    v.hp = 100; v.wreck = false; v.burning = 0; v.active = true;
    v.mesh.visible = true;
    v.driverMesh.visible = true;
    v.mode = 'traffic';
    v.y = 0;
  },

  placeParked(v, px, pz) {
    const C = G.CITY;
    for (let k = 0; k < 16; k++) {
      const ang = G.rnd(0, 6.283), dist = G.rnd(40, 150);
      const n = G.Nav.nearestNode(px + Math.cos(ang) * dist, pz + Math.sin(ang) * dist);
      const vert = G.chance(0.5);
      const t = G.rnd(0.2, 0.8);
      const nn = G.Nav.neighbors(n[0], n[1]);
      if (!nn.length) continue;
      const side = G.chance(0.5) ? 1 : -1;
      if (vert) {
        v.x = n[0] * C.P + side * (C.RW / 2 - 2.2);
        v.z = (n[1] + (G.chance(0.5) ? t : -t)) * C.P;
        v.a = side > 0 ? 0 : Math.PI;
      } else {
        v.x = (n[0] + (G.chance(0.5) ? t : -t)) * C.P;
        v.z = n[1] * C.P + side * (C.RW / 2 - 2.2);
        v.a = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (G.dist(v.x, v.z, px, pz) > 25) break;
    }
    v.speed = 0; v.hp = 100; v.wreck = false; v.burning = 0;
    v.active = true; v.mode = 'parked'; v.mesh.visible = true;
    v.driverMesh.visible = false;
    v.y = 0;
  },

  spawnPolice(px, pz, dist) {
    let v = this.list.find(q => !q.active && q.kind === 'police');
    if (!v) {
      v = this.create('police', 'police');
      this.list.push(v);
    }
    const ang = G.rnd(0, 6.283), d = dist || G.rnd(85, 150);
    const n = G.Nav.nearestNode(px + Math.cos(ang) * d, pz + Math.sin(ang) * d);
    const nb = G.Nav.neighbors(n[0], n[1]);
    v.node = n; v.next = nb.length ? G.pick(nb) : n; v.t = 0.5;
    this.applyNav(v);
    v.mode = 'police'; v.cop = true; v.siren = true;
    v.hp = 220; v.wreck = false; v.burning = 0; v.active = true;
    v.speed = 12; v.mesh.visible = true; v.driverMesh.visible = true;
    v.copsOut = false;
    v.y = 0;
    return v;
  },

  applyNav(v) {
    const A = G.Nav.pos(v.node[0], v.node[1]), B = G.Nav.pos(v.next[0], v.next[1]);
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
    v.x = A.x + (B.x - A.x) * v.t + (-dz) * this.LANE;
    v.z = A.z + (B.z - A.z) * v.t + (dx) * this.LANE;
    v.a = Math.atan2(dx, dz);
  },

  /* --------------------------------------------------------------- dano */
  damage(v, amount, source) {
    if (!v.active || v.wreck) return;
    v.hp -= amount;
    if (v.hp <= 0) {
      v.hp = 0;
      if (!v.burning) {
        v.burning = G.rnd(1.8, 3.2);
        if (source === G.player && v.mode !== 'player') G.stats.wrecked++;
      }
    } else if (v.mode === 'traffic' && amount > 12) {
      /* motorista foge do carro batido */
      v.wait = Math.max(v.wait, 1.2);
      v.honk = 0.4;
    }
  },

  explode(v) {
    G.Combat.explode(v.x, v.y + 1, v.z, 13, 130, v.mode === 'player' ? G.player : null);
    v.wreck = true; v.burning = 0;
    v.hp = 0; v.speed = 0;
    v.mesh.traverse(o => {
      if (o.isMesh && o.material && o.material.color && !o.material.map) {
        o.material = o.material.clone();
        o.material.color.setHex(0x1a1a1a);
        if (o.material.emissive) o.material.emissive.setHex(0);
      }
    });
    v.driverMesh.visible = false;
    if (v.mode === 'player') {
      G.player.exitCar(true);
    }
    if (v.cop) G.police.copCarDown(v);
  },

  nearest(x, z, maxD, filter) {
    let best = null, bd = maxD * maxD;
    for (const v of this.list) {
      if (!v.active || v.wreck) continue;
      if (filter && !filter(v)) continue;
      const d = G.dist2(x, z, v.x, v.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  },

  /* ------------------------------------------------------------- update */
  update(dt, px, pz) {
    const C = G.CITY;
    for (const v of this.list) {
      if (!v.active) {
        if (v.kind === 'police') continue;
        if (v.mode === 'parked') this.placeParked(v, px, pz);
        else this.placeTraffic(v, px, pz);
        continue;
      }
      const dp2 = G.dist2(v.x, v.z, px, pz);

      /* queima e explode */
      if (v.burning > 0) {
        v.burning -= dt;
        G.FX.spawn(v.x + G.rnd(-1, 1), v.y + 1.2, v.z + G.rnd(-1, 1), 0xff8822, G.rnd(0.6, 1.4), 0.4, 0, 3, 0);
        if (G.chance(0.4)) G.FX.spawn(v.x, v.y + 1.6, v.z, 0x444444, 1.6, 1.0, 0, 2.5, 0, true);
        if (v.burning <= 0) this.explode(v);
      }

      /* streaming */
      if (dp2 > 300 * 300 && v.mode !== 'player') {
        if (v.mode === 'police') { v.active = false; v.mesh.visible = false; continue; }
        if (v.wreck) { v.active = false; v.mesh.visible = false; continue; }
        if (v.mode === 'parked') this.placeParked(v, px, pz);
        else this.placeTraffic(v, px, pz);
        continue;
      }
      if (v.wreck) { v.speed *= 0.9; this.integrate(v, dt); continue; }

      if (v.mode === 'traffic') this.updateTraffic(v, dt, px, pz);
      else if (v.mode === 'police') this.updatePolice(v, dt, px, pz);
      else if (v.mode === 'parked') { v.speed *= 0.85; }
      /* 'player' e integrado pelo modulo do jogador */

      if (v.mode !== 'player') this.integrate(v, dt);
      this.applyMesh(v, dt);
    }
    this.vsVehicle(dt);
  },

  updateTraffic(v, dt, px, pz) {
    const C = G.CITY;
    /* olha a frente: outro carro, o jogador a pe ou um obstaculo */
    const fx = Math.sin(v.a), fz = Math.cos(v.a);
    let block = false;
    for (const o of this.list) {
      if (o === v || !o.active) continue;
      const ox = o.x - v.x, oz = o.z - v.z;
      const f = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (f > 0.5 && f < 9 + v.speed * 0.35 && side < 2.6) { block = true; break; }
    }
    /* pedestres na frente: buzina e freia */
    for (const p of G.peds.list) {
      if (!p.active || p.dead) continue;
      const ox = p.x - v.x, oz = p.z - v.z;
      const f = ox * fx + oz * fz;
      if (f > 0 && f < 7 && Math.abs(ox * fz - oz * fx) < 2.2) {
        block = true;
        if (v.honk <= 0 && G.chance(0.02)) { v.honk = 1.2; if (G.dist2(v.x, v.z, px, pz) < 60 * 60) G.Audio.horn(G.clamp(1 - G.dist(v.x, v.z, px, pz) / 60, 0.1, 1)); }
        break;
      }
    }
    if (v.honk > 0) v.honk -= dt;
    /* jogador a pe na frente */
    if (!G.player.inCar) {
      const ox = px - v.x, oz = pz - v.z;
      const f = ox * fx + oz * fz;
      if (f > 0 && f < 8 && Math.abs(ox * fz - oz * fx) < 2.4) block = true;
    }
    if (v.wait > 0) { v.wait -= dt; block = true; }

    const target = block ? 0 : (v.K.top * 0.42);
    v.speed = G.damp(v.speed, target, block ? 5 : 1.6, dt);

    /* avanca no grafo */
    const A = G.Nav.pos(v.node[0], v.node[1]), B = G.Nav.pos(v.next[0], v.next[1]);
    const seg = Math.hypot(B.x - A.x, B.z - A.z) || C.P;
    v.t += v.speed * dt / seg;
    if (v.t >= 1) {
      v.t -= 1;
      const prev = v.node; v.node = v.next;
      let nb = G.Nav.neighbors(v.node[0], v.node[1]).filter(n => n[0] !== prev[0] || n[1] !== prev[1]);
      if (!nb.length) nb = G.Nav.neighbors(v.node[0], v.node[1]);
      /* prefere seguir reto */
      const dirx = v.node[0] - prev[0], dirz = v.node[1] - prev[1];
      const straight = nb.find(n => n[0] - v.node[0] === dirx && n[1] - v.node[1] === dirz);
      v.next = (straight && G.chance(0.62)) ? straight : G.pick(nb);
    }
    const A2 = G.Nav.pos(v.node[0], v.node[1]), B2 = G.Nav.pos(v.next[0], v.next[1]);
    const dx = Math.sign(B2.x - A2.x), dz = Math.sign(B2.z - A2.z);
    const tx = A2.x + (B2.x - A2.x) * v.t + (-dz) * this.LANE;
    const tz = A2.z + (B2.z - A2.z) * v.t + (dx) * this.LANE;
    v.x = G.damp(v.x, tx, 6, dt);
    v.z = G.damp(v.z, tz, 6, dt);
    v.a = G.dampAngle(v.a, Math.atan2(dx, dz), 5, dt);
    v.wheelSpin += v.speed * dt * 2.2;
  },

  updatePolice(v, dt, px, pz) {
    const tx = px, tz = pz;
    const d = G.dist(v.x, v.z, tx, tz);
    let dx = tx - v.x, dz = tz - v.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    /* desvio simples de obstaculo: sonda a frente */
    const fx = Math.sin(v.a), fz = Math.cos(v.a);
    let avoid = 0;
    const probe = [[6, 0], [10, 0], [8, 2.5], [8, -2.5]];
    const boxes = [];
    for (const [f, s] of probe) {
      const qx = v.x + fx * f + (-fz) * s, qz = v.z + fz * f + fx * s;
      G.grid.query(qx, qz, 1.0, boxes);
      for (const b of boxes) {
        if (qx > b.x1 - 1 && qx < b.x2 + 1 && qz > b.z1 - 1 && qz < b.z2 + 1) { avoid += s >= 0 ? -1 : 1; break; }
      }
    }
    const targetA = Math.atan2(dx, dz) + (avoid ? Math.sign(avoid) * 0.7 : 0);
    v.a = G.dampAngle(v.a, targetA, 2.6, dt);
    const want = d > 9 ? v.K.top * 0.85 : (d > 5 ? 8 : 0);
    v.speed = G.damp(v.speed, want, 2.2, dt);
    v.x += Math.sin(v.a) * v.speed * dt;
    v.z += Math.cos(v.a) * v.speed * dt;
    v.wheelSpin += v.speed * dt * 2.2;
    G.pushOutCircle(v, 2.3, () => { v.speed *= 0.35; });

    /* policiais saem do carro quando o alvo esta perto e parado */
    if (!v.copsOut && G.police.wanted >= 2 && d < 26 && (v.speed < 6 || !G.player.inCar)) {
      v.copsOut = true;
      const n = G.police.wanted >= 4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const c = G.peds.spawnCop(v.x + G.rnd(-2.5, 2.5), v.z + G.rnd(-2.5, 2.5));
        if (c) c.target = G.player;
      }
      v.driverMesh.visible = false;
      v.speed = 0;
      v.mode = 'parked';
      v.siren = true;
      setTimeout(() => { if (v.active) v.active = v.active; }, 1);
    }
    /* colisao com o jogador de carro: empurra */
    if (G.player.inCar && d < 5.2) {
      const pv = G.player.car;
      pv.x += dx * 6 * dt; pv.z += dz * 6 * dt;
      G.vehicles.damage(pv, 26 * dt, v);
      G.vehicles.damage(v, 14 * dt, null);
    }
  },

  integrate(v, dt) {
    if (v.mode === 'traffic') return;   /* transito ja moveu no grafo */
    v.x += Math.sin(v.a) * v.speed * dt;
    v.z += Math.cos(v.a) * v.speed * dt;
    v.wheelSpin += v.speed * dt * 2.2;
  },

  applyMesh(v, dt) {
    const gh = G.groundHeight(v.x, v.z);
    v.y = G.damp(v.y, gh, 9, dt);
    v.mesh.position.set(v.x, v.y, v.z);
    v.mesh.rotation.y = v.a;
    v.mesh.rotation.z = G.damp(v.mesh.rotation.z, -v.roll, 8, dt);
    v.mesh.rotation.x = G.damp(v.mesh.rotation.x, v.pitch, 8, dt);
    const ud = v.mesh.userData;
    if (ud.wheels) {
      for (const w of ud.wheels) {
        w.rotation.x = -v.wheelSpin;
        if (w.userData.front) w.rotation.y = v.steer * 0.5;
      }
    }
    if (ud.siren && v.siren) {
      const on = Math.floor(performance.now() / 180) % 2;
      ud.siren[0].material.color.setHex(on ? 0x2244ff : 0x101020);
      if (ud.siren[1]) ud.siren[1].material.color.setHex(on ? 0x101020 : 0xff2222);
    }
    if (ud.lampMat) {
      ud.lampMat.color.setHex(G.world.night ? 0xfff4cf : 0x8a8064);
      ud.tailMat.color.setHex(v.braking || v.speed < -0.2 ? 0xff3b30 : (G.world.night ? 0xa02525 : 0x7a1c1c));
    }
  },

  /* colisao carro-carro */
  vsVehicle(dt) {
    const l = this.list;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      if (!a.active) continue;
      for (let j = i + 1; j < l.length; j++) {
        const b = l[j];
        if (!b.active) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const rr = (a.hl + b.hl) * 0.82;
        if (d2 > rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const push = (rr - d) * 0.5;
        const aFixed = a.mode === 'parked' || a.wreck, bFixed = b.mode === 'parked' || b.wreck;
        if (!aFixed) { a.x -= nx * push; a.z -= nz * push; }
        if (!bFixed) { b.x += nx * push; b.z += nz * push; }
        const rel = Math.abs(a.speed - b.speed);
        if (rel > 9) {
          const dmg = rel * 0.7;
          this.damage(a, dmg, null); this.damage(b, dmg, null);
          if (a.mode === 'player' || b.mode === 'player') {
            G.Audio.crash(G.clamp(rel / 30, 0.2, 1));
            G.camShake(G.clamp(rel / 40, 0, 0.7));
            const pv = a.mode === 'player' ? a : b;
            pv.speed *= 0.3;
            G.player.damage(rel * 0.25);
          } else {
            if (!a.wait) a.wait = 1.5;
            if (!b.wait) b.wait = 1.5;
          }
        } else {
          if (!aFixed) a.speed *= 0.92;
          if (!bFixed) b.speed *= 0.92;
        }
      }
    }
  },

  /* atropelamento */
  runOverCheck(v, dt) {
    if (Math.abs(v.speed) < 4) return;
    for (const p of G.peds.list) {
      if (!p.active || p.dead) continue;
      const dx = p.x - v.x, dz = p.z - v.z;
      if (dx * dx + dz * dz > 25) continue;
      const s = Math.sin(-v.a), c = Math.cos(-v.a);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < v.hw + 0.4 && Math.abs(lz) < v.hl + 0.3) {
        const dmg = Math.abs(v.speed) * 4.2;
        const nd = Math.hypot(dx, dz) || 1;
        G.peds.damage(p, dmg, v.mode === 'player' ? G.player : null, dx / nd, dz / nd);
        G.FX.blood(p.x, p.y + 1, p.z, dx / nd, dz / nd);
        if (v.mode === 'player') {
          G.toast('Atropelamento!');
          v.speed *= 0.86;
        }
      }
    }
  }
};
