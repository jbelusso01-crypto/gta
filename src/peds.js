/* ==========================================================================
   peds.js - pedestres, gangues e policiais a pe.
   Populacao com streaming: so existe gente perto do jogador.
   ========================================================================== */
'use strict';
var G = window.G;

/* ---------------------------------------------------- grafo de navegacao */
G.Nav = {
  pos(i, j) { return { x: i * G.CITY.P, z: j * G.CITY.P }; },
  inside(i, j) { const N = G.CITY.N; return i >= -N && i <= N && j >= -N && j <= N; },
  neighbors(i, j) {
    const r = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.inside(i + di, j + dj)) r.push([i + di, j + dj]);
    }
    return r;
  },
  randomNode() {
    const N = G.CITY.N;
    return [G.rndi(-N, N), G.rndi(-N, N)];
  },
  /* no mais proximo de um ponto qualquer */
  nearestNode(x, z) {
    const N = G.CITY.N, P = G.CITY.P;
    return [G.clamp(Math.round(x / P), -N, N), G.clamp(Math.round(z / P), -N, N)];
  }
};

/* --------------------------------------------------------------- colisao */
const _boxes = [];
G.pushOutCircle = function (o, r, onHit) {
  G.grid.query(o.x, o.z, r + 3, _boxes);
  for (const b of _boxes) {
    const x1 = b.x1 - r, x2 = b.x2 + r, z1 = b.z1 - r, z2 = b.z2 + r;
    if (o.x > x1 && o.x < x2 && o.z > z1 && o.z < z2) {
      const dl = o.x - x1, dr = x2 - o.x, dt = o.z - z1, db = z2 - o.z;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) o.x = x1; else if (m === dr) o.x = x2;
      else if (m === dt) o.z = z1; else o.z = z2;
      if (onHit) onHit(b, m);
    }
  }
  const lim = G.CITY.EXT + 260;
  o.x = G.clamp(o.x, -lim, lim);
  o.z = G.clamp(o.z, -lim, lim);
};

/* ======================================================================== */
G.peds = {
  list: [], pool: [], MAX: 58, scene: null,
  SIDEWALK: G.CITY.RW / 2 + G.CITY.SW * 0.6,

  init(scene) {
    this.scene = scene;
    for (let i = 0; i < this.MAX; i++) this.list.push(this.create());
  },

  create() {
    const look = G.randomPedLook();
    const ch = G.makeChar(look);
    this.scene.add(ch.root);
    const p = {
      ch, x: 0, y: 0, z: 0, a: 0, vx: 0, vz: 0,
      hp: 100, dead: false, active: false, state: 'walk',
      speed: G.rnd(1.5, 2.4), faction: 'civil', weapon: null, wModel: null,
      node: [0, 0], next: [0, 0], t: 0, side: G.chance(0.5) ? 1 : -1,
      timer: 0, fireCd: 0, deadT: 0, panic: 0, hitFlash: 0, target: null
    };
    ch.root.visible = false;
    return p;
  },

  /* --------------------------------------------------------- spawn/reciclo */
  placeOnSidewalk(p, node) {
    const n = node || G.Nav.randomNode();
    const nb = G.Nav.neighbors(n[0], n[1]);
    p.node = n; p.next = G.pick(nb); p.t = G.rnd(0, 1);
    const A = G.Nav.pos(n[0], n[1]), B = G.Nav.pos(p.next[0], p.next[1]);
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z);
    p.x = A.x + (B.x - A.x) * p.t + (-dz) * this.SIDEWALK * p.side;
    p.z = A.z + (B.z - A.z) * p.t + (dx) * this.SIDEWALK * p.side;
    p.y = G.groundHeight(p.x, p.z);
    p.a = Math.atan2(dx, dz);
  },

  spawnNear(p, px, pz, minD, maxD) {
    for (let k = 0; k < 12; k++) {
      const a = G.rnd(0, 6.283), d = G.rnd(minD, maxD);
      const n = G.Nav.nearestNode(px + Math.cos(a) * d, pz + Math.sin(a) * d);
      this.placeOnSidewalk(p, n);
      if (G.dist(p.x, p.z, px, pz) > minD * 0.7) break;
    }
    this.reset(p);
  },

  reset(p) {
    p.hp = 100; p.dead = false; p.deadT = 0; p.state = 'walk';
    p.panic = 0; p.fireCd = 0; p.target = null; p.hitFlash = 0;
    p.ch.root.rotation.set(0, 0, 0);
    p.ch.root.visible = true;
    p.active = true;
    p.y = G.groundHeight(p.x, p.z);
    /* faccao conforme o bairro */
    const b = G.blocks.length ? G.blockAt(Math.floor(p.x / G.CITY.P), Math.floor(p.z / G.CITY.P)) : null;
    const dist = b ? b.district : 'commercial';
    this.setFaction(p, (dist === 'favela' || dist === 'industrial') && G.chance(0.32) ? 'gang' : 'civil');
    p.speed = p.faction === 'gang' ? G.rnd(2.0, 2.8) : G.rnd(1.4, 2.5);
  },

  setFaction(p, f) {
    p.faction = f;
    if (p.wModel) { p.ch.armR.hand.remove(p.wModel); p.wModel = null; }
    if (f === 'gang') {
      p.weapon = G.chance(0.5) ? G.WEAPONS.pistol : G.WEAPONS.uzi;
      p.wModel = G.makeWeaponModel(p.weapon.id);
      p.wModel.position.set(0, -0.12, 0.06);
      p.ch.armR.hand.add(p.wModel);
    } else if (f === 'cop') {
      p.weapon = G.WEAPONS.pistol;
      p.wModel = G.makeWeaponModel('pistol');
      p.wModel.position.set(0, -0.12, 0.06);
      p.ch.armR.hand.add(p.wModel);
    } else {
      p.weapon = null;
    }
  },

  spawnCop(x, z) {
    /* usa um pedestre livre ou o mais distante */
    let p = this.list.find(q => !q.active);
    if (!p) {
      let far = null, fd = -1;
      for (const q of this.list) {
        if (q.faction === 'cop' || q.dead) continue;
        const d = G.dist2(q.x, q.z, G.player.x, G.player.z);
        if (d > fd) { fd = d; far = q; }
      }
      p = far;
    }
    if (!p) return null;
    p.x = x; p.z = z;
    this.reset(p);
    /* uniforme */
    p.ch.root.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });
    this.setFaction(p, 'cop');
    p.state = 'chase';
    p.speed = 4.6;
    p.hp = 130;
    return p;
  },

  /* ------------------------------------------------------------- dano */
  damage(p, amount, source, dx, dz) {
    if (p.dead || !p.active) return;
    p.hp -= amount;
    p.hitFlash = 0.15;
    p.panic = 10;
    if (source === G.player && p.faction !== 'cop') {
      /* civis fogem, gangue revida */
      p.state = p.faction === 'gang' ? 'fight' : 'flee';
      p.target = G.player;
    }
    if (p.hp <= 0) this.kill(p, source, dx, dz);
    else if (p.faction === 'cop') { p.state = 'chase'; p.target = G.player; }
  },

  kill(p, source, dx, dz) {
    if (p.dead) return;
    p.dead = true; p.state = 'down'; p.deadT = 0;
    p.vx = (dx || 0) * 3; p.vz = (dz || 0) * 3;
    if (source === G.player) {
      G.stats.kills++;
      const cash = p.faction === 'gang' ? G.rndi(60, 220) : G.rndi(15, 90);
      G.pickups.drop('cash', p.x, p.z, cash);
      if (p.faction === 'gang' && G.chance(0.35)) G.pickups.drop('ammo', p.x + 1, p.z, 0, p.weapon.id);
      G.police.crime(p.faction === 'cop' ? 3 : 1, p.x, p.z);
      G.mission.onKill(p);
    }
    /* panico ao redor */
    for (const q of this.list) {
      if (q === p || !q.active || q.dead) continue;
      if (G.dist2(q.x, q.z, p.x, p.z) < 400) {
        q.panic = 12;
        if (q.faction === 'civil') { q.state = 'flee'; q.target = G.player; }
        else if (q.faction === 'gang' && source === G.player) { q.state = 'fight'; q.target = G.player; }
      }
    }
  },

  /* alerta geral (tiro ouvido) */
  alarm(x, z, r) {
    for (const q of this.list) {
      if (!q.active || q.dead) continue;
      if (G.dist2(q.x, q.z, x, z) < r * r) {
        q.panic = Math.max(q.panic, 8);
        if (q.faction === 'civil' && q.state !== 'flee') { q.state = 'flee'; q.target = G.player; }
      }
    }
  },

  /* ----------------------------------------------------------- update */
  update(dt, px, pz) {
    const P = G.CITY.P;
    for (const p of this.list) {
      if (!p.active) { this.spawnNear(p, px, pz, 45, 130); continue; }
      const d2 = G.dist2(p.x, p.z, px, pz);

      /* streaming: recicla quem ficou longe demais */
      if (d2 > 260 * 260 && !p.dead) {
        if (p.faction === 'cop') { p.active = false; p.ch.root.visible = false; continue; }
        this.spawnNear(p, px, pz, 60, 150);
        continue;
      }
      if (p.dead) {
        p.deadT += dt;
        if (p.deadT > 22) { p.active = false; p.ch.root.visible = false; continue; }
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.vx *= 0.9; p.vz *= 0.9;
        p.ch.root.position.set(p.x, p.y, p.z);
        G.poseChar(p.ch, 'down', dt);
        if (p.deadT > 18) {
          const k = 1 - (p.deadT - 18) / 4;
          p.ch.root.position.y = p.y - (1 - k) * 1.4;
        }
        continue;
      }

      p.panic = Math.max(0, p.panic - dt);
      p.fireCd -= dt;
      let moveSpeed = 0;
      let anim = 'walk';

      if (p.state === 'flee') {
        const tx = p.target ? p.target.x : px, tz = p.target ? p.target.z : pz;
        let dx = p.x - tx, dz = p.z - tz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const sp = 6.2;
        p.x += dx * sp * dt; p.z += dz * sp * dt;
        p.a = G.dampAngle(p.a, Math.atan2(dx, dz), 8, dt);
        moveSpeed = sp;
        if (p.panic <= 0 || l > 70) { p.state = 'walk'; this.placeOnSidewalk(p, G.Nav.nearestNode(p.x, p.z)); }
      } else if (p.state === 'fight' || p.state === 'chase') {
        const t = p.target || G.player;
        const tx = t.x, tz = t.z;
        const dd = G.dist(p.x, p.z, tx, tz);
        /* policial so mantem distancia quando ja esta atirando (3+ estrelas);
           com poucas estrelas ele corre para render o jogador. */
        const arrest = p.faction === 'cop' && G.police.wanted < 3 && !G.player.inCar;
        const wantD = arrest ? 1.4 : (p.faction === 'cop' ? 11 : 9);
        let dx = tx - p.x, dz = tz - p.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        if (dd > wantD) {
          const sp = p.faction === 'cop' ? 5.2 : 4.4;
          p.x += dx * sp * dt; p.z += dz * sp * dt;
          moveSpeed = sp;
        } else if (dd < wantD - 4) {
          p.x -= dx * 2.2 * dt; p.z -= dz * 2.2 * dt;
          moveSpeed = 2.2;
        }
        p.a = G.dampAngle(p.a, Math.atan2(dx, dz), 9, dt);
        anim = 'aim';
        /* atira */
        if (p.weapon && dd < 34 && p.fireCd <= 0 && !G.player.dead && !arrest) {
          const clear = Math.abs(G.angleDiff(p.a, Math.atan2(dx, dz))) < 0.5;
          if (clear) {
            p.fireCd = p.faction === 'cop' ? G.rnd(0.7, 1.4) : G.rnd(0.35, 1.1);
            const oy = p.y + 1.4;
            G.Combat.npcFire(p, p.weapon.dmg * 0.55, 0.055,
              G.player.x, G.player.y + 1.0, G.player.z,
              p.x + dx * 0.5, oy, p.z + dz * 0.5);
            G.Audio.gunshot(p.weapon.sound, G.clamp(1 - dd / 60, 0.1, 0.8));
            G.peds.alarm(p.x, p.z, 40);
          }
        }
        if (dd > 90) { p.state = 'walk'; this.placeOnSidewalk(p, G.Nav.nearestNode(p.x, p.z)); }
      } else {
        /* caminhada normal pela calcada */
        const A = G.Nav.pos(p.node[0], p.node[1]), B = G.Nav.pos(p.next[0], p.next[1]);
        const seg = Math.hypot(B.x - A.x, B.z - A.z) || P;
        p.t += p.speed * dt / seg;
        if (p.t >= 1) {
          p.t -= 1;
          const prev = p.node; p.node = p.next;
          let nb = G.Nav.neighbors(p.node[0], p.node[1]).filter(n => n[0] !== prev[0] || n[1] !== prev[1]);
          if (!nb.length) nb = G.Nav.neighbors(p.node[0], p.node[1]);
          p.next = G.pick(nb);
        }
        const A2 = G.Nav.pos(p.node[0], p.node[1]), B2 = G.Nav.pos(p.next[0], p.next[1]);
        const dx = Math.sign(B2.x - A2.x), dz = Math.sign(B2.z - A2.z);
        const tx = A2.x + (B2.x - A2.x) * p.t + (-dz) * this.SIDEWALK * p.side;
        const tz = A2.z + (B2.z - A2.z) * p.t + (dx) * this.SIDEWALK * p.side;
        p.x = G.damp(p.x, tx, 9, dt); p.z = G.damp(p.z, tz, 9, dt);
        p.a = G.dampAngle(p.a, Math.atan2(dx, dz), 7, dt);
        moveSpeed = p.speed;
        anim = 'walk';
        /* desvia do jogador */
        if (d2 < 6) {
          const ax = p.x - px, az = p.z - pz, al = Math.hypot(ax, az) || 1;
          p.x += ax / al * dt * 2.5; p.z += az / al * dt * 2.5;
        }
      }

      G.pushOutCircle(p, 0.45);
      p.y = G.damp(p.y, G.groundHeight(p.x, p.z), 12, dt);
      p.ch.root.position.set(p.x, p.y, p.z);
      p.ch.root.rotation.y = p.a;

      /* anima so quem esta perto o suficiente para ser visto */
      if (d2 < 130 * 130) {
        const st = p.state === 'flee' ? 'walk' : (anim === 'aim' ? 'aim' : (p.weapon ? 'hold' : 'walk'));
        G.poseChar(p.ch, st, dt, { speed: moveSpeed, pitch: 0, twoHand: false });
        p.ch.root.visible = true;
      } else {
        p.ch.root.visible = d2 < 200 * 200;
      }
    }
  }
};
