/* ==========================================================================
   models.js - personagens (com bracos!), veiculos e armas.
   ========================================================================== */
'use strict';
var G = window.G;

/* Extrusao de um perfil 2D (plano ZY) ao longo do eixo X.
   E o que da silhueta de verdade aos carros (capo, para-brisa, teto).       */
G.extrudeProfile = function (pts, width) {
  const hw = width / 2;
  const tris = [];
  /* centro para leque de triangulos (perfis usados aqui sao estrelados) */
  let cz = 0, cy = 0;
  for (const p of pts) { cz += p[0]; cy += p[1]; }
  cz /= pts.length; cy /= pts.length;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    /* lado +X */
    tris.push([hw, cy, cz], [hw, a[1], a[0]], [hw, b[1], b[0]]);
    /* lado -X */
    tris.push([-hw, cy, cz], [-hw, b[1], b[0]], [-hw, a[1], a[0]]);
    /* faixa lateral */
    tris.push([-hw, a[1], a[0]], [hw, a[1], a[0]], [hw, b[1], b[0]]);
    tris.push([-hw, a[1], a[0]], [hw, b[1], b[0]], [-hw, b[1], b[0]]);
  }
  const pos = new Float32Array(tris.length * 3);
  const uv = new Float32Array(tris.length * 2);
  for (let i = 0; i < tris.length; i++) {
    pos[i * 3] = tris[i][0]; pos[i * 3 + 1] = tris[i][1]; pos[i * 3 + 2] = tris[i][2];
    uv[i * 2] = tris[i][2] * 0.25; uv[i * 2 + 1] = tris[i][1] * 0.25;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
};

/* atalho: caixa simples com pivo no centro */
function box(w, h, d, m) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.castShadow = true;
  return g;
}
/* caixa pendurada a partir do pivo (usada nos membros) */
function limb(w, h, d, m) {
  const mesh = box(w, h, d, m);
  mesh.position.y = -h / 2;
  return mesh;
}

/* ======================================================================== */
/*                              PERSONAGENS                                  */
/* ======================================================================== */
const SKINS = [0xe0ac7e, 0xc98d5f, 0x8d5524, 0x5c3a21, 0xf1c9a0, 0xa9714b];
const SHIRTS = [0xd94f4f, 0x3f7fd0, 0xf2c14e, 0x54b06a, 0xe0e0e0, 0x333a44, 0x9b59b6,
  0xff7043, 0x26a69a, 0xf06292, 0x795548];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4632, 0x1f2933, 0x6d6a5f, 0x24445c];
const HAIRS = [0x18120c, 0x2b1d10, 0x5a3a1c, 0x8a6a3a, 0xc9b27c, 0x101010];

G.randomPedLook = function () {
  return {
    skin: G.pick(SKINS), shirt: G.pick(SHIRTS), pants: G.pick(PANTS),
    hair: G.pick(HAIRS), shoes: 0x1a1a1a, cap: G.chance(0.25) ? G.pick(SHIRTS) : null,
    scale: G.rnd(0.94, 1.08)
  };
};

/* Constroi um humano articulado: quadril, tronco, cabeca, 2 bracos com
   antebraco e mao, 2 pernas com canela e pe. E o "braco" que faltava.
   As partes que nao se movem entre si sao fundidas: 11 meshes por pessoa
   em vez de 20, o que derruba muito o numero de draw calls.              */
function cbox(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return G.paint(g, color);
}
G.makeChar = function (look) {
  look = look || G.randomPedLook();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const skin = look.skin, shirt = look.shirt, pants = look.pants;
  const shoes = look.shoes || 0x1a1a1a, hair = look.hair;
  const M = list => {
    const m = new THREE.Mesh(G.mergeGeos(list), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  const pelvis = M([cbox(0.42, 0.26, 0.26, 0, 0, 0, pants)]);
  pelvis.position.y = 0.94; body.add(pelvis);

  const chest = new THREE.Group();
  chest.position.y = 1.06; body.add(chest);
  chest.add(M([
    cbox(0.5, 0.56, 0.29, 0, 0.28, 0, shirt),
    cbox(0.62, 0.14, 0.3, 0, 0.52, 0, shirt),
    cbox(0.13, 0.1, 0.13, 0, 0.61, 0, skin)
  ]));

  const head = new THREE.Group();
  head.position.y = 0.68; chest.add(head);
  const headParts = [
    cbox(0.24, 0.28, 0.24, 0, 0.13, 0, skin),
    cbox(0.26, 0.09, 0.26, 0, 0.26, 0, hair),
    cbox(0.05, 0.05, 0.05, 0, 0.12, 0.13, skin),
    cbox(0.05, 0.03, 0.02, -0.07, 0.17, 0.12, 0x201810),
    cbox(0.05, 0.03, 0.02, 0.07, 0.17, 0.12, 0x201810)
  ];
  if (look.cap) {
    headParts.push(cbox(0.28, 0.09, 0.28, 0, 0.28, 0, look.cap));
    headParts.push(cbox(0.26, 0.03, 0.12, 0, 0.25, 0.18, look.cap));
  }
  head.add(M(headParts));

  function arm(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.315, 0.48, 0);
    chest.add(g);
    g.add(M([cbox(0.14, 0.32, 0.16, 0, -0.16, 0, shirt)]));
    const fore = new THREE.Group(); fore.position.y = -0.32; g.add(fore);
    fore.add(M([
      cbox(0.12, 0.3, 0.14, 0, -0.15, 0, skin),
      cbox(0.12, 0.12, 0.13, 0, -0.35, 0, skin)
    ]));
    const hand = new THREE.Group(); hand.position.y = -0.3; fore.add(hand);
    return { g, fore, hand };
  }
  const armL = arm(-1), armR = arm(1);

  function leg(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.12, 0.94, 0);
    body.add(g);
    g.add(M([cbox(0.18, 0.46, 0.2, 0, -0.23, 0, pants)]));
    const shinG = new THREE.Group(); shinG.position.y = -0.46; g.add(shinG);
    shinG.add(M([
      cbox(0.15, 0.44, 0.17, 0, -0.22, 0, pants),
      cbox(0.16, 0.1, 0.28, 0, -0.49, 0.06, shoes)
    ]));
    return { g, shinG };
  }
  const legL = leg(-1), legR = leg(1);

  root.scale.setScalar(look.scale || 1);
  return {
    root, body, chest, head, armL, armR, legL, legR, look, mat,
    anim: { phase: Math.random() * 6.28, t: 0 }
  };
};

/* Poses / animacoes. state: idle|walk|run|aim|punch|drive|down|hit */
G.poseChar = function (ch, state, dt, opts) {
  opts = opts || {};
  const a = ch.anim;
  const sp = opts.speed || 0;
  a.t += dt;

  const set = (o, x, y, z) => { o.rotation.set(x, y || 0, z || 0); };
  const L = (o, x, y, z, k) => {
    o.rotation.x = G.damp(o.rotation.x, x, k, dt);
    o.rotation.y = G.damp(o.rotation.y, y || 0, k, dt);
    o.rotation.z = G.damp(o.rotation.z, z || 0, k, dt);
  };

  if (state === 'down') {
    ch.root.rotation.x = G.damp(ch.root.rotation.x, -Math.PI / 2 * 0.92, 8, dt);
    ch.body.position.y = G.damp(ch.body.position.y, 0.35, 8, dt);
    L(ch.armL.g, 0.15, 0, -0.45, 6); L(ch.armR.g, -0.2, 0, 0.62, 6);
    L(ch.legL.g, 0.18, 0, 0.16, 6); L(ch.legR.g, -0.32, 0, -0.12, 6);
    L(ch.armL.fore, -0.85, 0, 0, 6); L(ch.armR.fore, -1.15, 0, 0, 6);
    L(ch.legR.shinG, 0.75, 0, 0, 6); L(ch.legL.shinG, 0.2, 0, 0, 6);
    L(ch.chest, 0.1, 0.25, 0, 6); L(ch.head, 0.25, -0.35, 0, 6);
    return;
  }
  ch.root.rotation.x = G.damp(ch.root.rotation.x, 0, 10, dt);

  if (state === 'drive') {
    ch.body.position.y = G.damp(ch.body.position.y, -0.5, 10, dt);
    L(ch.legL.g, -1.5, 0, 0.12, 10); L(ch.legR.g, -1.5, 0, -0.12, 10);
    L(ch.legL.shinG, 1.35, 0, 0, 10); L(ch.legR.shinG, 1.35, 0, 0, 10);
    const steer = opts.steer || 0;
    L(ch.armL.g, -1.15 + steer * 0.35, 0, -0.5, 10);
    L(ch.armR.g, -1.15 - steer * 0.35, 0, 0.5, 10);
    L(ch.armL.fore, -0.35, 0, 0, 10); L(ch.armR.fore, -0.35, 0, 0, 10);
    L(ch.chest, 0.12, 0, 0, 10);
    return;
  }

  ch.body.position.y = G.damp(ch.body.position.y, 0, 10, dt);

  /* pernas: ciclo de caminhada proporcional a velocidade */
  const moving = sp > 0.4;
  const cyc = moving ? (sp > 7 ? 9.5 : 6.2) : 0;
  a.phase += cyc * dt;
  const amp = moving ? G.clamp(sp / 9, 0.25, 1) : 0;
  const s = Math.sin(a.phase), c = Math.cos(a.phase);

  if (moving) {
    ch.legL.g.rotation.x = s * 0.85 * amp;
    ch.legR.g.rotation.x = -s * 0.85 * amp;
    ch.legL.shinG.rotation.x = Math.max(0, -c * 0.9) * amp;
    ch.legR.shinG.rotation.x = Math.max(0, c * 0.9) * amp;
    ch.body.position.y += Math.abs(Math.sin(a.phase)) * 0.045 * amp;
    ch.body.rotation.z = s * 0.03 * amp;
  } else {
    L(ch.legL.g, 0, 0, 0.02, 9); L(ch.legR.g, 0, 0, -0.02, 9);
    L(ch.legL.shinG, 0, 0, 0, 9); L(ch.legR.shinG, 0, 0, 0, 9);
    ch.body.position.y += Math.sin(a.t * 2) * 0.012;
    ch.body.rotation.z = G.damp(ch.body.rotation.z, 0, 6, dt);
  }

  /* bracos */
  if (state === 'aim') {
    const p = opts.pitch || 0;
    const two = opts.twoHand;
    L(ch.armR.g, -1.55 - p, -0.18, 0.12, 18);
    L(ch.armR.fore, -0.12, 0, 0, 18);
    if (two) { L(ch.armL.g, -1.45 - p, 0.5, 0.3, 18); L(ch.armL.fore, -0.55, 0, 0, 18); }
    else { L(ch.armL.g, -0.5 + s * 0.2 * amp, 0, -0.2, 12); L(ch.armL.fore, -0.6, 0, 0, 12); }
    L(ch.chest, 0.04, -0.12, 0, 12);
  } else if (state === 'punch') {
    const k = opts.punchT || 0;              /* 0..1 */
    const ext = Math.sin(Math.min(1, k) * Math.PI);
    set(ch.armR.g, -1.6 * ext, 0, 0.1);
    set(ch.armR.fore, -(1 - ext) * 1.3, 0, 0);
    L(ch.armL.g, -0.6, 0, -0.35, 14);
    L(ch.armL.fore, -1.1, 0, 0, 14);
    ch.chest.rotation.y = G.damp(ch.chest.rotation.y, -0.35 * ext, 14, dt);
  } else if (state === 'hold') { /* arma guardada / correndo com arma */
    L(ch.armR.g, -0.55 + s * 0.25 * amp, 0, 0.22, 12);
    L(ch.armR.fore, -0.85, 0, 0, 12);
    L(ch.armL.g, -0.2 - s * 0.5 * amp, 0, -0.12, 12);
    L(ch.armL.fore, -0.35, 0, 0, 12);
    L(ch.chest, 0, 0, 0, 10);
  } else {
    ch.armL.g.rotation.x = G.damp(ch.armL.g.rotation.x, s * 0.7 * amp, 12, dt);
    ch.armR.g.rotation.x = G.damp(ch.armR.g.rotation.x, -s * 0.7 * amp, 12, dt);
    ch.armL.g.rotation.z = G.damp(ch.armL.g.rotation.z, -0.09, 10, dt);
    ch.armR.g.rotation.z = G.damp(ch.armR.g.rotation.z, 0.09, 10, dt);
    const bend = moving ? -0.35 - amp * 0.35 : -0.12;
    L(ch.armL.fore, bend, 0, 0, 10);
    L(ch.armR.fore, bend, 0, 0, 10);
    L(ch.chest, moving ? 0.06 + amp * 0.09 : 0, 0, 0, 8);
  }
  /* cabeca olha um pouco na direcao da mira */
  ch.head.rotation.x = G.damp(ch.head.rotation.x, state === 'aim' ? -(opts.pitch || 0) * 0.5 : 0, 10, dt);
};

/* ======================================================================== */
/*                                VEICULOS                                   */
/* ======================================================================== */
G.CAR_COLORS = [0xb42d2d, 0x1f4fa8, 0xe8e8e8, 0x1a1a1c, 0xd8a520, 0x2e8b4a,
  0x6c3fa0, 0xdd7722, 0x9aa2a8, 0x25626b, 0xf2f0e6, 0x50565c];

/* Perfis laterais (z,y) - z positivo = frente do carro. */
const PROFILES = {
  sedan: [[-2.35, 0.34], [-2.4, 0.86], [-1.5, 0.95], [-0.85, 1.52], [0.45, 1.55], [1.15, 0.98], [2.3, 0.88], [2.35, 0.36]],
  coupe: [[-2.1, 0.3], [-2.2, 0.78], [-1.2, 0.86], [-0.45, 1.36], [0.55, 1.34], [1.35, 0.82], [2.15, 0.72], [2.1, 0.3]],
  suv: [[-2.4, 0.4], [-2.45, 1.1], [-1.7, 1.18], [-1.1, 1.86], [0.75, 1.88], [1.35, 1.16], [2.4, 1.05], [2.4, 0.42]],
  pickup: [[-2.6, 0.38], [-2.65, 0.95], [-0.5, 0.98], [-0.35, 1.7], [0.75, 1.72], [1.3, 1.0], [2.5, 0.92], [2.5, 0.4]],
  van: [[-2.7, 0.4], [-2.75, 1.95], [0.9, 2.0], [1.6, 1.25], [2.5, 1.1], [2.5, 0.42]],
  bus: [[-5.2, 0.5], [-5.3, 3.0], [4.6, 3.05], [5.2, 1.2], [5.2, 0.5]]
};
const VEHICLE_KINDS = {
  sedan: { profile: 'sedan', width: 2.05, wheel: 0.44, wb: 1.55, mass: 1, top: 34, acc: 15 },
  coupe: { profile: 'coupe', width: 2.0, wheel: 0.42, wb: 1.45, mass: 0.85, top: 46, acc: 22 },
  suv: { profile: 'suv', width: 2.25, wheel: 0.55, wb: 1.65, mass: 1.25, top: 32, acc: 14 },
  pickup: { profile: 'pickup', width: 2.2, wheel: 0.52, wb: 1.8, mass: 1.2, top: 33, acc: 15 },
  van: { profile: 'van', width: 2.3, wheel: 0.48, wb: 1.85, mass: 1.4, top: 28, acc: 11 },
  taxi: { profile: 'sedan', width: 2.05, wheel: 0.44, wb: 1.55, mass: 1, top: 33, acc: 15, color: 0xf5c518 },
  police: { profile: 'sedan', width: 2.1, wheel: 0.46, wb: 1.6, mass: 1.05, top: 42, acc: 20, color: 0xf0f0f0 },
  ambulance: { profile: 'van', width: 2.3, wheel: 0.5, wb: 1.85, mass: 1.4, top: 30, acc: 13, color: 0xffffff },
  bus: { profile: 'bus', width: 2.6, wheel: 0.62, wb: 3.4, mass: 3, top: 22, acc: 7, color: 0x2f6fb0 }
};
G.VEHICLE_KINDS = VEHICLE_KINDS;

G.makeVehicle = function (kind, color) {
  const K = VEHICLE_KINDS[kind] || VEHICLE_KINDS.sedan;
  const col = K.color || color || G.pick(G.CAR_COLORS);
  const g = new THREE.Group();
  /* materiais por veiculo (permite pintar/queimar sem afetar os outros) */
  const bodyMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 65, specular: 0x2a2a2a });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x121b24, shininess: 120, specular: 0x9fc4e0, transparent: true, opacity: 0.8 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4cf });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x8a2020 });
  const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const prof = PROFILES[K.profile];
  const zf = prof.reduce((m, p) => Math.max(m, p[0]), 0);
  const zb = prof.reduce((m, p) => Math.min(m, p[0]), 0);
  const hw = K.width / 2;

  /* --- carroceria fundida em um unico mesh --- */
  const parts = [G.paint(G.extrudeProfile(prof, K.width), col)];
  parts.push(cbox(K.width + 0.04, 0.26, zf - zb - 0.2, 0, 0.32, (zf + zb) / 2, 0x15171a));      /* saia */
  parts.push(cbox(K.width + 0.06, 0.2, 0.22, 0, 0.55, zf - 0.05, 0xb8bec6));                     /* para-choques */
  parts.push(cbox(K.width + 0.06, 0.2, 0.22, 0, 0.55, zb + 0.05, 0xb8bec6));
  parts.push(cbox(0.1, 0.16, zf - zb - 1.2, hw + 0.03, 0.95, (zf + zb) / 2, 0x2a2d31));          /* frisos */
  parts.push(cbox(0.1, 0.16, zf - zb - 1.2, -hw - 0.03, 0.95, (zf + zb) / 2, 0x2a2d31));
  if (kind === 'police') {
    parts.push(cbox(K.width + 0.07, 0.5, 3.2, 0, 0.78, 0, 0x16326e));
  } else if (kind === 'taxi') {
    parts.push(cbox(K.width + 0.06, 0.22, 3.0, 0, 0.72, 0, 0x1c1c1c));
    parts.push(cbox(0.7, 0.24, 0.32, 0, 1.66, 0.2, 0xf5f0d0));
  } else if (kind === 'ambulance') {
    parts.push(cbox(0.05, 0.16, 0.7, hw + 0.02, 1.3, 0, 0xd02020));
    parts.push(cbox(0.05, 0.7, 0.16, hw + 0.02, 1.3, 0, 0xd02020));
  } else if (kind === 'bus') {
    parts.push(cbox(K.width + 0.06, 0.5, 9.4, 0, 1.5, 0, 0xf0f0f0));
  }
  const bodyMesh = new THREE.Mesh(G.mergeGeos(parts), bodyMat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  /* --- vidros --- */
  const minCab = (K.profile === 'van' || K.profile === 'bus') ? 1.0 : 0.85;
  const cabinPts = prof.filter(p => p[1] > minCab);
  if (cabinPts.length >= 3) {
    const cab = new THREE.Mesh(G.extrudeProfile(cabinPts, K.width + 0.04), glassMat);
    g.add(cab);
  }

  /* --- luzes (1 mesh na frente, 1 atras) --- */
  const heads = new THREE.Mesh(G.mergeGeos([
    cbox(0.44, 0.18, 0.1, hw - 0.35, 0.82, zf - 0.02, 0xffffff),
    cbox(0.44, 0.18, 0.1, -(hw - 0.35), 0.82, zf - 0.02, 0xffffff)
  ]), lampMat);
  const tails = new THREE.Mesh(G.mergeGeos([
    cbox(0.4, 0.16, 0.1, hw - 0.32, 0.85, zb + 0.02, 0xffffff),
    cbox(0.4, 0.16, 0.1, -(hw - 0.32), 0.85, zb + 0.02, 0xffffff)
  ]), tailMat);
  g.add(heads, tails);

  /* --- rodas (pneu + aro fundidos) --- */
  const wheels = [];
  const tire = new THREE.CylinderGeometry(K.wheel, K.wheel, 0.32, 14).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(K.wheel * 0.55, K.wheel * 0.55, 0.34, 10).rotateZ(Math.PI / 2);
  const wheelGeo = G.mergeGeos([G.paint(tire, 0x141416), G.paint(rim, 0xb0b6bd)]);
  const zs = K.profile === 'bus' ? [3.4, -3.4] : [K.wb, -K.wb];
  for (const zz of zs) for (const sx of [-1, 1]) {
    const wg = new THREE.Group();
    wg.position.set(sx * (hw + 0.02), K.wheel, zz);
    const m = new THREE.Mesh(wheelGeo, wheelMat);
    m.castShadow = true;
    wg.add(m);
    wg.userData.front = zz > 0;
    g.add(wg); wheels.push(wg);
  }

  const ud = { wheels, headMesh: heads, tailMesh: tails, tailMat, lampMat, kind, color: col, bodyMat };

  if (kind === 'police' || kind === 'ambulance') {
    const barY = kind === 'bus' ? 3.2 : (K.profile === 'van' ? 2.1 : 1.62);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bl.position.set(-0.32, barY, -0.1);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    br.position.set(0.32, barY, -0.1);
    g.add(bl, br);
    ud.siren = [bl, br];
  }

  g.userData = ud;
  return g;
};

/* ======================================================================== */
/*                                  ARMAS                                    */
/* ======================================================================== */
G.makeWeaponModel = function (id) {
  const g = new THREE.Group();
  const gun = new THREE.MeshPhongMaterial({ color: 0x26282c, shininess: 60 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4426 });
  const metalM = new THREE.MeshPhongMaterial({ color: 0x8b9097, shininess: 90 });
  const B = (w, h, d, m, x, y, z) => { const b = box(w, h, d, m); b.position.set(x, y, z); g.add(b); return b; };
  switch (id) {
    case 'pistol':
      B(0.07, 0.13, 0.1, gun, 0, -0.06, -0.02);
      B(0.07, 0.09, 0.3, gun, 0, 0.03, 0.1);
      B(0.05, 0.05, 0.1, metalM, 0, 0.04, 0.27);
      break;
    case 'uzi':
      B(0.08, 0.14, 0.11, gun, 0, -0.06, -0.05);
      B(0.09, 0.12, 0.34, gun, 0, 0.03, 0.08);
      B(0.06, 0.22, 0.07, gun, 0, -0.14, 0.02);
      B(0.04, 0.04, 0.16, metalM, 0, 0.04, 0.3);
      break;
    case 'shotgun':
      B(0.08, 0.11, 0.9, gun, 0, 0.02, 0.22);
      B(0.06, 0.06, 0.36, metalM, 0, 0.06, 0.5);
      B(0.08, 0.15, 0.3, wood, 0, -0.05, -0.25);
      B(0.09, 0.09, 0.2, wood, 0, -0.04, 0.2);
      break;
    case 'rifle':
      B(0.07, 0.12, 0.8, gun, 0, 0.02, 0.2);
      B(0.05, 0.05, 0.34, metalM, 0, 0.05, 0.6);
      B(0.07, 0.24, 0.12, gun, 0, -0.12, 0.06);
      B(0.08, 0.13, 0.26, wood, 0, -0.04, -0.28);
      break;
    case 'sniper':
      B(0.06, 0.1, 1.0, gun, 0, 0, 0.28);
      B(0.06, 0.06, 0.3, metalM, 0, 0.11, 0.24);
      B(0.09, 0.14, 0.34, wood, 0, -0.05, -0.3);
      break;
    case 'bat':
      B(0.07, 0.07, 0.28, wood, 0, 0, -0.05);
      B(0.12, 0.12, 0.62, wood, 0, 0, 0.42);
      break;
    case 'grenade':
      { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3b5a2c }));
        g.add(m); B(0.03, 0.06, 0.03, metalM, 0, 0.11, 0); }
      break;
    default: return g;
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
};

/* pequeno modelo de dinheiro / itens no chao */
G.makePickup = function (type) {
  const g = new THREE.Group();
  if (type === 'cash') {
    const m = new THREE.MeshBasicMaterial({ color: 0x6ede6a });
    for (let i = 0; i < 3; i++) {
      const b = box(0.5, 0.05, 0.28, m);
      b.position.y = i * 0.06; b.rotation.y = i * 0.3; g.add(b);
    }
  } else if (type === 'health') {
    const m = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const a = box(0.5, 0.16, 0.16, m), b = box(0.16, 0.5, 0.16, m);
    g.add(a, b);
  } else if (type === 'armor') {
    const m = new THREE.MeshBasicMaterial({ color: 0x5fb0ff });
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.1, 6), m);
    s.rotation.x = Math.PI / 2; g.add(s);
  }
  return g;
};
