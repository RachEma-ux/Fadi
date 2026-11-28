/**
 * Script de la visionneuse hors ligne (cas 4, lot C4, étape 7d), embarqué tel quel dans le fichier HTML : WebGL 1 sans
 * bibliothèque, orbite, vues enregistrées, plan de coupe horizontal, mesure entre deux points accrochés aux sommets,
 * balises affichées ou masquées. Lecture seule : rien n'est écrit, rien n'est chargé du réseau.
 * Contrainte d'écriture : ni accent grave ni « </ » dans ce texte (il vit dans un gabarit et dans une balise <script>).
 */
export const SCRIPT_VISIONNEUSE = String.raw`(function () {
"use strict";
var D = JSON.parse(document.getElementById("donnees-visionneuse").textContent);
var q = function (s) { return document.querySelector(s); };
var canvas = q("[data-scene]");
var erreur = function (m) { var e = q("[data-erreur]"); e.textContent = m; e.hidden = false; document.body.setAttribute("data-pret", "erreur"); };
var gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true }) || canvas.getContext("experimental-webgl");
var virgule = function (x, n) { return x.toFixed(n).replace("-", "−").replace(".", ","); };

// Maillages : sommets dupliqués par triangle (normales plates), en mètres.
var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], total = 0;
var objets = D.maillages.map(function (m) {
  var n = m.triangles.length, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (var k = 0; k < n; k += 3) {
    var a = m.triangles[k] * 3, b = m.triangles[k + 1] * 3, c = m.triangles[k + 2] * 3, P = m.positions;
    var ax = P[a] / 1000, ay = P[a + 1] / 1000, az = P[a + 2] / 1000, bx = P[b] / 1000, by = P[b + 1] / 1000, bz = P[b + 2] / 1000, cx = P[c] / 1000, cy = P[c + 1] / 1000, cz = P[c + 2] / 1000;
    var ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    var s = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (var i = 0; i < 9; i++) { pos[k * 3 + i] = s[i]; nor[k * 3 + i] = [nx, ny, nz][i % 3] / l; }
    for (var j = 0; j < 9; j++) { var d = j % 3; if (s[j] < min[d]) min[d] = s[j]; if (s[j] > max[d]) max[d] = s[j]; }
  }
  total += n / 3;
  var b = D.balises[m.balise];
  var coul = [0.86, 0.88, 0.86];
  if (b && /^#[0-9a-fA-F]{6}$/.test(b.couleur)) for (var t = 0; t < 3; t++) coul[t] = coul[t] * 0.7 + parseInt(b.couleur.substr(1 + t * 2, 2), 16) / 255 * 0.3;
  return { nom: m.nom, balise: m.balise, pos: pos, nor: nor, n: n, couleur: coul, tampons: null };
});
var visibles = D.balises.map(function (b) { return b.visible; });
var vu = function (o) { return o.balise < 0 || visibles[o.balise]; };
if (!isFinite(min[0])) { min = [0, 0, 0]; max = [1, 1, 1]; }
var centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
var rayon = Math.max(0.5, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
document.body.setAttribute("data-triangles", String(total));

// Caméra : cible, distance, azimut, hauteur (Z vers le haut), champ vertical en degrés, projection.
var cam = { cible: centre.slice(), distance: rayon * 2.6, azimut: -Math.PI / 3, hauteur: Math.PI / 6, champ: 35, projection: "perspective" };
var vueActive = -1, outil = "orbite", coupeAltitude = (min[2] + max[2]) / 2, mesure = [];
function poserVue(i) {
  var v = D.vues[i]; if (!v) return;
  var dx = v.position[0] - v.cible[0], dy = v.position[1] - v.cible[1], dz = v.position[2] - v.cible[2], d = Math.hypot(dx, dy, dz) || rayon * 2.6;
  cam = { cible: v.cible.slice(), distance: d, azimut: Math.atan2(dy, dx), hauteur: Math.asin(Math.max(-1, Math.min(1, dz / d))), champ: v.champ || 35, projection: v.projection };
  vueActive = i; majVues(); dessiner();
}
function oeil() {
  var c = Math.cos(cam.hauteur);
  return [cam.cible[0] + cam.distance * c * Math.cos(cam.azimut), cam.cible[1] + cam.distance * c * Math.sin(cam.azimut), cam.cible[2] + cam.distance * Math.sin(cam.hauteur)];
}
function sous(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function croix(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function scal(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function unit(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function repere() {
  var e = oeil(), f = unit(sous(cam.cible, e)), haut = Math.abs(f[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
  var r = unit(croix(f, haut)), u = croix(r, f);
  return { e: e, f: f, r: r, u: u };
}
// Matrice colonne (WebGL) : projection × vue.
function matrice() {
  var R = repere(), w = canvas.width || 1, h = canvas.height || 1, asp = w / h;
  var V = [R.r[0], R.u[0], -R.f[0], 0, R.r[1], R.u[1], -R.f[1], 0, R.r[2], R.u[2], -R.f[2], 0, -scal(R.r, R.e), -scal(R.u, R.e), scal(R.f, R.e), 1];
  var pres = Math.max(0.01, cam.distance - rayon * 3), loin = cam.distance + rayon * 3, P;
  if (cam.projection === "parallele") {
    var hh = cam.distance * Math.tan(cam.champ * Math.PI / 360), ww = hh * asp;
    P = [1 / ww, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / (loin - pres), 0, 0, 0, -(loin + pres) / (loin - pres), 1];
  } else {
    var f = 1 / Math.tan(cam.champ * Math.PI / 360);
    P = [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (loin + pres) / (pres - loin), -1, 0, 0, 2 * loin * pres / (pres - loin), 0];
  }
  var M = new Float32Array(16);
  for (var c = 0; c < 4; c++) for (var l = 0; l < 4; l++) { var s = 0; for (var k = 0; k < 4; k++) s += P[k * 4 + l] * V[c * 4 + k]; M[c * 4 + l] = s; }
  return M;
}
function projeter(M, p) {
  var x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
  var r = canvas.getBoundingClientRect();
  return [(x / w * 0.5 + 0.5) * r.width, (1 - (y / w * 0.5 + 0.5)) * r.height];
}

var prog = null, aP, aN, uM, uC, uZ, uK;
if (!gl) erreur("Ce navigateur n'affiche pas la 3D (WebGL indisponible).");
else {
  var sh = function (type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec3 p;attribute vec3 n;uniform mat4 m;varying vec3 vn;varying float vz;void main(){vn=n;vz=p.z;gl_Position=m*vec4(p,1.0);}"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, "precision mediump float;varying vec3 vn;varying float vz;uniform vec3 c;uniform float z;uniform float k;void main(){if(k>0.5&&vz>z)discard;vec3 L=normalize(vec3(0.35,-0.55,0.76));float d=abs(dot(normalize(vn),L));gl_FragColor=vec4(c*(0.42+0.58*d),1.0);}"));
  gl.linkProgram(prog);
  aP = gl.getAttribLocation(prog, "p"); aN = gl.getAttribLocation(prog, "n"); uM = gl.getUniformLocation(prog, "m"); uC = gl.getUniformLocation(prog, "c"); uZ = gl.getUniformLocation(prog, "z"); uK = gl.getUniformLocation(prog, "k");
  objets.forEach(function (o) {
    var bp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.bufferData(gl.ARRAY_BUFFER, o.pos, gl.STATIC_DRAW);
    var bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, o.nor, gl.STATIC_DRAW);
    o.tampons = [bp, bn];
  });
}

// Trait de mesure : calque SVG au-dessus de la scène.
var NS = "http://www.w3.org/2000/svg", calque = document.createElementNS(NS, "svg");
calque.setAttribute("style", "position:absolute;left:0;top:52px;width:100%;height:calc(100% - 86px);pointer-events:none;z-index:1");
document.body.appendChild(calque);
var bulle = q("[data-mesure]");
var attente = false;
function dessiner() {
  if (attente) return; attente = true;
  requestAnimationFrame(function () { attente = false; rendu(); });
}
function rendu() {
  var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  var M = matrice();
  if (gl) {
    gl.viewport(0, 0, w, h); gl.clearColor(0.875, 0.89, 0.878, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(prog); gl.uniformMatrix4fv(uM, false, M); gl.uniform1f(uZ, coupeAltitude); gl.uniform1f(uK, outil === "coupe" ? 1 : 0);
    objets.forEach(function (o) {
      if (!vu(o) || !o.n) return;
      gl.uniform3fv(uC, o.couleur);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.tampons[0]); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.tampons[1]); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, o.n);
    });
  }
  while (calque.firstChild) calque.removeChild(calque.firstChild);
  var pts = mesure.map(function (m) { return projeter(M, m.p); });
  if (pts.length === 2) {
    var ligne = document.createElementNS(NS, "line");
    ligne.setAttribute("x1", pts[0][0]); ligne.setAttribute("y1", pts[0][1]); ligne.setAttribute("x2", pts[1][0]); ligne.setAttribute("y2", pts[1][1]);
    ligne.setAttribute("stroke", "#2f6fd6"); ligne.setAttribute("stroke-width", "2.5"); calque.appendChild(ligne);
  }
  pts.forEach(function (p) { var c = document.createElementNS(NS, "circle"); c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", "6"); c.setAttribute("fill", "#2f6fd6"); calque.appendChild(c); });
  if (pts.length === 2) {
    var a = mesure[0].p, b = mesure[1].p, d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    var acc = (mesure[0].accroche ? 1 : 0) + (mesure[1].accroche ? 1 : 0);
    bulle.textContent = virgule(d, 3) + " m · " + (acc === 2 ? "deux points accrochés" : acc === 1 ? "un point accroché" : "points sans accrochage");
    bulle.style.left = Math.round(Math.max(pts[0][0], pts[1][0]) + 12) + "px";
    bulle.style.top = Math.round(52 + (pts[0][1] + pts[1][1]) / 2 - 14) + "px";
    bulle.hidden = false;
    document.body.setAttribute("data-mesure-m", d.toFixed(3));
  } else bulle.hidden = true;
}

// Rayon sous le pointeur, triangle le plus proche (Möller–Trumbore), accroché au sommet le plus proche à moins de 12 px.
function viser(cx, cy) {
  var r = canvas.getBoundingClientRect(), x = (cx - r.left) / r.width * 2 - 1, y = 1 - (cy - r.top) / r.height * 2;
  var R = repere(), asp = r.width / r.height, t = Math.tan(cam.champ * Math.PI / 360), o, dir;
  if (cam.projection === "parallele") {
    var hh = cam.distance * t;
    o = [R.e[0] + R.r[0] * x * hh * asp + R.u[0] * y * hh, R.e[1] + R.r[1] * x * hh * asp + R.u[1] * y * hh, R.e[2] + R.r[2] * x * hh * asp + R.u[2] * y * hh]; dir = R.f;
  } else { o = R.e; dir = unit([R.f[0] + R.r[0] * x * t * asp + R.u[0] * y * t, R.f[1] + R.r[1] * x * t * asp + R.u[1] * y * t, R.f[2] + R.r[2] * x * t * asp + R.u[2] * y * t]); }
  var meilleur = null, tmin = Infinity;
  objets.forEach(function (ob) {
    if (!vu(ob)) return;
    var P = ob.pos;
    for (var k = 0; k < ob.n; k += 3) {
      var i = k * 3, A = [P[i], P[i + 1], P[i + 2]], B = [P[i + 3], P[i + 4], P[i + 5]], C = [P[i + 6], P[i + 7], P[i + 8]];
      var e1 = sous(B, A), e2 = sous(C, A), pv = croix(dir, e2), det = scal(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      var tv = sous(o, A), u = scal(tv, pv) / det; if (u < 0 || u > 1) continue;
      var qv = croix(tv, e1), v = scal(dir, qv) / det; if (v < 0 || u + v > 1) continue;
      var tt = scal(e2, qv) / det;
      if (tt <= 1e-6 || tt >= tmin) continue;
      var p = [o[0] + dir[0] * tt, o[1] + dir[1] * tt, o[2] + dir[2] * tt];
      if (outil === "coupe" && p[2] > coupeAltitude) continue;
      tmin = tt; meilleur = { p: p, sommets: [A, B, C] };
    }
  });
  if (!meilleur) return null;
  var M = matrice(), vise = projeter(M, meilleur.p), proche = null, dmin = 12;
  meilleur.sommets.forEach(function (s) { var e = projeter(M, s), d = Math.hypot(e[0] - vise[0], e[1] - vise[1]); if (d < dmin) { dmin = d; proche = s; } });
  return proche ? { p: proche, accroche: true } : { p: meilleur.p, accroche: false };
}

// Gestes : glisser = orbite (Maj ou bouton droit : déplacer), molette ou pincement = zoom, clic = point de mesure.
var pointeurs = {}, depart = null, ecartPince = 0;
canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
canvas.addEventListener("pointerdown", function (e) {
  canvas.setPointerCapture(e.pointerId); pointeurs[e.pointerId] = [e.clientX, e.clientY];
  var ids = Object.keys(pointeurs);
  if (ids.length === 2) { var a = pointeurs[ids[0]], b = pointeurs[ids[1]]; ecartPince = Math.hypot(a[0] - b[0], a[1] - b[1]); depart = null; }
  else depart = { x: e.clientX, y: e.clientY, bouge: false, deplacer: e.shiftKey || e.button === 2 };
});
canvas.addEventListener("pointermove", function (e) {
  if (!pointeurs[e.pointerId]) return;
  var avant = pointeurs[e.pointerId]; pointeurs[e.pointerId] = [e.clientX, e.clientY];
  var ids = Object.keys(pointeurs);
  if (ids.length === 2) {
    var a = pointeurs[ids[0]], b = pointeurs[ids[1]], ec = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (ecartPince > 0 && ec > 0) { cam.distance = Math.max(rayon * 0.05, cam.distance * ecartPince / ec); ecartPince = ec; dessiner(); }
    return;
  }
  if (!depart) return;
  var dx = e.clientX - avant[0], dy = e.clientY - avant[1];
  if (Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 4) depart.bouge = true;
  if (!depart.bouge) return;
  if (depart.deplacer) {
    var R = repere(), r = canvas.getBoundingClientRect(), k = 2 * cam.distance * Math.tan(cam.champ * Math.PI / 360) / r.height;
    for (var i = 0; i < 3; i++) cam.cible[i] += (-R.r[i] * dx + R.u[i] * dy) * k;
  } else { cam.azimut -= dx * 0.008; cam.hauteur = Math.max(-1.55, Math.min(1.55, cam.hauteur + dy * 0.008)); }
  vueActive = -1; majVues(); dessiner();
});
var fin = function (e) {
  var clic = depart && !depart.bouge && Object.keys(pointeurs).length === 1;
  delete pointeurs[e.pointerId];
  if (clic && e.type === "pointerup" && outil === "mesure") {
    var p = viser(e.clientX, e.clientY);
    if (p) { if (mesure.length === 2) mesure = []; mesure.push(p); dessiner(); }
  }
  depart = null;
};
canvas.addEventListener("pointerup", fin); canvas.addEventListener("pointercancel", fin);
canvas.addEventListener("wheel", function (e) { e.preventDefault(); cam.distance = Math.max(rayon * 0.05, cam.distance * Math.exp(e.deltaY * 0.0015)); vueActive = -1; majVues(); dessiner(); }, { passive: false });
window.addEventListener("resize", dessiner);

// Vues enregistrées.
var nav = q("[data-vues]");
var boutonsVues = D.vues.map(function (v, i) {
  var b = document.createElement("button"); b.type = "button"; b.textContent = v.nom; b.setAttribute("data-vue", String(i));
  b.addEventListener("click", function () { poserVue(i); }); nav.appendChild(b); return b;
});
function majVues() { boutonsVues.forEach(function (b, i) { b.className = i === vueActive ? "on" : ""; }); document.body.setAttribute("data-vue-active", String(vueActive)); }

// Outils : orbite, plan de coupe, mesure ; balises dans une liste.
var curseur = q("[data-coupe-curseur]"), carteCoupe = q("[data-coupe]"), liste = q("[data-liste-balises]"), boutonBalises = q('[data-outil="balises"]');
curseur.min = String(Math.floor(min[2] * 100) / 100); curseur.max = String(Math.ceil(max[2] * 100) / 100); curseur.step = "0.01"; curseur.value = String(Math.round(coupeAltitude * 100) / 100);
function majCoupe() { coupeAltitude = Number(curseur.value); q("[data-coupe-altitude]").textContent = "Horizontal, altitude " + virgule(coupeAltitude, 2) + " m"; document.body.setAttribute("data-coupe", outil === "coupe" ? curseur.value : ""); dessiner(); }
curseur.addEventListener("input", majCoupe);
function choisirOutil(o) {
  outil = o;
  Array.prototype.forEach.call(document.querySelectorAll("[data-outil]"), function (b) { if (b !== boutonBalises) b.className = b.getAttribute("data-outil") === o ? "on" : ""; });
  carteCoupe.hidden = o !== "coupe"; if (o !== "mesure") mesure = [];
  document.body.setAttribute("data-outil", o); majCoupe();
}
["orbite", "coupe", "mesure"].forEach(function (o) { q('[data-outil="' + o + '"]').addEventListener("click", function () { choisirOutil(o); }); });
function majBalises() {
  var masquees = visibles.filter(function (v) { return !v; }).length;
  boutonBalises.textContent = "Balises : " + (masquees === 0 ? "affichées" : masquees === visibles.length ? "masquées" : masquees + (masquees > 1 ? " masquées" : " masquée"));
  document.body.setAttribute("data-balises-masquees", String(masquees)); dessiner();
}
D.balises.forEach(function (b, i) {
  var l = document.createElement("label"), c = document.createElement("input"), pastille = document.createElement("i"), nom = document.createElement("span");
  c.type = "checkbox"; c.checked = visibles[i]; c.setAttribute("data-balise", String(i));
  c.addEventListener("change", function () { visibles[i] = c.checked; mesure = []; majBalises(); });
  if (/^#[0-9a-fA-F]{6}$/.test(b.couleur)) pastille.style.background = b.couleur;
  nom.textContent = b.nom; l.appendChild(c); l.appendChild(pastille); l.appendChild(nom); liste.appendChild(l);
});
boutonBalises.addEventListener("click", function () { liste.hidden = !liste.hidden; boutonBalises.className = liste.hidden ? "" : "on"; });
majBalises();

if (D.vues.length) poserVue(0); else { majVues(); dessiner(); }
choisirOutil("orbite");
document.body.setAttribute("data-pret", gl ? "oui" : "erreur");
})();`;
