/* ==========================================================================
   police.js - nivel de procurado (6 estrelas), viaturas, prisao e fuga.
   ========================================================================== */
'use strict';
var G = window.G;

G.police = {
  wanted: 0, heat: 0, lastCrime: 99, seen: 0, arrestT: 0, spawnCd: 0,
  heli: null,

  crime(level, x, z, noisy) {
    /* so conta se alguem viu: policial, viatura perto ou barulho */
    let witnessed = !!noisy;
    if (!witnessed) {
      for (const v of G.vehicles.list) {
        if (v.active && v.cop && G.dist2(v.x, v.z, x, z) < 70 * 70) { witnessed = true; break; }
      }
    }
    if (!witnessed) {
      for (const p of G.peds.list) {
        if (p.active && !p.dead && G.dist2(p.x, p.z, x, z) < 30 * 30) { witnessed = G.chance(0.8); break; }
      }
    }
    if (!witnessed && this.wanted === 0) return;
    this.heat += level;
    this.lastCrime = 0;
    const target = G.clamp(Math.floor(this.heat / 2.2), 0, 6);
    if (target > this.wanted) this.setWanted(target);
  },

  setWanted(n) {
    n = G.clamp(n, 0, 6);
    if (n === this.wanted) return;
    const up = n > this.wanted;
    this.wanted = n;
    if (up) { G.Audio.wanted(); G.hud.flashStars(); }
    if (n === 0) G.toast('Voce despistou a policia');
  },

  clear() {
    this.wanted = 0; this.heat = 0; this.arrestT = 0;
    if (this.heli && this.heli.active && this.heli.dead <= 0) this.killHeli(false);
    for (const v of G.vehicles.list) {
      if (v.cop && v.active) { v.active = false; v.mesh.visible = false; v.cop = false; v.mode = 'traffic'; }
    }
    for (const p of G.peds.list) {
      if (p.faction === 'cop' && p.active) { p.active = false; p.ch.root.visible = false; }
    }
  },

  copCarDown(v) {
    this.crime(1, v.x, v.z, true);
  },

  /* --------------------------------------------------------- helicoptero */
  spawnHeli(px, pz) {
    if (!this.heli) {
      const mesh = G.makeHelicopter();
      G.scene.add(mesh);
      const light = new THREE.SpotLight(0xffffff, 0, 90, 0.35, 0.4, 1);
      G.scene.add(light); G.scene.add(light.target);
      this.heli = { mesh, light, x: 0, y: 60, z: 0, a: 0, hp: 320, active: false, fireCd: 0, dead: 0 };
    }
    const h = this.heli;
    const ang = G.rnd(0, 6.283);
    h.x = px + Math.cos(ang) * 130; h.z = pz + Math.sin(ang) * 130;
    h.y = 55; h.hp = 320; h.active = true; h.dead = 0; h.fireCd = 3;
    h.mesh.visible = true;
    G.toast('Helicoptero da policia!');
    return h;
  },

  killHeli(explode) {
    const h = this.heli;
    if (!h || !h.active) return;
    if (explode) G.Combat.explode(h.x, h.y, h.z, 14, 120, null);
    h.active = false; h.mesh.visible = false; h.light.intensity = 0;
  },

  updateHeli(dt, px, pz) {
    const h = this.heli;
    if (!h || !h.active) { G.Audio.heliLevel(0); return; }
    const ud = h.mesh.userData;
    if (h.dead > 0) {
      /* abatido: cai girando */
      h.dead += dt;
      h.y -= h.dead * 9 * dt * 3;
      h.a += dt * 4;
      h.mesh.rotation.set(0.4, h.a, 0.35);
      h.mesh.position.set(h.x, h.y, h.z);
      ud.rotor.rotation.y += dt * 8;
      G.FX.spawn(h.x, h.y, h.z, 0x333333, 3, 1.2, 0, 1, 0, true);
      if (h.y <= 2) { this.killHeli(true); }
      return;
    }
    /* persegue o alvo mantendo altura */
    const target = 30 + Math.sin(performance.now() / 2400) * 5;
    const dx = px - h.x, dz = pz - h.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = d > 22 ? Math.min(34, d) : 0;
    const sp = G.clamp(d * 0.5, 0, 34);
    h.x += (dx / d) * sp * dt * (d > 20 ? 1 : 0.2);
    h.z += (dz / d) * sp * dt * (d > 20 ? 1 : 0.2);
    h.y = G.damp(h.y, target, 1.4, dt);
    h.a = G.dampAngle(h.a, Math.atan2(dx, dz), 2.2, dt);
    h.mesh.position.set(h.x, h.y, h.z);
    h.mesh.rotation.set(G.clamp(d * 0.004, 0, 0.22), h.a, 0);
    ud.rotor.rotation.y += dt * 26;
    ud.tail.rotation.x += dt * 34;
    ud.beacon.material.color.setHex(Math.floor(performance.now() / 250) % 2 ? 0xff2222 : 0x330000);
    /* holofote a noite */
    if (G.world.night) {
      h.light.intensity = 2.6;
      h.light.position.set(h.x, h.y - 1, h.z);
      h.light.target.position.set(px, 0, pz);
    } else h.light.intensity = 0;
    /* atira no jogador */
    h.fireCd -= dt;
    if (h.fireCd <= 0 && !G.player.dead && d < 55) {
      h.fireCd = G.rnd(0.5, 1.1);
      G.Combat.npcFire(null, 9, 0.05, G.player.x, G.player.y + 1, G.player.z, h.x, h.y - 1.2, h.z);
      G.Audio.gunshot('uzi', G.clamp(1 - d / 90, 0.1, 0.6));
    }
    G.Audio.heliLevel(G.clamp(1 - d / 150, 0, 1));
  },

  /* dano vindo de tiros do jogador */
  damageHeli(n) {
    const h = this.heli;
    if (!h || !h.active || h.dead > 0) return;
    h.hp -= n;
    if (h.hp <= 0) { h.dead = 0.01; G.toast('Helicoptero abatido!'); G.stats.wrecked++; }
  },

  update(dt, px, pz) {
    this.lastCrime += dt;
    this.spawnCd -= dt;

    /* o calor esfria com o tempo */
    if (this.lastCrime > 6) this.heat = Math.max(0, this.heat - dt * 0.55);

    /* alguem esta te vendo? */
    let seenNow = false;
    for (const v of G.vehicles.list) {
      if (v.active && v.cop && !v.wreck && G.dist2(v.x, v.z, px, pz) < 95 * 95) { seenNow = true; break; }
    }
    if (!seenNow) {
      for (const p of G.peds.list) {
        if (p.active && !p.dead && p.faction === 'cop' && G.dist2(p.x, p.z, px, pz) < 60 * 60) { seenNow = true; break; }
      }
    }
    this.seen = seenNow ? 0 : this.seen + dt;

    if (this.wanted > 0) {
      /* perde uma estrela apos algum tempo escondido */
      const need = 9 + this.wanted * 3;
      if (this.seen > need && this.lastCrime > 8) {
        this.seen = 0;
        this.heat = Math.max(0, this.heat - 2.4);
        this.setWanted(this.wanted - 1);
      }
      /* helicoptero a partir de 4 estrelas */
      if (this.wanted >= 4) {
        if (!this.heli || !this.heli.active) {
          if (this.spawnCd <= 0) { this.spawnHeli(px, pz); this.spawnCd = 4; }
        }
      } else if (this.heli && this.heli.active && this.heli.dead <= 0) this.killHeli(false);

      /* mantem viaturas em campo */
      const cars = G.vehicles.list.filter(v => v.active && v.cop && !v.wreck).length;
      const want = Math.min(8, this.wanted + (this.wanted > 2 ? 1 : 0));
      if (cars < want && this.spawnCd <= 0) {
        G.vehicles.spawnPolice(px, pz, G.rnd(90, 170));
        this.spawnCd = Math.max(0.6, 2.4 - this.wanted * 0.3);
      }
      /* prisao: policial a pe encostado no jogador desarmado/parado */
      if (!G.player.inCar && !G.player.dead) {
        let close = false;
        for (const p of G.peds.list) {
          if (p.active && !p.dead && p.faction === 'cop' && G.dist2(p.x, p.z, px, pz) < 12) { close = true; break; }
        }
        for (const v of G.vehicles.list) {
          if (v.active && v.cop && !v.wreck && G.dist2(v.x, v.z, px, pz) < 22) { close = true; break; }
        }
        if (close) {
          this.arrestT += dt;
          if (this.arrestT > 1.6) { G.player.busted_(); this.arrestT = 0; }
        } else this.arrestT = Math.max(0, this.arrestT - dt);
      } else this.arrestT = 0;
    } else {
      this.arrestT = 0;
      if (this.heli && this.heli.active && this.heli.dead <= 0) this.killHeli(false);
    }
    this.updateHeli(dt, px, pz);

    /* sirene proxima */
    let nearest = 1e9;
    for (const v of G.vehicles.list) {
      if (v.active && v.cop && !v.wreck) nearest = Math.min(nearest, G.dist(v.x, v.z, px, pz));
    }
    G.Audio.sirenLevel(this.wanted > 0 && nearest < 120 ? G.clamp(1 - nearest / 120, 0, 1) : 0);
  }
};
