/* ==========================================================================
   CIDADE ABERTA - core.js
   Utilitarios de matematica, geometria procedural e estruturas espaciais.
   Tudo exposto no namespace global G para funcionar via file:// sem modulos.
   ========================================================================== */
'use strict';
var G = window.G || (window.G = {});

/* ----------------------------------------------------------------- random */
G.rnd  = (a, b) => a + Math.random() * (b - a);
G.rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
G.chance = p => Math.random() < p;

/* Gerador deterministico (mulberry32) usado na geracao da cidade. */
G.makeRng = function (seed) {
  let t = seed >>> 0;
  const r = function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  return r;
};

/* ------------------------------------------------------------------- math */
G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
G.lerp = (a, b, t) => a + (b - a) * t;
/* damping independente de framerate */
G.damp = (a, b, lambda, dt) => G.lerp(a, b, 1 - Math.exp(-lambda * dt));
G.angleDiff = function (a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
G.lerpAngle = (a, b, t) => a + G.angleDiff(a, b) * t;
G.dampAngle = (a, b, lambda, dt) => a + G.angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
G.dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
G.dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
G.smoothstep = function (e0, e1, x) {
  const t = G.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* Convencao de direcao do mundo:
   heading a  ->  frente = (sin a, cos a)
   A camera fica atras do jogador, portanto o vetor "direita da tela" e
   (-cos a, sin a). Todo movimento lateral usa G.rightVec para nao inverter
   as teclas A/D (bug classico da versao anterior). */
G.fwdVec = a => ({ x: Math.sin(a), z: Math.cos(a) });
G.rightVec = a => ({ x: -Math.cos(a), z: Math.sin(a) });

/* --------------------------------------------------------------- geometria */
/* Um quad definido por 4 cantos (sentido horario visto de fora).
   uvw/uvh controlam a repeticao da textura em unidades de mundo. */
G.quad = function (a, b, c, d, uvw, uvh, uoff, voff) {
  const pos = new Float32Array(18);
  const nor = new Float32Array(18);
  const uv = new Float32Array(12);
  const tri = [a, b, c, a, c, d];
  for (let i = 0; i < 6; i++) {
    pos[i * 3] = tri[i][0]; pos[i * 3 + 1] = tri[i][1]; pos[i * 3 + 2] = tri[i][2];
  }
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  for (let i = 0; i < 6; i++) { nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz; }
  const U = uvw || 1, V = uvh || 1, uo = uoff || 0, vo = voff || 0;
  const c00 = [uo, vo], c10 = [uo + U, vo], c11 = [uo + U, vo + V], c01 = [uo, vo + V];
  const uvs = [c00, c10, c11, c00, c11, c01];
  for (let i = 0; i < 6; i++) { uv[i * 2] = uvs[i][0]; uv[i * 2 + 1] = uvs[i][1]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};

/* Plano horizontal (chao, telhado, calcada). */
G.floorQuad = function (cx, cz, w, d, y, tile, rot) {
  const hw = w / 2, hd = d / 2;
  let p = [[-hw, y, -hd], [hw, y, -hd], [hw, y, hd], [-hw, y, hd]];
  if (rot) {
    const s = Math.sin(rot), c = Math.cos(rot);
    p = p.map(v => [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]);
  }
  p = p.map(v => [v[0] + cx, v[1], v[2] + cz]);
  const t = tile || 1;
  return G.quad(p[0], p[3], p[2], p[1], w / t, d / t);
};

/* Caixa fechada com UV em unidades de mundo (uso: predios, muros, props). */
G.boxGeo = function (w, h, d, tile, uoff, voff) {
  const t = tile || 1, hw = w / 2, hh = h / 2, hd = d / 2;
  const uo = uoff || 0, vo = voff || 0;
  const P = (x, y, z) => [x, y, z];
  const geos = [
    G.quad(P(-hw, -hh, hd), P(hw, -hh, hd), P(hw, hh, hd), P(-hw, hh, hd), w / t, h / t, uo, vo),   // +Z
    G.quad(P(hw, -hh, -hd), P(-hw, -hh, -hd), P(-hw, hh, -hd), P(hw, hh, -hd), w / t, h / t, uo, vo), // -Z
    G.quad(P(hw, -hh, hd), P(hw, -hh, -hd), P(hw, hh, -hd), P(hw, hh, hd), d / t, h / t, uo, vo),   // +X
    G.quad(P(-hw, -hh, -hd), P(-hw, -hh, hd), P(-hw, hh, hd), P(-hw, hh, -hd), d / t, h / t, uo, vo), // -X
    G.quad(P(-hw, hh, hd), P(hw, hh, hd), P(hw, hh, -hd), P(-hw, hh, -hd), w / t, d / t),           // +Y
    G.quad(P(-hw, -hh, -hd), P(hw, -hh, -hd), P(hw, -hh, hd), P(-hw, -hh, hd), w / t, d / t)        // -Y
  ];
  return G.mergeGeos(geos);
};

/* Aplica cor por vertice (permite fundir centenas de objetos em 1 draw call). */
G.paint = function (geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
};

G.transformGeo = function (geo, x, y, z, ry) {
  const m = new THREE.Matrix4();
  if (ry) m.makeRotationY(ry);
  m.setPosition(x, y, z);
  geo.applyMatrix4(m);
  return geo;
};

/* Funde geometrias nao indexadas (position/normal/uv/color). */
G.mergeGeos = function (list) {
  list = list.map(g => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  let anyColor = false;
  for (const g of list) if (g.attributes.color) { anyColor = true; break; }
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    pos.set(p.array.subarray(0, p.count * 3), o * 3);
    if (n) nor.set(n.array.subarray(0, p.count * 3), o * 3);
    if (u) uv.set(u.array.subarray(0, p.count * 2), o * 2);
    if (c) col.set(c.array.subarray(0, p.count * 3), o * 3);
    else col.fill(1, o * 3, (o + p.count) * 3);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (anyColor) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
};

/* -------------------------------------------------- grade espacial (AABB) */
/* A cidade tem milhares de caixas de colisao; a busca linear mataria o FPS.
   Esta grade responde "quais caixas estao perto de (x,z)" em O(1). */
G.SpatialGrid = function (cell) {
  this.cell = cell || 40;
  this.map = new Map();
  this.items = [];
};
G.SpatialGrid.prototype.key = function (ix, iz) { return ix * 73856093 ^ iz * 19349663; };
G.SpatialGrid.prototype.insert = function (box) {
  this.items.push(box);
  const c = this.cell;
  const i0 = Math.floor(box.x1 / c), i1 = Math.floor(box.x2 / c);
  const j0 = Math.floor(box.z1 / c), j1 = Math.floor(box.z2 / c);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const k = this.key(i, j);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(box);
  }
};
G.SpatialGrid.prototype.query = function (x, z, r, out) {
  out.length = 0;
  const c = this.cell;
  const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c);
  const j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const a = this.map.get(this.key(i, j));
    if (!a) continue;
    for (let k = 0; k < a.length; k++) if (out.indexOf(a[k]) < 0) out.push(a[k]);
  }
  return out;
};

/* --------------------------------------------------------------- materiais */
G.matLambert = (color, opts) => new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
G.matPhong = (color, opts) => new THREE.MeshPhongMaterial(Object.assign({ color: color }, opts || {}));
G.matBasic = (color, opts) => new THREE.MeshBasicMaterial(Object.assign({ color: color }, opts || {}));

/* --------------------------------------------------------------- utilidade */
G.money = v => 'R$ ' + Math.floor(v).toLocaleString('pt-BR');
G.pad2 = v => (v < 10 ? '0' : '') + Math.floor(v);
