// Extension « Trame d'axes » (catalogue des extensions, cas 3, lot 2 : D1-F2-030 ; protocole 1.3).
// Un outil pose une trame d'axes nommée à entraxes saisis : files accrochables (arêtes d'un groupe « Trame »
// verrouillé, sur la balise « Trame »), bulles et cotes d'entraxe. Une commande rouvre les réglages d'une trame
// sélectionnée et la repose en un seul pas. Les entraxes sont ceux que l'utilisateur saisit : aucune valeur imposée.

const t = (en, francais, anglais) => (en ? anglais : francais);
const EPS = 1e-9;
/** Files d'une direction, au plus. */
const MAX_FILES = 40;
/** Rayon des bulles (m) et écart des cotes au bout des files (m) : mise en page, pas une règle. */
const RAYON_BULLE = 0.4;
const ECART_COTE = 0.8;
const COTES_BULLE = 24;
const CLE = "trame";

const DEFAUT = { x: "3x6", y: "2x6", repX: "lettres", repY: "chiffres", angle: 0, debord: 1.5 };
let reglages = { ...DEFAUT };
let unites = null;
let origine = null;

// ————————————————————————————————————————————— Lecture des réglages —————————————————————————————————————————————

/** « 5,40;5,40;7,20 » ou « 6x5,40 » (mélangeables : « 2x6;7,20 ») → entraxes en mètres, ou un message d'erreur. */
function lireEntraxes(texte, en) {
  const valeurs = [];
  for (const brut of String(texte).split(";")) {
    const morceau = brut.trim().replace(/,/g, ".");
    if (!morceau) continue;
    const m = /^(?:(\d{1,3})\s*[x×*]\s*)?(\d+(?:\.\d+)?)$/i.exec(morceau);
    if (!m) return t(en, `Entraxe illisible : « ${brut.trim()} ». Écrivez par exemple 5,40;5,40;7,20 ou 6x5,40.`, `Unreadable spacing: "${brut.trim()}". Write for example 5.40;5.40;7.20 or 6x5.40.`);
    const n = m[1] ? Number(m[1]) : 1;
    const v = Number(m[2]);
    if (!(v > EPS) || n < 1) return t(en, "Un entraxe est positif.", "A spacing is positive.");
    for (let i = 0; i < n; i++) valeurs.push(v);
  }
  if (valeurs.length === 0) return t(en, "Saisissez au moins un entraxe.", "Type at least one spacing.");
  if (valeurs.length + 1 > MAX_FILES) return t(en, `${MAX_FILES} files au plus par direction.`, `${MAX_FILES} grid lines at most per direction.`);
  return valeurs;
}

/** Repère n° i : A…Z, AA, AB… ou 1, 2, 3… */
function repere(i, genre) {
  if (genre === "chiffres") return String(i + 1);
  let s = "";
  let k = i;
  do {
    s = String.fromCharCode(65 + (k % 26)) + s;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return s;
}

const texteNombre = (v, sep) => String(Math.round(v * 1e6) / 1e6).replace(".", sep);
/** Entraxes rendus en texte court : « 3x6 ; 7,2 » plutôt que la liste complète. */
function ecrireEntraxes(valeurs, sep) {
  const parts = [];
  for (let i = 0; i < valeurs.length; ) {
    let j = i;
    while (j < valeurs.length && Math.abs(valeurs[j] - valeurs[i]) < EPS) j++;
    parts.push(j - i > 1 ? `${j - i}x${texteNombre(valeurs[i], sep)}` : texteNombre(valeurs[i], sep));
    i = j;
  }
  return parts.join(";");
}

async function demanderReglages(en, depart) {
  const sep = (unites && unites.separateur) || ",";
  const choixRep = [
    { valeur: "lettres", libelle: t(en, "Lettres (A, B, C…)", "Letters (A, B, C…)") },
    { valeur: "chiffres", libelle: t(en, "Chiffres (1, 2, 3…)", "Numbers (1, 2, 3…)") },
  ];
  for (;;) {
    const r = await planche.saisie.demander(t(en, "Trame d'axes", "Grid lines"), [
      { id: "x", genre: "texte", libelle: t(en, "Entraxes en X (m)", "X spacings (m)"), valeur: String(depart.x).replace(/\./g, sep) },
      { id: "repX", genre: "choix", libelle: t(en, "Repères des files en X", "X grid line labels"), valeur: depart.repX, choix: choixRep },
      { id: "y", genre: "texte", libelle: t(en, "Entraxes en Y (m)", "Y spacings (m)"), valeur: String(depart.y).replace(/\./g, sep) },
      { id: "repY", genre: "choix", libelle: t(en, "Repères des files en Y", "Y grid line labels"), valeur: depart.repY, choix: choixRep },
      { id: "angle", genre: "nombre", libelle: t(en, "Angle de la trame", "Grid angle"), valeur: depart.angle, min: -360, max: 360, unite: "°" },
      { id: "debord", genre: "nombre", libelle: t(en, "Débord des files", "Grid line overhang"), valeur: depart.debord, min: 0, max: 100, unite: "m" },
    ]);
    if (!r) return null;
    const x = lireEntraxes(r.x, en);
    const y = lireEntraxes(r.y, en);
    const faux = typeof x === "string" ? x : typeof y === "string" ? y : null;
    if (faux) {
      await planche.message.afficher(faux, "alerte");
      depart = { ...depart, ...r };
      continue;
    }
    if (r.repX === r.repY) {
      await planche.message.afficher(t(en, "Les deux directions ont des repères différents : lettres d'un côté, chiffres de l'autre.", "The two directions need different labels: letters one way, numbers the other."), "alerte");
      depart = { ...depart, ...r };
      continue;
    }
    return { x: ecrireEntraxes(x, "."), y: ecrireEntraxes(y, "."), repX: r.repX, repY: r.repY, angle: Number(r.angle) || 0, debord: Math.max(0, Number(r.debord) || 0) };
  }
}

// ————————————————————————————————————————————— Géométrie de la trame —————————————————————————————————————————————

const ajouter = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const fois = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cumul = (v) => v.reduce((acc, x) => [...acc, acc[acc.length - 1] + x], [0]);

/**
 * Plan de la trame, à l'origine `o` : files (segments), bulles (centre, repère), cotes d'entraxe et cotes totales.
 * Files en X : parallèles à l'axe Y tourné, rangées le long de X (repères en X) ; files en Y : l'inverse.
 */
function plan(r, o) {
  const ex = lireEntraxes(r.x, false);
  const ey = lireEntraxes(r.y, false);
  const a = (r.angle * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a), 0];
  const v = [-Math.sin(a), Math.cos(a), 0];
  const px = cumul(ex);
  const py = cumul(ey);
  const lx = px[px.length - 1];
  const ly = py[py.length - 1];
  const P = (s, w) => ajouter(o, ajouter(fois(u, s), fois(v, w)));
  const d = r.debord;
  const files = [];
  const bulles = [];
  const cotes = [];
  px.forEach((s, i) => {
    files.push([P(s, -d), P(s, ly + d)]);
    bulles.push({ centre: P(s, -d - RAYON_BULLE), texte: repere(i, r.repX), pied: P(s, -d) });
  });
  py.forEach((w, j) => {
    files.push([P(-d, w), P(lx + d, w)]);
    bulles.push({ centre: P(-d - RAYON_BULLE, w), texte: repere(j, r.repY), pied: P(-d, w) });
  });
  const basX = -d - 2 * RAYON_BULLE - ECART_COTE;
  const basY = -d - 2 * RAYON_BULLE - ECART_COTE;
  for (let i = 1; i < px.length; i++) cotes.push({ a: P(px[i - 1], 0), b: P(px[i], 0), position: P(px[i - 1], basX) });
  for (let j = 1; j < py.length; j++) cotes.push({ a: P(0, py[j - 1]), b: P(0, py[j]), position: P(basY, py[j - 1]) });
  if (px.length > 2) cotes.push({ a: P(0, 0), b: P(lx, 0), position: P(0, basX - ECART_COTE) });
  if (py.length > 2) cotes.push({ a: P(0, 0), b: P(0, ly), position: P(basY - ECART_COTE, 0) });
  return { files, bulles, cotes, nx: px.length, ny: py.length };
}

function cercle(c, r, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), c[2]]);
  }
  return pts;
}

/** Origine retenue : le point accroché ; sinon le point visé, arrondi au pas d'accrochage du projet (1.3). */
function origineDe(d) {
  if (d.nature !== "libre" || !d.vise) return d.point;
  const pas = unites && unites.pasLongueur;
  if (!(pas > EPS)) return d.vise;
  return [Math.round(d.vise[0] / pas) * pas, Math.round(d.vise[1] / pas) * pas, d.vise[2]];
}

// ————————————————————————————————————————————— Pose —————————————————————————————————————————————

/** Pose la trame dans l'opération ouverte : files et bulles dans un groupe verrouillé, balisé, puis bulles et cotes. */
async function poser(r, o, en) {
  const p = plan(r, o);
  const lu = await planche.modele.lire();
  const avant = new Set([...lu.aretes, ...lu.faces].map((x) => x.id));
  const monde = await planche.modele.lire({ portee: "monde" });
  // Tracer à l'écart, grouper, puis déplacer : les files ne se soudent pas au dessin existant.
  let xMax = 0;
  for (const a of monde.aretes) for (const q of a.points) xMax = Math.max(xMax, q[0]);
  const ecart = [Math.max(0, xMax - Math.min(...p.files.flat().map((q) => q[0]))) + 50, 0, 0];
  await planche.modele.lignes(p.files.map(([a, b]) => [ajouter(a, ecart), ajouter(b, ecart)]));
  for (const b of p.bulles) await planche.modele.cercle(ajouter(b.centre, ecart), RAYON_BULLE, [0, 0, 1], COTES_BULLE);
  // Les files qui se croisent ferment des cases, et les bulles des disques : une trame n'a que des traits.
  const apres = await planche.modele.lire();
  const faces = apres.faces.map((x) => x.id).filter((id) => !avant.has(id));
  if (faces.length) await planche.modele.effacer(faces);
  const nouvelles = (await planche.modele.lire()).aretes.map((x) => x.id).filter((id) => !avant.has(id));
  const etendue = `${repere(0, r.repX)}–${repere(p.nx - 1, r.repX)} / ${repere(0, r.repY)}–${repere(p.ny - 1, r.repY)}`;
  const nom = t(en, `Trame ${etendue}`, `Grid ${etendue}`);
  const groupe = await planche.modele.grouper(nouvelles, nom);
  await planche.modele.deplacer([groupe], fois(ecart, -1));
  const balise = await planche.balises.creer(t(en, "Trame", "Grid"), "#c0392b");
  await planche.balises.appliquer([groupe], balise);
  // Bulles et cotes sur la même balise que les files : la trame cachée l'est en entier.
  const textes = [];
  for (const b of p.bulles) textes.push(await planche.textes.creer(b.centre, b.centre, b.texte, balise));
  const cotes = [];
  for (const c of p.cotes) cotes.push(await planche.cotes.creer(c.a, c.b, c.position, undefined, balise));
  await planche.donnees.ecrire(groupe, CLE, { ...r, origine: o, annotations: [...textes, ...cotes] });
  await planche.objets.verrouiller([groupe], true);
  await planche.selection.definir([groupe]);
  return { groupe, p };
}

// ————————————————————————————————————————————— Outil —————————————————————————————————————————————

const repos = (en) => ({
  apercu: { segments: [], pointilles: [], points: [], contours: [], textes: [] },
  etat: t(en, "Cliquez l'origine de la trame (croisement des premières files). | Entrée = Réglages. | Échap = Annuler.", "Click the grid origin (crossing of the first grid lines). | Enter = Settings. | Esc = Cancel."),
  saisie: { libelle: t(en, "Origine X;Y", "Origin X;Y"), valeur: "" },
  curseur: "croix",
});

async function apercu(o, en) {
  const p = plan(reglages, o);
  const fx = await planche.unites.formater(o[0]);
  const fy = await planche.unites.formater(o[1]);
  return {
    apercu: {
      segments: [],
      pointilles: p.files,
      points: [o],
      contours: p.bulles.slice(0, 100).map((b) => cercle(b.centre, RAYON_BULLE, COTES_BULLE)),
      textes: p.bulles.slice(0, 40).map((b) => ({ point: b.centre, texte: b.texte })),
    },
    etat: t(en, `Origine ${fx} ; ${fy} — cliquez pour poser ${p.nx} × ${p.ny} files. | Entrée = Réglages. | Échap = Annuler.`, `Origin ${fx}; ${fy} — click to place ${p.nx} × ${p.ny} grid lines. | Enter = Settings. | Esc = Cancel.`),
    saisie: { libelle: t(en, "Origine X;Y", "Origin X;Y"), valeur: `${fx.replace(/ m$/, "")};${fy.replace(/ m$/, "")}` },
    curseur: "cible",
  };
}

async function activer(d) {
  const en = d.langue === "en";
  unites = await planche.unites.lire();
  origine = null;
  const r = await demanderReglages(en, reglages);
  if (r) reglages = r;
  return repos(en);
}

/** La trame se pose à la racine : bulles et cotes sont dans les coordonnées du modèle (protocole 1.3, `dans`). */
async function horsRacine(en) {
  const lu = await planche.modele.lire();
  if (!lu.dans) return false;
  await planche.message.afficher(t(en, "Fermez le groupe ou le composant ouvert pour poser ou modifier une trame.", "Close the open group or component to place or edit a grid."), "alerte");
  return true;
}

async function poserIci(o, en) {
  if (await horsRacine(en)) return repos(en);
  await planche.operation.ouvrir(t(en, "Trame d'axes", "Grid lines"));
  const { p } = await poser(reglages, o, en);
  await planche.operation.valider();
  await planche.message.afficher(t(en, `Trame posée : ${p.nx} × ${p.ny} files, verrouillée, sur la balise « Trame ».`, `Grid placed: ${p.nx} × ${p.ny} grid lines, locked, on the "Grid" tag.`));
  origine = null;
  return repos(en);
}

planche.outil.sur("poser", "activation", activer);
planche.outil.sur("poser", "annulation", (d) => {
  origine = null;
  return repos(d.langue === "en");
});
planche.outil.sur("poser", "deplacement", (d) => {
  origine = origineDe(d);
  return apercu(origine, d.langue === "en");
});
planche.outil.sur("poser", "clic", (d) => poserIci(origineDe(d), d.langue === "en"));
planche.outil.sur("poser", "validation", async (d) => {
  const en = d.langue === "en";
  const r = await demanderReglages(en, reglages);
  if (r) reglages = r;
  return origine ? apercu(origine, en) : repos(en);
});
// Origine saisie « x;y » (m) : la trame est posée là, à la hauteur du point visé.
planche.outil.sur("poser", "saisie", async (d) => {
  const en = d.langue === "en";
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*;\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(d.texte || "");
  if (!m) {
    await planche.message.afficher(t(en, "Origine : écrivez x;y en mètres, par exemple 12,40;3,20.", "Origin: write x;y in metres, for example 12.40;3.20."), "alerte");
    return null;
  }
  return poserIci([Number(m[1].replace(",", ".")), Number(m[2].replace(",", ".")), origine ? origine[2] : 0], en);
});

// ————————————————————————————————————————————— Modifier —————————————————————————————————————————————

planche.sur("commande.modifier", async (d) => {
  const en = d && d.langue === "en";
  unites = await planche.unites.lire();
  if (await horsRacine(en)) return false;
  const sel = await planche.selection.lire();
  const lu = sel.length === 1 ? await planche.donnees.lire(sel[0], CLE) : null;
  if (!lu || !lu.origine) {
    await planche.message.afficher(t(en, "Sélectionnez une seule trame posée par « Trame d'axes ».", "Select a single grid placed by \"Grid lines\"."), "alerte");
    return false;
  }
  const r = await demanderReglages(en, lu);
  if (!r) return false;
  await planche.operation.ouvrir(t(en, "Modifier la trame", "Edit the grid"));
  await planche.objets.verrouiller([sel[0]], false);
  await planche.modele.effacer([sel[0]]);
  const deja = await planche.annotations.lire();
  const existe = new Set([...deja.cotes, ...deja.textes].map((x) => x.id));
  const aEffacer = (lu.annotations || []).filter((id) => existe.has(id));
  if (aEffacer.length) await planche.annotations.effacer(aEffacer);
  const { p } = await poser(r, lu.origine, en);
  await planche.operation.valider();
  reglages = r;
  await planche.message.afficher(t(en, `Trame reposée : ${p.nx} × ${p.ny} files.`, `Grid placed again: ${p.nx} × ${p.ny} grid lines.`));
  return true;
});
