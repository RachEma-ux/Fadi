// Extension « Échanges DXF » (catalogue des extensions, cas 3, lot 1 ; maquettes validées le 27 novembre 2026).
// Trois commandes : reprendre un plan DXF à l'échelle, écrire le modèle en DXF, écrire un plan masse en figure-fond.
// Protocole 1.1 : fichier lu en flux, segments en lot, vrais arcs, balises créées, lecture du modèle entier.
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
      if (section === "ENTITIES" || (section === "BLOCKS" && bloc)) ent = { type: v, calque: "0", pts: [], bombes: [] };
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

// ——————————————————————————————————————————————— Reprise d'un plan ———————————————————————————————————————————————

planche.sur("commande.importer", async (d) => {
  const fr = FR(d);
  const f = await planche.fichiers.ouvrir([".dxf"], { flux: true });
  if (!f) return null;
  const dxf = lireDxf(await f.texte());
  const lue = UNITES[dxf.unite];
  const calquesDe = (liste) => [...new Set(liste.filter((e) => REPRIS.includes(e.type)).map((e) => e.calque))];
  const calques = calquesDe(entitesEspace(dxf, "objet"));
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
  ]);
  if (!r) return null;
  const k = UNITES[Number(r.unite)][2];

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
  // Tracés différés, par calque : chaque calque est tracé puis groupé aussitôt, pour qu'il ne se fonde pas aux autres.
  let parCalque = {};
  const du = (c) => (parCalque[c] ||= { segs: [], courbes: [], objets: [] });

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
    if (!crees.length) continue;
    const g = await planche.modele.grouper(crees, c);
    if (r.balises) {
      ids[c] = await planche.balises.creer(c);
      await planche.balises.appliquer([g], ids[c]);
    }
  }
  await planche.operation.valider();

  const n = Object.keys(ids).length;
  await planche.message.afficher(
    t(fr, "Plan repris : ", "Plan imported: ") + traits + t(fr, " traits, ", " lines, ") + arcs + t(fr, " arcs et cercles, ", " arcs and circles, ") + blocs + t(fr, " blocs, ", " blocks, ") + n + t(fr, " calques en balises.", " layers as tags."),
  );
  if (enSegments) await planche.message.afficher(enSegments + t(fr, " courbe(s) de blocs déformés (échelles X et Y différentes) : posée(s) en segments.", " curve(s) in distorted blocks (different X and Y scales): placed as segments."), "alerte");
  if (eclates) await planche.message.afficher(eclates + t(fr, " bloc(s) inséré(s) à une échelle autre que 1 : posé(s) éclaté(s).", " block(s) inserted at a scale other than 1: placed exploded."), "alerte");
  const o = Object.entries(omis).map(([type, nb]) => nb + " " + type).join(", ");
  if (o) await planche.message.afficher(t(fr, "Non repris : ", "Not imported: ") + o + t(fr, " (textes, hachures et cotes : à venir).", " (texts, hatches and dimensions: to come)."), "alerte");
  return traits;
});

// ————————————————————————————————————————————————— Écriture DXF —————————————————————————————————————————————————

const nomCalque = (s) => (String(s || "0").replace(/[<>/\\":;?*|=`,]/g, "_").trim() || "0").slice(0, 255);
const nombre = (v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toFixed(9))).toString();

/** DXF texte (AC1009, lisible partout) : en-tête avec l'unité, table des calques, entités. */
function ecrireDxf(unite, calques, entites) {
  const l = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", String(unite), "0", "ENDSEC"];
  l.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(calques.length));
  for (const c of calques) l.push("0", "LAYER", "2", c, "70", "0", "62", "7", "6", "CONTINUOUS");
  l.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
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
  const calques = [...new Set(["0", ...entites.map((e) => e[3])])];
  const nom = /\.dxf$/i.test(r.nom) ? r.nom : r.nom + ".dxf";
  const fait = await planche.fichiers.enregistrer(nom, ecrireDxf(Number(r.unite), calques, entites));
  if (fait) await planche.message.afficher(t(fr, "DXF écrit : ", "DXF written: ") + (entites.length - vrais) + t(fr, " traits, ", " lines, ") + vrais + t(fr, " arcs et cercles, ", " arcs and circles, ") + calques.length + t(fr, " calques.", " layers."));
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
