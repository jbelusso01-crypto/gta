/* ==========================================================================
   missions.js - trabalhos: entregas, taxi, justiceiro, rampagem e racha.
   ========================================================================== */
'use strict';
var G = window.G;

function marker(color, r, h) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  m.visible = false;
  return m;
}

G.mission = {
  active: null, type: null, timer: 0, goal: 0, count: 0, reward: 0,
  cp: [], cpIndex: 0, streak: 0, level: { taxi: 1, vigilante: 1, courier: 1 },
  target: null, passenger: false,

  init(scene) {
    this.scene = scene;
    this.mk = marker(0xffd23f, 3.2, 9);      /* objetivo generico */
    this.mk2 = marker(0x4aa3ff, 3.2, 9);     /* checkpoint         */
    scene.add(this.mk); scene.add(this.mk2);
    /* entrega sempre disponivel */
    this.newCourier();
  },

  /* -------------------------------------------------------------- ajuda */
  place(mk, x, z) {
    mk.position.set(x, 4, z);
    mk.visible = true;
    mk.userData.x = x; mk.userData.z = z;
  },
  dist(mk) { return G.dist(mk.userData.x, mk.userData.z, G.player.x, G.player.z); },

  /* ------------------------------------------------------------ entrega */
  newCourier() {
    const p = G.randomRoadPoint();
    this.courier = { x: p.x, z: p.z };
    this.place(this.mk, p.x, p.z);
    this.courierDist = G.dist(p.x, p.z, G.player.x, G.player.z);
  },

  /* ----------------------------------------------------------- iniciar */
  canStart() {
    if (this.active) return null;
    if (G.player.inCar) {
      if (G.player.car.kind === 'taxi') return 'taxi';
      if (G.player.car.cop) return 'vigilante';
      return 'race';
    }
    return 'rampage';
  },

  toggle() {
    if (this.active) { this.abort('Trabalho cancelado'); return; }
    const t = this.canStart();
    if (t === 'taxi') this.startTaxi();
    else if (t === 'vigilante') this.startVigilante();
    else if (t === 'race') this.startRace();
    else if (t === 'rampage') this.startRampage();
  },

  startTaxi() {
    this.active = true; this.type = 'taxi'; this.passenger = false;
    const p = G.randomRoadPoint();
    this.place(this.mk2, p.x, p.z);
    this.timer = 0;
    G.hud.bigMessage('TAXI', '#f5c518');
    G.toast('Busque o passageiro no marcador azul');
  },
  startVigilante() {
    this.active = true; this.type = 'vigilante';
    const p = G.randomRoadPoint();
    let ped = G.peds.list.find(q => !q.active);
    if (!ped) ped = G.peds.list[0];
    ped.x = p.x + G.rnd(-8, 8); ped.z = p.z + G.rnd(-8, 8);
    G.peds.reset(ped);
    G.peds.setFaction(ped, 'gang');
    ped.hp = 220; ped.state = 'fight'; ped.target = G.player; ped.speed = 5;
    this.target = ped;
    this.timer = 90;
    G.hud.bigMessage('JUSTICEIRO', '#4aa3ff');
    G.toast('Elimine o criminoso marcado');
  },
  startRampage() {
    this.active = true; this.type = 'rampage';
    this.goal = 8 + this.level.courier * 2;
    this.count = 0; this.timer = 60;
    G.hud.bigMessage('RAMPAGEM', '#ff4d4d');
    G.toast('Elimine ' + this.goal + ' alvos em 60s');
  },
  startRace() {
    this.active = true; this.type = 'race';
    this.cp = []; this.cpIndex = 0;
    for (let i = 0; i < 6; i++) this.cp.push(G.randomRoadPoint());
    this.place(this.mk2, this.cp[0].x, this.cp[0].z);
    this.timer = 75;
    G.hud.bigMessage('RACHA', '#38d68a');
    G.toast('Passe por todos os checkpoints');
  },

  abort(msg) {
    if (!this.active) return;
    this.active = false; this.type = null;
    this.mk2.visible = false;
    if (this.target) { this.target = null; }
    G.toast(msg || 'Trabalho abandonado');
  },
  finish(reward, msg) {
    G.player.money += reward;
    G.stats.earned += reward;
    G.stats.missions++;
    G.hud.bigMessage(msg + '  +' + G.money(reward), '#7be26b');
    G.Audio.cash();
    this.active = false; this.type = null;
    this.mk2.visible = false;
    this.target = null;
  },

  /* -------------------------------------------------------------- hooks */
  onKill(ped) {
    if (!this.active) return;
    if (this.type === 'rampage') {
      this.count++;
      if (this.count >= this.goal) this.finish(600 + this.goal * 60, 'RAMPAGEM COMPLETA');
    } else if (this.type === 'vigilante' && ped === this.target) {
      this.level.vigilante++;
      this.finish(400 + this.level.vigilante * 120, 'ALVO ELIMINADO');
    }
  },
  onEnterVehicle(v) {
    if (this.active && this.type === 'rampage') return;
  },

  /* ------------------------------------------------------------ update */
  update(dt) {
    const px = G.player.x, pz = G.player.z;
    this.mk.rotation.y += dt * 0.8;
    this.mk2.rotation.y -= dt * 0.8;

    /* entrega (sempre ativa, independe de missao) */
    if (this.mk.visible && G.dist2(this.mk.userData.x, this.mk.userData.z, px, pz) < 16) {
      const rew = Math.floor(80 + this.courierDist * 1.1 + this.streak * 45);
      G.player.money += rew; G.stats.earned += rew; this.streak++;
      G.toast('Entrega feita! + ' + G.money(rew), 2200);
      G.Audio.cash();
      this.newCourier();
    }

    if (!this.active) return;
    if (this.timer > 0 && this.type !== 'taxi') {
      this.timer -= dt;
      if (this.timer <= 0) { this.abort('Tempo esgotado!'); G.Audio.bad(); return; }
    }

    if (this.type === 'taxi') {
      if (!G.player.inCar || G.player.car.kind !== 'taxi') { this.abort('Voce saiu do taxi'); return; }
      const d = G.dist2(this.mk2.userData.x, this.mk2.userData.z, px, pz);
      if (!this.passenger) {
        if (d < 30 && Math.abs(G.player.car.speed) < 6) {
          this.passenger = true;
          const p = G.randomRoadPoint();
          this.fare = G.dist(px, pz, p.x, p.z);
          this.place(this.mk2, p.x, p.z);
          this.timer = 30 + this.fare / 12;
          G.toast('Passageiro embarcou! Leve ao destino');
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) { this.abort('O passageiro desistiu'); return; }
        if (d < 30 && Math.abs(G.player.car.speed) < 6) {
          this.level.taxi++;
          this.finish(Math.floor(90 + this.fare * 1.4 + this.level.taxi * 20), 'CORRIDA PAGA');
          this.passenger = false;
        }
      }
    } else if (this.type === 'vigilante') {
      const t = this.target;
      if (!t || !t.active) { this.abort('O alvo escapou'); return; }
      this.place(this.mk2, t.x, t.z);
      if (!G.player.inCar) { /* segue valendo a pe */ }
    } else if (this.type === 'race') {
      const c = this.cp[this.cpIndex];
      if (G.dist2(c.x, c.z, px, pz) < 64) {
        this.cpIndex++;
        G.Audio.pickup();
        if (this.cpIndex >= this.cp.length) {
          this.finish(700 + Math.floor(this.timer) * 12, 'RACHA VENCIDO');
          return;
        }
        this.timer += 12;
        this.place(this.mk2, this.cp[this.cpIndex].x, this.cp[this.cpIndex].z);
      }
    }
  },

  status() {
    if (!this.active) return '';
    if (this.type === 'taxi') return this.passenger ? 'Levar passageiro  ' + Math.ceil(this.timer) + 's' : 'Buscar passageiro';
    if (this.type === 'rampage') return 'Alvos: ' + this.count + '/' + this.goal + '   ' + Math.ceil(this.timer) + 's';
    if (this.type === 'vigilante') return 'Eliminar alvo   ' + Math.ceil(this.timer) + 's';
    if (this.type === 'race') return 'Checkpoint ' + (this.cpIndex + 1) + '/' + this.cp.length + '   ' + Math.ceil(this.timer) + 's';
    return '';
  }
};
