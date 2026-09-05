/* ==========================================================================
   police.js - nivel de procurado (6 estrelas), viaturas, prisao e fuga.
   ========================================================================== */
'use strict';
var G = window.G;

G.police = {
  wanted: 0, heat: 0, lastCrime: 99, seen: 0, arrestT: 0, spawnCd: 0,

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
    }

    /* sirene proxima */
    let nearest = 1e9;
    for (const v of G.vehicles.list) {
      if (v.active && v.cop && !v.wreck) nearest = Math.min(nearest, G.dist(v.x, v.z, px, pz));
    }
    G.Audio.sirenLevel(this.wanted > 0 && nearest < 120 ? G.clamp(1 - nearest / 120, 0, 1) : 0);
  }
};
