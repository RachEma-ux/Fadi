// Banc L0.4 — taille d'un fichier brut, gzip (niveau 9) et brotli (qualité 11, zlib.brotliCompressSync de Node).
// Usage : node scripts/bench/brotli-size.mjs <fichier> [--out fichier.json]   (quelques minutes pour un wasm de 60 Mo)
import fs from 'node:fs';
import zlib from 'node:zlib';
const [file] = process.argv.slice(2);
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const buf = fs.readFileSync(file);
const t = performance.now();
const brotli = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const brotliMs = Math.round(performance.now() - t);
const gzip = zlib.gzipSync(buf, { level: 9 }).length;
const r = { file, rawBytes: buf.length, gzip9Bytes: gzip, brotli11Bytes: brotli, brotliCompressMs: brotliMs };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r));
