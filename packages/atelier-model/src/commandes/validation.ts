/**
 * Validation des paramètres canoniques de chaque classe (section 5.2) : unités, bornes, préconditions sur les
 * objets référencés. Retourne des paramètres typés ou lève `ErreurCommande` (400 côté API) — jamais de valeur
 * par défaut inventée pour une grandeur physique (R3) : une hauteur absente reste `null`.
 */
import { derivesProfil, lireProfilVertical, type ProfilVertical } from "../profils-verticaux.js";
import { REFERENCE_EXTERNE, versRepereProjet, type ParamsReferenceExterne } from "./refexterne.js";
import { contourFerme } from "./changer-classe.js";
import { profilFerme } from "./hachures-associees.js";
import { lireOuvrant } from "../ouvrants.js";
import { lireMenuiserie } from "../menuiserie.js";
import { lireCintre, type Cintre } from "../cintres.js";
import { distance, longueurAxeMur, pointDansPolygone } from "../geometrie.js";
import { anneauRetombee } from "../dalles.js";
import { faceHauteSolide } from "../solides-forme.js";
import { USAGES_DALLE, type ModeleAtelier, type ParamsParClasse } from "../modele.js";
import type { Classe } from "../ontologie.js";
import { TOLERANCE_REDUCTEUR, type Angle, type Longueur } from "../unites.js";
import { ErreurCommande, lire } from "./base.js";
import { enveloppeConvexe } from "../echanges/import-ifc.js";
import { emprisePosee } from "../solide-exact.js";
import { empriseMaillage, POSE_NULLE, positionsPosees3 } from "../ontologies/mechanical/geometrie.js";
import { DDL_LIAISON, TYPES_LIAISON } from "../ontologies/mechanical/liaisons.js";
import { AVEC_AILE, AVEC_EPAISSEUR, FORMES_SECTION, sectionDepuisCatalogue } from "../ontologies/structure/sections.js";
import { estBetonDeclare } from "../ontologies/structure/beton.js";
import type { LigneCatalogue } from "../catalogues/csv-source.js";
import type { Percage, SectionBois, SectionStructure, Vecteur3 } from "../modele.js";
import { sectionBoisDepuisCatalogue } from "../ontologies/timber/sections.js";
import type { PortReseau, ProfilReseau, SectionReseau, SystemeReseau } from "../modele.js";
import { PORTS_PAR_RACCORD } from "../modele.js";
import { sectionReseauDepuisCatalogue } from "../ontologies/mep/sections.js";

type Brut = Record<string, unknown>;
/** Faces subdivisées admises au plus pour une surface libre (triangles × 4ⁿ). */
const BUDGET_SUBDIVISION = 200_000;
const CHAMPS_ETIQUETTE = ["nom", "repere", "numero", "classe", "niveau", "section", "longueur", "volume"];

/** Renflements d'une polyligne (D-063) : un par segment, |b| ≤ 1 (demi-cercle au plus) ; tous nuls : clé absente. */
function renflementsDe(p: Brut, forme: string, n: number, ferme: boolean): { renflements?: number[] } {
  const v = p["renflements"];
  if (v === undefined || v === null) return {};
  if (forme !== "polyligne") throw new ErreurCommande("invalide", "renflements", "segments en arc : polylignes seulement");
  const attendu = n - 1 + (ferme && n > 2 ? 1 : 0);
  if (!Array.isArray(v) || v.length !== attendu || !v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1 + 1e-12)) throw new ErreurCommande("invalide", "renflements", `renflements : ${attendu} nombre(s) entre −1 et 1 (un par segment)`);
  const r = (v as number[]).map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12));
  return r.some((x) => x !== 0) ? { renflements: r } : {};
}

/** Espace sur plusieurs niveaux (D-142) : niveau haut connu, exclusif d'une hauteur propre ; absent : clé omise. */
function niveauHautEspace(etat: ModeleAtelier, p: Brut): { niveauHautId?: string } {
  const id = lire.chaineOuNull(p, "niveauHautId");
  if (id === null) return {};
  if (!etat.niveaux[id]) throw new ErreurCommande("precondition", "niveauHautId", `niveau inconnu : ${id}`);
  if (p["hauteur"] !== undefined && p["hauteur"] !== null) throw new ErreurCommande("invalide", "niveauHautId", "espace : hauteur propre ou niveau haut, pas les deux");
  return { niveauHautId: id };
}

/** Hauteur propre d'une pièce ou d'un espace (D-059) : clé présente seulement si déclarée. */
const hauteurPropre = (p: Brut): { hauteur?: Longueur } => {
  const h = lire.longueur(p, "hauteur", { optionnel: true, strict: true });
  return h ? { hauteur: h } : {};
};

function surfaceOuNull(params: Brut, cle: string) {
  const v = params[cle];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || (v as { unit?: string }).unit !== "m2" || !Number.isFinite((v as { value?: number }).value)) {
    throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une surface ({ value, unit: "m2" })`);
  }
  return { value: (v as { value: number }).value, unit: "m2" as const };
}

function contour(params: Brut, min = 3) {
  const c = lire.points(params, "contour", { min });
  return { contour: c, trous: lire.trous(params) };
}

export const VALIDATEURS: { [C in Classe]: (etat: ModeleAtelier, params: Brut) => ParamsParClasse[C] } = {
  mur(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "mur de longueur nulle");
    const niveauHautId = lire.chaineOuNull(p, "niveauHautId");
    if (niveauHautId !== null && !etat.niveaux[niveauHautId]) throw new ErreurCommande("precondition", "niveauHautId", `niveau inconnu : ${niveauHautId}`);
    return {
      a,
      b,
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      niveauHautId,
      alignement: lire.enumeration(p, "alignement", ["gauche", "axe", "droite"] as const, "axe"),
      exterieur: lire.booleen(p, "exterieur", false),
      nom: lire.chaineOuNull(p, "nom"),
      ...renflementMur(etat, p),
    };
  },
  porte: (etat, p) => {
    const o = ouverture(etat, p);
    const ouvrant = lireOuvrant(p["ouvrant"], "params.ouvrant", o.largeur.value);
    // Menuiserie de porte (D-113) : dormant, seuil, vantaux pleins ou vitrés (porte-fenêtre).
    const hote = etat.objets[o.murHoteId] as { params: { epaisseur: { value: number } } };
    const menuiserie = lireMenuiserie(p["menuiserie"], { largeur: o.largeur.value, hauteur: o.hauteur.value, epaisseurMur: hote.params.epaisseur.value, porte: true });
    return { ...o, ...(ouvrant ? { ouvrant } : {}), ...(menuiserie ? { menuiserie } : {}) };
  },
  fenetre: (etat, p) => {
    const o = ouverture(etat, p);
    // Menuiserie paramétrée (D-101) : dormant, vitrage, vantaux ; absente : panneau simple.
    const hote = etat.objets[o.murHoteId] as { params: { epaisseur: { value: number } } };
    const menuiserie = lireMenuiserie(p["menuiserie"], { largeur: o.largeur.value, hauteur: o.hauteur.value, epaisseurMur: hote.params.epaisseur.value });
    return menuiserie ? { ...o, menuiserie } : o;
  },
  ouverture: (etat, p) => ouverture(etat, p),
  dalle(_etat, p) {
    const usage = p["usage"] === undefined || p["usage"] === null ? null : lire.enumeration(p, "usage", USAGES_DALLE);
    return { ...contour(p), epaisseur: lire.longueur(p, "epaisseur", { strict: true })!, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, nom: lire.chaineOuNull(p, "nom"), ...(usage ? { usage } : {}), ...penteDalle(p), ...sensDalle(p), ...retombeeDalle(p) };
  },
  toiture(_etat, p) {
    return {
      ...contour(p),
      type: lire.enumeration(p, "type", ["plate", "monopente", "bipente"] as const, "plate"),
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      pente: lire.angle(p, "pente", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  escalier(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "escalier de longueur nulle");
    const niveauDepartId = lire.chaine(p, "niveauDepartId");
    if (!etat.niveaux[niveauDepartId]) throw new ErreurCommande("precondition", "niveauDepartId", `niveau inconnu : ${niveauDepartId}`);
    const niveauArriveeId = lire.chaineOuNull(p, "niveauArriveeId");
    if (niveauArriveeId !== null && !etat.niveaux[niveauArriveeId]) throw new ErreurCommande("precondition", "niveauArriveeId", `niveau d'arrivée inconnu : ${niveauArriveeId}`);
    return {
      a,
      b,
      largeur: lire.longueur(p, "largeur", { strict: true })!,
      hauteurAFranchir: lire.longueur(p, "hauteurAFranchir", { strict: true })!,
      marches: lire.nombre(p, "marches", { optionnel: true, entier: true, min: 1 }),
      contremarches: lire.nombre(p, "contremarches", { optionnel: true, entier: true, min: 1 }),
      epaisseurPaillasse: lire.longueur(p, "epaisseurPaillasse", { optionnel: true, strict: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      niveauDepartId,
      niveauArriveeId,
      groupe: lire.chaineOuNull(p, "groupe"),
      referencePlanSeulement: lire.booleen(p, "referencePlanSeulement", false),
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  piece(_etat, p) {
    return {
      ...contour(p),
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
      ...hauteurPropre(p),
    };
  },
  espace(etat, p) {
    const polys = p["polygones"];
    if (!Array.isArray(polys) || polys.length === 0) throw new ErreurCommande("invalide", "polygones", "« polygones » requis (au moins un contour)");
    const polygones = polys.map((poly, i) => {
      if (typeof poly !== "object" || poly === null) throw new ErreurCommande("invalide", `polygones[${i}]`, "contour attendu");
      return contour(poly as Brut);
    });
    return {
      polygones,
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
      ...hauteurPropre(p),
      ...niveauHautEspace(etat, p),
    };
  },
  zone(_etat, p) {
    return { ...contour(p), nom: lire.chaine(p, "nom"), categorie: lire.chaineOuNull(p, "categorie") };
  },
  poteau(_etat, p) {
    const formeId = lire.chaine(p, "formeId");
    const largeur = lire.longueur(p, "largeur", { strict: true })!;
    const profondeur = lire.longueur(p, "profondeur", { strict: true })!;
    // Profilés (D-139) : épaisseur des parois saisie, inférieure à la moitié de la plus petite dimension.
    const profile = PROFILES_POTEAU.includes(formeId);
    const ep = profile ? lire.longueur(p, "epaisseurProfil", { strict: true }) : null;
    if (!profile && p["epaisseurProfil"] !== undefined && p["epaisseurProfil"] !== null) throw new ErreurCommande("invalide", "epaisseurProfil", "épaisseur de paroi réservée aux profilés I, T, L, U");
    if (ep && ep.value >= Math.min(largeur.value, profondeur.value) / 2) throw new ErreurCommande("invalide", "epaisseurProfil", "épaisseur de paroi inférieure à la moitié de la largeur et de la profondeur");
    return {
      point: lire.point(p, "point")!,
      formeId,
      ...(ep ? { epaisseurProfil: ep } : {}),
      largeur,
      profondeur,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      nom: lire.chaineOuNull(p, "nom"),
      statutConception: lire.chaineOuNull(p, "statutConception"),
      ...(p["miroir"] === true && formeId === "L" && ep ? { miroir: true as const } : {}),
    };
  },
  solide(_etat, p0) {
    // Profil vertical (D-154) : emprise, hauteur et base dérivées du profil ; incompatible avec dépouille,
    // inclinaison et esquisse source.
    let p = p0;
    let pv: ProfilVertical | null = null;
    if (p0["profilVertical"] !== undefined && p0["profilVertical"] !== null) {
      pv = lireProfilVertical(p0["profilVertical"]);
      for (const k of ["depouille", "inclinaison", "sourceId"]) if (p0[k] !== undefined && p0[k] !== null) throw new ErreurCommande("invalide", k, "profil vertical : ni dépouille, ni inclinaison, ni esquisse source");
      const d = derivesProfil(pv);
      p = { ...p0, contour: d.contour, trous: [], ferme: true, hauteur: { value: Math.round((d.zMax - d.zMin) * 1e9) / 1e9, unit: "m" }, decalageBase: { value: d.zMin, unit: "m" } };
    }
    const ferme = lire.booleen(p, "ferme", true);
    return {
      ...(pv ? { profilVertical: pv } : {}),
      ...contour(p, ferme ? 3 : 2),
      ferme,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      epaisseur: lire.longueur(p, "epaisseur", { optionnel: true }),
      role: lire.chaine(p, "role", { optionnel: true }) || "solid",
      nom: lire.chaineOuNull(p, "nom"),
      couleur: lire.chaineOuNull(p, "couleur"),
      ...sourceSolide(_etat, p),
      ...formeSolide(p, ferme),
    };
  },
  esquisse(_etat, p) {
    const forme = lire.enumeration(p, "forme", ["ligne", "polyligne", "arc", "cercle", "rectangle", "polygone", "spline", "construction", "hachure", "ellipse"] as const);
    const minPoints: Record<typeof forme, number> = { ligne: 2, polyligne: 2, arc: 0, cercle: 0, rectangle: 2, polygone: 3, spline: 2, construction: 2, hachure: 3, ellipse: 0 };
    const points = lire.points(p, "points", { min: minPoints[forme], optionnel: minPoints[forme] === 0 });
    const centre = lire.point(p, "centre", { optionnel: true });
    const rayon = lire.longueur(p, "rayon", { optionnel: true, strict: true });
    if ((forme === "arc" || forme === "cercle" || forme === "ellipse") && (!centre || !rayon)) throw new ErreurCommande("invalide", "centre", `${forme} : centre et rayon requis`);
    const rayonB = forme === "ellipse" ? lire.longueur(p, "rayonB", { strict: true }) : null;
    if (rayonB && rayon && rayonB.value > rayon.value + 1e-12) throw new ErreurCommande("invalide", "rayonB", "ellipse : le demi-petit axe (rayonB) ne dépasse pas le demi-grand axe (rayon)");
    if (forme === "ligne" || forme === "construction") {
      if (distance(points[0]!, points[1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "points", "segment de longueur nulle");
    }
    return {
      forme,
      points,
      ferme: lire.booleen(p, "ferme", forme === "polygone" || forme === "rectangle" || forme === "hachure" || forme === "cercle" || forme === "ellipse"),
      centre,
      rayon,
      angleDebut: lire.angle(p, "angleDebut", { optionnel: true }),
      angleFin: lire.angle(p, "angleFin", { optionnel: true }),
      motif: lire.chaineOuNull(p, "motif"),
      ...(forme === "ellipse" ? { rayonB, rotation: lire.angle(p, "rotation", { optionnel: true }) ?? { value: 0, unit: "deg" } } : {}),
      ...renflementsDe(p, forme, points.length, lire.booleen(p, "ferme", false)),
      ...tangentesDe(p, forme, points.length),
      ...sourceHachure(_etat, p, forme),
      ...degradeDe(p, forme),
      ...motifLignesDe(p, forme),
      ...axeDeDe(_etat, p, forme),
    };
  },
  "reference-plan"(_etat, p) {
    return { ...contour(p), source: lire.chaineOuNull(p, "source"), echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }), nom: lire.chaineOuNull(p, "nom") };
  },
  cotation(etat, p) {
    // Cote mécanique (P2-7) : préfixe et tolérance saisis, jamais supposés.
    const prefixe = p["prefixe"] === undefined || p["prefixe"] === null ? null : lire.enumeration(p, "prefixe", ["Ø", "R", "□", "M"] as const);
    let tolerance: { plus: number; moins: number } | null = null;
    if (p["tolerance"] !== undefined && p["tolerance"] !== null) {
      const t = p["tolerance"] as Brut;
      if (typeof t !== "object" || typeof t["plus"] !== "number" || typeof t["moins"] !== "number" || !Number.isFinite(t["plus"]) || !Number.isFinite(t["moins"])) throw new ErreurCommande("invalide", "tolerance", "tolérance { plus, moins } en mètres attendue (écart supérieur ≥ 0, écart inférieur ≥ 0)");
      if ((t["plus"] as number) < 0 || (t["moins"] as number) < 0) throw new ErreurCommande("invalide", "tolerance", "écarts de tolérance ≥ 0 (le signe est porté par le champ)");
      tolerance = { plus: t["plus"] as number, moins: t["moins"] as number };
    }
    const base = { a: lire.point(p, "a")!, b: lire.point(p, "b")!, decalage: lire.longueur(p, "decalage", { optionnel: true }) ?? { value: 0, unit: "m" as const }, ...(prefixe ? { prefixe } : {}), ...(tolerance ? { tolerance } : {}) };
    const ex = p["externe"];
    if (ex === undefined || ex === null) return base;
    // Cote sur une référence externe (D-153) : extrémités en repère de la source, position dérivée du calage.
    if (typeof ex !== "object" || Array.isArray(ex)) throw new ErreurCommande("invalide", "externe", "externe : { referenceId, a, b }");
    const q = ex as Brut;
    const referenceId = lire.chaine(q, "referenceId");
    const def = etat.definitions[referenceId];
    if (!def || def.classe !== REFERENCE_EXTERNE) throw new ErreurCommande("precondition", "externe.referenceId", `référence externe inconnue : ${referenceId}`);
    const ref = def.params as unknown as ParamsReferenceExterne;
    const point = (k: "a" | "b") => {
      const v = q[k] as { x?: unknown; y?: unknown } | undefined;
      if (!v || typeof v.x !== "number" || typeof v.y !== "number" || !Number.isFinite(v.x) || !Number.isFinite(v.y)) throw new ErreurCommande("invalide", `externe.${k}`, "point de la source { x, y } en mètres attendu");
      return { x: v.x, y: v.y };
    };
    const sa = point("a");
    const sb = point("b");
    const revisionSource = typeof q["revisionSource"] === "number" ? (q["revisionSource"] as number) : ref.revisionSource;
    const P = (v: { x: number; y: number }) => { const r = versRepereProjet(v, ref); return { x: r.x, y: r.y, frame: "local" as const, unit: "m" as const }; };
    return { ...base, a: P(sa), b: P(sb), externe: { referenceId, a: sa, b: sb, revisionSource, ...(revisionSource !== ref.revisionSource ? { aVerifier: true as const } : {}) } };
  },
  texte(_etat, p) {
    // Orientation (D-146) : ramenée dans ]−180, 180] ; nulle ou absente : clé omise.
    const a = lire.angle(p, "angle", { optionnel: true });
    const v = a ? Math.round((((((a.value + 180) % 360) + 360) % 360) - 180) * 1e9) / 1e9 : 0;
    return { position: lire.point(p, "position")!, texte: lire.chaine(p, "texte"), ...(v ? { angle: { value: v === -180 ? 180 : v, unit: "deg" as const } } : {}) };
  },
  etiquette(etat, p) {
    const objetId = lire.chaineOuNull(p, "objetId");
    if (objetId !== null && !etat.objets[objetId]) throw new ErreurCommande("precondition", "objetId", `objet inconnu : ${objetId}`);
    // Étiquette intelligente (P2-7) : gabarit `{champ}` lu sur l'objet visé ; champs connus seulement.
    const champ = lire.chaineOuNull(p, "champ");
    if (champ !== null) {
      if (objetId === null) throw new ErreurCommande("invalide", "champ", "un gabarit d'étiquette intelligente vise un objet (objetId)");
      const cles = [...champ.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]!);
      const inconnues = cles.filter((k) => !CHAMPS_ETIQUETTE.includes(k));
      if (!cles.length) throw new ErreurCommande("invalide", "champ", `gabarit sans champ : ${CHAMPS_ETIQUETTE.map((k) => `{${k}}`).join(", ")}`);
      if (inconnues.length) throw new ErreurCommande("invalide", "champ", `champ(s) inconnu(s) : ${inconnues.join(", ")}`);
    }
    return { position: lire.point(p, "position")!, texte: lire.chaineOuNull(p, "texte") ?? "", objetId, ...(champ ? { champ } : {}) };
  },
  "nuage-de-points"(_etat, p) {
    const nom = lire.chaine(p, "nom").trim(), source = lire.chaine(p, "source").trim();
    if (!nom || !source) throw new ErreurCommande("invalide", "source", "nom et fichier source requis");
    const points = lireSommets3(p, "points", 1);
    if (points.length > 20000) throw new ErreurCommande("invalide", "points", "20 000 points au plus dans l'échantillon (décimez à la lecture)");
    const o = p["origine"];
    const origine = o && typeof o === "object" && ["x", "y", "z"].every((k) => typeof (o as Record<string, unknown>)[k] === "number" && Number.isFinite((o as Record<string, number>)[k])) ? { x: (o as Record<string, number>)["x"]!, y: (o as Record<string, number>)["y"]!, z: (o as Record<string, number>)["z"]! } : null;
    if (!origine) throw new ErreurCommande("invalide", "origine", "origine { x, y, z } (m) requise : translation explicite du repère du relevé vers le repère local (jamais devinée)");
    const nombrePoints = lire.nombre(p, "nombrePoints", { entier: true, min: 1 })!;
    const pas = lire.nombre(p, "pas", { optionnel: true, entier: true, min: 1 }) ?? 1;
    if (points.length > nombrePoints) throw new ErreurCommande("invalide", "nombrePoints", "l'échantillon ne peut dépasser le nombre de points du fichier");
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const q of points) { min.x = Math.min(min.x, q.x); min.y = Math.min(min.y, q.y); min.z = Math.min(min.z, q.z); max.x = Math.max(max.x, q.x); max.y = Math.max(max.y, q.y); max.z = Math.max(max.z, q.z); }
    const coupeZ = lire.nombre(p, "coupeZ", { optionnel: true });
    return { nom, source, format: lire.enumeration(p, "format", ["las", "xyz", "pts"] as const), nombrePoints, pas, points, origine, bornes: { min, max }, coupeZ, epaisseurCoupe: lire.longueur(p, "epaisseurCoupe", { optionnel: true }) ?? { value: 0.2, unit: "m" } };
  },
  "annotation-fabrication"(etat, p) {
    const objetId = lire.chaineOuNull(p, "objetId");
    if (objetId !== null && !etat.objets[objetId]) throw new ErreurCommande("precondition", "objetId", `objet inconnu : ${objetId}`);
    const commun = { objetId, position: lire.point(p, "position")!, attache: lire.point(p, "attache", { optionnel: true }), z: lire.nombre(p, "z", { optionnel: true }) };
    const type = lire.enumeration(p, "type", ["tolerance-geometrique", "soudure", "etat-de-surface", "specialiste"] as const);
    switch (type) {
      case "tolerance-geometrique": {
        const refs = p["references"] === undefined || p["references"] === null ? [] : p["references"];
        if (!Array.isArray(refs) || refs.length > 3 || !refs.every((r) => typeof r === "string" && /^[A-Z](-[A-Z])?$/.test(r))) throw new ErreurCommande("invalide", "references", "références : lettres de référence (A, B, A-B), trois au plus");
        return { ...commun, type, caracteristique: lire.enumeration(p, "caracteristique", ["planeite", "rectitude", "circularite", "cylindricite", "parallelisme", "perpendicularite", "inclinaison", "position", "coaxialite", "symetrie", "profil-ligne", "profil-surface"] as const), valeur: lire.longueur(p, "valeur", { strict: true })!, references: refs as string[] };
      }
      case "soudure":
        return { ...commun, type, cordon: lire.enumeration(p, "cordon", ["bout-a-bout", "angle", "v", "demi-v", "u", "j", "bouchon", "point", "ligne"] as const), taille: lire.longueur(p, "taille", { optionnel: true, strict: true }), longueur: lire.longueur(p, "longueur", { optionnel: true, strict: true }), cote: lire.enumeration(p, "cote", ["fleche", "oppose", "deux-cotes"] as const, "fleche"), peripherique: lire.booleen(p, "peripherique", false), chantier: lire.booleen(p, "chantier", false), procede: lire.chaineOuNull(p, "procede") };
      case "etat-de-surface": {
        const valeur = lire.nombre(p, "valeur", { min: 0 })!;
        if (valeur <= 0) throw new ErreurCommande("invalide", "valeur", "rugosité > 0 (µm) attendue");
        return { ...commun, type, parametre: lire.enumeration(p, "parametre", ["Ra", "Rz", "Rt"] as const), valeur, procede: lire.chaineOuNull(p, "procede"), stries: lire.chaineOuNull(p, "stries") };
      }
      case "specialiste": {
        const famille = lire.chaine(p, "famille").trim(), texte = lire.chaine(p, "texte").trim();
        if (!famille || !texte) throw new ErreurCommande("invalide", "texte", "famille et texte requis");
        return { ...commun, type, famille, texte };
      }
    }
  },
  "garde-corps"(_etat, p) {
    const points = lire.points(p, "points", { min: 2 });
    for (let i = 0; i + 1 < points.length; i++) if (distance(points[i]!, points[i + 1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "points", "segment de garde-corps de longueur nulle");
    return {
      points,
      ferme: lire.booleen(p, "ferme", false),
      // Hauteur saisie, jamais déduite d'une règle (R3) : obligatoire.
      hauteur: lire.longueur(p, "hauteur", { strict: true })!,
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      remplissage: lire.enumeration(p, "remplissage", ["barreaudage", "plein", "vitre"] as const, "barreaudage"),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  "objet-importe"(_etat, p) {
    const m = p["maillage"] as { positions?: unknown; indices?: unknown } | undefined;
    const positions = m?.positions;
    const indices = m?.indices;
    if (!Array.isArray(positions) || positions.length % 3 !== 0 || positions.length > 1_500_000 || !positions.every((v) => typeof v === "number" && Number.isFinite(v))) throw new ErreurCommande("invalide", "maillage.positions", "maillage : coordonnées x, y, z finies attendues (500 000 sommets au plus)");
    const n = positions.length / 3;
    if (!Array.isArray(indices) || indices.length % 3 !== 0 || !indices.every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new ErreurCommande("invalide", "maillage.indices", "maillage : triangles d'indices entiers valides attendus");
    return {
      ifcClasse: lire.chaine(p, "ifcClasse"),
      globalId: lire.chaine(p, "globalId"),
      nom: lire.chaineOuNull(p, "nom"),
      type: lire.chaineOuNull(p, "type"),
      maillage: { positions: positions as number[], indices: indices as number[] },
      empreinte: lire.points(p, "empreinte", { optionnel: true }),
      source: lire.chaineOuNull(p, "source"),
    };
  },
  "solide-exact"(_etat, p) {
    const m = p["maillage"] as { positions?: unknown; indices?: unknown } | undefined;
    const positions = m?.positions;
    const indices = m?.indices;
    if (!Array.isArray(positions) || positions.length % 3 !== 0 || positions.length < 9 || positions.length > 1_500_000 || !positions.every((v) => typeof v === "number" && Number.isFinite(v))) throw new ErreurCommande("invalide", "maillage.positions", "maillage : coordonnées finies par triplets attendues");
    const n = positions.length / 3;
    if (!Array.isArray(indices) || indices.length % 3 !== 0 || indices.length < 3 || !indices.every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new ErreurCommande("invalide", "maillage.indices", "maillage : triangles d'indices entiers valides attendus");
    const brep = lire.chaine(p, "brep");
    if (!/^[A-Za-z0-9+/=]+$/.test(brep) || brep.length > 8_000_000) throw new ErreurCommande("invalide", "brep", "brep binaire en base64 attendu (8 Mo au plus)");
    const empreinteBrep = lire.chaine(p, "empreinteBrep");
    if (!/^[0-9a-f]{16}$/.test(empreinteBrep)) throw new ErreurCommande("invalide", "empreinteBrep", "empreinte FNV-1a 64 attendue (16 caractères hexadécimaux)");
    const volume = lire.nombre(p, "volume", { min: 0 })!;
    const aire = lire.nombre(p, "aire", { min: 0 })!;
    const faces = lire.nombre(p, "faces", { min: 1, entier: true })!;
    const op = (p["operation"] ?? {}) as Record<string, unknown>;
    const sources = Array.isArray(op["sources"]) ? (op["sources"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    // Entrées de l'opération (P2-7) : gardées telles que reçues (déjà validées par le noyau côté serveur) pour les documents dérivés (tableau des perçages).
    const entrees = op["entrees"] !== undefined && op["entrees"] !== null && typeof op["entrees"] === "object" ? (op["entrees"] as Record<string, unknown>) : undefined;
    // Perçage (P2-7) : porté par `operation.percage` (posé par le serveur après recalcul) ou dérivé d'entrées « trou » encore présentes.
    const percage = lirePercage(op["percage"] ?? (entrees && entrees["type"] === "trou" ? entrees : undefined));
    const position = lire.point(p, "position", { optionnel: true }) ?? { x: 0, y: 0, frame: "local", unit: "m" };
    const angle = lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" };
    const maillage = { positions: positions as number[], indices: indices as number[] };
    return {
      nom: lire.chaineOuNull(p, "nom"),
      couleur: lire.chaineOuNull(p, "couleur"),
      brep,
      moteur: lire.chaine(p, "moteur"),
      versionMoteur: lire.chaine(p, "versionMoteur"),
      empreinteBrep,
      maillage,
      volume,
      aire,
      faces,
      position,
      angle,
      // Emprise toujours recalculée (jamais prise du client) : enveloppe convexe du maillage posé.
      emprise: enveloppeConvexe(emprisePosee(maillage, position, angle.value)).map((q) => ({ x: q.x, y: q.y, frame: "local" as const, unit: "m" as const })),
      operation: { type: typeof op["type"] === "string" ? (op["type"] as string) : "inconnue", sources, libelle: typeof op["libelle"] === "string" ? (op["libelle"] as string) : "", ...(entrees ? { entrees } : {}), ...(percage ? { percage } : {}) },
    };
  },
  "piece-mecanique"(etat, p) {
    const m = p["maillage"] as { positions?: unknown; indices?: unknown } | undefined;
    const positions = m?.positions;
    const indices = m?.indices;
    if (!Array.isArray(positions) || positions.length % 3 !== 0 || positions.length < 9 || positions.length > 1_500_000 || !positions.every((v) => typeof v === "number" && Number.isFinite(v))) throw new ErreurCommande("invalide", "maillage.positions", "maillage : coordonnées finies par triplets attendues");
    const n = positions.length / 3;
    if (!Array.isArray(indices) || indices.length % 3 !== 0 || indices.length < 3 || !indices.every((v) => Number.isInteger(v) && v >= 0 && v < n)) throw new ErreurCommande("invalide", "maillage.indices", "maillage : triangles d'indices entiers valides attendus");
    const brep = lire.chaineOuNull(p, "brep");
    if (brep !== null && (!/^[A-Za-z0-9+/=]+$/.test(brep) || brep.length > 8_000_000)) throw new ErreurCommande("invalide", "brep", "brep binaire en base64 attendu (8 Mo au plus)");
    const assemblageId = lire.chaineOuNull(p, "assemblageId");
    if (assemblageId !== null && etat.objets[assemblageId]?.classe !== "assemblage") throw new ErreurCommande("precondition", "assemblageId", `assemblage inconnu : ${assemblageId}`);
    const pose = lirePose3(p);
    const asm = assemblageId ? (etat.objets[assemblageId] as { params: { position: { x: number; y: number }; angle: { value: number }; z: number } }) : null;
    const repere = asm ? { position: asm.params.position as never, angleDeg: asm.params.angle.value, z: asm.params.z } : null;
    const maillage = { positions: positions as number[], indices: indices as number[] };
    const numero = lire.nombre(p, "numero", { optionnel: true, entier: true, min: 1 });
    return {
      nom: lire.chaine(p, "nom").trim() || "Pièce",
      reference: lire.chaineOuNull(p, "reference"),
      numero,
      materiau: lire.chaineOuNull(p, "materiau"),
      // Masse volumique déclarée avec sa source (P2-6, DA-17-10) ; absente : masse et inertie « non évaluées » (R3).
      masseVolumique: ((): { valeur: number; source: string } | null => {
        const mv = p["masseVolumique"];
        if (mv === undefined || mv === null) return null;
        if (typeof mv !== "object") throw new ErreurCommande("invalide", "masseVolumique", "{ valeur (kg/m³), source } attendu");
        const valeur = (mv as { valeur?: unknown }).valeur, source = (mv as { source?: unknown }).source;
        if (typeof valeur !== "number" || !Number.isFinite(valeur) || valeur <= 0) throw new ErreurCommande("invalide", "masseVolumique.valeur", "masse volumique > 0 attendue (kg/m³)");
        if (typeof source !== "string" || !source.trim()) throw new ErreurCommande("invalide", "masseVolumique.source", "source de la masse volumique requise (aucune densité n'est connue du code)");
        return { valeur, source: source.trim() };
      })(),
      sourceId: lire.chaineOuNull(p, "sourceId"),
      brep,
      empreinteBrep: lire.chaineOuNull(p, "empreinteBrep"),
      moteur: lire.chaineOuNull(p, "moteur"),
      versionMoteur: lire.chaineOuNull(p, "versionMoteur"),
      maillage,
      volume: lire.nombre(p, "volume", { optionnel: true, min: 0 }),
      assemblageId,
      fixe: lire.booleen(p, "fixe", false),
      pose,
      // Emprise toujours recalculée : enveloppe convexe du maillage posé dans le repère du niveau.
      emprise: empriseMaillage(positionsPosees3(maillage, pose, repere)).emprise,
    };
  },
  assemblage(_etat, p) {
    return {
      nom: lire.chaine(p, "nom").trim() || "Assemblage",
      numero: lire.chaineOuNull(p, "numero"),
      position: lire.point(p, "position", { optionnel: true }) ?? { x: 0, y: 0, frame: "local", unit: "m" },
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      z: lire.nombre(p, "z", { optionnel: true }) ?? 0,
      diagnostic: lire.chaineOuNull(p, "diagnostic"),
    };
  },
  liaison(etat, p) {
    const type = lire.enumeration(p, "type", TYPES_LIAISON);
    const a = lire.objet(etat, p, "a");
    const b = lire.objet(etat, p, "b");
    if (a === b) throw new ErreurCommande("invalide", "b", "une liaison relie deux pièces différentes");
    const pa = etat.objets[a]!, pb = etat.objets[b]!;
    if (pa.classe !== "piece-mecanique" || pb.classe !== "piece-mecanique") throw new ErreurCommande("precondition", pa.classe !== "piece-mecanique" ? "a" : "b", "une liaison relie deux pièces mécaniques");
    if (!pa.params.assemblageId || pa.params.assemblageId !== pb.params.assemblageId) throw new ErreurCommande("precondition", "b", "les deux pièces doivent appartenir au même assemblage");
    const dir = (cle: string, defaut: { x: number; y: number; z: number }) => {
      const v = lireVecteur3(p, cle, defaut);
      if (Math.hypot(v.x, v.y, v.z) < 1e-9) throw new ErreurCommande("invalide", cle, `« ${cle} » : direction nulle`);
      return v;
    };
    const valeur = lire.nombre(p, "valeur", { optionnel: true });
    if (type === "distance" && valeur === null) throw new ErreurCommande("invalide", "valeur", "distance : valeur (m) requise");
    if ((type === "distance" || type === "glissiere") && valeur !== null && valeur < 0) throw new ErreurCommande("invalide", "valeur", "valeur négative refusée");
    return { type, a, b, pa: lireVecteur3(p, "pa", { x: 0, y: 0, z: 0 }), da: dir("da", { x: 0, y: 0, z: 1 }), ea: dir("ea", { x: 1, y: 0, z: 0 }), pb: lireVecteur3(p, "pb", { x: 0, y: 0, z: 0 }), db: dir("db", { x: 0, y: 0, z: 1 }), eb: dir("eb", { x: 1, y: 0, z: 0 }), valeur, etat: lire.chaineOuNull(p, "etat"), ddl: DDL_LIAISON[type] };
  },
  // Ontologie structure (P2-3).
  poutre(etat, p) {
    const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
    const za = lire.nombre(p, "za", { optionnel: true }) ?? 0;
    const zb = lire.nombre(p, "zb", { optionnel: true }) ?? za;
    if (Math.hypot(b.x - a.x, b.y - a.y, zb - za) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "élément de longueur nulle");
    const trameId = lire.chaineOuNull(p, "trameId");
    if (trameId !== null && etat.objets[trameId]?.classe !== "trame") throw new ErreurCommande("precondition", "trameId", `trame inconnue : ${trameId}`);
    return {
      nom: lire.chaineOuNull(p, "nom"),
      role: lire.enumeration(p, "role", ["poutre", "longrine", "contreventement", "tirant", "lisse", "panne", "chevron", "diagonale"] as const, "poutre"),
      a, b, za, zb,
      section: lireSection(etat, p, "section"),
      rotation: lire.angle(p, "rotation", { optionnel: true }) ?? { value: 0, unit: "deg" },
      materiau: lire.enumeration(p, "materiau", ["acier", "beton", "bois", "autre"] as const),
      materiauNom: lire.chaineOuNull(p, "materiauNom"),
      prefabrique: lire.booleen(p, "prefabrique", false),
      trameId,
    };
  },
  trame(_etat, p) {
    const axes = (cle: string) => {
      const v = p[cle];
      if (!Array.isArray(v) || v.length < 1 || v.length > 200) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste de 1 à 200 axes { nom, position }`);
      const out = v.map((x, i) => {
        const q = x as { nom?: unknown; position?: unknown };
        if (!q || typeof q.nom !== "string" || !q.nom.trim() || typeof q.position !== "number" || !Number.isFinite(q.position)) throw new ErreurCommande("invalide", `${cle}[${i}]`, "axe { nom, position (m) } attendu");
        return { nom: q.nom.trim(), position: q.position };
      });
      const noms = new Set(out.map((x) => x.nom));
      if (noms.size !== out.length) throw new ErreurCommande("invalide", cle, "noms d'axes en double");
      for (let i = 0; i + 1 < out.length; i++) if (Math.abs(out[i]!.position - out[i + 1]!.position) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", cle, "deux axes confondus");
      return out;
    };
    const g = p["generation"];
    let generation: { poteaux: number; poutres: number; hauteur: number } | null = null;
    if (g && typeof g === "object") {
      const q = g as { poteaux?: unknown; poutres?: unknown; hauteur?: unknown };
      if (typeof q.poteaux !== "number" || typeof q.poutres !== "number" || typeof q.hauteur !== "number") throw new ErreurCommande("invalide", "generation", "{ poteaux, poutres, hauteur } attendu");
      generation = { poteaux: q.poteaux, poutres: q.poutres, hauteur: q.hauteur };
    }
    return { nom: lire.chaine(p, "nom").trim() || "Trame", origine: lire.point(p, "origine")!, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, files: axes("files"), rangs: axes("rangs"), generation };
  },
  plaque(_etat, p) {
    const contour = lire.points(p, "contour", { min: 3 });
    if (Math.abs(contour.reduce((acc, q, i) => { const r = contour[(i + 1) % contour.length]!; return acc + q.x * r.y - r.x * q.y; }, 0)) < 1e-6) throw new ErreurCommande("invalide", "contour", "contour dégénéré (aire nulle)");
    return {
      nom: lire.chaineOuNull(p, "nom"),
      contour,
      trous: lire.trous(p),
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      z: lire.nombre(p, "z", { optionnel: true }) ?? 0,
      materiau: lire.enumeration(p, "materiau", ["acier", "beton", "bois", "autre"] as const),
      materiauNom: lire.chaineOuNull(p, "materiauNom"),
      prefabrique: lire.booleen(p, "prefabrique", false),
    };
  },
  "assemblage-structurel"(etat, p) {
    const elements = p["elements"];
    if (!Array.isArray(elements) || !elements.length || elements.length > 4 || !elements.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "elements", "« elements » : 1 à 4 identifiants d'éléments (poutres, poteaux, plaques)");
    for (const e of elements as string[]) {
      const o = etat.objets[e];
      if (!o) throw new ErreurCommande("precondition", "elements", `objet inconnu : ${e}`);
      if (o.classe !== "poutre" && o.classe !== "poteau" && o.classe !== "plaque") throw new ErreurCommande("precondition", "elements", `${e} (${o.classe}) : un assemblage relie des poutres, poteaux ou plaques`);
    }
    const pl = p["platine"];
    if (!pl || typeof pl !== "object") throw new ErreurCommande("invalide", "platine", "« platine » : { largeur, hauteur, epaisseur } (m) requis");
    const q = pl as Brut;
    const platine = { largeur: lire.longueur(q, "largeur", { strict: true })!, hauteur: lire.longueur(q, "hauteur", { strict: true })!, epaisseur: lire.longueur(q, "epaisseur", { strict: true })! };
    const bb = p["boulons"];
    let boulons: { rangees: number; parRangee: number; diametre: { value: number; unit: "m" }; entraxe: { value: number; unit: "m" }; longueur: { value: number; unit: "m" } } | null = null;
    if (bb !== undefined && bb !== null) {
      if (typeof bb !== "object") throw new ErreurCommande("invalide", "boulons", "« boulons » : { rangees, parRangee, diametre, entraxe, longueur }");
      const r = bb as Brut;
      boulons = { rangees: lire.nombre(r, "rangees", { entier: true, min: 1, max: 20 })!, parRangee: lire.nombre(r, "parRangee", { entier: true, min: 1, max: 20 })!, diametre: lire.longueur(r, "diametre", { strict: true })!, entraxe: lire.longueur(r, "entraxe", { strict: true })!, longueur: lire.longueur(r, "longueur", { strict: true })! };
      if (boulons.entraxe.value <= boulons.diametre.value) throw new ErreurCommande("invalide", "boulons.entraxe", "entraxe inférieur au diamètre des boulons");
    }
    return {
      nom: lire.chaineOuNull(p, "nom"),
      type: lire.enumeration(p, "type", ["platine-about", "platine-pied", "gousset", "cornieres", "eclisse"] as const),
      elements: [...new Set(elements as string[])],
      position: lire.point(p, "position")!,
      z: lire.nombre(p, "z", { optionnel: true }) ?? 0,
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      platine,
      boulons,
    };
  },
  soudure(etat, p) {
    const a = lire.objet(etat, p, "a"), b = lire.objet(etat, p, "b");
    if (a === b) throw new ErreurCommande("invalide", "b", "une soudure relie deux éléments différents");
    for (const [cle, id] of [["a", a], ["b", b]] as const) {
      const c = etat.objets[id]!.classe;
      if (c !== "poutre" && c !== "poteau" && c !== "plaque") throw new ErreurCommande("precondition", cle, `${id} (${c}) : une soudure relie des poutres, poteaux ou plaques`);
    }
    return {
      type: lire.enumeration(p, "type", ["angle", "bout-a-bout", "bouchon"] as const, "angle"),
      a, b,
      gorge: lire.longueur(p, "gorge", { strict: true })!,
      longueur: lire.longueur(p, "longueur", { strict: true })!,
      position: lire.point(p, "position")!,
      z: lire.nombre(p, "z", { optionnel: true }) ?? 0,
      intermittente: lire.booleen(p, "intermittente", false),
    };
  },
  armature(etat, p) {
    const hoteId = lire.chaineOuNull(p, "hoteId");
    if (hoteId !== null) {
      const h = etat.objets[hoteId];
      if (!h) throw new ErreurCommande("precondition", "hoteId", `objet inconnu : ${hoteId}`);
      if (!["poutre", "poteau", "plaque", "dalle"].includes(h.classe)) throw new ErreurCommande("precondition", "hoteId", `${hoteId} (${h.classe}) : une armature s'héberge dans une poutre, un poteau, une plaque ou une dalle`);
    }
    const forme = lire.enumeration(p, "forme", ["droite", "cadre", "etrier", "epingle", "u"] as const, "droite");
    const points = lire.points(p, "points", { min: 2 });
    if ((forme === "cadre" || forme === "etrier") && points.length < 3) throw new ErreurCommande("invalide", "points", "cadre ou étrier : au moins trois points");
    const nombre = lire.nombre(p, "nombre", { entier: true, min: 1, max: 400, optionnel: true }) ?? 1;
    const espacement = lire.longueur(p, "espacement", { optionnel: true, strict: true });
    if (nombre > 1 && !espacement) throw new ErreurCommande("invalide", "espacement", "plusieurs barres : espacement requis");
    return { nom: lire.chaineOuNull(p, "nom"), hoteId, forme, diametre: lire.longueur(p, "diametre", { strict: true })!, points, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, nombre, espacement, nuance: lire.chaineOuNull(p, "nuance") };
  },
  coulage(etat, p) {
    const el = p["elements"] ?? [];
    if (!Array.isArray(el) || !el.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "elements", "« elements » : liste d'identifiants");
    for (const e of el as string[]) {
      const o = etat.objets[e];
      if (!o) throw new ErreurCommande("precondition", "elements", `objet inconnu : ${e}`);
      if (!["poutre", "poteau", "plaque", "dalle"].includes(o.classe)) throw new ErreurCommande("precondition", "elements", `${e} (${o.classe}) : un coulage groupe des poutres, poteaux, plaques ou dalles`);
      if (!estBetonDeclare(o)) throw new ErreurCommande("precondition", "elements", `${e} (${o.classe}) : matériau béton non déclaré (materiau = beton, ou propriété « materiau » pour un poteau ou une dalle)`);
    }
    return { nom: lire.chaine(p, "nom").trim() || "Coulage", numero: lire.chaineOuNull(p, "numero"), elements: [...new Set(el as string[])], prefabrique: lire.booleen(p, "prefabrique", false) };
  },
  // Ontologie bois (P2-4).
  "element-bois"(etat, p) {
    const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
    const za = lire.nombre(p, "za", { optionnel: true }) ?? 0;
    const zb = lire.nombre(p, "zb", { optionnel: true }) ?? za;
    if (Math.hypot(b.x - a.x, b.y - a.y, zb - za) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "pièce de longueur nulle");
    const ossatureId = lire.chaineOuNull(p, "ossatureId");
    if (ossatureId !== null && etat.objets[ossatureId]?.classe !== "ossature") throw new ErreurCommande("precondition", "ossatureId", `ossature inconnue : ${ossatureId}`);
    return {
      nom: lire.chaineOuNull(p, "nom"),
      role: lire.enumeration(p, "role", ROLES_BOIS, "autre"),
      a, b, za, zb,
      section: lireSectionBois(etat, p, "section"),
      rotation: lire.angle(p, "rotation", { optionnel: true }) ?? { value: 0, unit: "deg" },
      ossatureId,
      repere: lire.chaineOuNull(p, "repere"),
    };
  },
  ossature(etat, p) {
    const genre = lire.enumeration(p, "genre", ["mur", "toit"] as const);
    const hoteId = lire.objet(etat, p, "hoteId");
    const hote = etat.objets[hoteId]!;
    if (genre === "mur" && hote.classe !== "mur") throw new ErreurCommande("precondition", "hoteId", `${hoteId} (${hote.classe}) : une ossature de mur se génère depuis un mur`);
    if (genre === "toit" && hote.classe !== "toiture") throw new ErreurCommande("precondition", "hoteId", `${hoteId} (${hote.classe}) : une charpente se génère depuis une toiture`);
    const g = p["generation"];
    let generation: { elements: number } | null = null;
    if (g && typeof g === "object") { const q = g as { elements?: unknown }; if (typeof q.elements !== "number") throw new ErreurCommande("invalide", "generation", "{ elements } attendu"); generation = { elements: q.elements }; }
    return {
      nom: lire.chaine(p, "nom").trim() || (genre === "mur" ? "Ossature" : "Charpente"),
      genre, hoteId,
      position: lire.point(p, "position")!,
      entraxe: lire.longueur(p, "entraxe", { strict: true })!,
      sectionMontant: lireSectionBois(etat, p, "sectionMontant"),
      sectionLisse: p["sectionLisse"] === undefined || p["sectionLisse"] === null ? null : lireSectionBois(etat, p, "sectionLisse"),
      generation,
    };
  },
  "panneau-clt"(etat, p) {
    const pose = lire.enumeration(p, "pose", ["mur", "plancher"] as const);
    const epaisseur = lire.longueur(p, "epaisseur", { strict: true })!;
    const couches = lire.nombre(p, "couches", { entier: true, min: 1, max: 15 })!;
    const profil = lireProfilCatalogue(etat, p, "profil");
    const commun = { nom: lire.chaineOuNull(p, "nom"), pose, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, epaisseur, couches, essence: lire.chaineOuNull(p, "essence"), classe: lire.chaineOuNull(p, "classe"), profil };
    if (pose === "mur") {
      const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "panneau de longueur nulle");
      return { ...commun, a, b, hauteur: lire.longueur(p, "hauteur", { strict: true })!, contour: [], trous: [] };
    }
    const contour = lire.points(p, "contour", { min: 3 });
    return { ...commun, a: null, b: null, hauteur: null, contour, trous: lire.trous(p) };
  },
  "assemblage-bois"(etat, p) {
    const a = lire.objet(etat, p, "a"), b = lire.objet(etat, p, "b");
    if (a === b) throw new ErreurCommande("invalide", "b", "un assemblage relie deux pièces différentes");
    for (const [cle, id] of [["a", a], ["b", b]] as const) {
      const c = etat.objets[id]!.classe;
      if (c !== "element-bois" && c !== "panneau-clt" && c !== "poteau" && c !== "poutre") throw new ErreurCommande("precondition", cle, `${id} (${c}) : un assemblage bois relie des pièces de bois, panneaux CLT, poteaux ou poutres`);
    }
    const type = lire.enumeration(p, "type", ["tenon-mortaise", "mi-bois", "embrevement", "queue-d-aronde", "enture", "equerre", "sabot", "plaque", "ferrure", "boulon-broche", "vis"] as const);
    const nature: "bois-bois" | "bois-metal" = ["tenon-mortaise", "mi-bois", "embrevement", "queue-d-aronde", "enture"].includes(type) ? "bois-bois" : "bois-metal";
    const q = p["quincaillerie"] ?? [];
    if (!Array.isArray(q)) throw new ErreurCommande("invalide", "quincaillerie", "liste { designation, nombre, source? } attendue");
    const quincaillerie = q.map((x, i) => {
      const r = x as { designation?: unknown; nombre?: unknown; source?: unknown };
      if (!r || typeof r.designation !== "string" || !r.designation.trim() || typeof r.nombre !== "number" || !Number.isInteger(r.nombre) || r.nombre < 1) throw new ErreurCommande("invalide", `quincaillerie[${i}]`, "{ designation, nombre ≥ 1, source? } attendu");
      return { designation: r.designation.trim(), nombre: r.nombre, source: typeof r.source === "string" && r.source.trim() ? r.source.trim() : null };
    });
    const pl = p["platine"];
    let platine: { largeur: Longueur; hauteur: Longueur; epaisseur: Longueur } | null = null;
    if (pl && typeof pl === "object") { const r = pl as Brut; platine = { largeur: lire.longueur(r, "largeur", { strict: true })!, hauteur: lire.longueur(r, "hauteur", { strict: true })!, epaisseur: lire.longueur(r, "epaisseur", { strict: true })! }; }
    if (nature === "bois-bois" && platine) throw new ErreurCommande("invalide", "platine", "un assemblage bois–bois n'a pas de platine");
    return { nom: lire.chaineOuNull(p, "nom"), type, nature, a, b, position: lire.point(p, "position")!, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, quincaillerie, platine };
  },
  // Ontologie tôlerie (P2-4).
  tole(etat, p) {
    const longueur = lire.longueur(p, "longueur", { strict: true })!, largeur = lire.longueur(p, "largeur", { strict: true })!, epaisseur = lire.longueur(p, "epaisseur", { strict: true })!;
    if (epaisseur.value >= Math.min(longueur.value, largeur.value) / 2) throw new ErreurCommande("invalide", "epaisseur", "épaisseur incompatible avec la face de base");
    const plisBrut = p["plis"] ?? [];
    if (!Array.isArray(plisBrut) || plisBrut.length > 4) throw new ErreurCommande("invalide", "plis", "liste de 0 à 4 plis { bord, angle, longueur, rayon? } (un par bord)");
    const bords = new Set<string>();
    const plis = plisBrut.map((x, i) => {
      const r = x as Brut;
      const bord = lire.enumeration(r, "bord", ["x0", "x1", "y0", "y1"] as const);
      if (bords.has(bord)) throw new ErreurCommande("invalide", `plis[${i}].bord`, `deux plis sur le bord ${bord}`);
      bords.add(bord);
      const angle = lire.angle(r, "angle")!;
      if (Math.abs(angle.value) < 1e-9 || Math.abs(angle.value) > 180) throw new ErreurCommande("invalide", `plis[${i}].angle`, "angle de pli entre −180° et 180°, non nul");
      return { bord, angle, longueur: lire.longueur(r, "longueur", { strict: true })!, rayon: lire.longueur(r, "rayon", { optionnel: true, strict: true }) };
    });
    const pb = p["pliage"];
    let pliage: { catalogueId: string } | { facteurK: number; source: string } | null = null;
    if (pb && typeof pb === "object") {
      const r = pb as Brut;
      if (typeof r["catalogueId"] === "string") {
        const cat = etat.definitions[r["catalogueId"]];
        if (!cat || cat.classe !== "catalogue") throw new ErreurCommande("precondition", "pliage.catalogueId", `table de pliage inconnue : ${r["catalogueId"]}`);
        if (cat.params["ontologie"] !== "sheetmetal") throw new ErreurCommande("precondition", "pliage.catalogueId", `${cat.nom} n'est pas une table de pliage (catalogue de l'ontologie ${String(cat.params["ontologie"] ?? "?")})`);
        pliage = { catalogueId: cat.id };
      } else {
        const k = lire.nombre(r, "facteurK", { min: 0, max: 1 });
        const source = lire.chaine(r, "source").trim();
        if (!source) throw new ErreurCommande("invalide", "pliage.source", "un facteur K déclaré porte sa source (R3)");
        pliage = { facteurK: k!, source };
      }
    }
    return {
      nom: lire.chaineOuNull(p, "nom"),
      repere: lire.chaineOuNull(p, "repere"),
      position: lire.point(p, "position")!,
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      z: lire.nombre(p, "z", { optionnel: true }) ?? 0,
      longueur, largeur, epaisseur,
      materiau: lire.chaineOuNull(p, "materiau"),
      rayonInterieur: lire.longueur(p, "rayonInterieur", { strict: true })!,
      plis, pliage,
    };
  },
  // Ontologie réseaux (P2-5) : rien n'est supposé — section, fluide, matériau, sens viennent du projet ou de sa spécification.
  "segment-reseau"(etat, p) {
    const systeme = lire.enumeration(p, "systeme", SYSTEMES_RESEAU);
    const sommets = lireSommets3(p, "sommets", 2);
    for (let i = 1; i < sommets.length; i++) if (Math.hypot(sommets[i]!.x - sommets[i - 1]!.x, sommets[i]!.y - sommets[i - 1]!.y, sommets[i]!.z - sommets[i - 1]!.z) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "sommets", `tronçon ${i} de longueur nulle`);
    const sec = lireSectionReseau(etat, p, "section", systeme);
    const spec = lireSpecification(etat, p, systeme, sec);
    return {
      nom: lire.chaineOuNull(p, "nom"), repere: lire.chaineOuNull(p, "repere"), systeme, sommets,
      section: sec.section, profil: sec.profil,
      fluide: lire.chaineOuNull(p, "fluide") ?? spec.fluide ?? sec.fluide, materiau: lire.chaineOuNull(p, "materiau") ?? spec.materiau ?? sec.materiau,
      sens: lire.enumeration(p, "sens", ["a-vers-b", "b-vers-a", "indifferent"] as const, "indifferent"), specificationId: spec.id,
    };
  },
  "raccord-reseau"(etat, p) {
    const type = lire.enumeration(p, "type", ["coude", "te", "croix", "reduction", "manchon", "bouchon"] as const);
    const systeme = lire.enumeration(p, "systeme", SYSTEMES_RESEAU);
    const sec = lireSectionReseau(etat, p, "section", systeme);
    const ports = lirePorts(etat, p, "ports", systeme);
    if (ports.length !== PORTS_PAR_RACCORD[type]) throw new ErreurCommande("invalide", "ports", `un raccord « ${type} » porte ${PORTS_PAR_RACCORD[type]} port(s), ${ports.length} donné(s)`);
    if (type === "reduction" && !ports.some((x) => x.section)) throw new ErreurCommande("invalide", "ports", "une réduction déclare la section propre d'au moins un port");
    const spec = lireSpecification(etat, p, systeme, sec);
    return { nom: lire.chaineOuNull(p, "nom"), type, systeme, position: lire.point(p, "position")!, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, section: sec.section, ports, profil: sec.profil, fluide: lire.chaineOuNull(p, "fluide") ?? spec.fluide ?? sec.fluide, materiau: lire.chaineOuNull(p, "materiau") ?? spec.materiau ?? sec.materiau, specificationId: spec.id };
  },
  vanne(etat, p) {
    const sec = lireSectionReseau(etat, p, "section", "tuyau");
    const spec = lireSpecification(etat, p, "tuyau", sec);
    const longueur = lire.longueur(p, "longueur", { strict: true })!;
    return { nom: lire.chaineOuNull(p, "nom"), repere: lire.chaineOuNull(p, "repere"), type: lire.enumeration(p, "type", ["arret", "reglage", "anti-retour", "securite", "trois-voies"] as const), position: lire.point(p, "position")!, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, section: sec.section, longueur, fluide: lire.chaineOuNull(p, "fluide") ?? spec.fluide ?? sec.fluide, materiau: lire.chaineOuNull(p, "materiau") ?? spec.materiau ?? sec.materiau, specificationId: spec.id, profil: sec.profil };
  },
  "equipement-reseau"(etat, p) {
    const nom = lire.chaine(p, "nom").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom requis");
    const type = lire.chaine(p, "type").trim();
    if (!type) throw new ErreurCommande("invalide", "type", "type déclaré requis (pompe, ventilateur, centrale…)");
    const ports = lirePorts(etat, p, "ports", null);
    for (const [i, x] of ports.entries()) if (!x.section) throw new ErreurCommande("invalide", `ports[${i}].section`, "chaque port d'un équipement déclare sa section");
    return { nom, repere: lire.chaineOuNull(p, "repere"), type, categorie: lire.enumeration(p, "categorie", ["terminal", "mouvement", "conversion", "stockage", "traitement", "controle"] as const), position: lire.point(p, "position")!, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, longueur: lire.longueur(p, "longueur", { strict: true })!, largeur: lire.longueur(p, "largeur", { strict: true })!, hauteur: lire.longueur(p, "hauteur", { strict: true })!, ports };
  },
  "support-reseau"(etat, p) {
    const porteId = lire.objet(etat, p, "porteId");
    if (etat.objets[porteId]!.classe !== "segment-reseau") throw new ErreurCommande("precondition", "porteId", `${porteId} n'est pas un segment de réseau`);
    const type = lire.enumeration(p, "type", ["collier", "suspente", "rail", "console"] as const);
    const longueur = lire.longueur(p, "longueur", { optionnel: true, strict: true });
    if (type === "suspente" && !longueur) throw new ErreurCommande("invalide", "longueur", "une suspente déclare sa longueur");
    return { nom: lire.chaineOuNull(p, "nom"), type, porteId, position: lire.point(p, "position")!, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, longueur };
  },
  // Bâtiment P2 (P2-6) : rien n'est supposé — hauteurs, épaisseurs, entraxes et flèches sont saisis.
  plafond(_etat, p) {
    const c = contour(p);
    const epaisseur = lire.longueur(p, "epaisseur", { strict: true })!;
    return { ...c, nom: lire.chaineOuNull(p, "nom"), hauteur: lire.longueur(p, "hauteur", { strict: true })!, epaisseur, suspendu: lire.booleen(p, "suspendu", false), materiau: lire.chaineOuNull(p, "materiau") };
  },
  coque(_etat, p) {
    const c = contour(p);
    // Le dôme est maillé sur le seul contour : un trou serait rebouché en silence (relecture Codex #99) → refus nommé.
    if (c.trous.length) throw new ErreurCommande("invalide", "trous", "coque : les trous ne sont pas construits (dôme sur le contour seul) — contour sans trou attendu");
    return { ...c, nom: lire.chaineOuNull(p, "nom"), decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, fleche: lire.longueur(p, "fleche", { strict: true })!, epaisseur: lire.longueur(p, "epaisseur", { strict: true })!, materiau: lire.chaineOuNull(p, "materiau") };
  },
  rampe(_etat, p) {
    const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "rampe de longueur nulle");
    return { nom: lire.chaineOuNull(p, "nom"), a, b, largeur: lire.longueur(p, "largeur", { strict: true })!, hauteurAFranchir: lire.longueur(p, "hauteurAFranchir", { strict: true })!, epaisseur: lire.longueur(p, "epaisseur", { strict: true })!, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" } };
  },
  echelle(_etat, p) {
    const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "direction de l'échelle indéterminée (a = b)");
    const hauteur = lire.longueur(p, "hauteur", { strict: true })!;
    const entraxe = lire.longueur(p, "entraxeBarreaux", { strict: true })!;
    if (entraxe.value >= hauteur.value) throw new ErreurCommande("invalide", "entraxeBarreaux", "entraxe des barreaux supérieur à la hauteur");
    const crin = lire.longueur(p, "crinolineDepuis", { optionnel: true, strict: true });
    if (crin && crin.value >= hauteur.value) throw new ErreurCommande("invalide", "crinolineDepuis", "la crinoline commence au-dessus de l'échelle");
    return { nom: lire.chaineOuNull(p, "nom"), a, b, hauteur, largeur: lire.longueur(p, "largeur", { strict: true })!, entraxeBarreaux: entraxe, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, crinolineDepuis: crin };
  },
  "mur-rideau"(_etat, p) {
    const a = lire.point(p, "a")!, b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "mur-rideau de longueur nulle");
    const hauteur = lire.longueur(p, "hauteur", { strict: true })!;
    const em = lire.longueur(p, "entraxeMontants", { strict: true })!, et = lire.longueur(p, "entraxeTraverses", { strict: true })!;
    if (em.value > distance(a, b) + 1e-9) throw new ErreurCommande("invalide", "entraxeMontants", "entraxe des montants supérieur à la longueur");
    if (et.value > hauteur.value + 1e-9) throw new ErreurCommande("invalide", "entraxeTraverses", "entraxe des traverses supérieur à la hauteur");
    return { nom: lire.chaineOuNull(p, "nom"), a, b, hauteur, entraxeMontants: em, entraxeTraverses: et, largeurProfil: lire.longueur(p, "largeurProfil", { strict: true })!, profondeurProfil: lire.longueur(p, "profondeurProfil", { strict: true })!, epaisseurVitrage: lire.longueur(p, "epaisseurVitrage", { strict: true })!, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, remplissage: lire.enumeration(p, "remplissage", ["vitre", "opaque"] as const, "vitre") };
  },
  terrain(_etat, p) {
    const points = lireSommets3(p, "points", 3);
    if (points.length > 20000) throw new ErreurCommande("invalide", "points", "20 000 points au plus");
    const cles = new Set(points.map((q) => `${Math.round(q.x * 1e6)}|${Math.round(q.y * 1e6)}`));
    if (cles.size !== points.length) throw new ErreurCommande("invalide", "points", "deux points du semis ont la même position en plan");
    return { nom: lire.chaineOuNull(p, "nom"), points, epaisseur: lire.longueur(p, "epaisseur", { optionnel: true }) ?? { value: 0, unit: "m" }, source: lire.chaineOuNull(p, "source") };
  },
  reservation(etat, p) {
    const c = contour(p);
    const hoteId = lire.chaineOuNull(p, "hoteId");
    if (hoteId !== null) { const h = etat.objets[hoteId]; if (!h || !["mur", "dalle", "poteau", "poutre", "plaque", "panneau-clt", "toiture"].includes(h.classe)) throw new ErreurCommande("precondition", "hoteId", `${hoteId} : hôte d'une réservation = mur, dalle, poteau, poutre, plaque, panneau CLT ou toiture`); }
    const pourId = lire.chaineOuNull(p, "pourId");
    if (pourId !== null && !etat.objets[pourId]) throw new ErreurCommande("precondition", "pourId", `objet inconnu : ${pourId}`);
    return { ...c, nom: lire.chaineOuNull(p, "nom"), hoteId, z: lire.nombre(p, "z", { optionnel: true }) ?? 0, hauteur: lire.longueur(p, "hauteur", { strict: true })!, pourId, statut: lire.enumeration(p, "statut", ["demandee", "accordee", "refusee"] as const, "demandee") };
  },
  "installation-chantier"(_etat, p) {
    const c = contour(p);
    const nom = lire.chaine(p, "nom").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom requis");
    const date = (cle: string): string | null => { const v = lire.chaineOuNull(p, cle); if (v === null) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErreurCommande("invalide", cle, "date ISO (AAAA-MM-JJ) attendue"); return v; };
    const debut = date("debut"), fin = date("fin");
    if (debut && fin && fin < debut) throw new ErreurCommande("invalide", "fin", "fin avant le début");
    return { ...c, nom, type: lire.enumeration(p, "type", ["grue", "base-vie", "stockage", "cloture", "acces", "levage", "autre"] as const), hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }), debut, fin, phaseChantier: lire.chaineOuNull(p, "phaseChantier") };
  },
  "surface-libre"(_etat, p) {
    const sommets = lireSommets3(p, "sommets", 3);
    if (sommets.length > 50000) throw new ErreurCommande("invalide", "sommets", "50 000 sommets au plus");
    const f = p["faces"];
    if (!Array.isArray(f) || !f.length || !f.every((x) => Array.isArray(x) && x.length >= 3 && x.length <= 4 && x.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < sommets.length))) throw new ErreurCommande("invalide", "faces", "liste de faces (3 ou 4 indices de sommets) requise");
    const faces = (f as number[][]).map((x) => [...x]);
    if (faces.length > 50000) throw new ErreurCommande("invalide", "faces", "50 000 faces au plus");
    const niveaux = lire.nombre(p, "niveaux", { optionnel: true, entier: true, min: 0, max: 4 }) ?? 1;
    // Budget de subdivision (relecture Codex #99) : triangles × 4ⁿ bornés, sinon la surface lissée épuise la mémoire du navigateur et du serveur.
    const triangles = faces.reduce((s, f) => s + (f.length === 4 ? 2 : 1), 0);
    if (triangles * 4 ** niveaux > BUDGET_SUBDIVISION) throw new ErreurCommande("invalide", "niveaux", `surface libre : ${triangles} triangle(s) × 4^${niveaux} = ${triangles * 4 ** niveaux} faces subdivisées, plus que ${BUDGET_SUBDIVISION} — réduisez le niveau de subdivision ou le maillage de contrôle`);
    const o = p["origine"];
    const origine = o && typeof o === "object" && typeof (o as { classe?: unknown }).classe === "string" && typeof (o as { id?: unknown }).id === "string" ? { classe: (o as { classe: string }).classe, id: (o as { id: string }).id } : null;
    return { nom: lire.chaineOuNull(p, "nom"), sommets, faces, niveaux, origine, ferme: lire.booleen(p, "ferme", false) };
  },
  "bloc-occurrence"(_etat, p) {
    return { position: lire.point(p, "position")!, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }) ?? 1, ...(lire.booleen(p, "miroir", false) ? { miroir: true as const } : {}) };
  },
};

/** Renflement d'un mur courbe (D-086) : |b| ≤ 1 ; nul ou absent : mur droit (clé omise). */
function renflementMur(_etat: ModeleAtelier, p: Brut): { renflement?: number } {
  const b = p["renflement"];
  if (b === undefined || b === null || b === 0) return {};
  if (typeof b !== "number" || !Number.isFinite(b) || Math.abs(b) > 1) throw new ErreurCommande("invalide", "renflement", "renflement de mur : nombre entre −1 et 1 (demi-cercle au plus)");
  return { renflement: b };
}

function ouverture(etat: ModeleAtelier, p: Brut): ParamsParClasse["porte"] {
  const murHoteId = lire.chaine(p, "murHoteId");
  const hote = etat.objets[murHoteId];
  if (!hote || hote.classe !== "mur") throw new ErreurCommande("precondition", "murHoteId", `mur hôte introuvable : ${murHoteId}`);
  const position = lire.nombre(p, "position", { min: 0, max: 1 })!;
  const largeur = lire.longueur(p, "largeur", { strict: true })!;
  // Mur courbe (D-095) : position en fraction de la longueur d'arc de l'axe.
  const longueurMur = longueurAxeMur(hote.params);
  const demi = largeur.value / 2 / longueurMur;
  if (position - demi < -1e-9 || position + demi > 1 + 1e-9) throw new ErreurCommande("precondition", "position", "l'emprise de l'ouverture sort du mur hôte");
  return {
    murHoteId,
    position,
    largeur,
    hauteur: lire.longueur(p, "hauteur", { strict: true })!,
    allege: lire.longueur(p, "allege", { optionnel: true }),
    repere: lire.chaineOuNull(p, "repere"),
    ...cintreOuverture(p, largeur.value),
  };
}

/** Haut cintré (D-141) : absent ou null, baie rectangulaire (clé omise). */
function cintreOuverture(p: Brut, largeur: number): { cintre?: Cintre } {
  const hauteur = lire.longueur(p, "hauteur", { strict: true })!.value;
  const c = lireCintre(p["cintre"], largeur, hauteur);
  return c ? { cintre: c } : {};
}

/**
 * Tangentes imposées d'une courbe (D-082) : une entrée par point, `null` = tangente libre (courbe passant par les
 * points) ; vecteur en mètres (direction et intensité). Absent, ou toutes libres : clé omise.
 */
/** Dépouille et inclinaison d'un solide fermé (D-148) : angles saisis, face haute contrôlée. */
function formeSolide(p: Brut, ferme: boolean): { depouille?: Angle; inclinaison?: { angle: Angle; direction: Angle } } {
  const dep = lire.angle(p, "depouille", { optionnel: true });
  const brut = p["inclinaison"];
  let inclinaison: { angle: Angle; direction: Angle } | undefined;
  if (brut !== undefined && brut !== null) {
    if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "inclinaison", "inclinaison : { angle, direction }");
    const q = brut as Brut;
    const angle = lire.angle(q, "angle")!;
    if (!(angle.value > 0 && angle.value <= 60)) throw new ErreurCommande("invalide", "inclinaison.angle", "inclinaison entre 0 (exclu) et 60°");
    inclinaison = { angle: { value: angle.value, unit: "deg" }, direction: { value: (lire.angle(q, "direction", { optionnel: true }) ?? { value: 0 }).value, unit: "deg" } };
  }
  const depouille = dep && dep.value !== 0 ? { value: dep.value, unit: "deg" as const } : undefined;
  if (!depouille && !inclinaison) return {};
  if (depouille && !(Math.abs(depouille.value) < 60)) throw new ErreurCommande("invalide", "depouille", "dépouille entre −60° et 60°");
  if (!ferme) throw new ErreurCommande("invalide", depouille ? "depouille" : "inclinaison", "dépouille et inclinaison réservées aux solides fermés");
  const h = lire.longueur(p, "hauteur", { optionnel: true });
  if (!h || !(h.value > 0)) throw new ErreurCommande("invalide", "hauteur", "dépouille ou inclinaison : hauteur du solide requise");
  const c = contour(p);
  if (depouille && c.trous.length) throw new ErreurCommande("invalide", "depouille", "dépouille d'un solide à trous : non prise en charge");
  if (!faceHauteSolide({ ...c, hauteur: h, ...(depouille ? { depouille } : {}), ...(inclinaison ? { inclinaison } : {}) })) throw new ErreurCommande("invalide", "depouille", "dépouille trop forte pour cette hauteur : la face haute se retourne");
  return { ...(depouille ? { depouille } : {}), ...(inclinaison ? { inclinaison } : {}) };
}

/** Solide associé (D-114) : esquisse source au profil fermé ; absente : solide libre. */
function sourceSolide(etat: ModeleAtelier, p: Brut): { sourceId?: string } {
  const id = p["sourceId"];
  if (id === undefined || id === null) return {};
  if (typeof id !== "string" || !etat.objets[id]) throw new ErreurCommande("precondition", "sourceId", `esquisse source inconnue : ${String(id)}`);
  if (!profilFerme(etat.objets[id]!)) throw new ErreurCommande("precondition", "sourceId", `${id} n'a pas de profil fermé (esquisse fermée, cercle, ellipse, courbe fermée)`);
  return { sourceId: id };
}

/** Hachure associative (D-092) : objet source à contour fermé dont la hachure suit le contour ; absente : libre. */
function sourceHachure(etat: ModeleAtelier, p: Brut, forme: string): { sourceId?: string } {
  const id = p["sourceId"];
  if (id === undefined || id === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "sourceId", "objet source réservé aux hachures");
  if (typeof id !== "string" || !etat.objets[id]) throw new ErreurCommande("precondition", "sourceId", `objet source inconnu : ${String(id)}`);
  if (!contourFerme(etat.objets[id]!)) throw new ErreurCommande("precondition", "sourceId", `${id} n'a pas de contour fermé (dalle, pièce, zone, polygone ou rectangle)`);
  return { sourceId: id };
}

/** Axe associé au centre d'un cercle, d'un arc ou d'une ellipse (D-132) : lignes de construction seulement. */
function axeDeDe(etat: ModeleAtelier, p: Brut, forme: string): { axeDe?: { sourceId: string; angle: number; debord: number } } {
  const brut = p["axeDe"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "construction") throw new ErreurCommande("invalide", "axeDe", "axe associé réservé aux lignes de construction");
  const q = brut as Brut;
  const sourceId = lire.chaine(q, "sourceId");
  const s = etat.objets[sourceId];
  if (!s || s.classe !== "esquisse" || !s.params.centre || !s.params.rayon) throw new ErreurCommande("precondition", "axeDe", `${sourceId} : cercle, arc ou ellipse attendu`);
  const angle = q["angle"];
  if (typeof angle !== "number" || !Number.isFinite(angle)) throw new ErreurCommande("invalide", "axeDe.angle", "angle en degrés");
  return { axeDe: { sourceId, angle, debord: lire.nombre(q, "debord", { min: 0, max: 100 })! } };
}

/** Lignes d'un motif importé (D-121) : hachures seulement, une à huit familles (angle, pas en m) ; null les retire. */
function motifLignesDe(p: Brut, forme: string): { motifLignes?: { angle: number; pas: number }[] } {
  const brut = p["motifLignes"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "motifLignes", "lignes de motif réservées aux hachures");
  if (!Array.isArray(brut) || brut.length < 1 || brut.length > 8) throw new ErreurCommande("invalide", "motifLignes", "une à huit lignes de motif { angle, pas }");
  return {
    motifLignes: brut.map((x, i) => {
      const q = (x ?? {}) as Brut;
      const angle = q["angle"];
      if (typeof angle !== "number" || !Number.isFinite(angle)) throw new ErreurCommande("invalide", `motifLignes[${i}].angle`, "angle en degrés");
      return { angle, pas: lire.nombre(q, "pas", { min: 1e-5, max: 1000 })! };
    }),
  };
}

/** Dégradé (D-120) : hachures seulement ; deux gris entre 0 (noir) et 1 (blanc) et un angle ; null le retire. */
function degradeDe(p: Brut, forme: string): { degrade?: { de: number; a: number; angle: { value: number; unit: "deg" } } } {
  const brut = p["degrade"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "hachure") throw new ErreurCommande("invalide", "degrade", "dégradé réservé aux hachures");
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "degrade", "dégradé : { de, a, angle }");
  const q = brut as Brut;
  const de = lire.nombre(q, "de", { min: 0, max: 1 })!;
  const a = lire.nombre(q, "a", { min: 0, max: 1 })!;
  const angle = lire.angle(q, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" as const };
  return { degrade: { de, a, angle: { value: angle.value, unit: "deg" } } };
}

/** Pente d'une dalle (D-140) : angle de 0 (exclu) à 60°, direction de montée ; null la retire. */
function penteDalle(p: Brut): { pente?: { angle: { value: number; unit: "deg" }; direction: { value: number; unit: "deg" } } } {
  const brut = p["pente"];
  if (brut === undefined || brut === null) return {};
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "pente", "pente : { angle, direction }");
  const q = brut as Brut;
  const angle = lire.angle(q, "angle")!;
  if (!(angle.value > 0 && angle.value <= 60)) throw new ErreurCommande("invalide", "pente.angle", "pente entre 0 (exclu) et 60°");
  const direction = lire.angle(q, "direction", { optionnel: true }) ?? { value: 0, unit: "deg" as const };
  return { pente: { angle: { value: angle.value, unit: "deg" }, direction: { value: direction.value, unit: "deg" } } };
}

/** Sens de l'épaisseur d'une dalle (D-144) : « bas » ou absent (vers le haut, clé omise). */
function sensDalle(p: Brut): { sens?: "bas" } {
  const v = p["sens"];
  if (v === undefined || v === null || v === "haut") return {};
  if (v !== "bas") throw new ErreurCommande("invalide", "sens", "sens de l'épaisseur : « haut » ou « bas »");
  return { sens: "bas" };
}

/** Retombée de rive (D-144) : largeur et hauteur > 0 ; l'anneau doit tenir dans la dalle sans toucher ses trémies. */
function retombeeDalle(p: Brut): { retombee?: { largeur: Longueur; hauteur: Longueur } } {
  const brut = p["retombee"];
  if (brut === undefined || brut === null) return {};
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "retombee", "retombée : { largeur, hauteur }");
  const q = brut as Brut;
  const largeur = lire.longueur(q, "largeur", { strict: true })!;
  const hauteur = lire.longueur(q, "hauteur", { strict: true })!;
  if (p["pente"] !== undefined && p["pente"] !== null) throw new ErreurCommande("invalide", "retombee", "retombée de rive : non prise en charge sur une dalle inclinée");
  const c = contour(p);
  const anneau = anneauRetombee({ contour: c.contour, retombee: { largeur, hauteur } });
  if (!anneau) throw new ErreurCommande("invalide", "retombee.largeur", "retombée plus large que la dalle ne le permet (contour intérieur retourné)");
  for (const [i, t] of c.trous.entries()) if (t.some((s) => !pointDansPolygone(s, anneau.interieur))) throw new ErreurCommande("invalide", "retombee.largeur", `la trémie ${i + 1} touche la retombée de rive`);
  return { retombee: { largeur, hauteur } };
}

/** Formes de section des poteaux qui demandent une épaisseur de paroi (D-139). */
export const PROFILES_POTEAU = ["I", "T", "L", "U"];

function tangentesDe(p: Brut, forme: string, n: number): { tangentes?: ({ x: number; y: number } | null)[] } {
  const brut = p["tangentes"];
  if (brut === undefined || brut === null) return {};
  if (forme !== "spline") throw new ErreurCommande("invalide", "tangentes", "tangentes réservées aux courbes (spline)");
  if (!Array.isArray(brut) || brut.length !== n) throw new ErreurCommande("invalide", "tangentes", `une tangente (ou null) par point : ${n} attendue(s)`);
  const t = brut.map((v, i) => {
    if (v === null) return null;
    const q = v as { x?: unknown; y?: unknown };
    if (typeof q.x !== "number" || typeof q.y !== "number" || !Number.isFinite(q.x) || !Number.isFinite(q.y)) throw new ErreurCommande("invalide", `tangentes[${i}]`, "vecteur { x, y } en mètres, ou null");
    if (Math.hypot(q.x, q.y) < 1e-9) throw new ErreurCommande("invalide", `tangentes[${i}]`, "tangente nulle : utiliser null (libre)");
    return { x: q.x, y: q.y };
  });
  return t.some((x) => x !== null) ? { tangentes: t } : {};
}

/**
 * Section de structure (P2-3) : soit saisie { forme, largeur, hauteur, epaisseur?, epaisseurAile? } (m), soit tirée
 * d'un catalogue sourcé du projet { catalogueId, designation } (D-180). Rien n'est supposé : une dimension requise
 * par la forme et absente refuse la commande.
 */
function lireSection(etat: ModeleAtelier, p: Brut, cle: string): SectionStructure {
  const v = p[cle];
  if (!v || typeof v !== "object") throw new ErreurCommande("invalide", cle, `« ${cle} » : section { forme, largeur, hauteur, … } ou { catalogueId, designation } requise`);
  const q = v as Brut;
  if (typeof q["catalogueId"] === "string") {
    const cat = etat.definitions[q["catalogueId"]];
    if (!cat || cat.classe !== ("catalogue" as typeof cat.classe)) throw new ErreurCommande("precondition", `${cle}.catalogueId`, `catalogue inconnu : ${q["catalogueId"]}`);
    const designation = lire.chaine(q, "designation").trim();
    const lignes = (cat.params["lignes"] as LigneCatalogue[] | undefined) ?? [];
    const ligne = lignes.find((l) => String(l.valeurs["designation"] ?? "").trim().toLowerCase() === designation.toLowerCase());
    if (!ligne) throw new ErreurCommande("precondition", `${cle}.designation`, `« ${designation} » absent du catalogue ${cat.nom}`);
    try { return sectionDepuisCatalogue(cat.id, ligne); } catch (e) { throw new ErreurCommande("precondition", `${cle}.designation`, e instanceof Error ? e.message : String(e)); }
  }
  const forme = lire.enumeration(q, "forme", FORMES_SECTION);
  const largeur = lire.longueur(q, "largeur", { strict: true })!;
  const hauteur = forme === "cercle" ? largeur : lire.longueur(q, "hauteur", { strict: true })!;
  const epaisseur = lire.longueur(q, "epaisseur", { optionnel: true, strict: true });
  const epaisseurAile = lire.longueur(q, "epaisseurAile", { optionnel: true, strict: true });
  if (AVEC_EPAISSEUR.includes(forme) && !epaisseur) throw new ErreurCommande("invalide", `${cle}.epaisseur`, `${forme} : épaisseur d'âme (ou de paroi) requise`);
  if (AVEC_AILE.includes(forme) && !epaisseurAile && !epaisseur) throw new ErreurCommande("invalide", `${cle}.epaisseurAile`, `${forme} : épaisseur d'aile requise`);
  if (epaisseur && epaisseur.value * 2 >= Math.min(largeur.value, hauteur.value)) throw new ErreurCommande("invalide", `${cle}.epaisseur`, "épaisseur incompatible avec les dimensions de la section");
  const masse = lire.nombre(q, "masseLineique", { optionnel: true, min: 0 });
  // Provenance facultative : relue dans le catalogue (source recalculée), jamais recopiée du client.
  const profil = lireProfilCatalogue(etat, q, "profil");
  return {
    forme, largeur, hauteur,
    epaisseur: AVEC_EPAISSEUR.includes(forme) ? epaisseur : null,
    epaisseurAile: AVEC_AILE.includes(forme) ? (epaisseurAile ?? epaisseur) : null,
    profil,
    // Masse linéique : seulement si elle vient d'un catalogue sourcé (profil), jamais saisie à la main (R3).
    masseLineique: profil && masse ? masse : null,
  };
}

const ROLES_BOIS = ["montant", "lisse", "sabliere", "traverse", "linteau", "appui", "poteau", "poutre", "solive", "entretoise", "panne", "chevron", "faitiere", "diagonale", "autre"] as const;

/** Provenance catalogue facultative { catalogueId, designation } → { catalogueId, designation, source } (ligne trouvée) ou null. */
function lireProfilCatalogue(etat: ModeleAtelier, p: Brut, cle: string): { catalogueId: string; designation: string; source: string } | null {
  const v = p[cle];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") throw new ErreurCommande("invalide", cle, `« ${cle} » : { catalogueId, designation } attendu`);
  const q = v as Brut;
  // La source n'est jamais reprise du client : la ligne du catalogue est relue et sa provenance recalculée (R3).
  const cat = etat.definitions[lire.chaine(q, "catalogueId")];
  if (!cat || cat.classe !== "catalogue") throw new ErreurCommande("precondition", `${cle}.catalogueId`, `catalogue inconnu : ${String(q["catalogueId"])}`);
  const designation = lire.chaine(q, "designation").trim();
  const ligne = ((cat.params["lignes"] as LigneCatalogue[] | undefined) ?? []).find((l) => String(l.valeurs["designation"] ?? "").trim().toLowerCase() === designation.toLowerCase());
  if (!ligne) throw new ErreurCommande("precondition", `${cle}.designation`, `« ${designation} » absent du catalogue ${cat.nom}`);
  return { catalogueId: cat.id, designation: String(ligne.valeurs["designation"]).trim(), source: `${ligne.source.source}, ${ligne.source.edition}, ${ligne.source.page}` };
}

/** Section de bois (P2-4) : { largeur, hauteur, essence?, classe? } (m) ou { catalogueId, designation } (catalogue sourcé). */
/** Perçage d'une opération exacte « trou » : centre, direction non nulle, Ø > 0, profondeur > 0 ou null (traversant) ; sinon rien. */
function lirePercage(brut: unknown): Percage | undefined {
  if (!brut || typeof brut !== "object") return undefined;
  const q = brut as Record<string, unknown>;
  const v3 = (v: unknown, cle: string): Vecteur3 => {
    const o = (v ?? {}) as Record<string, unknown>;
    for (const k of ["x", "y", "z"]) if (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)) throw new ErreurCommande("invalide", `operation.percage.${cle}`, "{ x, y, z } attendu");
    return { x: o["x"] as number, y: o["y"] as number, z: o["z"] as number };
  };
  const centre = v3(q["centre"], "centre"), direction = v3(q["direction"], "direction");
  if (Math.hypot(direction.x, direction.y, direction.z) < 1e-9) throw new ErreurCommande("invalide", "operation.percage.direction", "direction nulle");
  if (typeof q["diametre"] !== "number" || !(q["diametre"] > 0)) throw new ErreurCommande("invalide", "operation.percage.diametre", "diamètre strictement positif (m) attendu");
  const pf = q["profondeur"];
  if (pf !== null && pf !== undefined && (typeof pf !== "number" || !(pf > 0))) throw new ErreurCommande("invalide", "operation.percage.profondeur", "profondeur strictement positive (m) ou null (traversant)");
  return { centre, direction, diametre: q["diametre"], profondeur: pf === undefined ? null : (pf as number | null) };
}

function lireSectionBois(etat: ModeleAtelier, p: Brut, cle: string): SectionBois {
  const v = p[cle];
  if (!v || typeof v !== "object") throw new ErreurCommande("invalide", cle, `« ${cle} » : section { largeur, hauteur } ou { catalogueId, designation } requise`);
  const q = v as Brut;
  if (typeof q["catalogueId"] === "string" && typeof q["source"] !== "string") {
    const cat = etat.definitions[q["catalogueId"]];
    if (!cat || cat.classe !== "catalogue") throw new ErreurCommande("precondition", `${cle}.catalogueId`, `catalogue inconnu : ${q["catalogueId"]}`);
    const designation = lire.chaine(q, "designation").trim();
    const ligne = ((cat.params["lignes"] as LigneCatalogue[] | undefined) ?? []).find((l) => String(l.valeurs["designation"] ?? "").trim().toLowerCase() === designation.toLowerCase());
    if (!ligne) throw new ErreurCommande("precondition", `${cle}.designation`, `« ${designation} » absent du catalogue ${cat.nom}`);
    try { return sectionBoisDepuisCatalogue(cat.id, ligne); } catch (e) { throw new ErreurCommande("precondition", `${cle}.designation`, e instanceof Error ? e.message : String(e)); }
  }
  return {
    largeur: lire.longueur(q, "largeur", { strict: true })!,
    hauteur: lire.longueur(q, "hauteur", { strict: true })!,
    // Provenance facultative : relue dans le catalogue, jamais recopiée du client.
    profil: lireProfilCatalogue(etat, q, "profil"),
    essence: lire.chaineOuNull(q, "essence"),
    classe: lire.chaineOuNull(q, "classe"),
  };
}

const SYSTEMES_RESEAU = ["gaine", "tuyau", "chemin-de-cables", "conduit"] as const;

function lireSommets3(p: Brut, cle: string, min: number): { x: number; y: number; z: number }[] {
  const v = p[cle];
  if (!Array.isArray(v) || v.length < min || !v.every((q) => q && typeof q === "object" && [(q as { x?: unknown }).x, (q as { y?: unknown }).y, (q as { z?: unknown }).z].every((c) => typeof c === "number" && Number.isFinite(c)))) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste d'au moins ${min} points { x, y, z } (m, z depuis le niveau)`);
  // Repère : les sommets 3D sont dans le repère local du niveau par définition ; un point étiqueté d'un autre repère
  // (cadastral, géographique) n'est jamais réinterprété en silence — conversion explicite en amont (AGENTS.md, repères tagués).
  v.forEach((q, i) => { const f = (q as { frame?: unknown }).frame; if (f !== undefined && f !== "local") throw new ErreurCommande("invalide", `${cle}[${i}].frame`, `repère « ${String(f)} » refusé : les sommets 3D sont en repère local du niveau (convertissez explicitement)`); });
  return (v as { x: number; y: number; z: number }[]).map((q) => ({ x: q.x, y: q.y, z: q.z }));
}

/** Section de réseau (P2-5) : { forme: "circulaire", diametre, epaisseur? } / { forme: "rectangulaire", largeur, hauteur } (m) ou { catalogueId, designation }. */
function lireSectionReseau(etat: ModeleAtelier, p: Brut, cle: string, systeme: SystemeReseau | null): { section: SectionReseau; profil: ProfilReseau | null; fluide: string | null; materiau: string | null } {
  const v = p[cle];
  if (!v || typeof v !== "object") throw new ErreurCommande("invalide", cle, `« ${cle} » : section { forme, diametre | largeur, hauteur } ou { catalogueId, designation } requise`);
  const q = v as Brut;
  if (typeof q["catalogueId"] === "string" && typeof q["designation"] === "string" && q["forme"] === undefined) {
    const cat = etat.definitions[q["catalogueId"]];
    if (!cat || cat.classe !== "catalogue") throw new ErreurCommande("precondition", `${cle}.catalogueId`, `catalogue inconnu : ${q["catalogueId"]}`);
    const designation = q["designation"].trim();
    const ligne = ((cat.params["lignes"] as LigneCatalogue[] | undefined) ?? []).find((l) => String(l.valeurs["designation"] ?? "").trim().toLowerCase() === designation.toLowerCase());
    if (!ligne) throw new ErreurCommande("precondition", `${cle}.designation`, `« ${designation} » absent du catalogue ${cat.nom}`);
    try { return sectionReseauDepuisCatalogue(cat.id, ligne); } catch (e) { throw new ErreurCommande("precondition", `${cle}.designation`, e instanceof Error ? e.message : String(e)); }
  }
  const forme = lire.enumeration(q, "forme", ["circulaire", "rectangulaire"] as const);
  if (forme === "rectangulaire" && systeme === "tuyau") throw new ErreurCommande("invalide", `${cle}.forme`, "un tuyau est circulaire");
  // Provenance facultative : relue dans le catalogue (source et DN recalculés), jamais recopiée du client (R3).
  let profil: ProfilReseau | null = null;
  if (q["profil"] !== undefined && q["profil"] !== null) {
    const base = lireProfilCatalogue(etat, q, "profil")!;
    const cat = etat.definitions[base.catalogueId]!;
    const ligne = ((cat.params["lignes"] as LigneCatalogue[] | undefined) ?? []).find((l) => String(l.valeurs["designation"] ?? "").trim().toLowerCase() === base.designation.toLowerCase());
    const dn = ligne?.valeurs["diametre_nominal"];
    profil = { ...base, diametreNominal: typeof dn === "string" && dn.trim() ? dn.trim() : null };
  }
  if (forme === "circulaire") {
    const diametre = lire.longueur(q, "diametre", { strict: true })!;
    const epaisseur = lire.longueur(q, "epaisseur", { optionnel: true, strict: true });
    if (epaisseur && epaisseur.value * 2 >= diametre.value) throw new ErreurCommande("invalide", `${cle}.epaisseur`, "épaisseur incompatible avec le diamètre");
    return { section: { forme, diametre, epaisseur }, profil, fluide: null, materiau: null };
  }
  return { section: { forme, largeur: lire.longueur(q, "largeur", { strict: true })!, hauteur: lire.longueur(q, "hauteur", { strict: true })! }, profil, fluide: null, materiau: null };
}

/** Ports déclarés d'un raccord ou d'un équipement : identifiants uniques, décalages finis, sens, section / système / fluide propres facultatifs. */
function lirePorts(etat: ModeleAtelier, p: Brut, cle: string, systeme: SystemeReseau | null): PortReseau[] {
  const v = p[cle];
  if (!Array.isArray(v) || !v.length || v.length > 8) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste de 1 à 8 ports { id, dx, dy, dz, sens?, section?, systeme?, fluide? }`);
  const ids = new Set<string>();
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new ErreurCommande("invalide", `${cle}[${i}]`, "port attendu");
    const q = x as Brut;
    const id = lire.chaineOuNull(q, "id") ?? String(i + 1);
    if (ids.has(id)) throw new ErreurCommande("invalide", `${cle}[${i}].id`, `port « ${id} » en double`);
    ids.add(id);
    for (const k of ["dx", "dy", "dz"]) if (q[k] !== undefined && q[k] !== null && (typeof q[k] !== "number" || !Number.isFinite(q[k] as number))) throw new ErreurCommande("invalide", `${cle}[${i}].${k}`, "nombre attendu");
    // Le système d'un port d'équipement est déclaré, jamais supposé (un port sans système deviendrait un port de tuyauterie : refus nommé).
    // Raccord ou vanne : le port hérite du système déclaré de l'objet ; équipement (aucun système propre) : le port doit le déclarer.
    if ((q["systeme"] === undefined || q["systeme"] === null) && !systeme) throw new ErreurCommande("invalide", `${cle}[${i}].systeme`, `port « ${id} » : système requis (${SYSTEMES_RESEAU.join(" | ")}) — aucun système n'est supposé`);
    const sys = q["systeme"] === undefined || q["systeme"] === null ? systeme! : lire.enumeration(q, "systeme", SYSTEMES_RESEAU);
    const section = q["section"] === undefined || q["section"] === null ? null : lireSectionReseau(etat, q, "section", sys ?? systeme).section;
    return { id, dx: (q["dx"] as number | undefined) ?? 0, dy: (q["dy"] as number | undefined) ?? 0, dz: (q["dz"] as number | undefined) ?? 0, sens: lire.enumeration(q, "sens", ["entree", "sortie", "indifferent"] as const, "indifferent"), section, systeme: sys, fluide: lire.chaineOuNull(q, "fluide") };
  });
}

/** Spécification suivie (DA-12-07) : même système ; avec un catalogue, la section vient de ce catalogue et sa désignation est admise. */
function lireSpecification(etat: ModeleAtelier, p: Brut, systeme: SystemeReseau, sec: { section: SectionReseau; profil: ProfilReseau | null }): { id: string | null; fluide: string | null; materiau: string | null } {
  const id = lire.chaineOuNull(p, "specificationId");
  if (id === null) return { id: null, fluide: null, materiau: null };
  const d = etat.definitions[id];
  if (!d || d.classe !== "specification") throw new ErreurCommande("precondition", "specificationId", `spécification inconnue : ${id}`);
  const q = d.params as { systeme?: string; fluide?: string | null; materiau?: string | null; catalogueId?: string | null; designations?: string[] };
  if (q.systeme !== systeme) throw new ErreurCommande("precondition", "specificationId", `spécification ${d.nom} : système ${q.systeme}, objet ${systeme}`);
  if (q.catalogueId) {
    if (!sec.profil || sec.profil.catalogueId !== q.catalogueId) throw new ErreurCommande("precondition", "section", `spécification ${d.nom} : section à prendre dans son catalogue (${etat.definitions[q.catalogueId]?.nom ?? q.catalogueId})`);
    if (q.designations?.length && !q.designations.some((x) => x.toLowerCase() === sec.profil!.designation.toLowerCase())) throw new ErreurCommande("precondition", "section", `spécification ${d.nom} : désignation « ${sec.profil.designation} » non admise (${q.designations.join(", ")})`);
  }
  return { id, fluide: q.fluide ?? null, materiau: q.materiau ?? null };
}

/** Vecteur 3D { x, y, z } (m ou direction), valeur par défaut si absent. */
function lireVecteur3(p: Brut, cle: string, defaut: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const v = p[cle];
  if (v === undefined || v === null) return { ...defaut };
  const q = v as { x?: unknown; y?: unknown; z?: unknown };
  if (typeof v !== "object" || ![q.x, q.y, q.z].every((c) => typeof c === "number" && Number.isFinite(c))) throw new ErreurCommande("invalide", cle, `« ${cle} » : vecteur { x, y, z } attendu`);
  return { x: q.x as number, y: q.y as number, z: q.z as number };
}

/** Pose rigide 3D (P2-2) : { x, y, z, rx, ry, rz }, nulle par défaut ; rotation vectorielle en radians. */
function lirePose3(p: Brut): { x: number; y: number; z: number; rx: number; ry: number; rz: number } {
  const v = p["pose"];
  if (v === undefined || v === null) return { ...POSE_NULLE };
  if (typeof v !== "object") throw new ErreurCommande("invalide", "pose", "« pose » : { x, y, z, rx, ry, rz } attendu");
  const q = v as Record<string, unknown>;
  const out = { ...POSE_NULLE };
  for (const k of Object.keys(out) as (keyof typeof out)[]) {
    const c = q[k];
    if (c === undefined || c === null) continue;
    if (typeof c !== "number" || !Number.isFinite(c)) throw new ErreurCommande("invalide", `pose.${k}`, "nombre attendu");
    out[k] = c;
  }
  return out;
}

export function validerParams<C extends Classe>(etat: ModeleAtelier, classe: C, params: Brut): ParamsParClasse[C] {
  return VALIDATEURS[classe](etat, params);
}
