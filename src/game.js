/* ==========================================================================
   game.js - inicializacao, entrada, loop principal e save.
   ========================================================================== */
'use strict';
var G = window.G;

G.stats = { kills: 0, stolen: 0, wrecked: 0, missions: 0, deaths: 0, busted: 0, earned: 0, dist: 0, time: 0 };
G.camShakeAmt = 0;
G.camShake = function (a) { G.camShakeAmt = Math.min(1.2, G.camShakeAmt + a); };
G.toast = function (t, ms) { G.hud.toast(t, ms); };

G.input = { keys: {}, autoCam: true, jump: false, fire: false, aim: false };

G.requestLock = function () {
  if (G.started && !G.paused && !G.hud.mapOpen && !G.hud.shop) {
    G.renderer.domElement.requestPointerLock();
  }
};

/* ------------------------------------------------------------------ init */
G.init = function () {
  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.25, 2000);
  G.camera = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  document.body.appendChild(renderer.domElement);
  G.renderer = renderer;

  G.buildTextures();
  G.buildCity(scene);
  G.world.init(scene, renderer);
  G.FX.init(scene);
  G.peds.init(scene);
  G.vehicles.init(scene);
  G.player.init(scene, camera);
  G.pickups.init(scene);
  G.mission.init(scene);
  G.hud.init();

  /* luz de "farol" do carro do jogador */
  G.headlight = new THREE.SpotLight(0xfff0c8, 0, 70, 0.62, 0.55, 1.2);
  G.headlight.target.position.set(0, 0, 0);
  scene.add(G.headlight); scene.add(G.headlight.target);

  bindInput(renderer.domElement);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  G.loadGame(true);
  loop();
};

/* ----------------------------------------------------------------- input */
function bindInput(canvas) {
  const k = G.input.keys;
  addEventListener('keydown', e => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'KeyQ'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    k[e.code] = true;

    if (G.hud.shop) {
      if (e.code === 'Escape' || e.code === 'KeyF') { G.hud.closeShop(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) G.hud.buy(n - 1);
      return;
    }
    if (!G.started) return;

    switch (e.code) {
      case 'KeyE': G.player.tryEnterCar(); break;
      case 'KeyF': interact(); break;
      case 'KeyR': G.player.startReload(); break;
      case 'KeyQ': G.player.cycleWeapon(-1); break;
      case 'KeyH': if (G.player.inCar) { G.Audio.horn(1); G.peds.alarm(G.player.x, G.player.z, 20); } break;
      case 'Space': if (!G.player.inCar) G.input.jump = true; break;
      case 'Tab': case 'KeyM': G.hud.toggleMap(); break;
      case 'Escape': togglePause(); break;
      case 'KeyP': togglePause(); break;
      case 'KeyN': G.Audio.setMuted(!G.Audio.muted); G.toast(G.Audio.muted ? 'Som desligado' : 'Som ligado'); break;
      case 'Digit1': G.player.setWeapon(G.player.weapons.bat > 0 && G.player.cur === 'fist' ? 'bat' : 'fist'); break;
      case 'Digit2': G.player.setWeapon('pistol'); break;
      case 'Digit3': G.player.setWeapon('uzi'); break;
      case 'Digit4': G.player.setWeapon('shotgun'); break;
      case 'Digit5': G.player.setWeapon('rifle'); break;
      case 'Digit6': G.player.setWeapon('sniper'); break;
      case 'Digit7': G.player.setWeapon('grenade'); break;
      case 'F5': G.saveGame(); G.toast('Jogo salvo'); break;
      case 'F9': G.loadGame(); G.toast('Jogo carregado'); break;
    }
  });
  addEventListener('keyup', e => { k[e.code] = false; });
  addEventListener('blur', () => { for (const c in k) k[c] = false; });

  addEventListener('mousedown', e => {
    if (G.hud.shop || G.hud.mapOpen || G.paused || !G.started) return;
    if (document.pointerLockElement !== canvas) { G.requestLock(); return; }
    if (e.button === 0) { G.input.fire = true; G.player.attack(); }
    if (e.button === 2) { G.player.aiming = true; }
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) G.input.fire = false;
    if (e.button === 2) G.player.aiming = false;
  });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    if (!G.started || G.hud.shop) return;
    G.player.cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    const s = G.player.aiming ? 0.0014 : 0.0026;
    G.player.camYaw -= e.movementX * s;
    G.player.camPitch = G.clamp(G.player.camPitch + e.movementY * s * 0.8, -0.42, 1.0);
    G.input.autoCam = false;
    clearTimeout(G._camT);
    G._camT = setTimeout(() => { G.input.autoCam = true; }, 2200);
  });

  document.getElementById('intro').addEventListener('click', () => {
    document.getElementById('intro').style.display = 'none';
    G.started = true;
    G.Audio.init(); G.Audio.resume();
    G.requestLock();
  });
  canvas.addEventListener('click', () => { if (G.started) G.requestLock(); });
  document.getElementById('resume').addEventListener('click', () => togglePause());
}

function interact() {
  const p = G.player;
  const svc = G.world.serviceAt(p.x, p.z);
  if (svc) {
    if (svc.type === 'paynspray' && p.inCar) {
      if (p.money >= 200) {
        p.money -= 200; p.car.hp = 100; p.car.burning = 0;
        G.police.clear();
        G.toast('Veiculo reparado e repintado (-' + G.money(200) + ')');
        G.Audio.pickup();
      } else G.toast('Precisa de ' + G.money(200));
      return;
    }
    if (!p.inCar) { G.hud.openShop(svc.type); return; }
  }
  G.mission.toggle();
}

function togglePause() {
  if (!G.started) return;
  if (G.hud.mapOpen) { G.hud.toggleMap(); return; }
  if (G.hud.shop) { G.hud.closeShop(); return; }
  G.paused = !G.paused;
  document.getElementById('pause').style.display = G.paused ? 'flex' : 'none';
  if (G.paused) document.exitPointerLock(); else G.requestLock();
  if (G.paused) {
    document.getElementById('pausestats').innerHTML =
      `Dinheiro: ${G.money(G.player.money)}<br>Eliminacoes: ${G.stats.kills}<br>` +
      `Veiculos roubados: ${G.stats.stolen}<br>Trabalhos: ${G.stats.missions}<br>` +
      `Entregas: ${G.mission.streak}<br>Mortes: ${G.stats.deaths} &bull; Prisoes: ${G.stats.busted}<br>` +
      `Tempo: ${Math.floor(G.stats.time / 60)}min`;
  }
}

/* ------------------------------------------------------------------ save */
const SAVE_KEY = 'cidadeaberta.save.v1';
G.saveGame = function () {
  try {
    const p = G.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: p.x, z: p.z, money: p.money, hp: p.hp, armor: p.armor,
      weapons: p.weapons, mag: p.mag, cur: p.cur,
      time: G.world.time, stats: G.stats, streak: G.mission.streak
    }));
    return true;
  } catch (e) { return false; }
};
G.loadGame = function (silent) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    const p = G.player;
    if (p.inCar) p.exitCar(true);
    p.x = s.x; p.z = s.z; p.y = G.groundHeight(s.x, s.z);
    p.money = s.money; p.hp = s.hp; p.armor = s.armor || 0;
    for (const k in s.weapons) if (p.weapons[k] !== undefined) p.weapons[k] = s.weapons[k];
    for (const k in s.mag) p.mag[k] = s.mag[k];
    G.world.time = s.time || 9;
    Object.assign(G.stats, s.stats || {});
    G.mission.streak = s.streak || 0;
    p.setWeapon(s.cur && G.WEAPONS[s.cur] ? s.cur : 'fist');
    if (!silent) G.police.clear();
    return true;
  } catch (e) { return false; }
};

/* ------------------------------------------------------------------ loop */
let last = performance.now(), fpsT = 0, fpsN = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  fpsT += dt; fpsN++;
  if (fpsT > 0.5) {
    document.getElementById('fps').textContent = Math.round(fpsN / fpsT) + ' fps';
    fpsT = 0; fpsN = 0;
  }

  if (G.started && !G.paused && !G.hud.shop) {
    G.stats.time += dt;
    const p = G.player;

    /* tiro automatico segurando o botao */
    if (G.input.fire && !p.dead) {
      const W = G.WEAPONS[p.cur];
      if (W.auto || W.melee) p.attack();
    }

    p.update(dt, G.input);
    const px = p.x, pz = p.z;

    G.vehicles.update(dt, px, pz);
    G.peds.update(dt, px, pz);
    G.police.update(dt, px, pz);
    G.mission.update(dt);
    G.pickups.update(dt, px, pz);
    G.Grenades.update(dt);
    G.FX.update(dt);
    G.world.update(dt, px, pz);

    if (!p.inCar) G.Audio.engineUpdate(false, 0, 0);

    /* farol do carro a noite */
    if (p.inCar && G.world.night) {
      const c = p.car;
      G.headlight.intensity = 2.2;
      G.headlight.position.set(c.x + Math.sin(c.a) * 2.4, c.y + 1.0, c.z + Math.cos(c.a) * 2.4);
      G.headlight.target.position.set(c.x + Math.sin(c.a) * 28, 0, c.z + Math.cos(c.a) * 28);
    } else G.headlight.intensity = 0;

    G.camShakeAmt = Math.max(0, G.camShakeAmt - dt * 2.4);
    G.hud.update(dt);
  } else if (G.started) {
    G.hud.update(0);
  }

  G.renderer.render(G.scene, G.camera);
}

addEventListener('load', () => {
  try { G.init(); }
  catch (err) {
    document.getElementById('intro').innerHTML =
      '<h1>ERRO</h1><p style="max-width:700px">' + (err && err.message ? err.message : err) + '</p>';
    console.error(err);
  }
});
