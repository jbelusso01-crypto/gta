/* Gera dist/cidade-aberta.html: um unico arquivo com tudo embutido
   (three.js + modulos), para quem prefere um HTML solto.
   Uso: node build.js                                                       */
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const inline = src => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  return '<script>\n/* ===== ' + src + ' ===== */\n' + code + '\n</script>';
};

html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => inline(src));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'cidade-aberta.html');
fs.writeFileSync(out, html);
console.log('gerado ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB)');
