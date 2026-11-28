// Extension « Échanges DXF » (catalogue des extensions, cas 3, lot 1 ; maquettes validées le 27 novembre 2026).
// Trois commandes : reprendre un plan DXF à l'échelle, écrire le modèle en DXF, écrire un plan masse en figure-fond.
// Protocole 1.1 : fichier lu en flux, segments en lot, vrais arcs, balises créées, lecture du modèle entier.
// Version 1.1 (protocole 1.5) : textes (TEXT, MTEXT), cotes linéaires (DIMENSION) et hachures (HATCH, en faces portant une
// matière à motif) repris à la lecture d'un plan ; textes et cotes du modèle écrits à l'export.
// Rien n'est perdu en silence : chaque entité non reprise est comptée et signalée.

const FR = (d) => !(d && d.langue === "en");
const t = (fr, francais, anglais) => (fr ? francais : anglais);

/** Codes $INSUNITS du DXF → [libellé français, libellé anglais, mètres par unité]. */
const UNITES = {
  1: ["Pouces", "Inches", 0.0254],
  2: ["Pieds", "Feet", 0.3048],
  4: ["Millimètres", "Millimetres", 0.001],
  5: ["Centimètres", "Centimetres", 0.01],
  6: ["Mètres", "Metres", 1],
};
const REPRIS = ["LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "INSERT"];
/** (1.1) Entités annotées, lues à part : leurs codes sont gardés tels quels. */
const ANNOTEES = ["TEXT", "MTEXT", "DIMENSION", "HATCH"];
/** (1.1) Texte d'une annotation de la Planche, en caractères (borne du protocole 1.3). */
const MAX_TEXTE = 200;
const EPS = 1e-9;
/** Segments envoyés par appel à « lignes » : la borne du protocole 1.1 (MAX_SEGMENTS_APPEL). */
const LOT_SEGMENTS = 20000;

// ————————————————————————————————————————————— Lecture du DXF —————————————————————————————————————————————

/**
 * Lit un DXF texte : unité, entités de l'espace objet et de la présentation active, blocs (dont les présentations
 * inactives), noms des présentations. Ne garde que ce qui sert ; le reste est compté par type.
 */
function lireDxf(texte) {
  const l = texte.split(/\r?\n/);
  const paires = [];
  for (let i = 0; i + 1 < l.length; i += 2) paires.push([Number(l[i].trim()), l[i + 1].trim()]);
  const res = { unite: 0, entites: [], blocs: {}, presentations: [], enregistrements: {} };
  let section = null;
  let table = null;
  let bloc = null;
  let ent = null;
  let poly = null;
  let enreg = null;
  const ranger = (e) => (bloc ? bloc.entites : res.entites).push(e);
  const fermer = () => {
    if (!ent) return;
    if (ent.type === "LAYOUT") {
      if (ent.nom && ent.nom !== "Model") res.presentations.push({ nom: ent.nom, enregistrement: ent.enregistrement || "" });
    } else if (ent.type === "VERTEX") {
      if (poly) poly.pts.push(ent.pts[0] || [0, 0]), poly.bombes.push(ent.bombe || 0);
    } else if (ent.type === "BLOCK") {
      // en-tête de bloc : déjà rangé dans `bloc`
    } else if (ent.type === "SEQEND") {
      poly = null;
    } else {
      if (ent.type === "POLYLINE") poly = ent;
      ranger(ent);
    }
    ent = null;
  };
  for (let i = 0; i < paires.length; i++) {
    const [c, v] = paires[i];
    if (c === 0) {
      fermer();
      if (enreg) {
        if (enreg.handle) res.enregistrements[enreg.handle] = enreg.nom;
        enreg = null;
      }
      if (v === "SECTION") {
        section = paires[i + 1] ? paires[i + 1][1] : null;
        continue;
      }
      if (v === "ENDSEC") {
        section = null;
        continue;
      }
      if (section === "TABLES" && v === "TABLE") {
        table = paires[i + 1] ? paires[i + 1][1] : null;
        continue;
      }
      if (section === "TABLES" && v === "BLOCK_RECORD" && table === "BLOCK_RECORD") {
        enreg = { handle: "", nom: "" };
        continue;
      }
      if (section === "BLOCKS" && v === "BLOCK") {
        bloc = { nom: "", entites: [], base: [0, 0], enregistrement: "" };
        ent = { type: "BLOCK", pts: [] };
        continue;
      }
      if (section === "BLOCKS" && v === "ENDBLK") {
        if (bloc) res.blocs[bloc.nom] = bloc;
        bloc = null;
        continue;
      }
      if (section === "OBJECTS" && v === "LAYOUT") {
        ent = { type: "LAYOUT", nom: "", enregistrement: "" };
        continue;
      }
      if (section === "ENTITIES" || (section === "BLOCKS" && bloc)) ent = { type: v, calque: "0", pts: [], bombes: [], brut: ANNOTEES.includes(v) ? [] : null };
      continue;
    }
    if (enreg) {
      if (c === 5) enreg.handle = v;
      else if (c === 2) enreg.nom = v;
      continue;
    }
    if (section === "HEADER" && c === 9 && v === "$INSUNITS" && paires[i + 1]) res.unite = Number(paires[i + 1][1]);
    if (!ent) continue;
    if (ent.type === "BLOCK") {
      if (c === 2) bloc.nom = v;
      else if (c === 10) bloc.base[0] = Number(v);
      else if (c === 20) bloc.base[1] = Number(v);
      else if (c === 330) bloc.enregistrement = v;
      continue;
    }
    if (ent.type === "LAYOUT") {
      if (c === 1) ent.nom = v;
      else if (c === 330) ent.enregistrement = v; // le dernier 330 de l'objet désigne l'enregistrement de son bloc
      continue;
    }
    if (ent.brut) ent.brut.push([c, v]);
    if (c === 8) ent.calque = v;
    else if (c === 2) ent.nom = v;
    else if ((c === 10 || c === 20) && ent.type === "POLYLINE") continue; // point factice de l'en-tête : les sommets sont les VERTEX
    else if (c === 10) ent.pts.push([Number(v), 0]), ent.bombes.push(0);
    else if (c === 20 && ent.pts.length) ent.pts[ent.pts.length - 1][1] = Number(v);
    else if (c === 11) ent.fin = [Number(v), 0];
    else if (c === 21 && ent.fin) ent.fin[1] = Number(v);
    else if (c === 40) ent.r = Number(v);
    else if (c === 41) ent.ex = Number(v);
    else if (c === 42) {
      if (ent.type === "INSERT") ent.ey = Number(v);
      else if (ent.type === "VERTEX") ent.bombe = Number(v);
      else if (ent.bombes.length) ent.bombes[ent.bombes.length - 1] = Number(v);
    } else if (c === 50) ent.a0 = Number(v);
    else if (c === 51) ent.a1 = Number(v);
    else if (c === 70) ent.drapeaux = Number(v);
    else if (c === 67) ent.papier = Number(v) === 1;
  }
  fermer();
  return res;
}

/** Entités de l'espace choisi : espace objet, ou présentation (active : dans ENTITIES ; inactive : son bloc). */
function entitesEspace(dxf, espace) {
  if (espace === "objet") return dxf.entites.filter((e) => !e.papier);
  const p = dxf.presentations.find((x) => x.nom === espace);
  const nomBloc = p ? dxf.enregistrements[p.enregistrement] : undefined;
  if (nomBloc && nomBloc !== "*Paper_Space" && dxf.blocs[nomBloc]) return dxf.blocs[nomBloc].entites;
  return dxf.entites.filter((e) => e.papier);
}

// —————————————————————————————————————————————— Géométrie plane ——————————————————————————————————————————————

/** Transformation 2D d'une insertion : échelle, rotation (degrés), position. */
const transformer = (p, tr) => {
  if (!tr) return p;
  const x = (p[0] - tr.base[0]) * tr.ex;
  const y = (p[1] - tr.base[1]) * tr.ey;
  const c = Math.cos(tr.rot);
  const s = Math.sin(tr.rot);
  return [tr.pos[0] + x * c - y * s, tr.pos[1] + x * s + y * c];
};
const composer = (externe, interne) => (p) => externe(interne(p));

/** Point milieu d'un arc de polyligne défini par sa « bombe » (tangente du quart de l'angle). */
function milieuBombe(a, b, bombe) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fleche = (bombe * Math.hypot(dx, dy)) / 2;
  const n = Math.hypot(dx, dy) || 1;
  return [mx + (dy / n) * fleche, my - (dx / n) * fleche];
}

/** Points d'un arc de cercle passant par a, m et b (plan), pour le poser en segments (24 par tour au moins). */
function pointsArc(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < EPS) return [a, b];
  const n2 = (p) => p[0] * p[0] + p[1] * p[1];
  const c = [(n2(a) * (m[1] - b[1]) + n2(m) * (b[1] - a[1]) + n2(b) * (a[1] - m[1])) / d, (n2(a) * (b[0] - m[0]) + n2(m) * (a[0] - b[0]) + n2(b) * (m[0] - a[0])) / d];
  const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const tour = 2 * Math.PI;
  const n = (v) => ((v % tour) + tour) % tour;
  // Sens : celui qui passe par m.
  const ccw = n(ang(m) - ang(a)) <= n(ang(b) - ang(a));
  const balayage = ccw ? n(ang(b) - ang(a)) || tour : -(n(ang(a) - ang(b)) || tour);
  const k = Math.max(2, Math.ceil((Math.abs(balayage) / tour) * 24));
  const pts = [];
  for (let i = 0; i <= k; i++) pts.push(i === k ? b : [c[0] + r * Math.cos(ang(a) + (balayage * i) / k), c[1] + r * Math.sin(ang(a) + (balayage * i) / k)]);
  return pts;
}

// ———————————————————————————————————— (1.1) Textes, cotes et hachures lus ————————————————————————————————————

/** Valeurs d'une entité annotée : première valeur d'un code, en texte ou en nombre. */
const code = (e, c) => {
  const x = e.brut.find((p) => p[0] === c);
  return x ? x[1] : undefined;
};
const nbr = (e, c, d = 0) => {
  const x = code(e, c);
  return x === undefined || !Number.isFinite(Number(x)) ? d : Number(x);
};

/** Texte lisible : mise en forme MTEXT retirée, \U+XXXX et %%c, %%d, %%p décodés, blancs resserrés. */
function texteLisible(t) {
  return String(t)
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, "\u0000")
    .replace(/\\[Pp]/g, " ")
    .replace(/\\~/g, " ")
    .replace(/\\S([^;]*);/g, (_, x) => x.replace(/[\^#]/g, "/"))
    .replace(/\\[ACFHQTWfacfhqtw][^;]*;/g, "")
    .replace(/\\[LlOoKkNn]/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[cC]/g, "Ø")
    .replace(/%%[dD]/g, "°")
    .replace(/%%[pP]/g, "±")
    .replace(/%%%/g, "%")
    .replace(/\u0000/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
}

/** TEXT ou MTEXT : point d'insertion (ou d'alignement) et texte lisible. */
function texteDe(e) {
  const brut = e.type === "MTEXT" ? e.brut.filter((p) => p[0] === 3).map((p) => p[1]).join("") + (code(e, 1) || "") : code(e, 1) || "";
  const aligne = e.type === "TEXT" && (nbr(e, 72) !== 0 || nbr(e, 73) !== 0) && code(e, 11) !== undefined;
  return { p: aligne ? [nbr(e, 11), nbr(e, 21)] : [nbr(e, 10), nbr(e, 20)], texte: texteLisible(brut) };
}

/**
 * DIMENSION linéaire : points d'attache (13, 14) et point de la ligne de cote (10). Une cote tournée à 0° ou 90° devient
 * horizontale ou verticale ; une cote alignée reste alignée ; angulaire, rayon, diamètre, ordonnée et autre angle : `null`.
 */
function coteDe(e) {
  const genre = nbr(e, 70) & 7;
  if (genre !== 0 && genre !== 1) return { motif: "genre" };
  const a = [nbr(e, 13), nbr(e, 23)];
  const b = [nbr(e, 14), nbr(e, 24)];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < EPS) return { motif: "nulle" };
  let direction = "alignee";
  if (genre === 0) {
    const ang = (((nbr(e, 50) % 180) + 180) % 180 + 180) % 180;
    if (ang < 1e-6 || Math.abs(ang - 180) < 1e-6) direction = "horizontale";
    else if (Math.abs(ang - 90) < 1e-6) direction = "verticale";
    else {
      // Cote tournée : elle n'est juste que si elle suit la droite de ses deux points (alors elle est alignée).
      const d = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      if (Math.abs((((d - ang) % 180) + 180) % 180) > 1e-6 && Math.abs(((((d - ang) % 180) + 180) % 180) - 180) > 1e-6) return { motif: "angle" };
    }
  }
  return { a, b, pos: [nbr(e, 10), nbr(e, 20)], direction };
}

/** Points d'un arc de centre c, de rayon r, de a0 à a1 (radians, sens trigonométrique), 24 par tour au moins. */
function pointsAngles(c, r, a0, a1, rx = null) {
  const k = Math.max(2, Math.ceil((Math.abs(a1 - a0) / (2 * Math.PI)) * 24));
  const pts = [];
  for (let i = 0; i <= k; i++) {
    const a = a0 + ((a1 - a0) * i) / k;
    pts.push(rx ? [c[0] + rx[0][0] * Math.cos(a) + rx[1][0] * Math.sin(a), c[1] + rx[0][1] * Math.cos(a) + rx[1][1] * Math.sin(a)] : [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * HATCH : contours (polylignes, droites, arcs, ellipses ; une spline rend la hachure illisible), aplat plein ou motif
 * (familles 53 angle, 43 et 44 origine, 45 et 46 décalage, 49 tirets, en unités du dessin).
 */
function hachureDe(e) {
  const b = e.brut;
  const res = { plein: false, nom: e.nom || "", boucles: [], familles: [], illisible: false };
  let i = b.findIndex((p) => p[0] === 91);
  const avant = b.slice(0, i < 0 ? b.length : i);
  res.plein = avant.some((p) => p[0] === 70 && Number(p[1]) === 1);
  if (i < 0) return { ...res, illisible: true };
  const n = Number(b[i][1]);
  i++;
  const num = (c) => {
    if (!b[i] || b[i][0] !== c) throw new Error("code " + c);
    return Number(b[i++][1]);
  };
  const opt = (c, d) => (b[i] && b[i][0] === c ? Number(b[i++][1]) : d);
  const rad = (d) => (d * Math.PI) / 180;
  try {
    for (let k = 0; k < n; k++) {
      const drapeaux = num(92);
      const pts = [];
      if (drapeaux & 2) {
        const bombees = num(72);
        num(73);
        const nv = num(93);
        const s = [];
        for (let j = 0; j < nv; j++) {
          const x = num(10);
          const y = num(20);
          s.push([x, y, bombees ? opt(42, 0) : 0]);
        }
        for (let j = 0; j < s.length; j++) {
          const a = [s[j][0], s[j][1]];
          const c = [s[(j + 1) % s.length][0], s[(j + 1) % s.length][1]];
          pts.push(a);
          if (Math.abs(s[j][2]) > EPS) pts.push(...pointsArc(a, milieuBombe(a, c, s[j][2]), c).slice(1, -1));
        }
      } else {
        const ne = num(93);
        for (let j = 0; j < ne; j++) {
          const t = num(72);
          if (t === 1) {
            const a = [num(10), num(20)];
            num(11);
            num(21);
            pts.push(a);
          } else if (t === 2) {
            const c = [num(10), num(20)];
            const r = num(40);
            let a0 = rad(num(50));
            let a1 = rad(num(51));
            const trigo = opt(73, 1);
            if (!trigo) [a0, a1] = [-a0, -a1];
            if (trigo && a1 <= a0) a1 += 2 * Math.PI;
            if (!trigo && a1 >= a0) a1 -= 2 * Math.PI;
            pts.push(...pointsAngles(c, r, a0, a1).slice(0, -1));
          } else if (t === 3) {
            const c = [num(10), num(20)];
            const maj = [num(11), num(21)];
            const rapport = num(40);
            let a0 = rad(num(50));
            let a1 = rad(num(51));
            const trigo = opt(73, 1);
            if (!trigo) [a0, a1] = [-a0, -a1];
            if (trigo && a1 <= a0) a1 += 2 * Math.PI;
            if (!trigo && a1 >= a0) a1 -= 2 * Math.PI;
            pts.push(...pointsAngles(c, 0, a0, a1, [maj, [-maj[1] * rapport, maj[0] * rapport]]).slice(0, -1));
          } else throw new Error("spline");
        }
      }
      const ns = opt(97, 0);
      for (let j = 0; j < ns && b[i] && b[i][0] === 330; j++) i++;
      if (pts.length >= 3) res.boucles.push(pts);
    }
    if (!res.plein) {
      while (b[i] && b[i][0] !== 78 && b[i][0] !== 98) i++;
      const nl = opt(78, 0);
      for (let j = 0; j < nl; j++) {
        const f = { angle: num(53), x0: num(43), y0: num(44), ox: num(45), oy: num(46), tirets: [] };
        const nt = num(79);
        for (let q = 0; q < nt; q++) f.tirets.push(num(49));
        res.familles.push(f);
      }
    }
  } catch {
    res.illisible = true;
  }
  return res;
}

/**
 * Famille de motif de la Planche (mm papier, comme un .pat) depuis une ligne de motif DXF (unités du dessin, décalage
 * dans le repère du dessin) : `k` mètres par unité, tracé à l'échelle 1:`echelle`. `null` si le pas est nul.
 */
function familleMotif(f, k, echelle) {
  const a = (f.angle * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const nrm = [-u[1], u[0]];
  const mm = (v) => Number(((v * k * 1000) / echelle).toFixed(6));
  const dy = -(f.ox * nrm[0] + f.oy * nrm[1]);
  if (Math.abs(dy) < EPS) return null;
  return { angle: f.angle, x0: mm(f.x0), y0: mm(-f.y0), dx: mm(f.ox * u[0] + f.oy * u[1]), dy: mm(dy), tirets: f.tirets.slice(0, 32).map(mm) };
}

/** Point dans un polygone (plan), règle pair-impair. */
function dedansPolygone(q, poly) {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) dedans = !dedans;
  }
  return dedans;
}

// ——————————————————————————————————————————————— Reprise d'un plan ———————————————————————————————————————————————

planche.sur("commande.importer", async (d) => {
  const fr = FR(d);
  const f = await planche.fichiers.ouvrir([".dxf"], { flux: true });
  if (!f) return null;
  const dxf = lireDxf(await f.texte());
  const lue = UNITES[dxf.unite];
  const calquesDe = (liste) => [...new Set(liste.filter((e) => REPRIS.includes(e.type) || ANNOTEES.includes(e.type)).map((e) => e.calque))];
  const objet = entitesEspace(dxf, "objet");
  const calques = calquesDe(objet);
  // (1.1) Annotations du fichier, comptées dans l'espace objet et dans les blocs qu'il insère.
  const toutes = [...objet, ...Object.values(dxf.blocs).filter((x) => !x.nom.startsWith("*")).flatMap((x) => x.entites)];
  const nb = (types) => toutes.filter((e) => types.includes(e.type)).length;
  const nTextes = nb(["TEXT", "MTEXT"]);
  const nCotes = nb(["DIMENSION"]);
  const nHachures = nb(["HATCH"]);
  const avecMotif = toutes.some((e) => e.type === "HATCH" && !hachureDe(e).plein);
  const choixUnite = [4, 5, 6, 1, 2].map((u) => ({
    valeur: String(u),
    libelle: UNITES[u][fr ? 0 : 1] + (u === dxf.unite ? t(fr, " (lue dans le fichier)", " (read from the file)") : ""),
  }));
  const r = await planche.saisie.demander(t(fr, "Importer un plan DXF", "Import a DXF plan"), [
    {
      id: "unite",
      libelle: lue ? t(fr, "Unité du fichier", "File unit") : t(fr, "Unité du fichier (non indiquée dans le fichier : à choisir)", "File unit (not stated in the file: choose)"),
      genre: "choix",
      valeur: lue ? String(dxf.unite) : "4",
      choix: choixUnite,
    },
    {
      id: "espace",
      libelle: t(fr, "Espace à importer", "Drawing space"),
      genre: "choix",
      valeur: "objet",
      choix: [{ valeur: "objet", libelle: t(fr, "Espace objet (le dessin)", "Model space (the drawing)") }, ...dxf.presentations.map((p) => ({ valeur: p.nom, libelle: t(fr, "Présentation « " + p.nom + " »", "Layout “" + p.nom + "”") }))],
    },
    {
      id: "pose",
      libelle: t(fr, "Pose", "Placement"),
      genre: "choix",
      valeur: "sol",
      choix: [
        { valeur: "sol", libelle: t(fr, "À plat, sur le sol", "Flat, on the ground") },
        { valeur: "vertical", libelle: t(fr, "Debout, sur l'arête sélectionnée", "Upright, on the selected edge") },
      ],
    },
    { id: "balises", libelle: t(fr, "Calques en balises (", "Layers as tags (") + calques.length + ")", genre: "case", valeur: true },
    { id: "blocs", libelle: t(fr, "Blocs en composants", "Blocks as components"), genre: "case", valeur: true },
    { id: "textes", libelle: t(fr, "Textes (TEXT, MTEXT) : ", "Texts (TEXT, MTEXT): ") + nTextes, genre: "case", valeur: nTextes > 0 },
    { id: "cotes", libelle: t(fr, "Cotes linéaires (DIMENSION) : ", "Linear dimensions (DIMENSION): ") + nCotes, genre: "case", valeur: nCotes > 0 },
    { id: "hachures", libelle: t(fr, "Hachures en faces avec matière (HATCH) : ", "Hatches as faces with a material (HATCH): ") + nHachures, genre: "case", valeur: nHachures > 0 },
    ...(avecMotif ? [{ id: "echelle", libelle: t(fr, "Échelle de tracé des motifs de hachure (1:…)", "Hatch pattern plotting scale (1:…)"), genre: "nombre", valeur: 50, min: 1, max: 10000, unite: null }] : []),
  ]);
  if (!r) return null;
  const k = UNITES[Number(r.unite)][2];
  const echelle = Number(r.echelle) || 1;

  // Repère de pose : à plat (X, Y du plan) ou debout sur l'arête sélectionnée (X le long de l'arête, Y vertical).
  let origine = [0, 0, 0];
  let ex = [1, 0, 0];
  let ey = [0, 1, 0];
  if (r.pose === "vertical") {
    const sel = await planche.selection.lire();
    const m = await planche.modele.lire();
    const arete = sel.length === 1 ? m.aretes.find((a) => a.id === sel[0]) : undefined;
    const a = arete ? arete.points[0] : null;
    const b = arete ? arete.points[1] : null;
    const h = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0;
    if (!arete || h < EPS) {
      await planche.message.afficher(t(fr, "Pose debout : sélectionnez une seule arête, non verticale, puis relancez la commande.", "Upright placement: select a single non-vertical edge, then run the command again."), "alerte");
      return null;
    }
    origine = a;
    ex = [(b[0] - a[0]) / h, (b[1] - a[1]) / h, 0];
    ey = [0, 0, 1];
  }
  const normale = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  const P = (p) => [origine[0] + (ex[0] * p[0] + ey[0] * p[1]) * k, origine[1] + (ex[1] * p[0] + ey[1] * p[1]) * k, origine[2] + (ex[2] * p[0] + ey[2] * p[1]) * k];

  await planche.operation.ouvrir(t(fr, "Importer ", "Import ") + f.nom);
  let traits = 0;
  let arcs = 0;
  let blocs = 0;
  let eclates = 0;
  let enSegments = 0;
  const omis = {};
  // (1.1) Bilan des annotations : reprises, et non reprises avec leur motif.
  const bilan = { textes: 0, coupes: 0, vides: 0, cotes: 0, cotesGenre: 0, cotesAngle: 0, hachures: 0, hachuresIllisibles: 0, sansMotif: 0 };
  // Tracés différés, par calque : chaque calque est tracé puis groupé aussitôt, pour qu'il ne se fonde pas aux autres.
  let parCalque = {};
  const du = (c) => (parCalque[c] ||= { segs: [], courbes: [], objets: [], textes: [], cotes: [], hachures: [] });
  /** Direction d'une cote dans le monde : axe X, Y ou Z si le vecteur `v` (monde) en suit un, sinon `null`. */
  const axeMonde = (v) => {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    const i = [0, 1, 2].find((j) => Math.abs(Math.abs(v[j] / n) - 1) < 1e-6);
    return i === undefined ? null : ["axe-x", "axe-y", "axe-z"][i];
  };

  /**
   * Range une entité dans le calque `calque`, à travers la transformation 2D `T`. `deforme` : une insertion en amont
   * a des échelles X et Y différentes ; un cercle n'y reste pas un cercle, les courbes sont alors posées en segments.
   */
  const dessiner = (e, calque, T, profondeur, deforme = false) => {
    const q = (p) => P(T(p));
    const x = du(calque);
    const courbe = (a, m, b) => {
      if (!deforme) return void x.courbes.push(["arc", q(a), q(m), q(b)]);
      const pts = pointsArc(a, m, b);
      for (let i = 0; i + 1 < pts.length; i++) x.segs.push([q(pts[i]), q(pts[i + 1])]);
      enSegments++;
    };
    if (e.type === "LINE") {
      if (e.pts[0] && e.fin) x.segs.push([q(e.pts[0]), q(e.fin)]), traits++;
      return;
    }
    if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const p = e.pts;
      const ferme = (e.drapeaux || 0) & 1;
      const n = ferme ? p.length : p.length - 1;
      for (let i = 0; i < n; i++) {
        const a = p[i];
        const b = p[(i + 1) % p.length];
        const bombe = e.bombes[i] || 0;
        if (Math.abs(bombe) > EPS) courbe(a, milieuBombe(a, b, bombe), b), arcs++;
        else x.segs.push([q(a), q(b)]);
      }
      traits++;
      return;
    }
    if (e.type === "CIRCLE" || e.type === "ARC") {
      const c = e.pts[0] || [0, 0];
      const pt = (a) => [c[0] + e.r * Math.cos(a), c[1] + e.r * Math.sin(a)];
      if (e.type === "CIRCLE" && deforme) {
        courbe(pt(0), pt(Math.PI / 2), pt(Math.PI));
        courbe(pt(Math.PI), pt((3 * Math.PI) / 2), pt(2 * Math.PI));
        enSegments--;
      } else if (e.type === "CIRCLE") {
        // Centre et un point du cercle, transformés : le rayon suit une insertion à l'échelle uniforme.
        const p0 = q(pt(0));
        const pc = q(c);
        x.courbes.push(["cercle", pc, Math.hypot(p0[0] - pc[0], p0[1] - pc[1], p0[2] - pc[2]), normale]);
      } else {
        const a0 = ((e.a0 || 0) * Math.PI) / 180;
        let a1 = ((e.a1 === undefined ? 360 : e.a1) * Math.PI) / 180;
        if (a1 <= a0) a1 += 2 * Math.PI;
        courbe(pt(a0), pt((a0 + a1) / 2), pt(a1));
      }
      arcs++;
      return;
    }
    if (e.type === "TEXT" || e.type === "MTEXT") {
      if (!r.textes) return void (omis[e.type] = (omis[e.type] || 0) + 1);
      const tx = texteDe(e);
      if (!tx.texte) return void bilan.vides++;
      if (tx.texte.length > MAX_TEXTE) bilan.coupes++;
      x.textes.push({ p: q(tx.p), texte: tx.texte.slice(0, MAX_TEXTE) });
      return;
    }
    if (e.type === "DIMENSION") {
      if (!r.cotes) return void (omis.DIMENSION = (omis.DIMENSION || 0) + 1);
      const cd = coteDe(e);
      if (!cd.a) return void (cd.motif === "genre" ? bilan.cotesGenre++ : bilan.cotesAngle++);
      const [a, b, pos] = [q(cd.a), q(cd.b), q(cd.pos)];
      let direction = "alignee";
      if (cd.direction !== "alignee") {
        const o = q([0, 0]);
        const u = q(cd.direction === "horizontale" ? [1, 0] : [0, 1]);
        direction = axeMonde([u[0] - o[0], u[1] - o[1], u[2] - o[2]]);
        if (!direction) return void bilan.cotesAngle++;
      }
      x.cotes.push({ a, b, pos, direction });
      return;
    }
    if (e.type === "HATCH") {
      if (!r.hachures) return void (omis.HATCH = (omis.HATCH || 0) + 1);
      const h = hachureDe(e);
      if (h.illisible || !h.boucles.length) return void bilan.hachuresIllisibles++;
      x.hachures.push({ ...h, boucles: h.boucles.map((bc) => bc.map(q)) });
      return;
    }
    if (e.type === "INSERT") {
      const b = dxf.blocs[e.nom];
      if (!b || profondeur > 8) {
        omis.INSERT = (omis.INSERT || 0) + 1;
        return;
      }
      const tr = { base: b.base, pos: e.pts[0] || [0, 0], ex: e.ex ?? 1, ey: e.ey ?? e.ex ?? 1, rot: ((e.a0 || 0) * Math.PI) / 180 };
      const autre = deforme || Math.abs(Math.abs(tr.ex) - Math.abs(tr.ey)) > EPS;
      for (const s of b.entites) dessiner(s, s.calque === "0" ? calque : s.calque, composer(T, (p) => transformer(p, tr)), profondeur + 1, autre);
      return;
    }
    omis[e.type] = (omis[e.type] || 0) + 1;
  };

  /** Identifiants des faces et arêtes libres du contenu ouvert. */
  const libres = async () => {
    const m = await planche.modele.lire();
    return new Set([...m.aretes.map((a) => a.id), ...m.faces.map((f) => f.id)]);
  };
  /** Trace les tracés différés `x` ; rend ce qu'ils ont créé (après d'éventuelles coupes entre eux). */
  const tracer = async (x) => {
    const avant = await libres();
    for (const c of x.courbes) {
      if (c[0] === "arc") await planche.modele.arc(c[1], c[2], c[3]);
      else await planche.modele.cercle(c[1], c[2], c[3]);
    }
    for (let i = 0; i < x.segs.length; i += LOT_SEGMENTS) await planche.modele.lignes(x.segs.slice(i, i + LOT_SEGMENTS));
    return [...(await libres())].filter((id) => !avant.has(id));
  };

  /** (1.1) Plan de pose : coordonnées (le long de ex, le long de ey) d'un point du monde. */
  const plan = (p) => {
    const d = [p[0] - origine[0], p[1] - origine[1], p[2] - origine[2]];
    return [d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2], d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2]];
  };
  const matieres = {};
  /** (1.1) Matière d'une hachure : aplat plein, ou motif repris du fichier (une par nom de motif). */
  const matiereDe = async (h) => {
    const cle = h.plein ? "*plein" : h.nom || "DXF";
    if (matieres[cle]) return matieres[cle];
    let motif;
    if (!h.plein) {
      const familles = h.familles.map((y) => familleMotif(y, k, echelle)).filter(Boolean).slice(0, 64);
      if (familles.length) motif = await planche.motifs.creer(cle, familles, f.nom);
      else bilan.sansMotif++;
    }
    matieres[cle] = await planche.matieres.creer(h.plein ? t(fr, "Aplat plein (DXF)", "Solid fill (DXF)") : t(fr, "Hachure ", "Hatch ") + cle + " (DXF)", h.plein ? "#8c8c8c" : "#d9d9d9", motif);
    return matieres[cle];
  };
  /**
   * (1.1) Pose les contours d'une hachure (faces automatiques), puis donne sa matière aux faces qui sont dedans
   * (règle pair-impair : une île reste vide). Rend ce qu'elle a créé.
   */
  const poserHachure = async (h) => {
    const avant = await libres();
    const segs = [];
    for (const bc of h.boucles) for (let i = 0; i < bc.length; i++) segs.push([bc[i], bc[(i + 1) % bc.length]]);
    for (let i = 0; i < segs.length; i += LOT_SEGMENTS) await planche.modele.lignes(segs.slice(i, i + LOT_SEGMENTS));
    const m = await planche.modele.lire();
    const boucles = h.boucles.map((bc) => bc.map(plan));
    const pleines = m.faces.filter((fa) => {
      const tri = trianguler(fa.points.map(plan));
      if (!tri.length) return false;
      const [a, b, c] = tri[0];
      const g = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
      return boucles.filter((bp) => dedansPolygone(g, bp)).length % 2 === 1;
    });
    if (pleines.length) await planche.matieres.appliquer(pleines.map((fa) => fa.id), await matiereDe(h));
    bilan.hachures++;
    return [...m.faces.map((fa) => fa.id), ...m.aretes.map((a) => a.id)].filter((id) => !avant.has(id));
  };

  // Blocs en composants : une définition par bloc, une occurrence par insertion (copiée, déplacée, tournée).
  const modeles = {};
  const poserBloc = async (e) => {
    const b = dxf.blocs[e.nom];
    const ex1 = e.ex ?? 1;
    const ey1 = e.ey ?? ex1;
    if (!b || Math.abs(ex1 - 1) > EPS || Math.abs(ey1 - 1) > EPS) return false; // échelle : posé éclaté
    const pos = e.pts[0] || [0, 0];
    const rot = e.a0 || 0;
    let id;
    if (!modeles[e.nom]) {
      const sauve = parCalque;
      parCalque = {};
      for (const s of b.entites) dessiner(s, "0", (p) => [p[0] - b.base[0] + pos[0], p[1] - b.base[1] + pos[1]], 1);
      const tout = { segs: [], courbes: [] };
      for (const x of Object.values(parCalque)) tout.segs.push(...x.segs), tout.courbes.push(...x.courbes);
      parCalque = sauve;
      const crees = await tracer(tout);
      if (!crees.length) return false;
      id = await planche.modele.composant(crees, e.nom);
      modeles[e.nom] = { id, pos, rot };
      if (Math.abs(rot) > EPS) await planche.modele.tourner([id], P(pos), normale, rot);
    } else {
      const m = modeles[e.nom];
      const a = P(m.pos);
      const b2 = P(pos);
      const copies = await planche.modele.copier([m.id], [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]]);
      id = copies[0];
      if (Math.abs(rot - m.rot) > EPS) await planche.modele.tourner([id], b2, normale, rot - m.rot);
    }
    du(e.calque).objets.push(id);
    blocs++;
    return true;
  };

  const identite = (p) => p;
  for (const e of entitesEspace(dxf, r.espace)) {
    if (e.type === "INSERT") {
      if (r.blocs && (await poserBloc(e))) continue;
      if (dxf.blocs[e.nom]) eclates++;
    }
    dessiner(e, e.calque, identite, 0);
  }

  const ids = {};
  for (const [c, x] of Object.entries(parCalque)) {
    const crees = [...(await tracer(x)), ...x.objets];
    for (const h of x.hachures) crees.push(...(await poserHachure(h)));
    const annote = x.textes.length + x.cotes.length > 0;
    if (!crees.length && !annote) continue;
    if (r.balises) ids[c] = await planche.balises.creer(c);
    if (crees.length) {
      const g = await planche.modele.grouper([...new Set(crees)], c);
      if (r.balises) await planche.balises.appliquer([g], ids[c]);
    }
    // Textes et cotes : annotations de la Planche, cachées avec la balise de leur calque.
    for (const tx of x.textes) await planche.textes.creer(tx.p, tx.p, tx.texte, ids[c]);
    for (const cd of x.cotes) await planche.cotes.creer(cd.a, cd.b, cd.pos, cd.direction, ids[c]);
    bilan.textes += x.textes.length;
    bilan.cotes += x.cotes.length;
  }
  await planche.operation.valider();

  const n = Object.keys(ids).length;
  await planche.message.afficher(
    t(fr, "Plan repris : ", "Plan imported: ") + traits + t(fr, " traits, ", " lines, ") + arcs + t(fr, " arcs et cercles, ", " arcs and circles, ") + blocs + t(fr, " blocs, ", " blocks, ") + n + t(fr, " calques en balises.", " layers as tags."),
  );
  if (enSegments) await planche.message.afficher(enSegments + t(fr, " courbe(s) de blocs déformés (échelles X et Y différentes) : posée(s) en segments.", " curve(s) in distorted blocks (different X and Y scales): placed as segments."), "alerte");
  if (eclates) await planche.message.afficher(eclates + t(fr, " bloc(s) inséré(s) à une échelle autre que 1 : posé(s) éclaté(s).", " block(s) inserted at a scale other than 1: placed exploded."), "alerte");
  if (bilan.textes + bilan.cotes + bilan.hachures)
    await planche.message.afficher(t(fr, "Annotations reprises : ", "Annotations imported: ") + bilan.textes + t(fr, " textes, ", " texts, ") + bilan.cotes + t(fr, " cotes, ", " dimensions, ") + bilan.hachures + t(fr, " hachures (faces avec matière).", " hatches (faces with a material)."));
  if (bilan.textes) await planche.message.afficher(t(fr, "Textes posés sans leur hauteur ni leur rotation (la Planche ne les porte pas).", "Texts placed without their height or rotation (the Planche does not carry them).") + (bilan.coupes ? t(fr, " " + bilan.coupes + " texte(s) coupé(s) à 200 caractères.", " " + bilan.coupes + " text(s) cut at 200 characters.") : ""), "alerte");
  const nonCotes = bilan.cotesGenre + bilan.cotesAngle;
  if (nonCotes) await planche.message.afficher(nonCotes + t(fr, " cote(s) non reprise(s) : ", " dimension(s) not imported: ") + [bilan.cotesGenre ? bilan.cotesGenre + t(fr, " angulaire(s), de rayon, de diamètre ou d'ordonnée", " angular, radius, diameter or ordinate") : "", bilan.cotesAngle ? bilan.cotesAngle + t(fr, " tournée(s) hors des axes", " rotated off the axes") : ""].filter(Boolean).join(", ") + ".", "alerte");
  if (bilan.hachuresIllisibles) await planche.message.afficher(bilan.hachuresIllisibles + t(fr, " hachure(s) non reprise(s) : contour en spline ou illisible.", " hatch(es) not imported: spline or unreadable boundary."), "alerte");
  if (bilan.sansMotif) await planche.message.afficher(bilan.sansMotif + t(fr, " motif(s) sans définition dans le fichier : matière sans motif.", " pattern(s) with no definition in the file: material without a pattern."), "alerte");
  const o = Object.entries(omis).map(([type, nb]) => nb + " " + type).join(", ");
  if (o) await planche.message.afficher(t(fr, "Non repris : ", "Not imported: ") + o + ".", "alerte");
  return traits;
});

// ————————————————————————————————————————————————— Écriture DXF —————————————————————————————————————————————————

const nomCalque = (s) => (String(s || "0").replace(/[<>/\\":;?*|=`,]/g, "_").trim() || "0").slice(0, 255);
const nombre = (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toFixed(9))).toString();

/** (1.1) Texte DXF ASCII : hors ASCII en \U+XXXX, sans saut de ligne (comme l'export des feuilles). */
const texteDxf = (s) =>
  [...String(s).replace(/[\r\n]+/g, " ")]
    .map((c) => {
      const n = c.codePointAt(0);
      return n >= 32 && n < 127 ? c : n > 0xffff ? "?" : "\\U+" + n.toString(16).toUpperCase().padStart(4, "0");
    })
    .join("");

/** DXF texte (AC1009, lisible partout) : en-tête avec l'unité, table des calques, blocs (1.1 : ceux des cotes), entités. */
function ecrireDxf(unite, calques, entites, blocs = []) {
  const l = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", String(unite), "0", "ENDSEC"];
  l.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(calques.length));
  for (const c of calques) l.push("0", "LAYER", "2", c, "70", "0", "62", "7", "6", "CONTINUOUS");
  l.push("0", "ENDTAB", "0", "ENDSEC");
  if (blocs.length) {
    l.push("0", "SECTION", "2", "BLOCKS");
    for (const b of blocs) {
      l.push("0", "BLOCK", "8", "0", "2", b.nom, "70", "1", "10", "0", "20", "0", "30", "0", "3", b.nom);
      for (const e of b.entites) l.push(...e);
      l.push("0", "ENDBLK", "8", "0");
    }
    l.push("0", "ENDSEC");
  }
  l.push("0", "SECTION", "2", "ENTITIES");
  for (const e of entites) l.push(...e);
  l.push("0", "ENDSEC", "0", "EOF");
  return l.join("\n") + "\n";
}

const angle = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const dansBalayage = (a0, a1, a) => {
  const tour = 2 * Math.PI;
  const n = (x) => ((x % tour) + tour) % tour;
  return n(a - a0) <= n(a1 - a0) + EPS;
};

planche.sur("commande.exporter", async (d) => {
  const fr = FR(d);
  const r = await planche.saisie.demander(t(fr, "Exporter en DXF", "Export to DXF"), [
    { id: "contenu", libelle: t(fr, "Contenu", "Content"), genre: "choix", valeur: "modele", choix: [{ valeur: "selection", libelle: t(fr, "La sélection", "The selection") }, { valeur: "modele", libelle: t(fr, "Tout le modèle", "The whole model") }] },
    { id: "unite", libelle: t(fr, "Unité déclarée dans le fichier", "Unit declared in the file"), genre: "choix", valeur: "4", choix: [4, 5, 6].map((u) => ({ valeur: String(u), libelle: UNITES[u][fr ? 0 : 1] })) },
    { id: "calques", libelle: t(fr, "Un calque par balise", "One layer per tag"), genre: "case", valeur: true },
    { id: "arcs", libelle: t(fr, "Arcs et cercles en vrais arcs", "Arcs and circles as true arcs"), genre: "case", valeur: true },
    { id: "annotations", libelle: t(fr, "Textes (TEXT) et cotes (DIMENSION) du modèle", "Model texts (TEXT) and dimensions (DIMENSION)"), genre: "case", valeur: true },
    { id: "hauteur", libelle: t(fr, "Hauteur des textes écrits", "Height of written texts"), genre: "nombre", valeur: 0.25, min: 0.01, max: 10, unite: "m" },
    { id: "nom", libelle: t(fr, "Nom du fichier", "File name"), genre: "texte", valeur: "plan.dxf" },
  ]);
  if (!r) return null;
  const k = UNITES[Number(r.unite)][2];
  const m = await planche.modele.lire({ portee: "monde" });
  let aretes = m.aretes;
  if (r.contenu === "selection") {
    const sel = new Set(await planche.selection.lire());
    // Sélection faite à la racine ou dans un groupe ouvert : une arête est retenue si elle-même ou l'une des
    // occurrences de son chemin est sélectionnée.
    aretes = aretes.filter((a) => sel.has(a.id) || a.chemin.some((o) => sel.has(o)));
  }
  if (!aretes.length) {
    await planche.message.afficher(t(fr, "Rien à écrire : aucune arête dans le contenu choisi.", "Nothing to write: no edge in the chosen content."), "alerte");
    return null;
  }
  const noms = {};
  for (const b of await planche.balises.lire()) noms[b.id] = nomCalque(b.nom);
  const calqueDe = (a) => (r.calques && a.balise && noms[a.balise] ? noms[a.balise] : "0");
  const X = (p) => [p[0] / k, p[1] / k, p[2] / k];
  const entites = [];
  const courbes = {};
  let vrais = 0;
  for (const a of aretes) {
    const c = a.courbe;
    const plane = c && Math.abs(Math.abs(c.normale[2]) - 1) < 1e-6;
    if (r.arcs && c && plane && (c.genre === "arc" || c.genre === "cercle")) {
      const cle = a.chemin.join("/") + "#" + c.id;
      (courbes[cle] ||= { courbe: c, calque: calqueDe(a), aretes: [] }).aretes.push(a);
      continue;
    }
    const [p, q] = [X(a.points[0]), X(a.points[1])];
    entites.push(["0", "LINE", "8", calqueDe(a), "10", nombre(p[0]), "20", nombre(p[1]), "30", nombre(p[2]), "11", nombre(q[0]), "21", nombre(q[1]), "31", nombre(q[2])]);
  }
  for (const { courbe: c, calque, aretes: liste } of Object.values(courbes)) {
    const centre = X(c.centre);
    const rayon = c.rayon / k;
    const base = ["8", calque, "10", nombre(centre[0]), "20", nombre(centre[1]), "30", nombre(centre[2]), "40", nombre(rayon)];
    if (c.genre === "cercle") {
      entites.push(["0", "CIRCLE", ...base]);
      vrais++;
      continue;
    }
    // Arc : ses deux bouts sont les sommets qui n'appartiennent qu'à une arête ; le sens se lit au milieu d'une arête.
    const compte = new Map();
    const cle = (p) => p.map((v) => v.toFixed(7)).join(",");
    for (const a of liste) for (const p of a.points) compte.set(cle(p), { p, n: (compte.get(cle(p))?.n || 0) + 1 });
    const bouts = [...compte.values()].filter((x) => x.n === 1).map((x) => x.p);
    if (bouts.length !== 2) {
      for (const a of liste) {
        const [p, q] = [X(a.points[0]), X(a.points[1])];
        entites.push(["0", "LINE", "8", calque, "10", nombre(p[0]), "20", nombre(p[1]), "30", nombre(p[2]), "11", nombre(q[0]), "21", nombre(q[1]), "31", nombre(q[2])]);
      }
      continue;
    }
    let a0 = angle(c.centre, bouts[0]);
    let a1 = angle(c.centre, bouts[1]);
    const mi = liste[0].points;
    const am = angle(c.centre, [(mi[0][0] + mi[1][0]) / 2, (mi[0][1] + mi[1][1]) / 2]);
    if (!dansBalayage(a0, a1, am)) [a0, a1] = [a1, a0];
    entites.push(["0", "ARC", ...base, "50", nombre((a0 * 180) / Math.PI), "51", nombre((a1 * 180) / Math.PI)]);
    vrais++;
  }
  const traitsEcrits = entites.length - vrais;
  // (1.1) Textes et cotes du modèle (toute la planche ; une sélection ne porte pas d'annotation).
  const blocs = [];
  let textesEcrits = 0;
  let cotesEcrites = 0;
  let cotesZ = 0;
  if (r.annotations && r.contenu === "modele") {
    const an = await planche.annotations.lire();
    const h = Number(r.hauteur) / k;
    for (const x of an.textes) {
      const p = X(x.position);
      entites.push(["0", "TEXT", "8", "TEXTES", "10", nombre(p[0]), "20", nombre(p[1]), "30", nombre(p[2]), "40", nombre(h), "1", texteDxf(x.texte)]);
      textesEcrits++;
    }
    for (const c of an.cotes) {
      const [a, b, pos] = [X(c.a), X(c.b), X(c.position)];
      // Alignée et horizontale (composante horizontale) : le long de a → b dans le plan ; axes X et Y : selon l'axe ;
      // verticale (dénivelé) et axe Z : hors du plan DXF.
      const u0 = c.direction === "axe-x" ? [1, 0] : c.direction === "axe-y" ? [0, 1] : c.direction === "alignee" || c.direction === "horizontale" ? [b[0] - a[0], b[1] - a[1]] : null;
      const lu = u0 ? Math.hypot(u0[0], u0[1]) : 0;
      if (!u0 || lu < EPS) {
        cotesZ++;
        continue;
      }
      const u = [u0[0] / lu, u0[1] / lu];
      const nrm = [-u[1], u[0]];
      const pied = (p) => {
        const s = (p[0] - pos[0]) * u[0] + (p[1] - pos[1]) * u[1];
        return [pos[0] + u[0] * s, pos[1] + u[1] * s];
      };
      const [d1, d2] = [pied(a), pied(b)];
      const valeur = Math.abs((b[0] - a[0]) * u[0] + (b[1] - a[1]) * u[1]) * k;
      const texte = await planche.unites.formater(valeur, "longueur");
      const z = nombre(pos[2]);
      const L = (p, q) => ["0", "LINE", "8", "COTES", "10", nombre(p[0]), "20", nombre(p[1]), "30", z, "11", nombre(q[0]), "21", nombre(q[1]), "31", z];
      const tic = (p) => [p[0] + (u[0] + nrm[0]) * h * 0.35, p[1] + (u[1] + nrm[1]) * h * 0.35];
      const ticB = (p) => [p[0] - (u[0] + nrm[0]) * h * 0.35, p[1] - (u[1] + nrm[1]) * h * 0.35];
      const mi = [(d1[0] + d2[0]) / 2 + nrm[0] * h * 0.6, (d1[1] + d2[1]) / 2 + nrm[1] * h * 0.6];
      const angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
      const nomBloc = "*D" + (blocs.length + 1);
      blocs.push({
        nom: nomBloc,
        entites: [
          L(d1, d2),
          L([a[0], a[1]], d1),
          L([b[0], b[1]], d2),
          L(ticB(d1), tic(d1)),
          L(ticB(d2), tic(d2)),
          ["0", "TEXT", "8", "COTES", "10", nombre(mi[0]), "20", nombre(mi[1]), "30", z, "40", nombre(h), "1", texteDxf(texte), "50", nombre(angle), "72", "1", "11", nombre(mi[0]), "21", nombre(mi[1]), "31", z],
        ],
      });
      entites.push(["0", "DIMENSION", "8", "COTES", "2", nomBloc, "10", nombre(d2[0]), "20", nombre(d2[1]), "30", z, "11", nombre(mi[0]), "21", nombre(mi[1]), "31", z, "70", c.direction === "alignee" || c.direction === "horizontale" ? "1" : "0", "1", "", "13", nombre(a[0]), "23", nombre(a[1]), "33", nombre(a[2]), "14", nombre(b[0]), "24", nombre(b[1]), "34", nombre(b[2]), "50", nombre(c.direction === "alignee" || c.direction === "horizontale" ? 0 : angle)]);
      cotesEcrites++;
    }
  }
  const calques = [...new Set(["0", ...entites.map((e) => e[3])])];
  const nom = /\.dxf$/i.test(r.nom) ? r.nom : r.nom + ".dxf";
  const fait = await planche.fichiers.enregistrer(nom, ecrireDxf(Number(r.unite), calques, entites, blocs));
  if (fait) await planche.message.afficher(t(fr, "DXF écrit : ", "DXF written: ") + traitsEcrits + t(fr, " traits, ", " lines, ") + vrais + t(fr, " arcs et cercles, ", " arcs and circles, ") + textesEcrits + t(fr, " textes, ", " texts, ") + cotesEcrites + t(fr, " cotes, ", " dimensions, ") + calques.length + t(fr, " calques.", " layers."));
  if (fait && cotesZ) await planche.message.afficher(cotesZ + t(fr, " cote(s) verticale(s) (axe Z) non écrite(s) : un plan DXF ne les porte pas.", " vertical dimension(s) (Z axis) not written: a DXF plan does not carry them."), "alerte");
  if (fait && r.annotations && r.contenu === "selection") await planche.message.afficher(t(fr, "Sélection : textes et cotes non écrits (ils ne se sélectionnent pas).", "Selection: texts and dimensions not written (they cannot be selected)."), "alerte");
  return fait;
});

/** Triangulation d'un contour simple (plan XY) par découpe d'oreilles ; rend des triangles de points. */
function trianguler(points) {
  const p = points.slice();
  let aire = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    aire += a[0] * b[1] - b[0] * a[1];
  }
  if (aire < 0) p.reverse();
  const vec = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const dedans = (q, a, b, c) => vec(a, b, q) >= -EPS && vec(b, c, q) >= -EPS && vec(c, a, q) >= -EPS;
  const r = [];
  let garde = p.length * p.length;
  while (p.length > 3 && garde-- > 0) {
    let coupe = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length];
      const b = p[i];
      const c = p[(i + 1) % p.length];
      if (vec(a, b, c) <= EPS) continue;
      if (p.some((q) => q !== a && q !== b && q !== c && dedans(q, a, b, c))) continue;
      r.push([a, b, c]);
      p.splice(i, 1);
      coupe = true;
      break;
    }
    if (!coupe) break;
  }
  if (p.length === 3) r.push([p[0], p[1], p[2]]);
  return r;
}

// ————————————————————————————————————————————— Plan masse en figure-fond —————————————————————————————————————————————

planche.sur("commande.figure-fond", async (d) => {
  const fr = FR(d);
  const bal = await planche.balises.lire();
  const aucune = { valeur: "-", libelle: t(fr, "aucune", "none") };
  const liste = bal.map((b) => ({ valeur: b.id, libelle: b.nom }));
  const r = await planche.saisie.demander(t(fr, "Plan masse en figure-fond", "Figure-ground site plan"), [
    { id: "bati", libelle: t(fr, "Bâti en noir plein : balise", "Buildings in solid black: tag"), genre: "choix", valeur: bal[0] ? bal[0].id : "-", choix: liste.length ? liste : [aucune] },
    { id: "voirie", libelle: t(fr, "Voirie en trait : balise", "Roads as lines: tag"), genre: "choix", valeur: "-", choix: [aucune, ...liste] },
    { id: "parcelles", libelle: t(fr, "Parcelles en trait fin : balise", "Plots as thin lines: tag"), genre: "choix", valeur: "-", choix: [aucune, ...liste] },
    { id: "format", libelle: "Format", genre: "choix", valeur: "svg", choix: [{ valeur: "svg", libelle: t(fr, "SVG (image vectorielle)", "SVG (vector image)") }, { valeur: "dxf", libelle: "DXF" }] },
  ]);
  if (!r) return null;
  const m = await planche.modele.lire({ portee: "monde" });
  const faces = r.bati === "-" ? [] : m.faces.filter((f) => f.balise === r.bati);
  const traits = (b) => (b === "-" ? [] : m.aretes.filter((a) => a.balise === b).map((a) => a.points));
  const voirie = traits(r.voirie);
  const parcelles = traits(r.parcelles);
  const pts = [...faces.flatMap((f) => f.points), ...voirie.flat(), ...parcelles.flat()];
  if (!pts.length) {
    await planche.message.afficher(t(fr, "Rien à dessiner : aucune face ni arête sous les balises choisies.", "Nothing to draw: no face or edge under the chosen tags."), "alerte");
    return null;
  }
  const percees = faces.filter((f) => f.trous > 0).length;
  if (r.format === "dxf") {
    const ent = [];
    for (const f of faces) {
      const p = f.points;
      ent.push(["0", "POLYLINE", "8", "BATI", "66", "1", "70", "1", "10", "0", "20", "0", "30", "0", ...p.flatMap((q) => ["0", "VERTEX", "8", "BATI", "10", nombre(q[0]), "20", nombre(q[1]), "30", "0"]), "0", "SEQEND", "8", "BATI"]);
      // Remplissage plein : le contour découpé en triangles (oreilles), un SOLID par triangle, juste aussi en contour concave.
      for (const [a, b, c] of trianguler(p)) ent.push(["0", "SOLID", "8", "BATI", "10", nombre(a[0]), "20", nombre(a[1]), "11", nombre(b[0]), "21", nombre(b[1]), "12", nombre(c[0]), "22", nombre(c[1]), "13", nombre(c[0]), "23", nombre(c[1])]);
    }
    for (const [calque, liste] of [["VOIRIE", voirie], ["PARCELLES", parcelles]]) for (const [a, b] of liste) ent.push(["0", "LINE", "8", calque, "10", nombre(a[0]), "20", nombre(a[1]), "11", nombre(b[0]), "21", nombre(b[1])]);
    const fait = await planche.fichiers.enregistrer("plan-masse.dxf", ecrireDxf(6, ["0", "BATI", "VOIRIE", "PARCELLES"], ent));
    if (fait && percees) await planche.message.afficher(percees + t(fr, " face(s) percée(s) : remplie(s) sans leurs trous.", " face(s) with holes: filled without their holes."), "alerte");
    return fait;
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y1 = Math.max(...ys);
  const w = Math.max(...xs) - x0;
  const h = y1 - Math.min(...ys);
  const mg = Math.max(w, h) * 0.05 || 1;
  const P = (p) => (p[0] - x0 + mg).toFixed(3) + "," + (y1 - p[1] + mg).toFixed(3);
  const ligne = (seg, ep) => {
    const [a, b] = [P(seg[0]).split(","), P(seg[1]).split(",")];
    return '<line stroke="#000" stroke-width="' + ep + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
  };
  // Coordonnées en mètres du modèle (viewBox) ; l'échelle d'impression se choisit à l'usage.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (w + 2 * mg).toFixed(3) + " " + (h + 2 * mg).toFixed(3) + '">\n<rect width="100%" height="100%" fill="#fff"/>\n' +
    faces.map((f) => '<polygon fill="#000" points="' + f.points.map(P).join(" ") + '"/>').join("\n") + "\n" +
    voirie.map((s) => ligne(s, 0.6)).join("\n") + "\n" +
    parcelles.map((s) => ligne(s, 0.15)).join("\n") + "\n</svg>\n";
  const fait = await planche.fichiers.enregistrer("plan-masse.svg", svg);
  if (fait && percees) await planche.message.afficher(percees + t(fr, " face(s) percée(s) : remplie(s) sans leurs trous.", " face(s) with holes: filled without their holes."), "alerte");
  return fait;
});
