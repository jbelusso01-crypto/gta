/* ==========================================================================
   city.js - geracao procedural da cidade inteira.
   Mapa ~2.2 km x 2.2 km, 5 distritos, praia, parques, industria e favela.
   Toda a geometria estatica e fundida em poucos meshes (poucos draw calls).
   ========================================================================== */
'use strict';
var G = window.G;

G.CITY = {
  N: 9,            /* ruas de -N..N  -> 19 avenidas em cada eixo */
  P: 112,          /* distancia entre ruas                        */
  RW: 20,          /* largura da pista                            */
  SW: 6,           /* calcada                                     */
  CURB: 0.15
};
G.CITY.EXT = G.CITY.N * G.CITY.P + G.CITY.RW / 2;
G.CITY.BLOCK = G.CITY.P - G.CITY.RW;      /* 92 */

G.blocks = [];      /* metadados de cada quadra  */
G.zones = [];       /* nomes de bairro para o HUD */
G.shops = [];       /* lojas / servicos           */
G.grid = null;      /* colisao estatica           */

/* --------------------------------------------------------------- distritos */
const DISTRICTS = {
  downtown: { name: 'Centro', color: 0x8f9aa6 },
  commercial: { name: 'Comercial', color: 0xc0b49c },
  residential: { name: 'Residencial', color: 0xbfc9a8 },
  favela: { name: 'Morro', color: 0xc79a6b },
  industrial: { name: 'Industrial', color: 0x9a9a92 },
  beach: { name: 'Orla', color: 0xe0cf9a },
  park: { name: 'Parque', color: 0x4d8a37 }
};

const ZONE_NAMES = {
  downtown: ['Centro', 'Praca da Se', 'Distrito Financeiro', 'Baixo Centro'],
  commercial: ['Vila Nova', 'Bairro Alto', 'Jardim Europa', 'Rua do Comercio'],
  residential: ['Jardim Sul', 'Cohab', 'Vila Aurora', 'Bosque Verde', 'Alto da Colina'],
  favela: ['Morro do Cruzeiro', 'Beco Quente', 'Vila Esperanca'],
  industrial: ['Zona Portuaria', 'Distrito Industrial', 'Patio Ferroviario'],
  beach: ['Orla Sul', 'Praia Grande', 'Calcadao'],
  park: ['Parque das Araucarias', 'Bosque Municipal', 'Lagoa Azul']
};

function districtAt(i, j, rng) {
  const C = G.CITY;
  const cx = (i + 0.5) * C.P, cz = (j + 0.5) * C.P;
  const r = Math.hypot(cx, cz);
  if (j >= C.N - 2) return 'beach';                    /* faixa sul = orla   */
  if (r < 190) return 'downtown';
  if (i >= C.N - 3 && j <= 2) return 'industrial';     /* leste = industria  */
  if (i <= -C.N + 2 && j <= -2) return 'favela';       /* noroeste = morro   */
  if (r < 430) return rng.chance(0.18) ? 'park' : 'commercial';
  if (r < 700) return rng.chance(0.14) ? 'park' : (rng.chance(0.55) ? 'commercial' : 'residential');
  return rng.chance(0.12) ? 'park' : 'residential';
}

/* ------------------------------------------------------------------ build */
G.buildCity = function (scene) {
  const C = G.CITY, T = G.TEX;
  const rng = G.makeRng(20260905);
  G.grid = new G.SpatialGrid(48);

  const bucket = {};   /* geometrias agrupadas por material */
  const put = (key, geo) => { (bucket[key] || (bucket[key] = [])).push(geo); };
  const collide = (x, z, w, d) => G.grid.insert({ x1: x - w / 2, x2: x + w / 2, z1: z - d / 2, z2: z + d / 2 });

  /* ---------------------------------------------------------- chao base */
  {
    const S = C.EXT * 2 + 900;
    const g = G.floorQuad(0, -140, S, S, -0.05, 12);
    put('ground', g);
  }

  /* ------------------------------------------------------------- oceano */
  const OCEAN_Z = C.EXT + 210;
  {
    const g = G.floorQuad(0, OCEAN_Z + 600, 4200, 1400, -0.6, 40);
    put('water', g);
  }

  /* --------------------------------------------------------------- ruas */
  for (let i = -C.N; i <= C.N; i++) {
    for (let j = -C.N; j < C.N; j++) {
      /* trecho vertical (ao longo de Z): U atravessa a pista, V corre no comprimento */
      const z0 = j * C.P + C.RW / 2, z1 = (j + 1) * C.P - C.RW / 2;
      const len = z1 - z0;
      put('road', G.quad(
        [i * C.P + C.RW / 2, 0.01, z0], [i * C.P - C.RW / 2, 0.01, z0],
        [i * C.P - C.RW / 2, 0.01, z1], [i * C.P + C.RW / 2, 0.01, z1], 1, len / 18));
      /* trecho horizontal (ao longo de X) */
      const x0 = j * C.P + C.RW / 2, x1 = (j + 1) * C.P - C.RW / 2;
      put('road', G.quad(
        [x0, 0.01, i * C.P - C.RW / 2], [x0, 0.01, i * C.P + C.RW / 2],
        [x1, 0.01, i * C.P + C.RW / 2], [x1, 0.01, i * C.P - C.RW / 2], 1, (x1 - x0) / 18));
    }
  }
  /* cruzamentos */
  for (let i = -C.N; i <= C.N; i++) for (let j = -C.N; j <= C.N; j++) {
    put('cross', G.floorQuad(i * C.P, j * C.P, C.RW, C.RW, 0.012, C.RW));
  }

  /* ------------------------------------------------------------- quadras */
  for (let i = -C.N; i < C.N; i++) for (let j = -C.N; j < C.N; j++) {
    const cx = (i + 0.5) * C.P, cz = (j + 0.5) * C.P;
    const L = C.BLOCK;
    const d = districtAt(i, j, rng);
    const blk = { i, j, x: cx, z: cz, district: d, L };
    G.blocks.push(blk);

    /* calcada + meio-fio */
    if (d !== 'beach') {
      const swTint = 0xc3bfb4;
      put('sidewalk', G.paint(G.floorQuad(cx, cz, L, L, C.CURB, 4), swTint));
      /* laterais do meio-fio */
      const h = C.CURB;
      const s = [
        [cx, cz - L / 2, L, 0, 1], [cx, cz + L / 2, L, 0, -1],
        [cx - L / 2, cz, L, 1, 0], [cx + L / 2, cz, L, -1, 0]
      ];
      for (const [sx, sz, len, nx, nz] of s) {
        const hw = len / 2;
        const ax = nz ? sx - hw : sx, az = nz ? sz : sz - hw;
        const bx = nz ? sx + hw : sx, bz = nz ? sz : sz + hw;
        put('sidewalk', G.paint(G.quad([ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], len / 4, 0.15), 0xa8a49a));
      }
    }
    buildBlock(blk, rng, put, collide, scene);
  }

  /* ------------------------------------------------------------ praia */
  buildBeach(rng, put, collide, OCEAN_Z);
  /* ------------------------------------------------------- pontos fixos */
  buildLandmarks(rng, put, collide, scene);

  /* --------------------------------------------------- monta os meshes */
  const meshes = [];
  const add = (key, mat, cast, recv) => {
    if (!bucket[key] || !bucket[key].length) return;
    const geo = G.mergeGeos(bucket[key]);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !!cast; m.receiveShadow = recv !== false;
    m.matrixAutoUpdate = false;
    scene.add(m); meshes.push(m);
    return m;
  };
  add('ground', new THREE.MeshLambertMaterial({ map: T.grass, color: 0x8a9878 }), false, true);
  G.oceanMesh = add('water', new THREE.MeshPhongMaterial({ map: T.water, shininess: 90, specular: 0x88bbdd }), false, true);
  add('road', new THREE.MeshLambertMaterial({ map: T.road }), false, true);
  add('cross', new THREE.MeshLambertMaterial({ map: T.crossing }), false, true);
  add('sidewalk', new THREE.MeshLambertMaterial({ map: T.sidewalk, vertexColors: true }), true, true);
  add('grass', new THREE.MeshLambertMaterial({ map: T.grass }), false, true);
  add('sand', new THREE.MeshLambertMaterial({ map: T.sand }), false, true);
  add('roof', new THREE.MeshLambertMaterial({ map: T.roof, vertexColors: true }), true, true);
  add('tiles', new THREE.MeshLambertMaterial({ map: T.tiles, vertexColors: true }), true, true);
  add('metal', new THREE.MeshPhongMaterial({ map: T.metal, vertexColors: true, shininess: 30 }), true, true);
  add('bark', new THREE.MeshLambertMaterial({ map: T.bark, vertexColors: true }), true, true);
  add('leaf', new THREE.MeshLambertMaterial({ map: T.foliage, vertexColors: true }), true, true);
  add('plain', new THREE.MeshLambertMaterial({ vertexColors: true }), true, true);
  add('glowSign', new THREE.MeshBasicMaterial({ vertexColors: true }), false, false);

  G.windowMats = [];
  for (const st of ['glass', 'brick', 'concrete', 'stucco']) {
    /* vidro recebe brilho especular; o resto fica fosco */
    const opts = {
      map: T.facades[st].base, vertexColors: true,
      emissive: 0xffffff, emissiveMap: T.facades[st].lit, emissiveIntensity: 0
    };
    const mat = st === 'glass'
      ? new THREE.MeshPhongMaterial(Object.assign({ shininess: 55, specular: 0x556677 }, opts))
      : new THREE.MeshLambertMaterial(opts);
    G.windowMats.push(mat);
    add('wall_' + st, mat, true, true);
  }
  G.staticMeshes = meshes;

  /* --------------------------------------------------------- nomes de zona */
  const used = {};
  for (const b of G.blocks) {
    if (Math.abs(b.i % 3) === 1 && Math.abs(b.j % 3) === 1) {
      const list = ZONE_NAMES[b.district];
      const n = list[(Math.abs(b.i * 7 + b.j * 13)) % list.length];
      G.zones.push({ x: b.x, z: b.z, name: n });
      used[n] = 1;
    }
  }
  G.zones.push({ x: 0, z: OCEAN_Z, name: 'Oceano' });
};

/* ----------------------------------------------------------- por distrito */
function buildBlock(blk, rng, put, collide, scene) {
  const C = G.CITY;
  const L = C.BLOCK - C.SW * 2;    /* area util dentro da calcada */
  const d = blk.district;
  const y0 = C.CURB;

  if (d === 'beach') { buildBeachBlock(blk, rng, put, collide); return; }
  if (d === 'park') { buildPark(blk, rng, put, collide, L, y0); return; }
  if (d === 'industrial') { buildIndustrial(blk, rng, put, collide, L, y0); return; }
  if (d === 'residential') { buildHouses(blk, rng, put, collide, L, y0); return; }
  if (d === 'favela') { buildFavela(blk, rng, put, collide, L, y0); return; }

  /* ---- downtown / commercial: torres e predios ---- */
  const tall = d === 'downtown';
  const lots = rng.chance(tall ? 0.45 : 0.25) ? 1 : 2;
  const cs = L / lots;
  for (let a = 0; a < lots; a++) for (let b = 0; b < lots; b++) {
    if (lots === 2 && rng.chance(0.12)) { buildParkingLot(blk, rng, put, collide, cs, a, b, y0); continue; }
    const w = rng.range(cs * 0.62, cs * 0.94), dp = rng.range(cs * 0.62, cs * 0.94);
    const h = tall ? (rng.chance(0.35) ? rng.range(70, 135) : rng.range(34, 72))
      : (rng.chance(0.2) ? rng.range(32, 58) : rng.range(11, 30));
    const bx = blk.x - L / 2 + cs * (a + 0.5), bz = blk.z - L / 2 + cs * (b + 0.5);
    const style = tall ? (rng.chance(0.6) ? 'glass' : 'concrete')
      : rng.pick(['concrete', 'brick', 'stucco', 'glass']);
    building(bx, bz, w, dp, h, style, rng, put, collide, y0);
    /* letreiro comercial na frente */
    if (!tall && rng.chance(0.5)) sign(bx, bz + dp / 2 + 0.1, w * 0.7, rng, put, y0 + 4.2);
  }
  /* mobiliario urbano */
  streetProps(blk, rng, put, collide, y0);
}

function building(bx, bz, w, d, h, style, rng, put, collide, y0) {
  const T = G.TEX;
  const FW = T.FACADE_W, FH = T.FACADE_H;
  const tint = new THREE.Color().setHSL(rng.range(0.05, 0.14), rng.range(0.05, 0.24), rng.range(0.45, 0.78));
  if (style === 'glass') tint.setHSL(rng.range(0.5, 0.62), rng.range(0.12, 0.38), rng.range(0.4, 0.66));
  const uo = rng.range(0, 1), vo = rng.range(0, 1);
  const key = 'wall_' + style;
  const hw = w / 2, hd = d / 2, top = y0 + h;
  const P = (x, y, z) => [x, y, z];
  const walls = [
    [P(bx - hw, y0, bz + hd), P(bx + hw, y0, bz + hd), P(bx + hw, top, bz + hd), P(bx - hw, top, bz + hd), w],
    [P(bx + hw, y0, bz - hd), P(bx - hw, y0, bz - hd), P(bx - hw, top, bz - hd), P(bx + hw, top, bz - hd), w],
    [P(bx + hw, y0, bz + hd), P(bx + hw, y0, bz - hd), P(bx + hw, top, bz - hd), P(bx + hw, top, bz + hd), d],
    [P(bx - hw, y0, bz - hd), P(bx - hw, y0, bz + hd), P(bx - hw, top, bz + hd), P(bx - hw, top, bz - hd), d]
  ];
  for (const [a, b, c, e, len] of walls) {
    put(key, G.paint(G.quad(a, b, c, e, len / FW, h / FH, uo, vo), tint));
  }
  /* laje + platibanda */
  put('roof', G.paint(G.floorQuad(bx, bz, w, d, top + 0.02, 6), 0x9a9a9e));
  const pb = 0.9;
  for (const [sx, sz, ww, dd] of [[0, hd, w, 0.5], [0, -hd, w, 0.5], [hw, 0, 0.5, d], [-hw, 0, 0.5, d]]) {
    put('roof', G.paint(G.boxGeo(ww, pb, dd, 4).translate(bx + sx, top + pb / 2, bz + sz), 0x8e8e92));
  }
  /* caixa d'agua / casa de maquinas */
  if (rng.chance(0.6)) {
    const mw = w * rng.range(0.2, 0.4), mh = rng.range(2.5, 5.5);
    put('roof', G.paint(G.boxGeo(mw, mh, mw, 4).translate(bx + rng.range(-w * 0.2, w * 0.2), top + mh / 2, bz + rng.range(-d * 0.2, d * 0.2)), 0x8a8a8e));
  }
  if (h > 45 && rng.chance(0.7)) { /* antena */
    put('metal', G.paint(G.boxGeo(0.5, rng.range(6, 16), 0.5, 2).translate(bx, top + 8, bz), 0xb03030));
  }
  collide(bx, bz, w, d);
}

function sign(x, z, w, rng, put, y) {
  const c = rng.pick([0xff4d4d, 0x4dd2ff, 0xffd24d, 0x8cff4d, 0xff4dd2, 0xffffff]);
  put('glowSign', G.paint(G.boxGeo(w, 1.6, 0.35, 2).translate(x, y, z), c));
}

function buildParkingLot(blk, rng, put, collide, cs, a, b, y0) {
  const C = G.CITY, L = C.BLOCK - C.SW * 2;
  const bx = blk.x - L / 2 + cs * (a + 0.5), bz = blk.z - L / 2 + cs * (b + 0.5);
  put('plain', G.paint(G.floorQuad(bx, bz, cs * 0.92, cs * 0.92, y0 + 0.01, 8), 0x4a4a4e));
  for (let k = -3; k <= 3; k++) {
    put('plain', G.paint(G.floorQuad(bx + k * 3.4, bz, 0.2, cs * 0.7, y0 + 0.03, 4), 0xdddddd));
  }
  G.parkingSpots = G.parkingSpots || [];
  for (let k = -2; k <= 2; k++) G.parkingSpots.push({ x: bx + k * 3.4 + 1.7, z: bz, a: 0 });
}

function buildPark(blk, rng, put, collide, L, y0) {
  put('grass', G.floorQuad(blk.x, blk.z, L, L, y0 + 0.01, 8));
  /* caminho em cruz */
  put('plain', G.paint(G.floorQuad(blk.x, blk.z, L, 5, y0 + 0.03, 4), 0xa79b86));
  put('plain', G.paint(G.floorQuad(blk.x, blk.z, 5, L, y0 + 0.03, 4), 0xa79b86));
  const nTrees = rng.int(7, 12);
  for (let t = 0; t < nTrees; t++) {
    const tx = blk.x + rng.range(-L / 2 + 5, L / 2 - 5), tz = blk.z + rng.range(-L / 2 + 5, L / 2 - 5);
    if (Math.abs(tx - blk.x) < 4 && Math.abs(tz - blk.z) < 4) continue;
    tree(tx, tz, rng, put, collide, y0);
  }
  /* lago em alguns parques */
  if (rng.chance(0.35)) {
    const r = L * 0.24;
    const g = new THREE.CircleGeometry(r, 22).rotateX(-Math.PI / 2).translate(blk.x, y0 + 0.05, blk.z);
    const geo = g.toNonIndexed();
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 4); }
    put('water', geo);
  }
  /* bancos */
  for (let k = 0; k < 4; k++) {
    const bx = blk.x + rng.range(-L / 2 + 6, L / 2 - 6), bz = blk.z + rng.range(-L / 2 + 6, L / 2 - 6);
    bench(bx, bz, rng.range(0, 6.28), put, y0);
  }
}

function tree(x, z, rng, put, collide, y0) {
  const h = rng.range(4.5, 9), r = rng.range(2.2, 4.2);
  put('bark', G.paint(new THREE.CylinderGeometry(0.28, 0.45, h, 6).translate(x, y0 + h / 2, z), 0xffffff));
  const c = new THREE.Color().setHSL(rng.range(0.24, 0.32), rng.range(0.35, 0.6), rng.range(0.28, 0.42));
  const crown = new THREE.IcosahedronGeometry(r, 0).translate(x, y0 + h + r * 0.5, z);
  put('leaf', G.paint(crown, c));
  if (rng.chance(0.5)) {
    const c2 = new THREE.IcosahedronGeometry(r * 0.7, 0).translate(x + rng.range(-1.5, 1.5), y0 + h + r * 1.1, z + rng.range(-1.5, 1.5));
    put('leaf', G.paint(c2, c));
  }
  collide(x, z, 1.0, 1.0);
}
function palm(x, z, rng, put, collide, y0) {
  const h = rng.range(7, 12);
  const lean = rng.range(-0.12, 0.12);
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, h, 6);
  trunk.rotateZ(lean); trunk.translate(x, y0 + h / 2, z);
  put('bark', G.paint(trunk, 0xd8c9a0));
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * 6.283 + rng.range(0, 1);
    const leaf = new THREE.BoxGeometry(4.2, 0.18, 1.1);
    leaf.translate(2.1, 0, 0);
    leaf.rotateZ(-0.35); leaf.rotateY(a);
    leaf.translate(x + lean * h * -0.5, y0 + h, z);
    put('leaf', G.paint(leaf, 0x3f8f3a));
  }
  collide(x, z, 0.8, 0.8);
}
function bench(x, z, rot, put, y0) {
  const seat = G.boxGeo(1.8, 0.14, 0.6, 2); seat.rotateY(rot); seat.translate(x, y0 + 0.5, z);
  put('bark', G.paint(seat, 0xa06b3c));
  const back = G.boxGeo(1.8, 0.6, 0.12, 2); back.rotateY(rot);
  back.translate(x - Math.sin(rot) * 0.25, y0 + 0.85, z - Math.cos(rot) * 0.25);
  put('bark', G.paint(back, 0xa06b3c));
}

function buildHouses(blk, rng, put, collide, L, y0) {
  const n = 2, cs = L / n;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const bx = blk.x - L / 2 + cs * (a + 0.5), bz = blk.z - L / 2 + cs * (b + 0.5);
    if (rng.chance(0.12)) { tree(bx, bz, rng, put, collide, y0); continue; }
    const w = rng.range(cs * 0.5, cs * 0.68), d = rng.range(cs * 0.45, cs * 0.62);
    const h = rng.chance(0.3) ? rng.range(6.5, 8.5) : rng.range(3.4, 4.6);
    const style = rng.pick(['stucco', 'brick']);
    /* corpo */
    const T = G.TEX;
    const tint = new THREE.Color().setHSL(rng.range(0, 1), rng.range(0.1, 0.3), rng.range(0.5, 0.74));
    const hw = w / 2, hd = d / 2, top = y0 + h;
    const key = 'wall_' + style;
    const P = (x, y, zz) => [x, y, zz];
    const uo = rng.range(0, 1), vo = rng.range(0, 1);
    const walls = [
      [P(bx - hw, y0, bz + hd), P(bx + hw, y0, bz + hd), P(bx + hw, top, bz + hd), P(bx - hw, top, bz + hd), w],
      [P(bx + hw, y0, bz - hd), P(bx - hw, y0, bz - hd), P(bx - hw, top, bz - hd), P(bx + hw, top, bz - hd), w],
      [P(bx + hw, y0, bz + hd), P(bx + hw, y0, bz - hd), P(bx + hw, top, bz - hd), P(bx + hw, top, bz + hd), d],
      [P(bx - hw, y0, bz - hd), P(bx - hw, y0, bz + hd), P(bx - hw, top, bz + hd), P(bx - hw, top, bz - hd), d]
    ];
    for (const [p1, p2, p3, p4, len] of walls) put(key, G.paint(G.quad(p1, p2, p3, p4, len / T.FACADE_W, h / T.FACADE_H, uo, vo), tint));
    /* telhado de duas aguas */
    const rh = rng.range(1.4, 2.4);
    const prof = [[-d / 2 - 0.5, 0], [d / 2 + 0.5, 0], [0, rh]];
    const roofG = G.extrudeProfile(prof, w + 1.0);
    roofG.translate(bx, top, bz);
    put('tiles', G.paint(roofG, 0xffffff));
    collide(bx, bz, w, d);
    /* quintal com muro baixo */
    if (rng.chance(0.7)) {
      const fw = cs * 0.88;
      for (const [sx, sz, ww, dd] of [[0, cs * 0.44, fw, 0.25], [0, -cs * 0.44, fw, 0.25], [cs * 0.44, 0, 0.25, fw], [-cs * 0.44, 0, 0.25, fw]]) {
        if (rng.chance(0.25)) continue;
        put('plain', G.paint(G.boxGeo(ww, 1.0, dd, 3).translate(bx + sx, y0 + 0.5, bz + sz), rng.pick([0xd8d2c4, 0xbfae94, 0xc9c9c2])));
      }
      put('grass', G.floorQuad(bx, bz, cs * 0.86, cs * 0.86, y0 + 0.005, 6));
    }
  }
  streetProps(blk, rng, put, collide, y0);
}

function buildFavela(blk, rng, put, collide, L, y0) {
  const n = 3, cs = L / n;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const bx = blk.x - L / 2 + cs * (a + 0.5) + rng.range(-1.5, 1.5);
    const bz = blk.z - L / 2 + cs * (b + 0.5) + rng.range(-1.5, 1.5);
    const levels = rng.int(1, 3);
    let base = y0;
    for (let k = 0; k < levels; k++) {
      const w = rng.range(cs * 0.5, cs * 0.85) * (1 - k * 0.12);
      const d = rng.range(cs * 0.5, cs * 0.85) * (1 - k * 0.12);
      const h = rng.range(2.8, 3.6);
      const c = new THREE.Color().setHSL(rng.range(0.02, 0.16), rng.range(0.12, 0.4), rng.range(0.42, 0.66));
      put('wall_stucco', G.paint(G.boxGeo(w, h, d, G.TEX.FACADE_W).translate(bx + rng.range(-1, 1), base + h / 2, bz + rng.range(-1, 1)), c));
      base += h;
      if (k === levels - 1) {
        put('metal', G.paint(G.boxGeo(w + 0.6, 0.12, d + 0.6, 2).translate(bx, base + 0.06, bz), 0x9aa0a6));
        if (rng.chance(0.5)) put('metal', G.paint(G.boxGeo(0.9, 1.0, 0.9, 1).translate(bx + w * 0.25, base + 0.6, bz), 0x2c6fa0));
      }
    }
    collide(bx, bz, cs * 0.8, cs * 0.8);
  }
  streetProps(blk, rng, put, collide, y0);
}

function buildIndustrial(blk, rng, put, collide, L, y0) {
  put('plain', G.paint(G.floorQuad(blk.x, blk.z, L, L, y0 + 0.005, 8), 0x6d6d70));
  const type = rng.int(0, 2);
  if (type === 0) { /* galpao */
    const w = L * 0.8, d = L * 0.62, h = rng.range(9, 14);
    put('metal', G.paint(G.boxGeo(w, h, d, 5).translate(blk.x, y0 + h / 2, blk.z), rng.pick([0x8d949c, 0xa8a49a, 0x7f8b93])));
    const prof = [[-d / 2 - 0.4, 0], [d / 2 + 0.4, 0], [0, 2.2]];
    const roofG = G.extrudeProfile(prof, w + 0.8); roofG.translate(blk.x, y0 + h, blk.z);
    put('metal', G.paint(roofG, 0x6f7880));
    collide(blk.x, blk.z, w, d);
    /* containers */
    for (let k = 0; k < 5; k++) {
      const cx = blk.x + rng.range(-L / 2 + 4, L / 2 - 4), cz = blk.z + (rng.chance(0.5) ? d / 2 + 5 : -d / 2 - 5) + rng.range(-3, 3);
      const stack = rng.int(1, 2);
      for (let s = 0; s < stack; s++) {
        put('metal', G.paint(G.boxGeo(6.1, 2.6, 2.5, 3).translate(cx, y0 + 1.3 + s * 2.62, cz), rng.pick([0xb03a2e, 0x2874a6, 0xd4ac0d, 0x239b56])));
      }
      collide(cx, cz, 6.1, 2.5);
    }
  } else if (type === 1) { /* silos */
    for (let k = 0; k < 3; k++) {
      const sx = blk.x + (k - 1) * 12, sz = blk.z;
      const h = rng.range(14, 22), r = rng.range(3.5, 5);
      put('metal', G.paint(new THREE.CylinderGeometry(r, r, h, 14).translate(sx, y0 + h / 2, sz), 0xcfd3d6));
      put('metal', G.paint(new THREE.ConeGeometry(r + 0.2, 3, 14).translate(sx, y0 + h + 1.5, sz), 0x9aa0a6));
      collide(sx, sz, r * 2, r * 2);
    }
    for (let k = 0; k < 4; k++) {
      const cx = blk.x + rng.range(-L / 2 + 5, L / 2 - 5), cz = blk.z + rng.range(-L / 2 + 5, L / 2 - 5);
      if (Math.abs(cz - blk.z) < 8) continue;
      put('metal', G.paint(G.boxGeo(2.4, 2.4, 2.4, 2).translate(cx, y0 + 1.2, cz), 0x777d84));
      collide(cx, cz, 2.4, 2.4);
    }
  } else { /* patio com guindaste e tanques */
    for (let k = 0; k < 2; k++) {
      const sx = blk.x + (k ? -14 : 14), sz = blk.z;
      const r = 6, h = 7;
      put('metal', G.paint(new THREE.CylinderGeometry(r, r, h, 16).translate(sx, y0 + h / 2, sz), 0xc9cdd0));
      collide(sx, sz, r * 2, r * 2);
    }
    const th = 26;
    put('metal', G.paint(G.boxGeo(1.4, th, 1.4, 3).translate(blk.x, y0 + th / 2, blk.z - 20), 0xd4a017));
    put('metal', G.paint(G.boxGeo(1.2, 1.2, 26, 3).translate(blk.x, y0 + th, blk.z - 8), 0xd4a017));
    collide(blk.x, blk.z - 20, 2, 2);
  }
  /* cerca */
  for (const [sx, sz, ww, dd] of [[0, L / 2, L, 0.25], [0, -L / 2, L, 0.25], [L / 2, 0, 0.25, L], [-L / 2, 0, 0.25, L]]) {
    if (rng.chance(0.35)) continue;
    put('metal', G.paint(G.boxGeo(ww, 2.4, dd, 2).translate(blk.x + sx, y0 + 1.2, blk.z + sz), 0x8a9099));
    G.grid.insert({ x1: blk.x + sx - ww / 2, x2: blk.x + sx + ww / 2, z1: blk.z + sz - dd / 2, z2: blk.z + sz + dd / 2 });
  }
}

/* postes, semaforos, lixeiras, hidrantes */
function streetProps(blk, rng, put, collide, y0) {
  const C = G.CITY, L = C.BLOCK;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = blk.x + sx * (L / 2 - 2), z = blk.z + sz * (L / 2 - 2);
    /* poste */
    put('metal', G.paint(new THREE.CylinderGeometry(0.13, 0.2, 8, 6).translate(x, y0 + 4, z), 0x4a4f55));
    put('metal', G.paint(G.boxGeo(0.25, 0.25, 2.2, 2).translate(x - sx * 1.0, y0 + 7.9, z), 0x4a4f55));
    const lamp = G.boxGeo(0.7, 0.22, 1.5, 1).translate(x - sx * 1.8, y0 + 7.7, z);
    put('glowSign', G.paint(lamp, 0xfff0c0));
    G.lampPosts = G.lampPosts || [];
    if (G.lampPosts.length < 900) G.lampPosts.push({ x: x - sx * 1.8, z: z, y: y0 + 7.6 });
    if (rng.chance(0.35)) { /* lixeira */
      put('metal', G.paint(new THREE.CylinderGeometry(0.4, 0.35, 1.0, 8).translate(x + sx * 1.5, y0 + 0.5, z + sz * 1.2), 0x3d6b4a));
    }
    if (rng.chance(0.2)) { /* hidrante */
      put('plain', G.paint(G.boxGeo(0.35, 0.8, 0.35, 1).translate(x + sx * 0.8, y0 + 0.4, z - sz * 2.2), 0xc0392b));
    }
  }
  /* ponto de onibus */
  if (rng.chance(0.18)) {
    const x = blk.x + rng.range(-L / 4, L / 4), z = blk.z + (rng.chance(0.5) ? L / 2 - 1.6 : -(L / 2 - 1.6));
    put('metal', G.paint(G.boxGeo(4.5, 0.2, 1.8, 2).translate(x, y0 + 2.6, z), 0x9aa0a6));
    put('metal', G.paint(G.boxGeo(4.5, 2.6, 0.15, 2).translate(x, y0 + 1.3, z - 0.8), 0x6f7880));
    bench(x, z, 0, put, y0);
  }
}

/* -------------------------------------------------------------- praia/mar */
function buildBeachBlock(blk, rng, put, collide) {
  const C = G.CITY, L = C.BLOCK;
  put('sand', G.floorQuad(blk.x, blk.z, L + C.RW, L + C.RW, 0.02, 10));
  for (let k = 0; k < 3; k++) {
    palm(blk.x + rng.range(-L / 2, L / 2), blk.z + rng.range(-L / 2, L / 2), rng, put, collide, 0.02);
  }
  if (rng.chance(0.5)) { /* quiosque */
    const x = blk.x + rng.range(-L / 3, L / 3), z = blk.z + rng.range(-L / 3, L / 3);
    put('plain', G.paint(G.boxGeo(6, 3, 5, 3).translate(x, 1.5, z), 0xe8dcc0));
    put('tiles', G.paint(G.boxGeo(7, 0.3, 6, 3).translate(x, 3.15, z), 0xffffff));
    collide(x, z, 6, 5);
  }
  /* guarda-sois */
  for (let k = 0; k < 4; k++) {
    const x = blk.x + rng.range(-L / 2, L / 2), z = blk.z + rng.range(-L / 2, L / 2);
    put('metal', G.paint(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5).translate(x, 1.2, z), 0xdddddd));
    put('plain', G.paint(new THREE.ConeGeometry(1.8, 0.7, 8).translate(x, 2.6, z), rng.pick([0xe74c3c, 0xf1c40f, 0x3498db])));
  }
}

function buildBeach(rng, put, collide, OCEAN_Z) {
  const C = G.CITY;
  /* faixa de areia entre a ultima quadra e o mar */
  const z0 = C.EXT + 10;
  put('sand', G.floorQuad(0, z0 + 100, C.EXT * 2 + 200, 200, 0.02, 12));
  /* pier */
  const px = -180;
  put('bark', G.paint(G.boxGeo(14, 0.4, 200, 4).translate(px, 1.2, z0 + 100), 0xb08a5a));
  for (let z = z0; z < z0 + 200; z += 12) {
    for (const sx of [-6, 6]) {
      put('bark', G.paint(new THREE.CylinderGeometry(0.4, 0.4, 3, 6).translate(px + sx, 0, z), 0x7a5a34));
    }
  }
  for (let z = z0 + 6; z < z0 + 200; z += 24) {
    for (const sx of [-6.8, 6.8]) {
      put('metal', G.paint(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 5).translate(px + sx, 2.0, z), 0xdddddd));
    }
  }
  for (let k = 0; k < 24; k++) {
    palm(rng.range(-C.EXT, C.EXT), rng.range(z0 + 8, z0 + 70), rng, put, collide, 0.02);
  }
}

/* ---------------------------------------------------------- pontos fixos */
function buildLandmarks(rng, put, collide, scene) {
  const C = G.CITY;
  /* estadio no oeste */
  const sx = -(C.N - 3) * C.P, sz = (C.N - 6) * C.P;
  const R = 62;
  for (let k = 0; k < 40; k++) {
    const a0 = k / 40 * 6.283, a1 = (k + 1) / 40 * 6.283;
    const h = 22;
    const p1 = [sx + Math.cos(a0) * R, C.CURB, sz + Math.sin(a0) * R];
    const p2 = [sx + Math.cos(a1) * R, C.CURB, sz + Math.sin(a1) * R];
    put('wall_concrete', G.paint(G.quad(p1, p2, [p2[0], h, p2[2]], [p1[0], h, p1[2]], 10 / G.TEX.FACADE_W, h / G.TEX.FACADE_H), 0xd6d2c6));
    collide((p1[0] + p2[0]) / 2, (p1[2] + p2[2]) / 2, 8, 8);
  }
  const field = new THREE.CircleGeometry(R - 8, 30).rotateX(-Math.PI / 2).translate(sx, C.CURB + 0.1, sz);
  put('grass', field);

  /* praca central com obelisco (marco 0,0 fica em rua, entao usa a quadra ao lado) */
  const px = C.P * 0.5, pz = C.P * 0.5;
  put('plain', G.paint(G.floorQuad(px, pz, 30, 30, C.CURB + 0.02, 6), 0xbdb3a0));
  put('plain', G.paint(G.boxGeo(3, 18, 3, 4).translate(px, C.CURB + 9, pz), 0xe0dbd0));
  put('plain', G.paint(new THREE.ConeGeometry(2.2, 4, 4).translate(px, C.CURB + 20, pz), 0xd9c98f));
  collide(px, pz, 3.5, 3.5);
}

/* ------------------------------------------------------------- utilidades */
/* Altura do chao: calcada levantada ou asfalto. */
G.groundHeight = function (x, z) {
  const C = G.CITY;
  const bi = Math.floor(x / C.P), bj = Math.floor(z / C.P);
  if (bi < -C.N || bi >= C.N || bj < -C.N || bj >= C.N) return 0;
  const cx = (bi + 0.5) * C.P, cz = (bj + 0.5) * C.P;
  const half = C.BLOCK / 2;
  if (Math.abs(x - cx) < half && Math.abs(z - cz) < half) {
    const b = G.blockAt(bi, bj);
    if (b && b.district === 'beach') return 0;
    return C.CURB;
  }
  return 0;
};
G.blockAt = function (i, j) {
  const C = G.CITY;
  const idx = (i + C.N) * (C.N * 2) + (j + C.N);
  const b = G.blocks[idx];
  return (b && b.i === i && b.j === j) ? b : G.blocks.find(x => x.i === i && x.j === j);
};
G.zoneName = function (x, z) {
  let best = 'Cidade', bd = 1e9;
  for (const zz of G.zones) {
    const d = G.dist2(x, z, zz.x, zz.z);
    if (d < bd) { bd = d; best = zz.name; }
  }
  return best;
};
/* posicao aleatoria valida sobre a rua */
G.randomRoadPoint = function () {
  const C = G.CITY;
  const i = G.rndi(-C.N, C.N), j = G.rndi(-C.N, C.N - 1);
  const vert = G.chance(0.5);
  const t = G.rnd(0.15, 0.85);
  return vert
    ? { x: i * C.P, z: (j + t) * C.P }
    : { x: (j + t) * C.P, z: i * C.P };
};
