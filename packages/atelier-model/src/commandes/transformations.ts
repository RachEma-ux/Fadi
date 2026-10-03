/**
 * Transformations (annexe B, DA-02-01 à DA-02-14) sur une sélection typée (`cibles`) :
 * `transformer.deplacer`, `.copier`, `.tourner`, `.miroir`, `.echelle`, `.etirer`, `.ajuster`, `.prolonger`,
 * `.decaler`, `.repeter`, `.decomposer`, `.pointsDeControle`.
 *
 * Règles communes :
 * - classes admises : objets de niveau qui ont une géométrie (`CLASSES_TRANSFORMABLES`) ; niveau, calque,
 *   groupe, parcelle, emprise, hypothèse… refusés ; une baie seule est refusée (règle 2 : elle se déplace par
 *   `ouverture.deplacer`), elle suit son mur hôte ;
 * - échelle (D-014) : uniforme seulement ; ne modifie jamais un paramètre dimensionnel nommé des objets du
 *   bâtiment (épaisseur, hauteur, largeur, profondeur…) ; les tailles des esquisses suivent le facteur ;
 * - les angles des objets suivent la rotation, et sont réfléchis par un miroir (alignement gauche / droite
 *   d'un mur inversé, sens d'un arc inversé) ; aucune valeur n'est arrondie (R7) ;
 * - une copie est un nouvel objet saisi : ses valeurs gardent leurs annotations de statut ; les propriétés
 *   importées (`import.*`) ne sont pas recopiées (elles décrivent l'objet source) ;
 * - après transformation, contrôles propres de chaque classe (longueur minimale, contour, emprise des baies).
 */
import { TOLERANCES } from "../contrats/tolerances.js";
import type { Vecteur } from "../contrats/commandes.js";
import {
  CLASSES_BAIE,
  CLASSES_ESQUISSE,
  type ClasseObjet,
  type IdObjet,
  type ObjetModele,
  type ObjetMur,
} from "../ontologie/classes.js";
import { PREFIXE_PROPRIETE_IMPORT } from "../ontologie/proprietes.js";
import { estPointLocal, REPERE_LOCAL_PROJET, type PointLocal, type PolygoneAvecTrous, type TrouPolygone } from "../ontologie/reperes.js";
import { controlerGrandeur, type Grandeur } from "../ontologie/unites.js";
import {
  baiesDuMur,
  controlerContour,
  controlerEmprise,
  controlerIdentifiantLibre,
  controlerLongueurMin,
  controlerTrous,
  estBaie,
  exigerCibles,
  marquerSaisie,
  nomObjet,
  nouvelObjet,
  reposerBaies,
  supprimerObjet,
  type Corps,
} from "./communs.js";
import { controleEsquisse } from "./esquisses.js";
import { jsonCanonique } from "./empreinte.js";
import {
  distance,
  homothetie,
  intersectionDroites,
  longueurSegment,
  norme,
  parametreProjection,
  plus,
  pointDansPolygone,
  pt,
  RAD,
  rotation,
  sous,
  symetrie,
  translation,
  transformerPoint,
  vectoriel,
  fois,
  scalaire,
  type Transfo,
  type Vec,
} from "./geometrie.js";
import { motif, type Transaction } from "./transaction.js";

/** Classes transformables (objets de niveau ayant une géométrie propre). Les baies suivent leur mur. */
export const CLASSES_TRANSFORMABLES: readonly ClasseObjet[] = [
  "mur",
  "dalle",
  "toiture",
  "escalier",
  "poteau",
  "piece",
  "espace",
  "zone",
  "solide",
  ...CLASSES_ESQUISSE,
  "reference-plan",
  "cotation",
  "texte",
  "etiquette",
];

const ADMISES_SELECTION: readonly ClasseObjet[] = [...CLASSES_TRANSFORMABLES, ...CLASSES_BAIE];

// --- Image d'un objet par une transformation ---------------------------------

const echelle = <U extends "m">(g: Grandeur<U>, f: number): Grandeur<U> => (f === 1 ? g : { value: g.value * f, unit: g.unit });
const angleImage = (t: Transfo, a: Grandeur<"°">): Grandeur<"°"> => {
  const v = t.direction(a.value);
  return v === a.value ? a : { value: v, unit: "°" };
};
const pointImage = (t: Transfo, p: PointLocal): PointLocal => ((p.repereLocal ?? REPERE_LOCAL_PROJET) === REPERE_LOCAL_PROJET ? transformerPoint(t, p) : p);
const polyImage = (t: Transfo, poly: readonly PointLocal[]): PointLocal[] => poly.map((p) => pointImage(t, p));
const trousImage = (t: Transfo, trous: readonly TrouPolygone<PointLocal>[]): TrouPolygone<PointLocal>[] => trous.map((h) => ({ ...h, polygone: polyImage(t, h.polygone) }));
const pataImage = (t: Transfo, p: PolygoneAvecTrous<PointLocal>): PolygoneAvecTrous<PointLocal> => ({ contour: polyImage(t, p.contour), trous: trousImage(t, p.trous) });

/** Paramètres images (sans contrôle). Les paramètres non géométriques sont inchangés. */
export function imageParams(o: ObjetModele, t: Transfo): Record<string, unknown> {
  const f = t.facteur;
  switch (o.classe) {
    case "mur": {
      const p = o.params;
      const alignement = t.retourne && p.alignement !== "axe" ? (p.alignement === "gauche" ? "droite" : "gauche") : p.alignement;
      return { ...p, axe: { a: pointImage(t, p.axe.a), b: pointImage(t, p.axe.b) }, alignement };
    }
    case "dalle":
    case "toiture":
    case "solide":
      return { ...o.params, contour: polyImage(t, o.params.contour), trous: trousImage(t, o.params.trous) };
    case "esquisse.hachure":
      return { ...o.params, contour: polyImage(t, o.params.contour), trous: trousImage(t, o.params.trous), angle: angleImage(t, o.params.angle) };
    case "escalier":
      return { ...o.params, axe: { a: pointImage(t, o.params.axe.a), b: pointImage(t, o.params.axe.b) } };
    case "poteau":
      return { ...o.params, point: pointImage(t, o.params.point), angle: angleImage(t, o.params.angle) };
    case "piece": {
      const { aireCalculee, ...p } = o.params;
      const r: Record<string, unknown> = { ...p, polygones: o.params.polygones.map((x) => pataImage(t, x)) };
      if (o.params.etiquette !== undefined) r.etiquette = pointImage(t, o.params.etiquette);
      // L'aire calculée n'est conservée que si la transformation conserve les aires (déplacement, rotation, miroir).
      if (aireCalculee !== undefined && f === 1) r.aireCalculee = aireCalculee;
      return r;
    }
    case "espace":
    case "zone":
      return { ...o.params, polygones: o.params.polygones.map((x) => pataImage(t, x)) };
    case "esquisse.ligne":
      return { ...o.params, a: pointImage(t, o.params.a), b: pointImage(t, o.params.b) };
    case "esquisse.polyligne":
    case "esquisse.spline":
      return { ...o.params, points: polyImage(t, o.params.points) };
    case "esquisse.arc":
      return {
        ...o.params,
        centre: pointImage(t, o.params.centre),
        rayon: echelle(o.params.rayon, f),
        angleDebut: angleImage(t, o.params.angleDebut),
        angleFin: angleImage(t, o.params.angleFin),
        sens: t.retourne ? (o.params.sens === "trigo" ? "horaire" : "trigo") : o.params.sens,
      };
    case "esquisse.cercle":
      return { ...o.params, centre: pointImage(t, o.params.centre), rayon: echelle(o.params.rayon, f) };
    case "esquisse.rectangle": {
      const p = o.params;
      // Sommets O, O + l·u, O + l·u + p·v, O + p·v (v = u tourné de +90°). Un miroir inverse v : l'origine
      // devient l'image du coin O + p·v pour garder une profondeur positive.
      const a = p.angle.value * RAD;
      const v = { x: -Math.sin(a), y: Math.cos(a) };
      const o0 = t.retourne ? plus(p.origine, fois(v, p.profondeur.value)) : p.origine;
      const origine = t.retourne ? transformerPoint(t, pt(o0.x, o0.y)) : pointImage(t, p.origine);
      return { ...p, origine, largeur: echelle(p.largeur, f), profondeur: echelle(p.profondeur, f), angle: angleImage(t, p.angle) };
    }
    case "esquisse.polygone":
      return { ...o.params, centre: pointImage(t, o.params.centre), rayon: echelle(o.params.rayon, f), angle: angleImage(t, o.params.angle) };
    case "esquisse.construction": {
      const p = o.params;
      if (p.nature === "axe") return { ...p, a: pointImage(t, p.a), b: pointImage(t, p.b), ...(p.depassement !== undefined ? { depassement: echelle(p.depassement, f) } : {}) };
      return { ...p, point: pointImage(t, p.point), direction: angleImage(t, p.direction) };
    }
    case "reference-plan":
      return o.params.contour === undefined ? { ...o.params } : { ...o.params, contour: pataImage(t, o.params.contour) };
    case "cotation":
      return { ...o.params, a: pointImage(t, o.params.a), b: pointImage(t, o.params.b), decalage: t.retourne ? { value: -o.params.decalage.value, unit: "m" } : o.params.decalage };
    case "texte":
    case "etiquette":
      return { ...o.params, position: pointImage(t, o.params.position) };
    default:
      return { ...(o.params as object) };
  }
}

/** Clés de paramètres réellement changées. */
function clesChangees(avant: object, apres: object): string[] {
  const a = avant as Record<string, unknown>;
  const b = apres as Record<string, unknown>;
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => jsonCanonique(a[k] ?? null) !== jsonCanonique(b[k] ?? null));
}

/** Objet image (même identité), paramètres changés marqués « saisie ». */
export function imageObjet(o: ObjetModele, t: Transfo): ObjetModele {
  const params = imageParams(o, t);
  return marquerSaisie({ ...o, params } as ObjetModele, clesChangees(o.params, params));
}

/** Copie : nouvel objet saisi, mêmes valeurs (annotations de statut conservées), sans propriétés importées ni groupe. */
function copieObjet(o: ObjetModele, id: IdObjet, params: Record<string, unknown>): ObjetModele {
  const base = nouvelObjet(o.classe, id, params as never, {
    ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
    ...(o.calqueId !== undefined ? { calqueId: o.calqueId } : {}),
  }) as ObjetModele;
  const proprietes = o.proprietes.filter((p) => !p.nom.startsWith(PREFIXE_PROPRIETE_IMPORT) && p.provenance !== "import" && p.provenance !== "prototype");
  const classifications = (o.classifications ?? []).filter((k) => k.provenance === "saisie");
  return {
    ...base,
    statut: o.statut === "non-evaluee" ? "non-evaluee" : base.statut,
    proprietes,
    ...(o.definitionId !== undefined ? { definitionId: o.definitionId } : {}),
    ...(classifications.length > 0 ? { classifications } : {}),
    ...(o.annotations !== undefined ? { annotations: o.annotations } : {}),
  } as ObjetModele;
}

// --- Contrôles ----------------------------------------------------------------

/** Contrôles propres d'un objet après transformation (géométrie seulement). */
function controlerApres(tx: Transaction, o: ObjetModele, chemin: string): void {
  const nom = nomObjet(o);
  switch (o.classe) {
    case "mur":
    case "escalier":
      controlerLongueurMin(tx, o.params.axe.a, o.params.axe.b, chemin, nom);
      return;
    case "cotation":
      controlerLongueurMin(tx, o.params.a, o.params.b, chemin, nom);
      return;
    case "dalle":
    case "toiture":
      controlerContour(tx, o.params.contour, chemin, nom, true);
      controlerTrous(tx, o.params.contour, o.params.trous, chemin, nom);
      return;
    case "solide":
      if (o.params.ferme) controlerContour(tx, o.params.contour, chemin, nom, false);
      return;
    case "piece":
    case "espace":
    case "zone":
      o.params.polygones.forEach((p) => controlerContour(tx, p.contour, chemin, nom, false));
      return;
    default:
      if ((CLASSES_ESQUISSE as readonly string[]).includes(o.classe)) controleEsquisse(tx, o, chemin, null);
  }
}

function controlerVecteur(tx: Transaction, v: unknown, chemin: string, nulAdmis: boolean): v is Vecteur {
  const x = v as Partial<Vecteur> | null;
  if (typeof x !== "object" || x === null || typeof x.dx !== "number" || !Number.isFinite(x.dx) || typeof x.dy !== "number" || !Number.isFinite(x.dy)) {
    tx.refuser("parametre-invalide", chemin, motif("Vecteur", "composantes dx, dy finies attendues", "corriger le vecteur"));
    return false;
  }
  if (x.unit !== "m") {
    tx.refuser("unite-invalide", `${chemin}.unit`, motif("Vecteur", `unité « ${String(x.unit)} » incompatible, « m » attendue`, "donner le vecteur en mètres"));
    return false;
  }
  if (!nulAdmis && Math.hypot(x.dx, x.dy) < TOLERANCES.tolCoincidence) {
    tx.refuser("parametre-invalide", chemin, motif("Vecteur", "vecteur nul", "donner un déplacement non nul"));
    return false;
  }
  return true;
}

function controlerPointProjet(tx: Transaction, p: unknown, chemin: string): p is PointLocal {
  if (!estPointLocal(p)) {
    tx.refuser("repere-melange", chemin, motif("Point", "coordonnée locale `{ x, y, frame: \"local\", unit: \"m\" }` attendue", "donner un point du repère local du projet"));
    return false;
  }
  if ((p.repereLocal ?? REPERE_LOCAL_PROJET) !== REPERE_LOCAL_PROJET) {
    tx.refuser("repere-melange", chemin, motif("Point", `repère local « ${p.repereLocal ?? ""} » : repère du projet attendu`, "convertir explicitement le point"));
    return false;
  }
  return true;
}

function controlerNouveauxIds(tx: Transaction, ids: unknown, attendu: number, chemin: string): ids is readonly IdObjet[] {
  if (!Array.isArray(ids) || ids.length !== attendu) {
    tx.refuser("parametre-invalide", chemin, motif("Commande", `${Array.isArray(ids) ? ids.length : 0} identifiant(s) fourni(s), ${attendu} attendu(s)`, "fournir un nouvel identifiant par objet créé"));
    return false;
  }
  if (new Set(ids).size !== ids.length) {
    tx.refuser("parametre-invalide", chemin, motif("Commande", "identifiants en double", "fournir des identifiants distincts"));
    return false;
  }
  return ids.every((id, i) => controlerIdentifiantLibre(tx, id, `${chemin}[${i}]`));
}

/** Sélection transformable : classes admises ; une baie n'est admise qu'avec son mur hôte. */
function selection(tx: Transaction, cibles: unknown): ObjetModele[] | null {
  const objs = exigerCibles(tx, cibles, ADMISES_SELECTION);
  if (!objs) return null;
  const ids = new Set(objs.map((o) => o.id));
  let ok = true;
  objs.forEach((o, i) => {
    if (estBaie(o) && !ids.has(o.params.murHoteId)) {
      ok = false;
      tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), "une baie seule ne se transforme pas : elle suit son mur hôte", "utiliser ouverture.deplacer, ou sélectionner aussi le mur"), [o.id]);
    }
  });
  return ok ? objs : null;
}

// --- Application --------------------------------------------------------------

/** Transforme en place ; les baies suivent leur mur (t conservé, ou centre conservé pour `absolu`). */
function transformerEnPlace(tx: Transaction, objs: readonly ObjetModele[], t: Transfo, chemin: string, baies: "t" | "absolu"): number {
  let changes = 0;
  for (const o of objs) {
    if (estBaie(o)) continue;
    const img = imageObjet(o, t);
    if (jsonCanonique(img) === jsonCanonique(o)) continue;
    changes++;
    tx.mettre(img);
    controlerApres(tx, img, chemin);
    if (img.classe === "mur") {
      if (baies === "absolu") reposerBaies(tx, o as ObjetMur, "absolu", chemin);
      else if (t.facteur !== 1) {
        const L = longueurSegment(img.params.axe);
        for (const b of baiesDuMur(tx, img.id)) {
          if (b.params.position.distance !== undefined) tx.mettre(marquerSaisie({ ...b, params: { ...b.params, position: { t: b.params.position.t, distance: { value: b.params.position.t * L, unit: "m" } } } }, ["position"]));
        }
      }
      controlerEmprise(tx, img.id, chemin);
    }
  }
  return changes;
}

/** Copies images de la sélection (`ids[i]` pour `objs[i]`) ; les baies copiées suivent la copie de leur mur. */
function copierSelection(tx: Transaction, objs: readonly ObjetModele[], ids: readonly IdObjet[], t: Transfo, chemin: string): void {
  const correspondance = new Map<IdObjet, IdObjet>();
  objs.forEach((o, i) => correspondance.set(o.id, ids[i] ?? ""));
  const nouveaux: ObjetModele[] = [];
  objs.forEach((o, i) => {
    const id = ids[i] ?? "";
    let params = estBaie(o) ? { ...o.params, murHoteId: correspondance.get(o.params.murHoteId) ?? o.params.murHoteId } : imageParams(o, t);
    if (o.classe === "cotation") {
      const refs = o.params.references;
      const remap = refs.every((r) => correspondance.has(r.objetId));
      params = { ...params, references: remap ? refs.map((r) => ({ ...r, objetId: correspondance.get(r.objetId) ?? r.objetId })) : [], etat: remap && refs.length > 0 ? "rattachee" : "libre" };
    }
    if (o.classe === "etiquette" && o.params.objetId !== undefined && correspondance.has(o.params.objetId)) params = { ...params, objetId: correspondance.get(o.params.objetId) };
    nouveaux.push(copieObjet(o, id, params));
  });
  // Murs d'abord, pour que les relations dérivées des baies trouvent leur hôte.
  for (const n of [...nouveaux].sort((a, b) => Number(estBaie(a)) - Number(estBaie(b)))) {
    tx.mettre(n);
    controlerApres(tx, n, chemin);
  }
  for (const n of nouveaux) {
    if (n.classe === "mur") controlerEmprise(tx, n.id, chemin);
    if (n.classe === "piece" && n.params.code !== undefined) {
      tx.signaler({
        code: "valeur-a-verifier",
        gravite: "avertissement",
        message: `${nomObjet(n)} : code de pièce « ${n.params.code} » dupliqué par la copie.`,
        objetIds: [n.id],
        ...(n.niveauId !== undefined ? { niveauId: n.niveauId } : {}),
      });
    }
  }
}

function superposition(tx: Transaction, v: Vecteur, objs: readonly ObjetModele[]): void {
  if (Math.hypot(v.dx, v.dy) < TOLERANCES.tolCoincidence) {
    tx.signaler({ code: "valeur-a-verifier", gravite: "avertissement", message: "Copie à vecteur nul : objets superposés.", objetIds: objs.map((o) => o.id) });
  }
}

// --- Commandes ------------------------------------------------------------------

export const deplacer: Corps<"transformer.deplacer"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerVecteur(tx, c.params.vecteur, "params.vecteur", false)) return;
  transformerEnPlace(tx, objs, translation(c.params.vecteur.dx, c.params.vecteur.dy), "params.vecteur", "t");
};

export const copier: Corps<"transformer.copier"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerVecteur(tx, c.params.vecteur, "params.vecteur", true)) return;
  if (!controlerNouveauxIds(tx, c.params.nouveauxIds, objs.length, "params.nouveauxIds")) return;
  superposition(tx, c.params.vecteur, objs);
  copierSelection(tx, objs, c.params.nouveauxIds, translation(c.params.vecteur.dx, c.params.vecteur.dy), "params.vecteur");
};

export const tourner: Corps<"transformer.tourner"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerPointProjet(tx, c.params.centre, "params.centre")) return;
  const e = controlerGrandeur(c.params.angle, "°");
  if (e) {
    tx.refuser("unite-invalide", "params.angle", motif("Rotation", e, "donner l'angle en degrés"));
    return;
  }
  const a = c.params.angle.value;
  const reste = ((a % 360) + 360) % 360;
  if (Math.min(reste, 360 - reste) * RAD <= TOLERANCES.tolAngle) {
    tx.refuser("parametre-invalide", "params.angle", motif("Rotation", `angle ${a}° sans effet (nul ou multiple de 360°)`, "donner un autre angle"));
    return;
  }
  transformerEnPlace(tx, objs, rotation(c.params.centre, a), "params.angle", "t");
};

export const miroir: Corps<"transformer.miroir"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  const axe = c.params.axe;
  if (!objs || typeof axe !== "object" || axe === null || !controlerPointProjet(tx, axe.a, "params.axe.a") || !controlerPointProjet(tx, axe.b, "params.axe.b")) return;
  if (distance(axe.a, axe.b) < TOLERANCES.tolCoincidence) {
    tx.refuser("parametre-invalide", "params.axe", motif("Miroir", "points de l'axe confondus", "désigner deux points distincts"));
    return;
  }
  const t = symetrie(axe.a, axe.b);
  if (c.params.conserverOriginal) {
    if (!controlerNouveauxIds(tx, c.params.nouveauxIds, objs.length, "params.nouveauxIds")) return;
    copierSelection(tx, objs, c.params.nouveauxIds ?? [], t, "params.axe");
  } else {
    if (c.params.nouveauxIds !== undefined && c.params.nouveauxIds.length > 0) {
      tx.refuser("parametre-invalide", "params.nouveauxIds", motif("Miroir", "identifiants fournis pour un miroir sans conservation de l'original", "les retirer ou conserver l'original"));
      return;
    }
    transformerEnPlace(tx, objs, t, "params.axe", "t");
  }
};

export const mettreAEchelle: Corps<"transformer.echelle"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerPointProjet(tx, c.params.centre, "params.centre")) return;
  const f = c.params.facteur;
  if (typeof f !== "number" || !Number.isFinite(f) || f <= 0) {
    tx.refuser("parametre-invalide", "params.facteur", motif("Mise à l'échelle", `facteur ${String(f)} invalide (> 0 attendu ; un facteur négatif est un miroir)`, "donner un facteur strictement positif, ou utiliser transformer.miroir"));
    return;
  }
  if (Math.abs(f - 1) <= 1e-12) {
    tx.refuser("parametre-invalide", "params.facteur", motif("Mise à l'échelle", "facteur 1 sans effet", "donner un autre facteur"));
    return;
  }
  transformerEnPlace(tx, objs, homothetie(c.params.centre, f), "params.facteur", "t");
};

export const etirer: Corps<"transformer.etirer"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerVecteur(tx, c.params.vecteur, "params.vecteur", false)) return;
  const fenetre = c.params.fenetre;
  if (!Array.isArray(fenetre) || fenetre.length < 3 || !fenetre.every((p, i) => controlerPointProjet(tx, p, `params.fenetre[${i}]`))) {
    if (!tx.refusee) tx.refuser("parametre-invalide", "params.fenetre", motif("Étirement", "fenêtre d'au moins 3 sommets attendue", "tracer la fenêtre de capture"));
    return;
  }
  const { dx, dy } = c.params.vecteur;
  const t: Transfo = { point: (p) => (pointDansPolygone(p, fenetre) ? { x: p.x + dx, y: p.y + dy } : p), direction: (a) => a, retourne: false, facteur: 1 };
  if (transformerEnPlace(tx, objs, t, "params.fenetre", "absolu") === 0) {
    tx.refuser("precondition", "params.fenetre", motif("Étirement", "aucun sommet capturé par la fenêtre", "agrandir la fenêtre ou changer la sélection"));
  }
};

/** Segments d'un objet limite (droites `borne: false` pour une ligne de construction illimitée). */
function segmentsLimite(o: ObjetModele): { p: Vec; d: Vec; borne: boolean }[] {
  const seg = (a: Vec, b: Vec) => ({ p: a, d: sous(b, a), borne: true });
  const contour = (pts: readonly Vec[], ferme: boolean) => pts.flatMap((a, i) => (i + 1 < pts.length ? [seg(a, pts[i + 1] as Vec)] : ferme && pts.length > 2 ? [seg(a, pts[0] as Vec)] : []));
  switch (o.classe) {
    case "mur":
      return [seg(o.params.axe.a, o.params.axe.b)];
    case "esquisse.ligne":
      return [seg(o.params.a, o.params.b)];
    case "esquisse.polyligne":
      return contour(o.params.points, o.params.ferme);
    case "esquisse.construction":
      if (o.params.nature === "axe") return [seg(o.params.a, o.params.b)];
      return [{ p: o.params.point, d: { x: Math.cos(o.params.direction.value * RAD), y: Math.sin(o.params.direction.value * RAD) }, borne: false }];
    case "esquisse.rectangle": {
      const a = o.params.angle.value * RAD;
      const u = { x: Math.cos(a), y: Math.sin(a) };
      const v = { x: -Math.sin(a), y: Math.cos(a) };
      const O = o.params.origine;
      const A = plus(O, fois(u, o.params.largeur.value));
      return contour([O, A, plus(A, fois(v, o.params.profondeur.value)), plus(O, fois(v, o.params.profondeur.value))], true);
    }
    case "dalle":
    case "toiture":
    case "solide":
    case "esquisse.hachure":
      return contour(o.params.contour, true);
    default:
      return [];
  }
}

function cibleSegment(tx: Transaction, c: { cibles: unknown; params: { limiteIds: unknown; pointChoix: unknown } }): { o: ObjetModele; a: PointLocal; b: PointLocal; limites: { p: Vec; d: Vec; borne: boolean }[] } | null {
  const cibles = exigerCibles(tx, c.cibles, ["mur", "esquisse.ligne"], { min: 1, max: 1 });
  const o = cibles?.[0];
  if (!o || (o.classe !== "mur" && o.classe !== "esquisse.ligne")) return null;
  if (!controlerPointProjet(tx, c.params.pointChoix, "params.pointChoix")) return null;
  const lims = exigerCibles(tx, c.params.limiteIds, null);
  if (!lims) return null;
  const limites: { p: Vec; d: Vec; borne: boolean }[] = [];
  let ok = true;
  lims.forEach((l, i) => {
    if (l.id === o.id) {
      ok = false;
      tx.refuser("precondition", `params.limiteIds[${i}]`, motif(nomObjet(l), "la cible ne peut pas être sa propre limite", "choisir une autre arête"), [l.id]);
    } else if (l.niveauId !== o.niveauId) {
      ok = false;
      tx.refuser("precondition", `params.limiteIds[${i}]`, motif(nomObjet(l), "sur un autre niveau", "choisir une arête du même niveau"), [l.id]);
    } else {
      const s = segmentsLimite(l);
      if (s.length === 0) {
        ok = false;
        tx.refuser("precondition", `params.limiteIds[${i}]`, motif(nomObjet(l), `la classe ${l.classe} ne fournit pas d'arête limite`, "choisir une ligne, un mur ou un contour"), [l.id]);
      }
      limites.push(...s);
    }
  });
  if (!ok) return null;
  const [a, b] = o.classe === "mur" ? [o.params.axe.a, o.params.axe.b] : [o.params.a, o.params.b];
  return { o, a, b, limites };
}

function poserSegment(tx: Transaction, o: ObjetModele, a: PointLocal, b: PointLocal, chemin: string): void {
  const params = o.classe === "mur" ? { ...o.params, axe: { a, b } } : { ...(o.params as object), a, b };
  const n = marquerSaisie({ ...o, params } as ObjetModele, o.classe === "mur" ? ["axe"] : ["a", "b"]);
  tx.mettre(n);
  controlerApres(tx, n, chemin);
  if (n.classe === "mur") {
    reposerBaies(tx, o as ObjetMur, "absolu", chemin);
    controlerEmprise(tx, n.id, chemin);
  }
}

const tolU = 1e-9;

export const ajuster: Corps<"transformer.ajuster"> = (tx, c) => {
  const s = cibleSegment(tx, c);
  if (!s) return;
  const { o, a, b, limites } = s;
  const d = sous(b, a);
  const L = norme(d);
  const coupes: number[] = [];
  for (const l of limites) {
    const r = intersectionDroites(a, d, l.p, l.d);
    if (r && r.s * L > TOLERANCES.tolCoincidence && (1 - r.s) * L > TOLERANCES.tolCoincidence && (!l.borne || (r.u >= -tolU && r.u <= 1 + tolU))) coupes.push(r.s);
  }
  if (coupes.length === 0) {
    tx.refuser("precondition", "params.limiteIds", motif(nomObjet(o), "aucune arête de coupe rencontrée", "choisir des limites qui coupent l'objet"), [o.id]);
    return;
  }
  const tc = parametreProjection({ a, b }, c.params.pointChoix);
  const avant = coupes.filter((x) => x < tc);
  const apres = coupes.filter((x) => x > tc);
  if (avant.length > 0 && apres.length > 0) {
    tx.refuser("precondition", "params.pointChoix", motif(nomObjet(o), "la partie désignée est entre deux coupes (l'objet serait scindé)", "scinder d'abord, ou désigner une extrémité"), [o.id]);
    return;
  }
  const point = (t: number) => {
    const q = plus(a, fois(d, t));
    return pt(q.x, q.y);
  };
  if (apres.length > 0) poserSegment(tx, o, point(Math.min(...apres)), b, "params.pointChoix");
  else poserSegment(tx, o, a, point(Math.max(...avant)), "params.pointChoix");
};

export const prolonger: Corps<"transformer.prolonger"> = (tx, c) => {
  const s = cibleSegment(tx, c);
  if (!s) return;
  const { o, a, b, limites } = s;
  const finB = distance(c.params.pointChoix, b) <= distance(c.params.pointChoix, a);
  const [E, F] = finB ? [b, a] : [a, b];
  const r = sous(E, F);
  const L = norme(r);
  let meilleur: number | null = null;
  let surLimite = false;
  for (const l of limites) {
    const x = intersectionDroites(E, r, l.p, l.d);
    if (!x || (l.borne && (x.u < -tolU || x.u > 1 + tolU))) continue;
    if (Math.abs(x.s) * L <= TOLERANCES.tolCoincidence) surLimite = true;
    else if (x.s > 0 && (meilleur === null || x.s < meilleur)) meilleur = x.s;
  }
  if (meilleur === null) {
    tx.refuser("precondition", "params.limiteIds", motif(nomObjet(o), surLimite ? "l'extrémité est déjà sur la limite" : "aucune limite atteinte dans la direction du prolongement", "choisir une autre limite"), [o.id]);
    return;
  }
  const q = plus(E, fois(r, meilleur));
  const nouveau = pt(q.x, q.y);
  if (finB) poserSegment(tx, o, a, nouveau, "params.limiteIds");
  else poserSegment(tx, o, nouveau, b, "params.limiteIds");
};

/** Côté de `cote` par rapport à a→b : +1 gauche, −1 droite, 0 sur la droite. */
function cote(a: Vec, b: Vec, p: Vec): number {
  const l = distance(a, b);
  const x = vectoriel(sous(b, a), sous(p, a));
  return l === 0 || Math.abs(x) / l <= TOLERANCES.tolCoincidence ? 0 : Math.sign(x);
}

function decalageSegment(a: Vec, b: Vec, d: number): { a: Vec; b: Vec } {
  const u = sous(b, a);
  const l = norme(u);
  const n = { x: (-u.y / l) * d, y: (u.x / l) * d };
  return { a: plus(a, n), b: plus(b, n) };
}

export const decaler: Corps<"transformer.decaler"> = (tx, c) => {
  const objs = exigerCibles(tx, c.cibles, ["mur", "esquisse.ligne", "esquisse.polyligne", "esquisse.cercle", "esquisse.arc", "esquisse.rectangle"]);
  if (!objs) return;
  const e = controlerGrandeur(c.params.distance, "m");
  if (e) {
    tx.refuser("unite-invalide", "params.distance", motif("Décalage", e, "donner la distance en mètres"));
    return;
  }
  const dist = c.params.distance.value;
  if (dist < TOLERANCES.longueurMin) {
    tx.refuser("parametre-invalide", "params.distance", motif("Décalage", `distance ${dist} m inférieure au minimum ${TOLERANCES.longueurMin} m`, "donner une distance plus grande"));
    return;
  }
  const P = c.params.cote;
  if (!controlerPointProjet(tx, P, "params.cote") || !controlerNouveauxIds(tx, c.params.nouveauxIds, objs.length, "params.nouveauxIds")) return;
  const surObjet = (o: ObjetModele) => tx.refuser("precondition", "params.cote", motif(nomObjet(o), "le point de côté est sur l'objet", "désigner un point d'un côté de l'objet"), [o.id]);
  objs.forEach((o, i) => {
    const id = c.params.nouveauxIds[i] ?? "";
    let params: Record<string, unknown> | null = null;
    switch (o.classe) {
      case "mur":
      case "esquisse.ligne": {
        const [a, b] = o.classe === "mur" ? [o.params.axe.a, o.params.axe.b] : [o.params.a, o.params.b];
        const s = cote(a, b, P);
        if (s === 0) return surObjet(o);
        const n = decalageSegment(a, b, s * dist);
        const na = pt(n.a.x, n.a.y);
        const nb = pt(n.b.x, n.b.y);
        params = o.classe === "mur" ? { ...o.params, axe: { a: na, b: nb } } : { ...o.params, a: na, b: nb };
        break;
      }
      case "esquisse.cercle":
      case "esquisse.arc": {
        const r = o.params.rayon.value;
        const dc = distance(o.params.centre, P);
        if (Math.abs(dc - r) <= TOLERANCES.tolCoincidence) return surObjet(o);
        const nr = dc < r ? r - dist : r + dist;
        if (nr < TOLERANCES.longueurMin) {
          tx.refuser("precondition", "params.distance", motif(nomObjet(o), `le contour s'effondre : distance maximale ${r - TOLERANCES.longueurMin} m`, "réduire la distance"), [o.id]);
          return;
        }
        params = { ...o.params, rayon: { value: nr, unit: "m" } };
        break;
      }
      case "esquisse.rectangle": {
        const p = o.params;
        const a = p.angle.value * RAD;
        const u = { x: Math.cos(a), y: Math.sin(a) };
        const v = { x: -Math.sin(a), y: Math.cos(a) };
        const O = p.origine;
        const coins = [O, plus(O, fois(u, p.largeur.value)), plus(plus(O, fois(u, p.largeur.value)), fois(v, p.profondeur.value)), plus(O, fois(v, p.profondeur.value))];
        const dedans = pointDansPolygone(P, coins);
        const k = dedans ? 1 : -1;
        const l2 = p.largeur.value - 2 * k * dist;
        const p2 = p.profondeur.value - 2 * k * dist;
        if (l2 < TOLERANCES.longueurMin || p2 < TOLERANCES.longueurMin) {
          tx.refuser("precondition", "params.distance", motif(nomObjet(o), `le contour s'effondre : distance maximale ${(Math.min(p.largeur.value, p.profondeur.value) - TOLERANCES.longueurMin) / 2} m`, "réduire la distance"), [o.id]);
          return;
        }
        const no = plus(O, fois(plus(u, v), k * dist));
        params = { ...p, origine: pt(no.x, no.y), largeur: { value: l2, unit: "m" }, profondeur: { value: p2, unit: "m" } };
        break;
      }
      case "esquisse.polyligne": {
        const pts = o.params.points;
        const ferme = o.params.ferme;
        const n = pts.length;
        const nbSeg = ferme ? n : n - 1;
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < nbSeg; j++) {
          const a = pts[j] as PointLocal;
          const b = pts[(j + 1) % n] as PointLocal;
          const t = Math.max(0, Math.min(1, parametreProjection({ a, b }, P)));
          const dd = distance(plus(a, fois(sous(b, a), t)), P);
          if (dd < bestD) {
            bestD = dd;
            best = j;
          }
        }
        const s = cote(pts[best] as PointLocal, pts[(best + 1) % n] as PointLocal, P);
        if (s === 0 || bestD <= TOLERANCES.tolCoincidence) return surObjet(o);
        const segs = Array.from({ length: nbSeg }, (_, j) => decalageSegment(pts[j] as PointLocal, pts[(j + 1) % n] as PointLocal, s * dist));
        const sommet = (j: number): Vec | null => {
          const prec = segs[(j - 1 + nbSeg) % nbSeg];
          const suiv = segs[j % nbSeg];
          if (!ferme && j === 0) return segs[0]?.a ?? null;
          if (!ferme && j === n - 1) return segs[nbSeg - 1]?.b ?? null;
          if (!prec || !suiv) return null;
          const x = intersectionDroites(prec.a, sous(prec.b, prec.a), suiv.a, sous(suiv.b, suiv.a));
          return x ? plus(prec.a, fois(sous(prec.b, prec.a), x.s)) : suiv.a;
        };
        const nouveaux = Array.from({ length: n }, (_, j) => sommet(j));
        let effondre = nouveaux.some((q) => q === null);
        for (let j = 0; j < nbSeg && !effondre; j++) {
          const a = nouveaux[j] as Vec;
          const b = nouveaux[(j + 1) % n] as Vec;
          if (scalaire(sous(b, a), sous(pts[(j + 1) % n] as PointLocal, pts[j] as PointLocal)) <= 0) effondre = true;
        }
        if (effondre) {
          tx.refuser("precondition", "params.distance", motif(nomObjet(o), "le décalage retourne ou fait disparaître un segment", "réduire la distance"), [o.id]);
          return;
        }
        params = { ...o.params, points: nouveaux.map((q) => pt((q as Vec).x, (q as Vec).y)) };
        break;
      }
      default:
        return;
    }
    const copie = copieObjet(o, id, params);
    tx.mettre(copie);
    controlerApres(tx, copie, "params.distance");
  });
};

export const repeter: Corps<"transformer.repeter"> = (tx, c) => {
  const objs = selection(tx, c.cibles);
  if (!objs || !controlerVecteur(tx, c.params.vecteur, "params.vecteur", false)) return;
  const n = c.params.nombre;
  if (!Number.isInteger(n) || n < 1) {
    tx.refuser("parametre-invalide", "params.nombre", motif("Répétition", `nombre ${String(n)} invalide`, "donner un entier ≥ 1"));
    return;
  }
  if (n * objs.length > TOLERANCES.copiesMax) {
    tx.refuser("parametre-invalide", "params.nombre", motif("Répétition", `${n * objs.length} copies demandées, maximum ${TOLERANCES.copiesMax} par commande`, "réduire le nombre ou la sélection"));
    return;
  }
  if (!controlerNouveauxIds(tx, c.params.nouveauxIds, n * objs.length, "params.nouveauxIds")) return;
  const { dx, dy } = c.params.vecteur;
  for (let k = 1; k <= n; k++) copierSelection(tx, objs, c.params.nouveauxIds.slice((k - 1) * objs.length, k * objs.length), translation(dx * k, dy * k), "params.vecteur");
};

export const decomposer: Corps<"transformer.decomposer"> = (tx, c) => {
  const objs = exigerCibles(tx, c.cibles, ["esquisse.polyligne", "esquisse.rectangle"]);
  if (!objs) return;
  const segments = objs.map((o): [PointLocal, PointLocal][] => {
    if (o.classe === "esquisse.polyligne") {
      const pts = o.params.points;
      const n = pts.length;
      return Array.from({ length: o.params.ferme ? n : n - 1 }, (_, j) => [pts[j] as PointLocal, pts[(j + 1) % n] as PointLocal]);
    }
    if (o.classe !== "esquisse.rectangle") return [];
    const s = segmentsLimite(o);
    return s.map((x) => [pt(x.p.x, x.p.y), pt(x.p.x + x.d.x, x.p.y + x.d.y)]);
  });
  const total = segments.reduce((s, x) => s + x.length, 0);
  if (!controlerNouveauxIds(tx, c.params.nouveauxIds, total, "params.nouveauxIds")) return;
  let k = 0;
  objs.forEach((o, i) => {
    for (const [a, b] of segments[i] ?? []) {
      const id = c.params.nouveauxIds[k++] ?? "";
      const ligne = nouvelObjet("esquisse.ligne", id, { a, b }, {
        ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
        ...(o.calqueId !== undefined ? { calqueId: o.calqueId } : {}),
      });
      tx.mettre(ligne);
      controlerApres(tx, ligne, "params.nouveauxIds");
    }
    supprimerObjet(tx, o.id);
  });
};

/** Points de contrôle déplaçables par classe : lecture et écriture par indice. */
function pointsDe(o: ObjetModele): { points: PointLocal[]; ecrire: (pts: PointLocal[]) => Record<string, unknown>; cles: string[]; ferme: boolean } | null {
  switch (o.classe) {
    case "mur":
      return { points: [o.params.axe.a, o.params.axe.b], ecrire: ([a, b]) => ({ ...o.params, axe: { a, b } }), cles: ["axe"], ferme: false };
    case "esquisse.ligne":
    case "cotation":
      return { points: [o.params.a, o.params.b], ecrire: ([a, b]) => ({ ...o.params, a, b }), cles: ["a", "b"], ferme: false };
    case "esquisse.construction":
      if (o.params.nature !== "axe") return null;
      return { points: [o.params.a, o.params.b], ecrire: ([a, b]) => ({ ...o.params, a, b }), cles: ["a", "b"], ferme: false };
    case "esquisse.polyligne":
    case "esquisse.spline":
      return { points: [...o.params.points], ecrire: (points) => ({ ...o.params, points }), cles: ["points"], ferme: o.params.ferme };
    case "dalle":
    case "toiture":
    case "solide":
    case "esquisse.hachure":
      return { points: [...o.params.contour], ecrire: (contour) => ({ ...o.params, contour }), cles: ["contour"], ferme: true };
    default:
      return null;
  }
}

export const pointsDeControle: Corps<"transformer.pointsDeControle"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ADMISES_SELECTION, { min: 1, max: 1 });
  const o = cibles?.[0];
  if (!o) return;
  const acces = pointsDe(o);
  if (!acces) {
    tx.refuser("precondition", "cibles[0]", motif(nomObjet(o), `la classe ${o.classe} n'a pas de points de contrôle éditables`, "utiliser la commande de modification de la classe"), [o.id]);
    return;
  }
  const deps = c.params.deplacements;
  if (!Array.isArray(deps) || deps.length === 0) {
    tx.refuser("parametre-invalide", "params.deplacements", motif(nomObjet(o), "aucun déplacement", "fournir `{ indice, point }`"), [o.id]);
    return;
  }
  const pts = [...acces.points];
  const vus = new Set<number>();
  for (let i = 0; i < deps.length; i++) {
    const d = deps[i];
    if (!d || !Number.isInteger(d.indice) || d.indice < 0 || d.indice >= pts.length || vus.has(d.indice)) {
      tx.refuser("parametre-invalide", `params.deplacements[${i}].indice`, motif(nomObjet(o), `indice ${String(d?.indice)} invalide ou répété (0 à ${pts.length - 1})`, "corriger l'indice"), [o.id]);
      return;
    }
    if (!controlerPointProjet(tx, d.point, `params.deplacements[${i}].point`)) return;
    vus.add(d.indice);
    pts[d.indice] = d.point;
  }
  const n = marquerSaisie({ ...o, params: acces.ecrire(pts) } as ObjetModele, acces.cles);
  tx.mettre(n);
  controlerApres(tx, n, "params.deplacements");
  if (n.classe === "mur") {
    reposerBaies(tx, o as ObjetMur, "absolu", "params.deplacements");
    controlerEmprise(tx, n.id, "params.deplacements");
  }
};

