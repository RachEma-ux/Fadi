// Banc P2-0 (D-178) — solveur de contraintes d'assemblage 3D écrit, borné : Gauss-Newton amorti (Levenberg-Marquardt)
// sur les équations de contrainte, rang de la jacobienne pour diagnostiquer sous-contraint / sur-contraint.
// Prototype de mesure, pas le code produit : il fixe la méthode et les chiffres (12 cas de référence, 6 cas dégénérés).
// Usage : node scripts/bench/solveur-bench.mjs [--out fichier.json]
import fs from 'node:fs';
const argv = process.argv.slice(2);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;

// ——— Pièces : pose rigide = translation (3) + rotation vectorielle (3, Rodrigues). Une pièce « fixe » n'a pas d'inconnue.
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const rotate = (w, p) => { // Rodrigues : rotation d'angle |w| autour de w/|w|
  const th = norm(w); if (th < 1e-12) return p;
  const k = scl(w, 1 / th), c = Math.cos(th), s = Math.sin(th);
  return add(add(scl(p, c), scl(cross(k, p), s)), scl(k, dot(k, p) * (1 - c)));
};
const poseOf = (x, piece) => piece.fixe ? { t: [0, 0, 0], w: [0, 0, 0] } : { t: x.slice(piece.i, piece.i + 3), w: x.slice(piece.i + 3, piece.i + 6) };
const monde = (x, piece, p) => { const { t, w } = poseOf(x, piece); return add(rotate(w, p), t); };
const dirMonde = (x, piece, d) => rotate(poseOf(x, piece).w, d);

// ——— Contraintes → résidus (équations scalaires)
function residus(x, cas) {
  const r = [];
  for (const c of cas.contraintes) {
    const A = cas.pieces[c.a], B = cas.pieces[c.b];
    if (c.type === 'coincidence') { const d = sub(monde(x, A, c.pa), monde(x, B, c.pb)); r.push(d[0], d[1], d[2]); }
    else if (c.type === 'distance') { r.push(norm(sub(monde(x, A, c.pa), monde(x, B, c.pb))) - c.d); }
    else if (c.type === 'parallele') { const u = dirMonde(x, A, c.da), v = dirMonde(x, B, c.db); const w = cross(u, v); r.push(w[0], w[1], w[2]); }
    else if (c.type === 'angle') { const u = dirMonde(x, A, c.da), v = dirMonde(x, B, c.db); r.push(dot(u, v) - Math.cos(c.deg * Math.PI / 180)); }
    else if (c.type === 'concentrique') { // axe (pa, da) de A et axe (pb, db) de B confondus : parallèles + point de B sur l'axe de A
      const u = dirMonde(x, A, c.da), v = dirMonde(x, B, c.db); const w = cross(u, v); r.push(w[0], w[1], w[2]);
      const d = sub(monde(x, B, c.pb), monde(x, A, c.pa)); const e = cross(d, u); r.push(e[0], e[1], e[2]);
    }
    else if (c.type === 'plan') { r.push(dot(sub(monde(x, B, c.pb), monde(x, A, c.pa)), dirMonde(x, A, c.da))); } // point pb de B sur le plan (pa, normale da) de A
    else throw new Error('contrainte inconnue ' + c.type);
  }
  return r;
}
function jacobienne(x, cas, r0) {
  const h = 1e-7, J = r0.map(() => new Float64Array(x.length));
  for (let j = 0; j < x.length; j++) { const xp = x.slice(); xp[j] += h; const r = residus(xp, cas); for (let i = 0; i < r.length; i++) J[i][j] = (r[i] - r0[i]) / h; }
  return J;
}
// Rang numérique par élimination de Gauss avec pivot partiel (petites matrices : < 120 × 120).
function rang(M, tol = 1e-6) {
  const A = M.map((row) => Array.from(row)); const m = A.length, n = m ? A[0].length : 0; let rk = 0;
  for (let c = 0, r = 0; c < n && r < m; c++) {
    let p = r; for (let i = r + 1; i < m; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    if (Math.abs(A[p][c]) < tol) continue;
    [A[r], A[p]] = [A[p], A[r]];
    for (let i = 0; i < m; i++) if (i !== r) { const f = A[i][c] / A[r][c]; for (let k = c; k < n; k++) A[i][k] -= f * A[r][k]; }
    r++; rk++;
  }
  return rk;
}
// Résolution de (JᵀJ + λI) δ = −Jᵀr par Cholesky.
function resoudreNormal(J, r, lambda) {
  const n = J[0] ? J[0].length : 0, m = J.length; if (!n) return null;
  const A = Array.from({ length: n }, () => new Float64Array(n)); const b = new Float64Array(n);
  for (let i = 0; i < m; i++) for (let a = 0; a < n; a++) { const ji = J[i][a]; if (!ji) continue; b[a] -= ji * r[i]; for (let c = 0; c < n; c++) A[a][c] += ji * J[i][c]; }
  for (let a = 0; a < n; a++) A[a][a] += lambda;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j]; }
  const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const d = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * d[k]; d[i] = s / L[i][i]; }
  return d;
}
const TOL = 5e-6; // 5 µm, comme le solveur 2D (D-051)
const nrm = (v) => Math.sqrt(v.reduce((s, a) => s + a * a, 0));
function resoudre(cas) {
  let i = 0; for (const p of cas.pieces) { if (!p.fixe) { p.i = i; i += 6; } }
  const n = i; let x = new Array(n).fill(0);
  for (const p of cas.pieces) if (!p.fixe && p.depart) { x[p.i] = p.depart[0]; x[p.i + 1] = p.depart[1]; x[p.i + 2] = p.depart[2]; }
  const t0 = performance.now();
  let r = residus(x, cas), lambda = 1e-3, iters = 0, J = null;
  while (iters < 100 && nrm(r) > TOL && r.length) {
    J = jacobienne(x, cas, r);
    const d = resoudreNormal(J, r, lambda);
    if (!d) { lambda *= 10; iters++; continue; }
    const xn = x.map((v, k) => v + d[k]); const rn = residus(xn, cas);
    if (nrm(rn) < nrm(r)) { x = xn; r = rn; lambda = Math.max(lambda / 3, 1e-12); } else lambda *= 10;
    iters++;
  }
  J = J || jacobienne(x, cas, r);
  const ms = performance.now() - t0;
  const rk = r.length ? rang(J) : 0, m = r.length, residu = nrm(r);
  // Diagnostic : degrés de liberté restants = n − rang ; équations dépendantes = m − rang (incompatibles si le résidu ne tombe pas).
  const ddl = n - rk, redondantes = m - rk;
  let diagnostic;
  if (residu > TOL && redondantes > 0) diagnostic = 'sur-contraint incompatible';
  else if (residu > TOL) diagnostic = 'non convergé';
  else if (ddl > 0 && redondantes > 0) diagnostic = 'résolu, sous-contraint et redondant';
  else if (ddl > 0) diagnostic = 'résolu, sous-contraint';
  else if (redondantes > 0) diagnostic = 'résolu, redondant (compatible)';
  else diagnostic = 'bien contraint';
  return { inconnues: n, equations: m, rang: rk, ddlRestants: ddl, redondantes, iterations: iters, residu, ms: Math.round(ms * 100) / 100, diagnostic };
}

// ——— Cas de référence : pièces = points/axes locaux ; une pièce fixe sert de bâti.
const piece = (nom, fixe = false, depart = null) => ({ nom, fixe, depart });
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], O = [0, 0, 0];
// nb pièces empilées : coïncidence (3 éq.) + parallèle Z + parallèle X (2 × 3 éq. de rang 2, rang 3 ensemble) = 6 ddl fixés.
// Leçon du banc : une contrainte d'angle à 0° ou 180° écrite avec le produit scalaire a un gradient nul à la solution
// (extremum du cosinus) ; elle doit être écrite comme un parallélisme (produit vectoriel), sinon le rang la compte pour rien.
const empiler = (nb) => {
  const pieces = [piece('bati', true)]; const contraintes = [];
  for (let k = 1; k < nb; k++) { pieces.push(piece('p' + k, false, [0.3 * k, 0.1 * k, 0.05 * k])); contraintes.push({ type: 'coincidence', a: k - 1, b: k, pa: [0, 0, 1], pb: O }, { type: 'parallele', a: k - 1, b: k, da: Z, db: Z }, { type: 'parallele', a: k - 1, b: k, da: X, db: X }); }
  return { pieces, contraintes };
};
const reference = [
  { nom: '1. deux pièces coïncidentes + parallèles', ...empiler(2) },
  { nom: '2. trois pièces empilées', ...empiler(3) },
  { nom: '3. pivot (concentrique + plan + angle 30°)', pieces: [piece('bati', true), piece('bras', false, [0.2, 0.2, 0.2])], contraintes: [{ type: 'concentrique', a: 0, b: 1, pa: O, da: Z, pb: O, db: Z }, { type: 'plan', a: 0, b: 1, pa: O, da: Z, pb: O }, { type: 'angle', a: 0, b: 1, da: X, db: X, deg: 30 }] },
  { nom: '4. glissière (2 parallèles + 2 plans + distance)', pieces: [piece('bati', true), piece('coulisseau', false, [0.5, 0.5, 0.5])], contraintes: [{ type: 'parallele', a: 0, b: 1, da: X, db: X }, { type: 'parallele', a: 0, b: 1, da: Y, db: Y }, { type: 'plan', a: 0, b: 1, pa: O, da: Z, pb: O }, { type: 'plan', a: 0, b: 1, pa: O, da: Y, pb: O }, { type: 'distance', a: 0, b: 1, pa: O, pb: O, d: 0.25 }] },
  { nom: '5. cinq pièces empilées', ...empiler(5) },
  { nom: '6. dix pièces empilées', ...empiler(10) },
  { nom: '7. CTA : socle + caisson + ventilateur (pivot) + panneau (glissière)', pieces: [piece('socle', true), piece('caisson', false, [0.1, 0.1, 0.1]), piece('ventilateur', false, [0.5, 0.5, 0.5]), piece('panneau', false, [0.1, 0.9, 0.1])],
    contraintes: [{ type: 'coincidence', a: 0, b: 1, pa: [0, 0, 0.1], pb: O }, { type: 'parallele', a: 0, b: 1, da: Z, db: Z }, { type: 'parallele', a: 0, b: 1, da: X, db: X },
      { type: 'concentrique', a: 1, b: 2, pa: [0.6, 0.4, 0.5], da: Y, pb: O, db: Y }, { type: 'plan', a: 1, b: 2, pa: [0.6, 0.4, 0.5], da: Y, pb: O }, { type: 'angle', a: 1, b: 2, da: X, db: X, deg: 45 },
      { type: 'parallele', a: 1, b: 3, da: X, db: X }, { type: 'parallele', a: 1, b: 3, da: Z, db: Z }, { type: 'plan', a: 1, b: 3, pa: [0, 0.8, 0], da: Y, pb: O }, { type: 'plan', a: 1, b: 3, pa: O, da: Z, pb: O }, { type: 'distance', a: 1, b: 3, pa: [0, 0.8, 0], pb: O, d: 0.3 }] },
  { nom: '8. quinze pièces empilées', ...empiler(15) },
  { nom: '9. vingt pièces empilées', ...empiler(20) },
  { nom: '10. deux pivots en série', pieces: [piece('bati', true), piece('b1', false, [0.2, 0.1, 0]), piece('b2', false, [0.4, 0.2, 0])], contraintes: [{ type: 'concentrique', a: 0, b: 1, pa: O, da: Z, pb: O, db: Z }, { type: 'plan', a: 0, b: 1, pa: O, da: Z, pb: O }, { type: 'angle', a: 0, b: 1, da: X, db: X, deg: 20 }, { type: 'concentrique', a: 1, b: 2, pa: [1, 0, 0], da: Z, pb: O, db: Z }, { type: 'plan', a: 1, b: 2, pa: [1, 0, 0], da: Z, pb: O }, { type: 'angle', a: 1, b: 2, da: X, db: X, deg: -40 }] },
  { nom: '11. distance seule (sous-contraint attendu, 5 ddl)', pieces: [piece('bati', true), piece('libre', false, [0.5, 0.5, 0.5])], contraintes: [{ type: 'distance', a: 0, b: 1, pa: O, pb: O, d: 1 }] },
  { nom: '12. pivot à 90° depuis un départ éloigné', pieces: [piece('bati', true), piece('bras', false, [3, -2, 1])], contraintes: [{ type: 'concentrique', a: 0, b: 1, pa: O, da: Z, pb: O, db: Z }, { type: 'plan', a: 0, b: 1, pa: O, da: Z, pb: O }, { type: 'angle', a: 0, b: 1, da: X, db: X, deg: 90 }] },
];
const degeneres = [
  { nom: 'D0. angle 0° écrit en produit scalaire (gradient nul à la solution) : le rang ne le compte pas', attendu: 'résolu, sous-contraint et redondant', pieces: [piece('bati', true), piece('p', false, [0.1, 0.1, 0.1])], contraintes: [{ type: 'coincidence', a: 0, b: 1, pa: O, pb: O }, { type: 'parallele', a: 0, b: 1, da: Z, db: Z }, { type: 'angle', a: 0, b: 1, da: X, db: X, deg: 0 }] },
  { nom: 'D1. deux distances incompatibles (1 m et 2 m entre les mêmes points)', attendu: 'sur-contraint incompatible', pieces: [piece('bati', true), piece('p', false, [0.5, 0, 0])], contraintes: [{ type: 'distance', a: 0, b: 1, pa: O, pb: O, d: 1 }, { type: 'distance', a: 0, b: 1, pa: O, pb: O, d: 2 }] },
  { nom: 'D2. coïncidence + distance non nulle des mêmes points', attendu: 'sur-contraint incompatible', pieces: [piece('bati', true), piece('p', false, [0.3, 0.3, 0.3])], contraintes: [{ type: 'coincidence', a: 0, b: 1, pa: O, pb: O }, { type: 'distance', a: 0, b: 1, pa: O, pb: O, d: 0.5 }] },
  { nom: 'D3. parallèle + angle 90° des mêmes directions', attendu: 'sur-contraint incompatible', pieces: [piece('bati', true), piece('p', false, [0, 0, 0])], contraintes: [{ type: 'parallele', a: 0, b: 1, da: X, db: X }, { type: 'angle', a: 0, b: 1, da: X, db: X, deg: 90 }] },
  { nom: 'D4. pièce libre (aucune contrainte) : 6 ddl', attendu: 'résolu, sous-contraint', pieces: [piece('bati', true), piece('p', false, [1, 1, 1])], contraintes: [] },
  { nom: 'D5. coïncidence seule : 3 ddl de rotation', attendu: 'résolu, sous-contraint', pieces: [piece('bati', true), piece('p', false, [1, 1, 1])], contraintes: [{ type: 'coincidence', a: 0, b: 1, pa: O, pb: O }] },
  { nom: 'D6. parallèle posée deux fois (redondante compatible, sous-contrainte)', attendu: 'résolu, sous-contraint et redondant', pieces: [piece('bati', true), piece('p', false, [0, 0, 0])], contraintes: [{ type: 'parallele', a: 0, b: 1, da: Z, db: Z }, { type: 'parallele', a: 0, b: 1, da: Z, db: Z }] },
];
const rapport = { node: process.version, tolerance: TOL, methode: 'Gauss-Newton amorti (Levenberg-Marquardt), jacobienne par différences finies, rang par élimination de Gauss (pivot partiel)', reference: [], degeneres: [] };
for (const cas of reference) { const r = resoudre(cas); rapport.reference.push({ nom: cas.nom, pieces: cas.pieces.length, ...r }); console.log(`${r.residu <= TOL ? '✓' : '✗'} ${cas.nom} — ${r.inconnues} inconnues, ${r.equations} éq., rang ${r.rang}, ${r.iterations} it., ${r.ms} ms, ${r.diagnostic}`); }
for (const cas of degeneres) { const r = resoudre(cas); const ok = r.diagnostic === cas.attendu; rapport.degeneres.push({ nom: cas.nom, attendu: cas.attendu, ...r, ok }); console.log(`${ok ? '✓' : '✗'} ${cas.nom} — attendu « ${cas.attendu} », obtenu « ${r.diagnostic} » (${r.ms} ms)`); }
rapport.synthese = { referenceResolus: rapport.reference.filter((r) => r.residu <= TOL).length, referenceMaxMs: Math.max(...rapport.reference.map((r) => r.ms)), degeneresCorrects: rapport.degeneres.filter((r) => r.ok).length };
console.log(JSON.stringify(rapport.synthese));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(rapport, null, 2));
