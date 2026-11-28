/**
 * Niveaux d'étage de la Planche (cas 4 du catalogue des extensions, étape 1 : D4-F5-001, avec D4-F5-054). Pur : ni
 * React, ni DOM.
 *
 * Un niveau est une définition nommée du document (`annotations.niveaux`, préfixe « n ») : nom, altitude relative au
 * ±0,00 du dessin (z = 0) et hauteur d'étage déclarée, en mètres. Un objet de la racine (groupe ou composant) porte son
 * niveau (`Occurrence.niveau`) ; changer l'altitude d'un niveau déplace tous ses objets du même écart, en un seul pas
 * d'annulation. Supprimer un niveau détache ses objets sans les déplacer.
 *
 * L'altitude NGF d'un niveau est calculée depuis le niveau de référence déclaré avec la Planche (altitude NGF du
 * ±0,00) ; sans niveau de référence, elle est « non évaluée » (`null`), jamais supposée.
 */
import type { Niveau, PlanDeCoupe, Repere } from "./annotations.js";
import { type Id, type Modele, boiteOccurrence, deplacer, modifierAnnotations, rattacherOccurrencesNiveau } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

/** Longueur maximale d'un nom de niveau (choix Fadi : tient dans une ligne du panneau et une étiquette de la vue). */
export const NOM_NIVEAU_MAX = 60;

/** Motif d'un refus, traduit par l'interface. */
export type ErreurNiveau = "nom" | "nom-pris" | "altitude" | "hauteur" | "absent" | "verrou" | "coupe";

export type ResultatNiveau = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurNiveau };

export interface ValeursNiveau {
  readonly nom: string;
  readonly altitude: number;
  readonly hauteur: number;
}

const refus = (erreur: ErreurNiveau): ResultatNiveau => ({ ok: false, erreur });
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Niveau reçu (document, delta) : jamais cru sur parole. */
export function estNiveau(id: Id, v: unknown): v is Niveau {
  return estObjet(v) && v["id"] === id && typeof v["nom"] === "string" && v["nom"].trim() !== "" && v["nom"].length <= NOM_NIVEAU_MAX && fini(v["altitude"]) && fini(v["hauteur"]) && v["hauteur"] > 0 && (v["coupe"] === undefined || (fini(v["coupe"]) && v["coupe"] > 0 && v["coupe"] <= v["hauteur"]));
}

/** Niveaux du document, du plus haut au plus bas (ordre de lecture d'une coupe), puis par nom. */
export function niveauxTries(m: Modele): Niveau[] {
  return Object.values(m.annotations?.niveaux ?? {}).sort((a, b) => b.altitude - a.altitude || a.nom.localeCompare(b.nom, "fr") || a.id.localeCompare(b.id));
}

const lireNombre = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, "").replace("±", "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Saisie du panneau (virgule ou point) lue en valeurs ; le premier champ refusé est nommé, rien n'est corrigé en silence. */
export function lireSaisieNiveau(s: { readonly nom: string; readonly altitude: string; readonly hauteur: string }): { readonly valeurs: ValeursNiveau } | { readonly erreur: ErreurNiveau } {
  const nom = s.nom.trim();
  if (nom === "") return { erreur: "nom" };
  const altitude = lireNombre(s.altitude);
  if (altitude === null) return { erreur: "altitude" };
  const hauteur = lireNombre(s.hauteur);
  if (hauteur === null || hauteur <= 0) return { erreur: "hauteur" };
  return { valeurs: { nom: nom.slice(0, NOM_NIVEAU_MAX), altitude, hauteur } };
}

function valider(m: Modele, v: ValeursNiveau, sauf?: Id): ErreurNiveau | null {
  const nom = v.nom.trim();
  if (nom === "" || nom.length > NOM_NIVEAU_MAX) return "nom";
  if (!fini(v.altitude)) return "altitude";
  if (!fini(v.hauteur) || v.hauteur <= 0) return "hauteur";
  const cle = nom.toLocaleLowerCase("fr");
  if (niveauxTries(m).some((n) => n.id !== sauf && n.nom.toLocaleLowerCase("fr") === cle)) return "nom-pris";
  return null;
}

/** Ajoute un niveau (un pas d'historique). Deux niveaux ne portent jamais le même nom. */
export function ajouterNiveau(m: Modele, v: ValeursNiveau): ResultatNiveau {
  const e = valider(m, v);
  if (e) return refus(e);
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("n");
    a.niveaux[k] = { id: k, nom: v.nom.trim(), altitude: v.altitude, hauteur: v.hauteur };
    return k;
  });
  return { ok: true, modele: r.modele, id: r.extra };
}

/**
 * Valeurs proposées par « Ajouter un niveau » quand des niveaux existent : l'étage au-dessus du plus haut, à son
 * altitude plus sa hauteur d'étage, de même hauteur, nommé d'après lui (« RDC » ou « R+n » → « R+n+1 », sinon
 * « Niveau k »). Rien n'est supposé : tout vient des niveaux déjà déclarés. `null` sans niveau.
 */
export function niveauSuivant(m: Modele): ValeursNiveau | null {
  const haut = niveauxTries(m)[0];
  if (!haut) return null;
  const pris = new Set(niveauxTries(m).map((n) => n.nom.toLocaleLowerCase("fr")));
  const r = /^R\+(\d+)$/i.exec(haut.nom.trim());
  let nom = /^(rdc|rez-de-chauss[ée]e)$/i.test(haut.nom.trim()) ? "R+1" : r ? `R+${Number(r[1]) + 1}` : "";
  for (let k = pris.size + 1; nom === "" || pris.has(nom.toLocaleLowerCase("fr")); k++) nom = `Niveau ${k}`;
  return { nom, altitude: Math.round((haut.altitude + haut.hauteur) * 1e6) / 1e6, hauteur: haut.hauteur };
}

/** Objets (occurrences de la racine) rattachés à un niveau. */
export function objetsDuNiveau(m: Modele, niveau: Id): Id[] {
  return Object.values(m.racine.occurrences)
    .filter((o) => o.niveau === niveau)
    .map((o) => o.id);
}

/**
 * Modifie un niveau. Si son altitude change, ses objets sont déplacés du même écart vertical dans le même pas
 * d'historique ; un objet verrouillé rattaché au niveau bloque ce changement (le verrou interdit tout déplacement).
 */
export function modifierNiveau(m: Modele, id: Id, v: ValeursNiveau): ResultatNiveau {
  const n = m.annotations?.niveaux?.[id];
  if (!n) return refus("absent");
  const e = valider(m, v, id);
  if (e) return refus(e);
  const dz = v.altitude - n.altitude;
  let modele = m;
  if (dz !== 0) {
    const objets = objetsDuNiveau(m, id);
    if (objets.some((o) => m.racine.occurrences[o]?.verrouille)) return refus("verrou");
    if (objets.length > 0) modele = deplacer(modele, objets, { x: 0, y: 0, z: dz }).modele;
  }
  modele = modifierAnnotations(modele, (a) => {
    // La hauteur de plan reste si elle tient encore dans l'étage ; sinon elle revient à la valeur par défaut.
    const coupe = n.coupe !== undefined && n.coupe <= v.hauteur ? { coupe: n.coupe } : {};
    a.niveaux[id] = { id, nom: v.nom.trim(), altitude: v.altitude, hauteur: v.hauteur, ...coupe };
  }).modele;
  return { ok: true, modele, id };
}

/** Supprime un niveau : ses objets en sont détachés, sans bouger (un seul pas d'historique). */
export function supprimerNiveau(m: Modele, id: Id): ResultatNiveau {
  if (!m.annotations?.niveaux?.[id]) return refus("absent");
  const objets = objetsDuNiveau(m, id);
  let modele = objets.length > 0 ? rattacherOccurrencesNiveau(m, objets, null).modele : m;
  modele = modifierAnnotations(modele, (a) => {
    delete a.niveaux[id];
  }).modele;
  return { ok: true, modele, id };
}

/** Rattache des objets de la racine à un niveau (ou les détache, `null`) ; les autres sélections sont ignorées. */
export function rattacherAuNiveau(m: Modele, objets: readonly Id[], niveau: Id | null): { readonly modele: Modele; readonly nombre: number } | { readonly erreur: ErreurNiveau } {
  if (niveau !== null && !m.annotations?.niveaux?.[niveau]) return { erreur: "absent" };
  const ids = objets.filter((o) => m.racine.occurrences[o] !== undefined);
  if (ids.length === 0) return { modele: m, nombre: 0 };
  return { modele: rattacherOccurrencesNiveau(m, ids, niveau).modele, nombre: ids.length };
}

/**
 * Niveau de travail : les objets de la racine créés par une opération (absents de `avant`) et sans niveau sont
 * rattachés au niveau donné. Rend `apres` inchangé s'il n'y a rien à rattacher ou si le niveau n'existe plus.
 */
export function rattacherNouveauxObjets(avant: Modele, apres: Modele, niveau: Id): Modele {
  if (!apres.annotations?.niveaux?.[niveau]) return apres;
  const nouveaux = Object.values(apres.racine.occurrences)
    .filter((o) => o.niveau === undefined && avant.racine.occurrences[o.id] === undefined)
    .map((o) => o.id);
  return nouveaux.length > 0 ? rattacherOccurrencesNiveau(apres, nouveaux, niveau).modele : apres;
}

/** Altitude NGF d'un niveau d'après le niveau de référence (NGF du ±0,00) ; `null` = non évaluée. */
export function altitudeNGF(altitude: number, reference: number | null): number | null {
  return reference === null ? null : reference + altitude;
}

/** Repère du niveau de travail : axes du modèle, origine à l'altitude du niveau (le plan XY y est posé). */
export function repereDuNiveau(n: Niveau): Repere {
  return { origine: { x: 0, y: 0, z: n.altitude }, x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } };
}

/** Altitude écrite à la française : « ±0,00 », « +2,85 », « −1,20 » (mètres, deux décimales). */
export function texteAltitude(v: number, separateur: "," | "." = ","): string {
  const a = Math.round(v * 100) / 100;
  const s = Math.abs(a).toFixed(2).replace(".", separateur);
  return a === 0 ? `±${s}` : a > 0 ? `+${s}` : `−${s}`;
}

/** Marge autour du dessin pour tracer les plans de niveau (choix Fadi : 1 m) ; dessin vide : carré de 10 m. */
const MARGE_PLANS = 1;
const DEMI_VIDE = 5;

/** Emprise en plan (XY) où tracer les plans de niveau : celle du dessin de la racine, plus une marge. */
export function empriseNiveaux(m: Modele): { readonly min: Vec3; readonly max: Vec3 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const point = (p: Vec3): void => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of Object.values(m.racine.sommets)) point(s.position);
  for (const o of Object.keys(m.racine.occurrences)) {
    const b = boiteOccurrence(m, o);
    if (b) {
      point(b.min);
      point(b.max);
    }
  }
  if (!Number.isFinite(minX)) return { min: { x: -DEMI_VIDE, y: -DEMI_VIDE, z: 0 }, max: { x: DEMI_VIDE, y: DEMI_VIDE, z: 0 } };
  return { min: { x: minX - MARGE_PLANS, y: minY - MARGE_PLANS, z: 0 }, max: { x: maxX + MARGE_PLANS, y: maxY + MARGE_PLANS, z: 0 } };
}

// ---------------------------------------------------------------- Sélecteur d'étage (cas 4, lot C1, étape 1a)

/**
 * Hauteur de plan par défaut (m au-dessus du niveau) : convention de dessin retenue le 28.11.2026 (décision de découpage
 * du lot C1, étape 1a), modifiable par niveau. Ce n'est pas une valeur réglementaire.
 */
export const HAUTEUR_PLAN_DEFAUT = 1.1;

/** Hauteur de plan d'un niveau (m au-dessus de son altitude). */
export const hauteurDePlan = (n: Niveau): number => n.coupe ?? HAUTEUR_PLAN_DEFAUT;

/** Saisie de la hauteur de plan (virgule ou point) ; vide = retour à la valeur par défaut (`null`). */
export function lireHauteurDePlan(s: string): { readonly coupe: number | null } | { readonly erreur: ErreurNiveau } {
  if (s.trim() === "") return { coupe: null };
  const n = lireNombre(s);
  return n === null || n <= 0 ? { erreur: "coupe" } : { coupe: n };
}

/** Règle la hauteur de plan d'un niveau (`null` = valeur par défaut) ; elle reste dans la hauteur d'étage. */
export function modifierHauteurDePlan(m: Modele, id: Id, coupe: number | null): ResultatNiveau {
  const n = m.annotations?.niveaux?.[id];
  if (!n) return refus("absent");
  if (coupe !== null && (!Number.isFinite(coupe) || coupe <= 0 || coupe > n.hauteur)) return refus("coupe");
  if ((n.coupe ?? null) === coupe) return { ok: true, modele: m, id };
  const modele = modifierAnnotations(m, (a) => {
    const { coupe: _ancienne, ...reste } = n;
    a.niveaux[id] = coupe === null ? reste : { ...reste, coupe };
  }).modele;
  return { ok: true, modele, id };
}

/**
 * Coupe horizontale d'un étage : plan à l'altitude du niveau + sa hauteur de plan, la partie au-dessus est coupée. C'est un
 * réglage de la vue, jamais écrit au modèle ; le rectangle couvre l'emprise du modèle avec une marge.
 */
export function coupeDeLEtage(m: Modele, id: Id): PlanDeCoupe | null {
  const n = m.annotations?.niveaux?.[id];
  if (!n) return null;
  const e = empriseNiveaux(m);
  const cx = (e.min.x + e.max.x) / 2;
  const cy = (e.min.y + e.max.y) / 2;
  return {
    id: `etage:${id}`,
    origine: { x: cx, y: cy, z: n.altitude + hauteurDePlan(n) },
    normale: { x: 0, y: 0, z: 1 },
    u: { x: 1, y: 0, z: 0 },
    w: { x: 0, y: 1, z: 0 },
    demiU: Math.max((e.max.x - e.min.x) / 2 + 1, 1),
    demiW: Math.max((e.max.y - e.min.y) / 2 + 1, 1),
    actif: true,
    inverse: false,
    nom: n.nom,
  };
}

/** Niveau voisin dans l'ordre des altitudes (+1 au-dessus, −1 au-dessous) ; `null` au bout de la liste. */
export function etageVoisin(m: Modele, id: Id, sens: 1 | -1): Id | null {
  const liste = niveauxTries(m);
  const i = liste.findIndex((n) => n.id === id);
  if (i < 0) return null;
  return liste[i - sens]?.id ?? null;
}

