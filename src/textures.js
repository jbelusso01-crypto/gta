/* ==========================================================================
   textures.js - todas as texturas sao desenhadas em canvas em tempo de carga.
   Nenhum arquivo externo: o jogo roda offline, direto do file://.
   ========================================================================== */
'use strict';
var G = window.G;

G.TEX = {};

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(canvas, rx, ry) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 8;
  return t;
}
/* ruido granulado reutilizado por varias superficies */
function grain(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = G.clamp(d[i] + n, 0, 255);
    d[i + 1] = G.clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = G.clamp(d[i + 2] + n, 0, 255);
    if (alpha) d[i + 3] = G.clamp(d[i + 3] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}
function splotches(ctx, w, h, n, color, rmin, rmax, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, G.rnd(rmin, rmax), 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/* ----------------------------------------------------------------- asfalto */
function asphalt() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#3a3a3e'; x.fillRect(0, 0, s, s);
  splotches(x, s, s, 70, '#4a4a50', 4, 22, 0.25);
  splotches(x, s, s, 60, '#2e2e33', 3, 18, 0.3);
  grain(x, s, s, 34);
  /* rachaduras */
  x.strokeStyle = 'rgba(25,25,28,.5)'; x.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) {
    x.beginPath();
    let px = Math.random() * s, py = Math.random() * s;
    x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += G.rnd(-28, 28); py += G.rnd(-28, 28); x.lineTo(px, py); }
    x.stroke();
  }
  return c;
}

/* Pista com faixas: eixo U atravessa a rua (0..1), eixo V corre ao longo. */
function road(lanes) {
  const w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.drawImage(asphalt(), 0, 0, w, h);
  x.drawImage(asphalt(), 0, h / 2, w, h / 2);
  /* faixa central dupla amarela */
  x.fillStyle = '#d8b23a';
  x.fillRect(w / 2 - 7, 0, 4, h);
  x.fillRect(w / 2 + 3, 0, 4, h);
  /* divisoria de faixa tracejada */
  x.fillStyle = '#e8e8e8';
  const laneX = [w * 0.25, w * 0.75];
  for (const lx of laneX) {
    for (let y = 0; y < h; y += 64) x.fillRect(lx - 2, y + 8, 4, 40);
  }
  /* acostamento */
  x.fillStyle = 'rgba(235,235,235,.75)';
  x.fillRect(4, 0, 3, h); x.fillRect(w - 7, 0, 3, h);
  grain(x, w, h, 12);
  return c;
}

/* Cruzamento: asfalto + faixa de pedestre nas 4 bordas */
function crossing() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.drawImage(asphalt(), 0, 0, s, s);
  x.fillStyle = 'rgba(240,240,240,.8)';
  for (let i = 0; i < 8; i++) {
    const p = 14 + i * 29;
    x.fillRect(p, 6, 16, 26);
    x.fillRect(p, s - 32, 16, 26);
    x.fillRect(6, p, 26, 16);
    x.fillRect(s - 32, p, 26, 16);
  }
  return c;
}

/* ---------------------------------------------------------------- calcada */
function sidewalk() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#9d9a92'; x.fillRect(0, 0, s, s);
  grain(x, s, s, 22);
  x.strokeStyle = 'rgba(88,86,80,.9)'; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    x.beginPath(); x.moveTo(i * s / 4, 0); x.lineTo(i * s / 4, s); x.stroke();
    x.beginPath(); x.moveTo(0, i * s / 4); x.lineTo(s, i * s / 4); x.stroke();
  }
  splotches(x, s, s, 34, '#8d8a83', 3, 14, 0.4);
  return c;
}

/* ------------------------------------------------------------------ grama */
function grass() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#4d8a37'; x.fillRect(0, 0, s, s);
  splotches(x, s, s, 120, '#3f7a2c', 6, 26, 0.5);
  splotches(x, s, s, 90, '#5c9b42', 5, 20, 0.45);
  for (let i = 0; i < 2200; i++) {
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(60,120,45,.7)' : 'rgba(105,160,70,.6)';
    x.lineWidth = 1;
    const px = Math.random() * s, py = Math.random() * s;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + G.rnd(-2, 2), py - G.rnd(2, 5)); x.stroke();
  }
  return c;
}

/* ------------------------------------------------------------------ areia */
function sand() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#c9b789'; x.fillRect(0, 0, s, s);
  splotches(x, s, s, 90, '#bda87a', 8, 28, 0.45);
  splotches(x, s, s, 60, '#d6c79b', 6, 20, 0.4);
  grain(x, s, s, 26);
  return c;
}

/* ------------------------------------------------------------------- agua */
function water() {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#1c5f86'); g.addColorStop(1, '#14496b');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(255,255,255,.13)';
  for (let i = 0; i < 90; i++) {
    x.lineWidth = G.rnd(1, 2.4);
    const y = Math.random() * s, w = G.rnd(14, 60), px = Math.random() * s;
    x.beginPath();
    x.moveTo(px, y);
    x.quadraticCurveTo(px + w / 2, y - 3, px + w, y);
    x.stroke();
  }
  return c;
}

/* ---------------------------------------------------------------- fachadas */
/* Cada fachada e um bloco de 4x4 janelas cobrindo 12 x 13 unidades de mundo.
   O mapa emissivo casa 1:1 com ela para acender janelas a noite.           */
const FACADE_W = 12, FACADE_H = 13;

function facade(style) {
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  const cols = 4, rows = 4, cw = s / cols, ch = s / rows;
  const lit = cv(s, s), lx = lit.getContext('2d');
  lx.fillStyle = '#000'; lx.fillRect(0, 0, s, s);

  if (style === 'glass') {
    x.fillStyle = '#8fa9bd'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const px = j * cw, py = i * ch;
      const g = x.createLinearGradient(px, py, px + cw, py + ch);
      g.addColorStop(0, '#3f5f7a'); g.addColorStop(0.5, '#6f97b5'); g.addColorStop(1, '#2c4459');
      x.fillStyle = g;
      x.fillRect(px + 2, py + 2, cw - 4, ch - 8);
      x.fillStyle = 'rgba(255,255,255,.16)';
      x.fillRect(px + 2, py + 2, cw - 4, 5);
      if (Math.random() < 0.22) {
        lx.fillStyle = G.pick(['#d9b061', '#c9a86e', '#8fb3cc']);
        lx.fillRect(px + 5, py + 5, cw - 10, ch - 14);
      }
    }
    x.strokeStyle = 'rgba(20,30,40,.8)'; x.lineWidth = 3;
    for (let i = 0; i <= rows; i++) { x.beginPath(); x.moveTo(0, i * ch); x.lineTo(s, i * ch); x.stroke(); }
    for (let j = 0; j <= cols; j++) { x.beginPath(); x.moveTo(j * cw, 0); x.lineTo(j * cw, s); x.stroke(); }
  } else if (style === 'brick') {
    x.fillStyle = '#8d4f3c'; x.fillRect(0, 0, s, s);
    /* tijolos */
    const bh = 8, bw = 18;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let px = -bw; px < s; px += bw) {
        x.fillStyle = `rgb(${G.rndi(120, 155)},${G.rndi(64, 86)},${G.rndi(50, 66)})`;
        x.fillRect(px + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const px = j * cw + cw * 0.2, py = i * ch + ch * 0.18;
      const w = cw * 0.6, h = ch * 0.5;
      x.fillStyle = '#20303c'; x.fillRect(px - 3, py - 3, w + 6, h + 6);
      const g = x.createLinearGradient(px, py, px, py + h);
      g.addColorStop(0, '#4a6273'); g.addColorStop(1, '#22333f');
      x.fillStyle = g; x.fillRect(px, py, w, h);
      x.strokeStyle = '#d8d2c4'; x.lineWidth = 2; x.strokeRect(px - 3, py - 3, w + 6, h + 6);
      if (Math.random() < 0.2) { lx.fillStyle = '#c99a52'; lx.fillRect(px + 2, py + 2, w - 4, h - 4); }
    }
  } else if (style === 'concrete') {
    x.fillStyle = '#a49e91'; x.fillRect(0, 0, s, s);
    splotches(x, s, s, 40, '#a9a294', 8, 30, 0.4);
    grain(x, s, s, 20);
    for (let i = 0; i < rows; i++) {
      x.fillStyle = 'rgba(90,88,80,.55)';
      x.fillRect(0, i * ch + ch * 0.78, s, 5);
      for (let j = 0; j < cols; j++) {
        const px = j * cw + cw * 0.14, py = i * ch + ch * 0.14;
        const w = cw * 0.72, h = ch * 0.56;
        const g = x.createLinearGradient(px, py, px, py + h);
        g.addColorStop(0, '#54697a'); g.addColorStop(1, '#1e2c36');
        x.fillStyle = g; x.fillRect(px, py, w, h);
        x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(px, py, w, h * 0.3);
        x.strokeStyle = 'rgba(60,58,52,.8)'; x.lineWidth = 2; x.strokeRect(px, py, w, h);
        if (Math.random() < 0.2) { lx.fillStyle = G.pick(['#c9a765', '#b8996a']); lx.fillRect(px + 2, py + 2, w - 4, h - 4); }
      }
    }
  } else { /* 'stucco' - predio popular colorido */
    x.fillStyle = '#c2b8a8'; x.fillRect(0, 0, s, s);
    splotches(x, s, s, 50, '#c9bfae', 10, 34, 0.45);
    grain(x, s, s, 18);
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const px = j * cw + cw * 0.22, py = i * ch + ch * 0.2;
      const w = cw * 0.56, h = ch * 0.46;
      x.fillStyle = '#2b3a44'; x.fillRect(px, py, w, h);
      x.fillStyle = 'rgba(160,190,210,.5)'; x.fillRect(px, py, w, h * 0.42);
      x.strokeStyle = '#8d8272'; x.lineWidth = 3; x.strokeRect(px, py, w, h);
      /* varal / ar condicionado */
      if (Math.random() < 0.25) { x.fillStyle = '#9aa0a6'; x.fillRect(px + w * 0.2, py + h + 2, w * 0.6, 6); }
      if (Math.random() < 0.24) { lx.fillStyle = '#c2a066'; lx.fillRect(px + 2, py + 2, w - 4, h - 4); }
    }
  }
  /* sujeira nas bordas para quebrar a repeticao */
  x.fillStyle = 'rgba(60,55,48,.16)';
  x.fillRect(0, s - 18, s, 18);
  return { base: c, lit: lit };
}

/* ------------------------------------------------------------------ metais */
function metal(color) {
  const s = 128, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, s, s);
  for (let i = 0; i < s; i += 8) {
    x.fillStyle = i % 16 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
    x.fillRect(0, i, s, 4);
  }
  grain(x, s, s, 14);
  return c;
}

/* ---------------------------------------------------------------- telhados */
function roof() {
  const s = 128, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#6b6b6f'; x.fillRect(0, 0, s, s);
  splotches(x, s, s, 40, '#5a5a5e', 6, 22, 0.5);
  splotches(x, s, s, 20, '#7a7a80', 4, 14, 0.4);
  grain(x, s, s, 22);
  x.strokeStyle = 'rgba(40,40,44,.5)'; x.lineWidth = 2;
  for (let i = 0; i < s; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke(); }
  return c;
}
function tiles() { /* telha ceramica das casas */
  const s = 128, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#9c4a33'; x.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 16) {
    for (let px = 0; px < s; px += 16) {
      x.fillStyle = `rgb(${G.rndi(140, 175)},${G.rndi(62, 84)},${G.rndi(46, 62)})`;
      x.beginPath();
      x.arc(px + 8, y + 12, 8, Math.PI, 0);
      x.fill();
    }
  }
  grain(x, s, s, 16);
  return c;
}

/* -------------------------------------------------------------- vegetacao */
function foliage() {
  const s = 128, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#2f7a2a'; x.fillRect(0, 0, s, s);
  splotches(x, s, s, 90, '#256b21', 6, 22, 0.6);
  splotches(x, s, s, 70, '#3f9436', 5, 18, 0.5);
  grain(x, s, s, 24);
  return c;
}
function bark() {
  const s = 64, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#6b4a2c'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(90,64,38,.8)' : 'rgba(50,34,20,.7)';
    x.lineWidth = G.rnd(1, 3);
    const px = Math.random() * s;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px + G.rnd(-6, 6), s); x.stroke();
  }
  return c;
}

/* -------------------------------------------------------------- particulas */
function spark() {
  const s = 64, c = cv(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,210,120,.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}
function smokePuff() {
  const s = 64, c = cv(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}

/* ------------------------------------------------------------------- ceu */
function skyDome() {
  const w = 16, h = 256, c = cv(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1e4b8f');
  g.addColorStop(0.45, '#79b4e8');
  g.addColorStop(0.75, '#bcd9ef');
  g.addColorStop(1, '#e6d7bd');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

/* --------------------------------------------------------------- init all */
G.buildTextures = function () {
  const T = G.TEX;
  T.asphalt = tex(asphalt(), 1, 1);
  T.road = tex(road(), 1, 1);
  T.crossing = tex(crossing(), 1, 1);
  T.sidewalk = tex(sidewalk(), 1, 1);
  T.grass = tex(grass(), 1, 1);
  T.sand = tex(sand(), 1, 1);
  T.water = tex(water(), 1, 1);
  T.roof = tex(roof(), 1, 1);
  T.tiles = tex(tiles(), 1, 1);
  T.foliage = tex(foliage(), 1, 1);
  T.bark = tex(bark(), 1, 1);
  T.metal = tex(metal('#8d949c'), 1, 1);
  T.spark = new THREE.CanvasTexture(spark());
  T.smoke = new THREE.CanvasTexture(smokePuff());
  T.sky = new THREE.CanvasTexture(skyDome());
  T.sky.wrapS = THREE.RepeatWrapping;
  T.facades = {};
  for (const st of ['glass', 'brick', 'concrete', 'stucco']) {
    const f = facade(st);
    T.facades[st] = { base: tex(f.base, 1, 1), lit: tex(f.lit, 1, 1) };
  }
  T.FACADE_W = FACADE_W;
  T.FACADE_H = FACADE_H;
};
