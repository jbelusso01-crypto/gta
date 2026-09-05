/* ==========================================================================
   player.js - controle do jogador a pe e dirigindo, camera, mira e combate.

   CORRECAO DO WASD: o movimento agora usa a base (frente, direita) derivada
   do angulo da camera com G.fwdVec/G.rightVec. Na versao antiga o vetor
   lateral estava invertido, entao A e D andavam trocados.
   ========================================================================== */
'use strict';
var G = window.G;

G.player = {
  x: 6, y: 0, z: 40, a: 0, vy: 0, grounded: true,
  camYaw: 0, camPitch: 0.18, camDist: 6.4, camDistCur: 6.4,
  hp: 100, maxHp: 100, armor: 0, money: 500,
  inCar: false, car: null, enterT: 0,
  dead: false, busted: false, respawnT: 0,
  weapons: { fist: Infinity, pistol: 0, uzi: 0, shotgun: 0, rifle: 0, sniper: 0, grenade: 0, bat: 0 },
  cur: 'fist', mag: {}, fireCd: 0, reloadT: 0, punchT: -1,
  aiming: false, sprint: false, speed: 0, moveVX: 0, moveVZ: 0,
  wModel: null, ch: null, footT: 0, radioOn: false,

  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.ch = G.makeChar({
      skin: 0xd9a37b, shirt: 0x2f6f4a, pants: 0x24304a, hair: 0x1a1208,
      shoes: 0x141414, cap: null, scale: 1.02
    });
    scene.add(this.ch.root);
    for (const k in this.weapons) this.mag[k] = 0;
    this.mag.pistol = 0;
    this.setWeapon('fist');
    /* spawn na calcada perto do centro */
    this.x = 12; this.z = G.CITY.P * 0.5 + 30;
    this.y = G.groundHeight(this.x, this.z);
  },

  /* ------------------------------------------------------------- armas */
  setWeapon(id) {
    if (!G.WEAPONS[id]) return;
    if (id !== 'fist' && this.weapons[id] <= 0 && this.mag[id] <= 0) return;
    this.cur = id;
    if (this.wModel) { this.ch.armR.hand.remove(this.wModel); this.wModel = null; }
    if (id !== 'fist') {
      this.wModel = G.makeWeaponModel(id);
      this.wModel.position.set(0, -0.12, 0.05);
      this.ch.armR.hand.add(this.wModel);
    }
    G.hud.flashWeapon();
  },
  cycleWeapon(dir) {
    const own = G.WEAPON_ORDER.filter(id => id === 'fist' || this.weapons[id] > 0 || this.mag[id] > 0);
    let i = own.indexOf(this.cur);
    i = (i + dir + own.length) % own.length;
    this.setWeapon(own[i]);
    G.Audio.ui();
  },
  giveWeapon(id, ammo) {
    if (!G.WEAPONS[id]) return;
    this.weapons[id] = (this.weapons[id] || 0) + ammo;
    if (this.mag[id] === undefined) this.mag[id] = 0;
    if (this.mag[id] === 0 && G.WEAPONS[id].mag) this.reloadNow(id);
    if (this.cur === 'fist' || this.cur === 'bat') this.setWeapon(id);
  },
  reloadNow(id) {
    const W = G.WEAPONS[id];
    if (!W || !W.mag) return;
    const need = W.mag - this.mag[id];
    const take = Math.min(need, this.weapons[id]);
    this.mag[id] += take; this.weapons[id] -= take;
  },
  startReload() {
    const W = G.WEAPONS[this.cur];
    if (!W || !W.mag || this.reloadT > 0) return;
    if (this.mag[this.cur] >= W.mag || this.weapons[this.cur] <= 0) return;
    this.reloadT = this.cur === 'shotgun' ? 1.5 : 1.15;
    G.Audio.reload();
  },

  /* -------------------------------------------------------------- dano */
  damage(n) {
    if (this.dead || n <= 0) return;
    if (this.armor > 0) {
      const abs = Math.min(this.armor, n * 0.7);
      this.armor -= abs; n -= abs;
    }
    this.hp -= n;
    G.hud.hurt();
    if (this.hp <= 0) { this.hp = 0; this.die('VOCE MORREU'); }
  },
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); },

  die(msg) {
    if (this.dead) return;
    this.dead = true; this.respawnT = 3.0;
    G.hud.bigMessage(msg, '#e05555');
    G.Audio.bad();
    if (this.inCar) this.exitCar(true);
    G.stats.deaths++;
  },
  busted_() {
    if (this.dead) return;
    this.dead = true; this.busted = true; this.respawnT = 3.0;
    G.hud.bigMessage('PRESO', '#4aa3ff');
    G.Audio.bad();
    if (this.inCar) this.exitCar(true);
    G.stats.busted++;
  },
  respawn() {
    const fee = Math.floor(this.money * (this.busted ? 0.15 : 0.1));
    this.money = Math.max(0, this.money - fee);
    if (this.busted) {
      /* preso: perde as armas */
      for (const k in this.weapons) if (k !== 'fist') this.weapons[k] = 0;
      for (const k in this.mag) this.mag[k] = 0;
      this.setWeapon('fist');
    }
    const spot = this.busted ? G.world.policeStation : G.world.hospital;
    this.x = spot.x; this.z = spot.z;
    this.y = G.groundHeight(this.x, this.z);
    this.hp = this.maxHp; this.armor = 0;
    this.dead = false; this.busted = false;
    G.police.clear();
    G.hud.toast(fee > 0 ? 'Taxa: ' + G.money(fee) : 'Recuperado');
    G.mission.abort('Voce nao terminou a missao');
  },

  /* --------------------------------------------------------- veiculos */
  tryEnterCar() {
    if (this.dead) return;
    if (this.inCar) { this.exitCar(); return; }
    const v = G.vehicles.nearest(this.x, this.z, 5.0, c => c.mode !== 'player');
    if (!v) return;
    if (v.mode === 'traffic' || v.mode === 'police') {
      G.police.crime(v.mode === 'police' ? 2 : 1, this.x, this.z);
      G.toast(v.mode === 'police' ? 'Viatura roubada!' : 'Carro roubado!');
      G.stats.stolen++;
    }
    v.mode = 'player'; v.driverMesh.visible = false;
    v.wait = 0; v.copsOut = false;
    this.car = v; this.inCar = true;
    v.vx = Math.sin(v.a) * v.speed; v.vz = Math.cos(v.a) * v.speed;
    /* jogador sentado dentro do carro */
    this.scene.remove(this.ch.root);
    v.mesh.add(this.ch.root);
    /* altura do banco: a cabeca precisa ficar abaixo do teto do veiculo */
    const seatY = v.kind === 'bus' ? 0.75 : (v.K.profile === 'van' ? 0.35 : (v.K.profile === 'suv' || v.K.profile === 'pickup' ? 0.12 : -0.06));
    this.ch.root.position.set(-v.K.width * 0.2, seatY, -0.2);
    this.ch.root.rotation.set(0, 0, 0);
    this.ch.root.visible = true;
    G.mission.onEnterVehicle(v);
  },

  exitCar(force) {
    if (!this.inCar) return;
    const v = this.car;
    if (!force && Math.abs(v.speed) > 16) { G.toast('Muito rapido para sair!'); return; }
    const rx = -Math.cos(v.a), rz = Math.sin(v.a);
    this.x = v.x - rx * 2.6; this.z = v.z - rz * 2.6;
    this.a = v.a;
    v.mesh.remove(this.ch.root);
    this.scene.add(this.ch.root);
    this.ch.root.position.set(this.x, this.y, this.z);
    this.ch.root.rotation.set(0, this.a, 0);
    this.inCar = false;
    if (!v.wreck) { v.mode = 'parked'; v.speed *= 0.3; }
    this.car = null;
    G.pushOutCircle(this, 0.5);
  },

  /* --------------------------------------------------------- disparo */
  aimDir() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return d;
  },
  muzzlePos() {
    if (this.wModel) {
      const p = new THREE.Vector3();
      this.wModel.getWorldPosition(p);
      return p;
    }
    return new THREE.Vector3(this.x, this.y + 1.4, this.z);
  },

  /* auto-mira suave no estilo GTA quando nao esta mirando com o botao direito */
  assistTarget(dir) {
    if (this.aiming) return dir;
    let best = null, bestDot = 0.92;
    for (const p of G.peds.list) {
      if (!p.active || p.dead) continue;
      const dx = p.x - this.x, dy = (p.y + 1.1) - (this.y + 1.5), dz = p.z - this.z;
      const l = Math.hypot(dx, dy, dz);
      if (l > 42) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / l;
      if (dot > bestDot) { bestDot = dot; best = { x: dx / l, y: dy / l, z: dz / l }; }
    }
    return best ? new THREE.Vector3(best.x, best.y, best.z) : dir;
  },

  attack() {
    if (this.dead || this.reloadT > 0) return;
    const W = G.WEAPONS[this.cur];
    if (this.fireCd > 0) return;

    if (this.inCar) {
      /* dirigindo: so armas de uma mao */
      if (W.melee || W.two || W.throw) return;
      if (this.mag[this.cur] <= 0) { this.startReload(); return; }
      this.mag[this.cur]--;
      this.fireCd = W.rate;
      const dir = this.aimDir();
      const o = new THREE.Vector3(this.car.x - Math.cos(this.car.a) * 1.4, this.car.y + 1.2, this.car.z + Math.sin(this.car.a) * 1.4);
      G.Combat.fire(this, W, o.x, o.y, o.z, dir.x, dir.y, dir.z);
      G.Audio.gunshot(W.sound, 1);
      G.police.crime(1, this.x, this.z, true);
      return;
    }

    if (W.melee) {
      this.fireCd = W.rate; this.punchT = 0;
      G.Audio.punch();
      const fx = Math.sin(this.a), fz = Math.cos(this.a);
      let hit = false;
      for (const p of G.peds.list) {
        if (!p.active || p.dead) continue;
        const dx = p.x - this.x, dz = p.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d > W.range) continue;
        if ((dx * fx + dz * fz) / (d || 1) < 0.45) continue;
        G.peds.damage(p, W.dmg, this, fx, fz);
        G.FX.blood(p.x, p.y + 1.3, p.z, fx, fz);
        G.Audio.hitFlesh();
        G.police.crime(1, this.x, this.z);
        hit = true;
        break;
      }
      if (!hit) {
        /* bate no carro tambem */
        const v = G.vehicles.nearest(this.x + fx * 2, this.z + fz * 2, 3.0);
        if (v) { G.vehicles.damage(v, W.dmg * 0.5, this); G.Audio.crash(0.25); }
      }
      return;
    }

    if (W.throw) {
      if (this.weapons.grenade <= 0) { G.toast('Sem granadas'); return; }
      this.weapons.grenade--;
      this.fireCd = W.rate;
      const d = this.aimDir();
      const o = this.muzzlePos();
      G.Grenades.throwOne(o.x, o.y + 0.3, o.z, d.x * 20, d.y * 20 + 6, d.z * 20, this);
      G.police.crime(1, this.x, this.z, true);
      return;
    }

    if (this.mag[this.cur] <= 0) {
      if (this.weapons[this.cur] > 0) this.startReload();
      else { G.Audio.ui(); G.toast('Sem municao'); }
      return;
    }
    this.mag[this.cur]--;
    this.fireCd = W.rate;
    let dir = this.aimDir();
    dir = this.assistTarget(dir);
    const o = this.muzzlePos();
    G.Combat.fire(this, W, o.x, o.y, o.z, dir.x, dir.y, dir.z);
    G.Audio.gunshot(W.sound, 1);
    G.camShake(W.id === 'shotgun' || W.id === 'sniper' ? 0.45 : 0.16);
    this.camPitch = Math.max(0.02, this.camPitch - (W.id === 'uzi' ? 0.006 : 0.02));
    G.peds.alarm(this.x, this.z, 55);
    G.police.crime(1, this.x, this.z, true);
  },

  /* ---------------------------------------------------------- update */
  update(dt, input) {
    if (this.dead) {
      this.respawnT -= dt;
      G.poseChar(this.ch, 'down', dt);
      this.ch.root.position.set(this.x, this.y, this.z);
      if (this.respawnT <= 0) this.respawn();
      this.updateCamera(dt);
      return;
    }
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.reloadNow(this.cur);
    }
    if (this.punchT >= 0) { this.punchT += dt * 3.4; if (this.punchT > 1) this.punchT = -1; }

    if (this.inCar) this.updateDriving(dt, input);
    else this.updateOnFoot(dt, input);

    this.updateCamera(dt);
  },

  /* -------------------------------------------------------- a pe */
  updateOnFoot(dt, input) {
    const k = input.keys;
    this.sprint = (k.ShiftLeft || k.ShiftRight) && !this.aiming;

    /* base correta: frente e direita a partir do angulo da camera */
    const f = G.fwdVec(this.camYaw), r = G.rightVec(this.camYaw);
    let mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    let mz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    let vx = 0, vz = 0, moving = false;
    if (mx || mz) {
      const l = Math.hypot(mx, mz);
      mx /= l; mz /= l;
      vx = f.x * mz + r.x * mx;
      vz = f.z * mz + r.z * mx;
      moving = true;
    }
    const base = this.aiming ? 2.6 : (this.sprint ? 8.6 : 4.4);
    const sp = base * (this.hp < 25 ? 0.75 : 1);
    this.speed = G.damp(this.speed, moving ? sp : 0, 14, dt);
    if (moving) { this.moveVX = vx; this.moveVZ = vz; }

    this.x += this.moveVX * this.speed * dt;
    this.z += this.moveVZ * this.speed * dt;

    /* virar: mirando encara a camera, senao encara o movimento */
    if (this.aiming) this.a = G.dampAngle(this.a, this.camYaw, 16, dt);
    else if (moving) this.a = G.dampAngle(this.a, Math.atan2(this.moveVX, this.moveVZ), 12, dt);

    /* natacao: fora da orla o jogador boia e nada devagar */
    this.swimming = G.inWater(this.x, this.z);
    if (this.swimming) {
      this.speed = G.damp(this.speed, moving ? 3.2 : 0, 6, dt);
      this.x += this.moveVX * this.speed * dt;
      this.z += this.moveVZ * this.speed * dt;
      this.y = G.damp(this.y, -0.62, 6, dt);
      this.vy = 0; this.grounded = false;
      if (moving) this.a = G.dampAngle(this.a, Math.atan2(this.moveVX, this.moveVZ), 8, dt);
      this.swimT = (this.swimT || 0) + dt;
      /* cansaco: longe demais da praia comeca a afogar */
      const deep = this.z - G.CITY.WATER_Z;
      if (deep > 130) this.damage(9 * dt);
      this.ch.root.position.set(this.x, this.y, this.z);
      this.ch.root.rotation.y = this.a;
      G.poseChar(this.ch, 'swim', dt, { speed: this.speed, t: this.swimT });
      if (G.chance(dt * 4)) G.FX.spawn(this.x + G.rnd(-.5, .5), 0.1, this.z + G.rnd(-.5, .5), 0xbfe0ef, 0.5, 0.4, 0, 0.6, 0, true);
      return;
    }

    /* pulo */
    const gh = G.groundHeight(this.x, this.z);
    if (input.jump && this.grounded) { this.vy = 6.2; this.grounded = false; input.jump = false; }
    this.vy -= 20 * dt;
    this.y += this.vy * dt;
    if (this.y <= gh) { this.y = gh; this.vy = 0; this.grounded = true; }

    G.pushOutCircle(this, 0.45);

    /* passos */
    if (moving && this.grounded) {
      this.footT -= dt * (this.sprint ? 3.4 : 2.2);
      if (this.footT <= 0) { this.footT = 1; G.Audio.step(this.sprint ? 1 : 0.6); }
    }

    this.ch.root.position.set(this.x, this.y, this.z);
    this.ch.root.rotation.y = this.a;
    let st = 'walk';
    if (this.punchT >= 0) st = 'punch';
    else if (this.aiming && this.cur !== 'fist') st = 'aim';
    else if (this.cur !== 'fist' && this.cur !== 'bat') st = 'hold';
    G.poseChar(this.ch, st, dt, {
      speed: this.speed, punchT: this.punchT,
      pitch: -this.camPitch + 0.15, twoHand: !!(G.WEAPONS[this.cur] || {}).two
    });
  },

  /* ---------------------------------------------------- dirigindo */
  updateDriving(dt, input) {
    const v = this.car, k = input.keys;
    if (!v || !v.active) { this.inCar = false; this.car = null; return; }
    const K = v.K;

    const throttle = (k.KeyW ? 1 : 0);
    const brake = (k.KeyS ? 1 : 0);
    const hand = k.Space ? 1 : 0;
    const steerIn = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);

    /* velocidade escalar ao longo da frente do carro */
    if (v.vx === undefined) { v.vx = Math.sin(v.a) * v.speed; v.vz = Math.cos(v.a) * v.speed; }
    const fx = Math.sin(v.a), fz = Math.cos(v.a);
    let fwd = v.vx * fx + v.vz * fz;
    let lat = v.vx * (-fz) + v.vz * fx;

    const top = K.top * (v.hp < 35 ? 0.75 : 1);
    if (throttle) fwd += K.acc * dt * (1 - Math.min(1, Math.abs(fwd) / top) * 0.85);
    if (brake) {
      if (fwd > 0.5) fwd -= K.acc * 1.6 * dt;
      else fwd -= K.acc * 0.55 * dt;
    }
    v.braking = brake > 0;
    if (!throttle && !brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 5.5 * dt);
    if (hand) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 7 * dt);
    fwd = G.clamp(fwd, -top * 0.42, top);

    /* esterco: quanto mais rapido, menos angulo */
    const grip = Math.min(1, Math.abs(fwd) / 6);
    const maxSteer = 0.85 - Math.min(0.55, Math.abs(fwd) / top * 0.55);
    this.carSteer = G.damp(this.carSteer || 0, steerIn * maxSteer, 9, dt);
    v.steer = this.carSteer;
    if (Math.abs(fwd) > 0.4) {
      v.a += this.carSteer * grip * (hand ? 2.7 : 1.85) * dt * Math.sign(fwd);
    }

    /* aderencia lateral: freio de mao faz derrapar */
    const gripLat = hand ? 0.9 : 7.5;
    lat = lat * Math.exp(-gripLat * dt);
    if (hand && Math.abs(fwd) > 6) {
      lat += this.carSteer * Math.abs(fwd) * 0.95 * dt * 6;
      if (G.chance(0.4)) {
        G.Audio.skid(G.clamp(Math.abs(lat) / 12, 0.1, 1));
        G.FX.spawn(v.x + G.rnd(-1, 1), 0.1, v.z + G.rnd(-1, 1), 0x999999, 0.8, 0.6, 0, 0.4, 0, true);
      }
    }

    v.vx = fx * fwd + (-fz) * lat;
    v.vz = fz * fwd + fx * lat;
    v.speed = fwd;

    const px = v.x, pz = v.z;
    v.x += v.vx * dt;
    v.z += v.vz * dt;

    /* caiu no mar: o carro afunda e o motorista sai nadando */
    if (G.inWater(v.x, v.z)) {
      v.sink = (v.sink || 0) + dt;
      v.speed *= 0.85; v.vx *= 0.85; v.vz *= 0.85;
      v.mesh.position.y = -v.sink * 1.2;
      if (v.sink < dt * 2) G.toast('O veiculo esta afundando!');
      if (v.sink > 1.2) {
        this.exitCar(true);
        v.wreck = true; v.active = false; v.mesh.visible = false;
        this.z = G.CITY.WATER_Z - 2;
        return;
      }
    }

    /* colisao com o cenario */
    let crashed = 0;
    G.pushOutCircle(v, v.hl * 0.8, () => { crashed = Math.abs(fwd); });
    if (crashed > 4) {
      G.vehicles.damage(v, crashed * 1.1, null);
      G.Audio.crash(G.clamp(crashed / 28, 0.15, 1));
      G.camShake(G.clamp(crashed / 40, 0, 0.8));
      this.damage(crashed * 0.22);
      v.vx *= -0.22; v.vz *= -0.22;
    }

    /* efeitos de carroceria */
    v.roll = G.clamp(-this.carSteer * Math.abs(fwd) * 0.012, -0.18, 0.18);
    v.pitch = G.clamp((throttle ? -0.035 : 0) + (brake ? 0.05 : 0), -0.1, 0.1);
    v.wheelSpin += fwd * dt * 2.4;

    G.vehicles.runOverCheck(v, dt);
    G.vehicles.applyMesh(v, dt);

    this.x = v.x; this.z = v.z; this.y = v.y;

    /* som do motor */
    G.Audio.engineUpdate(true, G.clamp(Math.abs(fwd) / top, 0.06, 1), throttle);

    G.poseChar(this.ch, 'drive', dt, { steer: this.carSteer });
  },

  /* ------------------------------------------------------------ camera */
  updateCamera(dt) {
    const cam = this.camera;
    const inCar = this.inCar;
    const tgtX = inCar ? this.car.x : this.x;
    const tgtZ = inCar ? this.car.z : this.z;
    const tgtY = (inCar ? this.car.y + 1.5 : this.y + 1.55);

    let dist = inCar ? (this.car.kind === 'bus' ? 13 : 9.2) : (this.aiming ? 3.0 : 6.4);
    let height = 0;
    if (this.aiming) height = 0.25;
    /* atras do carro quando ninguem mexe o mouse */
    if (inCar && G.input.autoCam) {
      this.camYaw = G.dampAngle(this.camYaw, this.car.a, 2.4, dt);
      this.camPitch = G.damp(this.camPitch, 0.24, 2, dt);
    }
    this.camDistCur = G.damp(this.camDistCur, dist, 6, dt);
    const cp = Math.cos(this.camPitch), sp2 = Math.sin(this.camPitch);
    const f = G.fwdVec(this.camYaw), r = G.rightVec(this.camYaw);
    const shoulder = this.aiming && !inCar ? 0.85 : 0;

    let cx = tgtX - f.x * this.camDistCur * cp + r.x * shoulder;
    let cz = tgtZ - f.z * this.camDistCur * cp + r.z * shoulder;
    let cy = tgtY + this.camDistCur * sp2 + height;

    /* nao atravessa parede: encurta a distancia se bater */
    const dx = cx - tgtX, dy = cy - tgtY, dz = cz - tgtZ;
    const len = Math.hypot(dx, dy, dz);
    if (len > 0.2) {
      const hit = G.rayHit(tgtX, tgtY, tgtZ, dx / len, dy / len, dz / len, len, null);
      if (hit && hit.type === 'world') {
        const s = Math.max(1.2, hit.dist - 0.5) / len;
        cx = tgtX + dx * s; cy = tgtY + dy * s; cz = tgtZ + dz * s;
      }
    }
    const sh = G.camShakeAmt;
    cam.position.set(cx + G.rnd(-sh, sh), Math.max(0.7, cy) + G.rnd(-sh, sh), cz + G.rnd(-sh, sh));
    const look = new THREE.Vector3(
      tgtX + f.x * 6 + r.x * shoulder,
      tgtY - Math.tan(this.camPitch) * 6 * 0.55,
      tgtZ + f.z * 6 + r.z * shoulder
    );
    cam.lookAt(look);
    const W = G.WEAPONS[this.cur];
    const fov = this.aiming && W && W.zoom ? 65 / W.zoom * 1.6 : 68;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = G.damp(cam.fov, fov, 8, dt); cam.updateProjectionMatrix(); }
  }
};
