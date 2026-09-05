/* ==========================================================================
   hud.js - interface: dinheiro, estrelas, vida, colete, arma, radar,
   mapa grande, lojas, pausa e mensagens.
   ========================================================================== */
'use strict';
var G = window.G;

const DIST_COLOR = {
  downtown: '#5c6470', commercial: '#6b6455', residential: '#59684a',
  favela: '#6e5236', industrial: '#565654', beach: '#8a7c50', park: '#2f5e28'
};

G.hud = {
  el: {}, toastT: 0, bigT: 0, hurtT: 0, wFlash: 0, starFlash: 0,
  mapOpen: false, shop: null, paused: false,

  init() {
    const id = s => document.getElementById(s);
    this.el = {
      money: id('money'), stars: id('stars'), hp: id('hp'), armor: id('armor'),
      armorWrap: id('armorwrap'), weapon: id('weapon'), ammo: id('ammo'),
      zone: id('zone'), clock: id('clock'), speed: id('speed'), speedWrap: id('speedwrap'),
      carhp: id('carhp'), carWrap: id('carwrap'), toast: id('toast'), big: id('big'),
      hint: id('hint'), mission: id('mission'), radar: id('radar'), cross: id('cross'),
      dmg: id('dmg'), bigmap: id('bigmap'), bigmapCv: id('bigmapcv'), shop: id('shop'),
      shopTitle: id('shoptitle'), shopList: id('shoplist'), pause: id('pause'),
      wepList: id('weplist'), fps: id('fps')
    };
    this.rctx = this.el.radar.getContext('2d');
    this.mctx = this.el.bigmapCv.getContext('2d');
    this.mapCache = null;
  },

  toast(t, ms) { this.el.toast.textContent = t; this.toastT = (ms || 1800) / 1000; this.el.toast.style.opacity = 1; },
  bigMessage(t, color) {
    this.el.big.textContent = t;
    this.el.big.style.color = color || '#ffd23f';
    this.bigT = 2.2; this.el.big.style.opacity = 1;
  },
  hurt() { this.hurtT = 0.45; },
  flashWeapon() { this.wFlash = 1.2; },
  flashStars() { this.starFlash = 1.0; },

  /* ------------------------------------------------------------- lojas */
  SHOPS: {
    ammunation: {
      title: 'CASA DE ARMAS',
      items: [
        { n: 'Taco de baseball', p: 150, w: 'bat', a: 1 },
        { n: 'Pistola + 51 balas', p: 500, w: 'pistol', a: 51 },
        { n: 'Uzi + 120 balas', p: 1400, w: 'uzi', a: 120 },
        { n: 'Escopeta + 40 cart.', p: 2100, w: 'shotgun', a: 40 },
        { n: 'Fuzil + 150 balas', p: 3800, w: 'rifle', a: 150 },
        { n: 'Sniper + 30 balas', p: 5200, w: 'sniper', a: 30 },
        { n: '4 Granadas', p: 900, w: 'grenade', a: 4 },
        { n: 'Colete a prova', p: 800, armor: 100 },
        { n: 'Municao para arma atual', p: 350, refill: true }
      ]
    },
    food: {
      title: 'LANCHONETE',
      items: [
        { n: 'Coxinha (+30 vida)', p: 40, heal: 30 },
        { n: 'X-Tudo (+70 vida)', p: 90, heal: 70 },
        { n: 'Rodizio (vida cheia)', p: 160, heal: 999 }
      ]
    },
    paynspray: {
      title: 'OFICINA',
      items: [
        { n: 'Reparar veiculo', p: 200, repair: true },
        { n: 'Repintar (limpa procurado)', p: 500, respray: true }
      ]
    },
    save: {
      title: 'CASA SEGURA',
      items: [
        { n: 'Salvar jogo', p: 0, save: true },
        { n: 'Dormir ate de manha (+vida)', p: 0, sleep: true },
        { n: 'Carregar ultimo save', p: 0, load: true }
      ]
    },
    hospital: {
      title: 'HOSPITAL',
      items: [
        { n: 'Tratamento completo', p: 250, heal: 999 },
        { n: 'Colete', p: 700, armor: 100 }
      ]
    },
    police: {
      title: 'DELEGACIA',
      items: [
        { n: 'Pagar fianca (limpa procurado)', p: 1000, bribe: true }
      ]
    }
  },

  openShop(type) {
    const def = this.SHOPS[type];
    if (!def) return;
    this.shop = { type, def, index: 0 };
    this.el.shop.style.display = 'flex';
    this.el.shopTitle.textContent = def.title;
    this.renderShop();
    document.exitPointerLock();
    G.Audio.ui();
  },
  renderShop() {
    const s = this.shop;
    let html = '';
    s.def.items.forEach((it, i) => {
      const afford = G.player.money >= it.p;
      html += `<div class="shopitem${i === s.index ? ' sel' : ''}${afford ? '' : ' poor'}" data-i="${i}">
        <span>${i + 1}. ${it.n}</span><span>${it.p ? G.money(it.p) : 'gratis'}</span></div>`;
    });
    html += '<div class="shophint">1-9 ou clique para comprar &bull; ESC para sair</div>';
    this.el.shopList.innerHTML = html;
    [...this.el.shopList.querySelectorAll('.shopitem')].forEach(e => {
      e.onclick = () => this.buy(+e.dataset.i);
    });
  },
  closeShop() {
    this.shop = null;
    this.el.shop.style.display = 'none';
    G.requestLock();
  },
  buy(i) {
    const s = this.shop; if (!s) return;
    const it = s.def.items[i]; if (!it) return;
    if (G.player.money < it.p) { this.toast('Dinheiro insuficiente'); G.Audio.bad(); return; }
    G.player.money -= it.p;
    if (it.w) { G.player.giveWeapon(it.w, it.a); this.toast(it.n); }
    if (it.armor) { G.player.armor = it.armor; this.toast('Colete equipado'); }
    if (it.heal) { G.player.hp = Math.min(G.player.maxHp, G.player.hp + it.heal); this.toast('Vida ' + Math.floor(G.player.hp) + '%'); }
    if (it.refill) {
      const w = G.player.cur;
      if (G.WEAPONS[w] && G.WEAPONS[w].mag) { G.player.weapons[w] += G.WEAPONS[w].mag * 3; this.toast('Municao comprada'); }
      else { G.player.money += it.p; this.toast('Arma sem municao'); return; }
    }
    if (it.repair) {
      if (G.player.inCar) { G.player.car.hp = 100; G.player.car.burning = 0; this.toast('Veiculo reparado'); }
      else { G.player.money += it.p; this.toast('Entre em um veiculo'); return; }
    }
    if (it.respray) { G.police.clear(); if (G.player.inCar) G.player.car.hp = 100; this.toast('Repintado - policia despistada'); }
    if (it.bribe) { G.police.clear(); this.toast('Fianca paga'); }
    if (it.save) { G.saveGame(); this.toast('Jogo salvo'); }
    if (it.load) { G.loadGame(); this.toast('Jogo carregado'); }
    if (it.sleep) {
      G.world.time = 7; G.player.hp = G.player.maxHp;
      this.toast('Bom dia!'); G.police.clear();
    }
    G.Audio.pickup();
    this.renderShop();
  },

  /* -------------------------------------------------------------- update */
  update(dt) {
    const p = G.player, e = this.el;
    e.money.textContent = G.money(p.money);
    /* estrelas */
    let st = '';
    for (let i = 1; i <= 6; i++) st += `<span class="${i <= G.police.wanted ? 'on' : 'off'}">&#9733;</span>`;
    e.stars.innerHTML = st;
    e.stars.style.transform = this.starFlash > 0 ? `scale(${1 + Math.sin(this.starFlash * 30) * 0.08})` : 'scale(1)';
    this.starFlash = Math.max(0, this.starFlash - dt);

    e.hp.style.width = G.clamp(p.hp, 0, 100) + '%';
    e.hp.style.background = p.hp < 25 ? '#ff3b30' : '#e0553d';
    e.armorWrap.style.display = p.armor > 0 ? 'block' : 'none';
    e.armor.style.width = G.clamp(p.armor, 0, 100) + '%';

    const W = G.WEAPONS[p.cur];
    e.weapon.innerHTML = W.name;
    e.weapon.style.opacity = this.wFlash > 0 ? 1 : 0.85;
    this.wFlash = Math.max(0, this.wFlash - dt);
    if (W.melee) e.ammo.textContent = '';
    else if (W.throw) e.ammo.textContent = p.weapons.grenade;
    else e.ammo.textContent = (p.mag[p.cur] || 0) + ' / ' + (p.weapons[p.cur] === Infinity ? '--' : (p.weapons[p.cur] || 0));
    if (p.reloadT > 0) e.ammo.textContent = 'RECARREGANDO';

    e.zone.textContent = G.zoneName(p.x, p.z);
    e.clock.textContent = G.world.clock();

    const drv = p.inCar;
    e.speedWrap.style.display = drv ? 'block' : 'none';
    e.carWrap.style.display = drv ? 'block' : 'none';
    if (drv) {
      e.speed.textContent = Math.round(Math.abs(p.car.speed) * 3.6);
      e.carhp.style.width = G.clamp(p.car.hp, 0, 100) + '%';
      e.carhp.style.background = p.car.hp < 30 ? '#ff3b30' : '#4aa3ff';
    }

    /* dica contextual */
    let hint = '';
    const svc = G.world.serviceAt(p.x, p.z);
    if (this.shop) hint = '';
    else if (svc) {
      if (svc.type === 'paynspray' && drv) hint = 'F: entrar na oficina';
      else if (!drv) hint = 'F: ' + svc.name;
      else hint = svc.name + ' (a pe)';
    } else if (!drv && G.vehicles.nearest(p.x, p.z, 5, c => c.mode !== 'player')) hint = 'E: entrar no veiculo';
    else if (drv) {
      const t = G.mission.canStart();
      hint = 'E: sair' + (G.mission.active ? '  |  F: cancelar trabalho' : (t === 'taxi' ? '  |  F: fazer corridas' : t === 'vigilante' ? '  |  F: modo justiceiro' : '  |  F: racha'));
    } else if (!G.mission.active) hint = 'F: rampagem  |  Tab: mapa';
    e.hint.textContent = hint;
    e.mission.textContent = G.mission.active ? G.mission.status() : (G.mission.streak > 0 ? 'Entregas: ' + G.mission.streak : '');

    /* mira */
    e.cross.style.display = (p.aiming && !p.inCar) ? 'block' : 'none';

    /* dano na tela */
    this.hurtT = Math.max(0, this.hurtT - dt);
    e.dmg.style.opacity = this.hurtT > 0 ? this.hurtT : (p.hp < 25 ? 0.18 + Math.sin(performance.now() / 300) * 0.08 : 0);

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.style.opacity = 0; }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) e.big.style.opacity = 0; }

    this.drawRadar();
    if (this.mapOpen) this.drawBigMap();
  },

  /* -------------------------------------------------------------- radar */
  drawRadar() {
    const g = this.rctx, S = 200, R = S / 2;
    const p = G.player;
    const scale = 0.19;                 /* mundo -> pixels */
    const ang = -(p.inCar && p.car ? p.car.a : p.a);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.clip();
    g.fillStyle = '#20301c'; g.fillRect(0, 0, S, S);

    g.translate(R, R);
    g.rotate(ang);
    g.scale(scale, scale);
    g.translate(-p.x, -p.z);

    const C = G.CITY, view = R / scale + C.P;
    /* mar ao sul da cidade */
    g.fillStyle = '#1b4f72';
    g.fillRect(-C.EXT * 2, C.EXT + 95, C.EXT * 4, C.EXT * 2);
    g.fillStyle = '#b6a374';
    g.fillRect(-C.EXT * 2, C.EXT - 60, C.EXT * 4, 155);
    /* quadras */
    for (const b of G.blocks) {
      if (Math.abs(b.x - p.x) > view || Math.abs(b.z - p.z) > view) continue;
      g.fillStyle = DIST_COLOR[b.district] || '#555';
      g.fillRect(b.x - C.BLOCK / 2, b.z - C.BLOCK / 2, C.BLOCK, C.BLOCK);
    }
    /* ruas */
    g.strokeStyle = '#9a9aa2'; g.lineWidth = C.RW;
    for (let i = -C.N; i <= C.N; i++) {
      if (Math.abs(i * C.P - p.z) < view) { g.beginPath(); g.moveTo(-C.EXT, i * C.P); g.lineTo(C.EXT, i * C.P); g.stroke(); }
      if (Math.abs(i * C.P - p.x) < view) { g.beginPath(); g.moveTo(i * C.P, -C.EXT); g.lineTo(i * C.P, C.EXT); g.stroke(); }
    }
    /* servicos */
    for (const s of G.world.services) {
      if (Math.abs(s.x - p.x) > view || Math.abs(s.z - p.z) > view) continue;
      g.fillStyle = '#' + s.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(s.x, s.z, 16, 0, 7); g.fill();
    }
    /* veiculos e pedestres */
    for (const v of G.vehicles.list) {
      if (!v.active || v.wreck) continue;
      if (Math.abs(v.x - p.x) > view || Math.abs(v.z - p.z) > view) continue;
      g.fillStyle = v.cop ? '#4aa3ff' : '#d8d8d8';
      g.beginPath(); g.arc(v.x, v.z, v.cop ? 15 : 9, 0, 7); g.fill();
    }
    for (const c of G.peds.list) {
      if (!c.active || c.dead || c.faction !== 'cop') continue;
      g.fillStyle = '#79c4ff';
      g.beginPath(); g.arc(c.x, c.z, 10, 0, 7); g.fill();
    }
    /* helicoptero */
    const hl = G.police.heli;
    if (hl && hl.active) {
      g.fillStyle = '#8ad4ff';
      g.beginPath(); g.arc(hl.x, hl.z, 22, 0, 7); g.fill();
      g.strokeStyle = '#0a2740'; g.lineWidth = 5; g.stroke();
    }
    /* objetivos */
    const mkList = [[G.mission.mk, '#ffd23f'], [G.mission.mk2, '#4aa3ff']];
    for (const [mk, col] of mkList) {
      if (!mk.visible) continue;
      g.fillStyle = col;
      g.beginPath(); g.arc(mk.userData.x, mk.userData.z, 20, 0, 7); g.fill();
    }
    g.restore();

    /* seta do jogador */
    g.save(); g.translate(R, R);
    g.fillStyle = '#7be26b'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 4); g.lineTo(-6, 7); g.closePath();
    g.fill(); g.stroke(); g.restore();

    /* setas para objetivos fora do radar */
    for (const [mk, col] of mkList) {
      if (!mk.visible) continue;
      const dx = mk.userData.x - p.x, dz = mk.userData.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d * scale < R - 12) continue;
      const a = Math.atan2(dz, dx) + ang;
      g.save(); g.translate(R + Math.cos(a) * (R - 10), R + Math.sin(a) * (R - 10)); g.rotate(a);
      g.fillStyle = col;
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill();
      g.restore();
    }
  },

  /* ----------------------------------------------------------- mapa full */
  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.el.bigmap.style.display = this.mapOpen ? 'flex' : 'none';
    if (this.mapOpen) document.exitPointerLock(); else G.requestLock();
  },
  drawBigMap() {
    const g = this.mctx, S = 720, C = G.CITY;
    const world = C.EXT * 2 + 420;
    const k = S / world;
    if (!this.mapCache) {
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const c = cv.getContext('2d');
      c.fillStyle = '#16304a'; c.fillRect(0, 0, S, S);
      c.save(); c.translate(S / 2, S / 2); c.scale(k, k);
      c.fillStyle = '#3f5a34'; c.fillRect(-world / 2, -world / 2, world, world);
      for (const b of G.blocks) {
        c.fillStyle = DIST_COLOR[b.district] || '#555';
        c.fillRect(b.x - C.BLOCK / 2, b.z - C.BLOCK / 2, C.BLOCK, C.BLOCK);
      }
      c.fillStyle = '#1c5f86';
      c.fillRect(-world / 2, C.EXT + 95, world, world);
      c.strokeStyle = '#b0b0b8'; c.lineWidth = C.RW * 0.8;
      for (let i = -C.N; i <= C.N; i++) {
        c.beginPath(); c.moveTo(-C.EXT, i * C.P); c.lineTo(C.EXT, i * C.P); c.stroke();
        c.beginPath(); c.moveTo(i * C.P, -C.EXT); c.lineTo(i * C.P, C.EXT); c.stroke();
      }
      c.restore();
      this.mapCache = cv;
    }
    g.drawImage(this.mapCache, 0, 0);
    g.save(); g.translate(S / 2, S / 2); g.scale(k, k);
    for (const s of G.world.services) {
      g.fillStyle = '#' + s.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(s.x, s.z, 26, 0, 7); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 5; g.stroke();
    }
    for (const [mk, col] of [[G.mission.mk, '#ffd23f'], [G.mission.mk2, '#4aa3ff']]) {
      if (!mk.visible) continue;
      g.fillStyle = col; g.beginPath(); g.arc(mk.userData.x, mk.userData.z, 30, 0, 7); g.fill();
    }
    for (const v of G.vehicles.list) {
      if (!v.active || !v.cop) continue;
      g.fillStyle = '#4aa3ff'; g.beginPath(); g.arc(v.x, v.z, 20, 0, 7); g.fill();
    }
    const p = G.player;
    g.save(); g.translate(p.x, p.z); g.rotate(-(p.inCar && p.car ? p.car.a : p.a));
    g.fillStyle = '#7be26b'; g.strokeStyle = '#000'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, -34); g.lineTo(22, 26); g.lineTo(0, 14); g.lineTo(-22, 26); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.restore();
  }
};
