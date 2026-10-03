/**
 * Outils communs des réducteurs : préconditions (identifiant libre, niveau, calque, cibles), création d'objet
 * saisi, fusion des modifications avec traçabilité, baies et contrôle d'emprise, suppression avec dépendants
 * et références « à réparer » (R12).
 */
import type { CommandeDeType, TypeCommande } from "../contrats/commandes.js";
import type { PropositionReparation, ReferenceTopologique } from "../contrats/references.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import { estCaracteristiqueNommee } from "../ontologie/caracteristiques.js";
import {
  CLASSES_BAIE,
  type ClasseBaie,
  type ClasseObjet,
  type IdObjet,
  type ObjetBaie,
  type ObjetDe,
  type ObjetModele,
  type ObjetMur,
  type ObjetNiveau,
  type ParamsParClasse,
} from "../ontologie/classes.js";
import { cleDefinition, ID_NON_TYPE, type ClasseTypee } from "../ontologie/definitions.js";
import { descripteur } from "../ontologie/descripteurs.js";
import { estNonEvaluee, type NonEvaluee, type Tracabilite } from "../ontologie/provenance.js";
import { estPointLocal, type PointLocal } from "../ontologie/reperes.js";
import { aireSignee, distance, intersectionDroites, longueurSegment, parametreProjection, pointA, pointDansPolygone, sommetsConfondus, sous } from "./geometrie.js";
import { motif, type Transaction } from "./transaction.js";

/** Corps d'un réducteur : lit et écrit dans la transaction, refuse par `tx.refuser`. */
export type Corps<T extends TypeCommande> = (tx: Transaction, c: CommandeDeType<T>) => void;

/** Traçabilité d'une valeur saisie par commande. */
export const SAISIE: Tracabilite = { provenance: "saisie", statut: "declaree" };

const estObjetJs = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function libelleClasse(classe: ClasseObjet): string {
  return descripteur(classe).libelle;
}

export function nomObjet(o: ObjetModele): string {
  return `${libelleClasse(o.classe)} ${o.id}`;
}

export function estBaie(o: ObjetModele | undefined): o is ObjetBaie {
  return o !== undefined && (CLASSES_BAIE as readonly string[]).includes(o.classe);
}

// --- Préconditions ----------------------------------------------------------

export function controlerIdentifiantLibre(tx: Transaction, id: unknown, chemin: string): id is IdObjet {
  if (typeof id !== "string" || id.trim() === "") {
    tx.refuser("parametre-invalide", chemin, motif("Nouvel objet", "identifiant absent ou vide", "fournir un identifiant stable non vide"));
    return false;
  }
  if (!tx.identifiantLibre(id)) {
    tx.refuser(
      "precondition",
      chemin,
      motif(`Identifiant ${id}`, tx.estSupprime(id) ? "déjà utilisé par un objet supprimé (jamais réutilisé)" : "déjà utilisé par un objet existant", "choisir un nouvel identifiant"),
      [id],
    );
    return false;
  }
  return true;
}

export function controlerNiveau(tx: Transaction, niveauId: unknown, chemin: string): ObjetNiveau | null {
  const o = typeof niveauId === "string" ? tx.objet(niveauId) : undefined;
  if (!o || o.classe !== "niveau") {
    tx.refuser("precondition", chemin, motif(`Niveau ${String(niveauId)}`, "inexistant ou supprimé", "choisir un niveau existant"), typeof niveauId === "string" ? [niveauId] : []);
    return null;
  }
  return o;
}

export function controlerCalque(tx: Transaction, calqueId: unknown, chemin: string): boolean {
  const o = typeof calqueId === "string" ? tx.objet(calqueId) : undefined;
  if (!o || o.classe !== "calque") {
    tx.refuser("precondition", chemin, motif(`Calque ${String(calqueId)}`, "inexistant ou supprimé", "choisir un calque existant ou le créer (calque.creer)"), typeof calqueId === "string" ? [calqueId] : []);
    return false;
  }
  return true;
}

/** Contrôle l'en-tête de création `{ id, niveauId, calqueId }`. */
export function controlerEnTete(tx: Transaction, p: { readonly id: unknown; readonly niveauId: unknown; readonly calqueId: unknown }): boolean {
  const a = controlerIdentifiantLibre(tx, p.id, "params.id");
  const b = controlerNiveau(tx, p.niveauId, "params.niveauId") !== null;
  const c = controlerCalque(tx, p.calqueId, "params.calqueId");
  return a && b && c;
}

/** Cibles de la commande : existence et classe admise. */
export function exigerCibles(tx: Transaction, cibles: unknown, classes: readonly ClasseObjet[] | null, options: { readonly min?: number; readonly max?: number } = {}): ObjetModele[] | null {
  const min = options.min ?? 1;
  if (!Array.isArray(cibles) || !cibles.every((x) => typeof x === "string")) {
    tx.refuser("parametre-invalide", "cibles", motif("Commande", "cibles mal formées", "fournir une liste d'identifiants"));
    return null;
  }
  if (cibles.length < min || (options.max !== undefined && cibles.length > options.max)) {
    const attendu = options.max === undefined ? `au moins ${min}` : options.max === min ? `exactement ${min}` : `de ${min} à ${options.max}`;
    tx.refuser("precondition", "cibles", motif("Commande", `${cibles.length} cible(s) reçue(s), ${attendu} attendue(s)`, "corriger la sélection"));
    return null;
  }
  if (new Set(cibles).size !== cibles.length) {
    tx.refuser("parametre-invalide", "cibles", motif("Commande", "cible en double", "citer chaque objet une seule fois"));
    return null;
  }
  const r: ObjetModele[] = [];
  let ok = true;
  cibles.forEach((id: string, i) => {
    const o = tx.objet(id);
    if (!o) {
      ok = false;
      tx.refuser("precondition", `cibles[${i}]`, motif(`Objet ${id}`, tx.estSupprime(id) ? "supprimé" : "introuvable", "recharger le modèle et refaire la sélection"), [id]);
    } else if (classes !== null && !classes.includes(o.classe)) {
      ok = false;
      tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), `classe « ${o.classe} » non admise par cette commande (admises : ${classes.join(", ")})`, "retirer l'objet de la sélection"), [id]);
    } else r.push(o);
  });
  return ok ? r : null;
}

// --- Construction et modification -----------------------------------------

/** Nouvel objet saisi (provenance `saisie`, statut `declaree`), sans aucune valeur ajoutée (R3). */
export function nouvelObjet<C extends ClasseObjet>(classe: C, id: IdObjet, params: ParamsParClasse[C], place: { readonly niveauId?: IdObjet; readonly calqueId?: IdObjet } = {}): ObjetDe<C> {
  const base = {
    id,
    classe,
    ontologie: descripteur(classe).ontologie,
    params,
    provenance: "saisie" as const,
    statut: "declaree" as const,
    proprietes: [],
  };
  return {
    ...base,
    ...(place.niveauId !== undefined ? { niveauId: place.niveauId } : {}),
    ...(place.calqueId !== undefined ? { calqueId: place.calqueId } : {}),
  } as ObjetDe<C>;
}

/** Retire de `p` les clés d'en-tête (identifiant, niveau, calque) et les clés données. */
export function sansCles<P extends object>(p: P, cles: readonly string[]): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!cles.includes(k) && v !== undefined) r[k] = v;
  return r;
}

/**
 * Traçabilité des paramètres changés par une saisie : si l'objet n'est pas lui-même « saisie / déclarée »
 * (objet importé, par exemple), chaque paramètre changé reçoit l'annotation « saisie » ; sinon l'annotation
 * éventuelle (héritée d'un import) est retirée.
 */
export function marquerSaisie<O extends ObjetModele>(o: O, cles: readonly string[]): O {
  if (cles.length === 0) return o;
  const objetSaisi = o.provenance === "saisie" && o.statut === "declaree";
  const annotations: Record<string, Tracabilite> = {};
  for (const [k, v] of Object.entries(o.annotations ?? {})) if (v !== undefined) annotations[k] = v;
  for (const k of cles) {
    if (objetSaisi) delete annotations[k];
    else annotations[k] = SAISIE;
  }
  const { annotations: _a, ...reste } = o;
  void _a;
  return (Object.keys(annotations).length > 0 ? { ...reste, annotations } : reste) as O;
}

/** Un paramètre retiré ne garde pas d'annotation de traçabilité (il n'a plus de valeur). */
function retirerAnnotations<O extends ObjetModele>(o: O, retraits: readonly string[]): O {
  if (retraits.length === 0 || o.annotations === undefined) return o;
  const annotations: Record<string, Tracabilite> = {};
  for (const [k, v] of Object.entries(o.annotations)) if (v !== undefined && !retraits.includes(k)) annotations[k] = v;
  const { annotations: _a, ...reste } = o;
  void _a;
  return (Object.keys(annotations).length > 0 ? { ...reste, annotations } : reste) as O;
}

/** Remplace des paramètres d'un objet (sans contrôle) et marque la saisie. */
export function avecParams<O extends ObjetModele>(o: O, params: Partial<O["params"]>, cles?: readonly string[]): O {
  const nouveau = { ...o, params: { ...o.params, ...params } } as O;
  return marquerSaisie(nouveau, cles ?? Object.keys(params));
}

/**
 * Fusionne `modifications` dans les paramètres : clés inconnues, dérivées ou interdites refusées ; `null`
 * retire un paramètre facultatif, refusé pour un paramètre obligatoire (D-024).
 * Retourne l'objet modifié, ou `null` (refus enregistré).
 */
export function fusionnerModifications<O extends ObjetModele>(tx: Transaction, o: O, modifications: unknown, chemin: string, interdits: readonly string[] = []): O | null {
  if (!estObjetJs(modifications)) {
    tx.refuser("parametre-invalide", chemin, motif(nomObjet(o), "modifications mal formées", "fournir un objet `{ paramètre: valeur }`"), [o.id]);
    return null;
  }
  const decls = new Map(descripteur(o.classe).parametres.map((d) => [d.nom, d]));
  let ok = true;
  const cles: string[] = [];
  const retraits: string[] = [];
  for (const [k, v] of Object.entries(modifications)) {
    if (v === undefined) continue;
    const d = decls.get(k);
    if (d && !d.derive && !interdits.includes(k) && v === null) {
      // D-024 : `null` retire un paramètre facultatif ; un paramètre obligatoire ne se retire pas.
      if (d.obligatoire) {
        ok = false;
        tx.refuser("parametre-invalide", `${chemin}.${k}`, motif(nomObjet(o), `« ${k} » est obligatoire et ne peut pas être retiré`, "donner une valeur (ou « non évaluée » si le paramètre l'admet)"), [o.id]);
      } else retraits.push(k);
      continue;
    }
    if (!d) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}.${k}`, motif(nomObjet(o), `paramètre « ${k} » inconnu pour la classe ${o.classe}`, "retirer ce paramètre"), [o.id]);
    } else if (d.derive) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}.${k}`, motif(nomObjet(o), `« ${k} » est une valeur calculée, jamais saisie`, "modifier les paramètres dont elle dépend"), [o.id]);
    } else if (interdits.includes(k)) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}.${k}`, motif(nomObjet(o), `« ${k} » ne se modifie pas par cette commande`, "utiliser la commande dédiée"), [o.id]);
    } else cles.push(k);
  }
  if (!ok) return null;
  const params: Record<string, unknown> = { ...(o.params as object) };
  for (const k of cles) params[k] = modifications[k];
  for (const k of retraits) delete params[k];
  return marquerSaisie(retirerAnnotations({ ...o, params } as O, retraits), cles);
}

// --- Murs et baies ----------------------------------------------------------

export function baiesDuMur(tx: Transaction, murId: IdObjet): ObjetBaie[] {
  return tx.objets().filter((o): o is ObjetBaie => estBaie(o) && o.params.murHoteId === murId);
}

/** Hauteur d'un mur (m) : `hauteur`, ou écart d'altitude jusqu'à `niveauHaut` ; `null` si non évaluable. */
export function hauteurMur(tx: Transaction, mur: ObjetMur): number | null {
  if (mur.params.hauteur !== undefined) return mur.params.hauteur.value;
  const haut = mur.params.niveauHaut !== undefined ? tx.objet(mur.params.niveauHaut) : undefined;
  const bas = mur.niveauId !== undefined ? tx.objet(mur.niveauId) : undefined;
  if (haut?.classe === "niveau" && bas?.classe === "niveau") return haut.params.elevation.value - bas.params.elevation.value;
  return null;
}

/**
 * Contrôle d'emprise des baies d'un mur (DA-07-02) : `[distance − largeur/2, distance + largeur/2]` dans
 * `[0, longueur]`, aucun recouvrement, `allège + hauteur` ≤ hauteur du mur ; tolérance `longueurMin` (D-024).
 */
export function controlerEmprise(tx: Transaction, murId: IdObjet, chemin: string): void {
  const mur = tx.objet(murId);
  if (!mur || mur.classe !== "mur") return;
  const L = longueurSegment(mur.params.axe);
  const H = hauteurMur(tx, mur);
  const tol = TOLERANCES.longueurMin;
  const intervalles = baiesDuMur(tx, murId).map((b) => {
    const centre = b.params.position.t * L;
    return { b, debut: centre - b.params.largeur.value / 2, fin: centre + b.params.largeur.value / 2 };
  });
  for (const { b, debut, fin } of intervalles) {
    if (debut < -tol || fin > L + tol) {
      tx.refuser("hors-emprise", chemin, motif(nomObjet(b), `hors de l'emprise du mur ${murId} (de ${debut} m à ${fin} m pour une longueur de ${L} m)`, "déplacer, réduire ou supprimer la baie"), [b.id, murId]);
    }
    if (H !== null && b.params.allege.value + b.params.hauteur.value > H + tol) {
      tx.refuser(
        "hors-emprise",
        chemin,
        motif(nomObjet(b), `allège + hauteur = ${b.params.allege.value + b.params.hauteur.value} m dépasse la hauteur du mur ${murId} (${H} m)`, "réduire la hauteur ou l'allège de la baie"),
        [b.id, murId],
      );
    }
  }
  const tries = [...intervalles].sort((x, y) => x.debut - y.debut || (x.b.id < y.b.id ? -1 : 1));
  for (let i = 1; i < tries.length; i++) {
    const p = tries[i - 1];
    const q = tries[i];
    if (p && q && p.fin > q.debut + tol) {
      tx.refuser("hors-emprise", chemin, motif(nomObjet(q.b), `recouvre ${nomObjet(p.b)} sur le mur ${murId}`, "déplacer l'une des deux baies"), [p.b.id, q.b.id, murId]);
    }
  }
}

/**
 * Les baies d'un mur suivent la nouvelle géométrie de leur hôte : `distance` conservée depuis l'arête de
 * début (`mode: "distance"`, DA-07-01 pour `mur.modifier`), ou centre conservé dans le plan (`"absolu"`,
 * pour un étirement, un ajustement, une scission). `choisirHote` permet de changer de mur (scission, jonction).
 */
export function reposerBaies(
  tx: Transaction,
  murAvant: ObjetMur,
  mode: "distance" | "absolu",
  chemin: string,
  choisirHote?: (centre: { x: number; y: number }, baie: ObjetBaie) => ObjetMur | null,
): void {
  const Lavant = longueurSegment(murAvant.params.axe);
  for (const b of baiesDuMur(tx, murAvant.id)) {
    const centre = pointA(murAvant.params.axe, b.params.position.t);
    const hote = choisirHote ? choisirHote(centre, b) : (tx.objet(murAvant.id) as ObjetMur | undefined) ?? null;
    if (!hote) {
      tx.refuser("hors-emprise", chemin, motif(nomObjet(b), "sa position ne se trouve sur aucun des nouveaux murs", "déplacer ou supprimer la baie d'abord"), [b.id, murAvant.id]);
      continue;
    }
    const Lapres = longueurSegment(hote.params.axe);
    if (Lapres === 0) continue;
    const t = mode === "distance" && hote.id === murAvant.id ? (b.params.position.t * Lavant) / Lapres : parametreProjection(hote.params.axe, centre);
    if (!(t >= 0 && t <= 1)) {
      tx.refuser("hors-emprise", chemin, motif(nomObjet(b), `son centre sortirait du mur ${hote.id} (t = ${t})`, "déplacer ou supprimer la baie d'abord"), [b.id, hote.id]);
      continue;
    }
    const position = b.params.position.distance === undefined ? { t } : { t, distance: mode === "distance" && hote.id === murAvant.id ? b.params.position.distance : { value: t * Lapres, unit: "m" as const } };
    const cles = hote.id === b.params.murHoteId ? ["position"] : ["position", "murHoteId"];
    tx.mettre(avecParams(b, { position, murHoteId: hote.id } as Partial<ObjetBaie["params"]>, cles));
  }
}

// --- Suppression ------------------------------------------------------------

/** Les cotations et étiquettes qui citent `objetId` passent « à réparer » (R12), avec propositions éventuelles. */
export function referencesAReparer(tx: Transaction, objetId: IdObjet, propositions?: (ref: ReferenceTopologique) => readonly PropositionReparation[]): void {
  for (const o of tx.objets()) {
    if (o.classe === "cotation" && o.params.references.some((r) => r.objetId === objetId)) {
      tx.mettre({ ...o, params: { ...o.params, etat: "a-reparer" } });
      for (const r of o.params.references.filter((x) => x.objetId === objetId)) signalerReference(tx, o.id, o.niveauId, { objetId, caracteristique: r.caracteristique }, propositions);
    } else if (o.classe === "etiquette" && o.params.objetId === objetId) {
      signalerReference(tx, o.id, o.niveauId, { objetId, caracteristique: o.params.caracteristique }, propositions);
    }
  }
}

function signalerReference(
  tx: Transaction,
  porteurId: IdObjet,
  niveauId: IdObjet | undefined,
  ref: { readonly objetId: IdObjet; readonly caracteristique: string | undefined },
  propositions?: (ref: ReferenceTopologique) => readonly PropositionReparation[],
): void {
  const nommee = ref.caracteristique !== undefined && estCaracteristiqueNommee(ref.caracteristique) ? { objetId: ref.objetId, caracteristique: ref.caracteristique } : null;
  if (nommee) tx.referencesTouchees.push({ porteurId, reference: nommee });
  const props = nommee && propositions ? propositions(nommee) : [];
  tx.signaler({
    code: "reference-a-reparer",
    gravite: "avertissement",
    message: `${porteurId} : la référence à ${ref.objetId}${ref.caracteristique ? ` (${ref.caracteristique})` : ""} est à réparer (objet supprimé ou scindé). Action : choisir une proposition ou détacher (reference.reparer).`,
    objetIds: [porteurId, ref.objetId],
    ...(niveauId !== undefined ? { niveauId } : {}),
    ...(props.length > 0 ? { propositions: props } : {}),
  });
}

/**
 * Supprime un objet : retire l'objet de son groupe, met « à réparer » les références qui le citent, retire
 * ses relations ; son identifiant reste réservé (`supprimes`).
 */
export function supprimerObjet(tx: Transaction, id: IdObjet, propositions?: (ref: ReferenceTopologique) => readonly PropositionReparation[]): void {
  const o = tx.objet(id);
  if (!o) return;
  if (o.groupeId !== undefined) {
    const g = tx.objet(o.groupeId);
    if (g?.classe === "groupe") tx.mettre({ ...g, params: { ...g.params, membres: g.params.membres.filter((m) => m !== id) } });
  }
  referencesAReparer(tx, id, propositions);
  tx.retirer(id);
}

export function estClasseBaie(c: unknown): c is ClasseBaie {
  return typeof c === "string" && (CLASSES_BAIE as readonly string[]).includes(c);
}

// --- Fabriques de réducteurs simples -----------------------------------------

/** Contrôle propre d'une classe : `cles` = paramètres touchés (`null` = tous, création). */
export type ControleObjet = (tx: Transaction, o: ObjetModele, chemin: string, cles: readonly string[] | null) => ObjetModele | void;

/** Création `EnTeteCreation & Params` d'un objet de niveau. `exclues` : clés de commande hors paramètres. */
export function fabriqueCreation<T extends TypeCommande>(classe: ClasseObjet, controle?: ControleObjet, exclues: readonly string[] = []): Corps<T> {
  return (tx, c) => {
    const p = c.params as unknown as { id: unknown; niveauId: unknown; calqueId: unknown } & Record<string, unknown>;
    if (!controlerEnTete(tx, p)) return;
    const o = nouvelObjet(classe, p.id as IdObjet, sansCles(p, ["id", "niveauId", "calqueId", ...exclues]) as never, { niveauId: p.niveauId as IdObjet, calqueId: p.calqueId as IdObjet }) as ObjetModele;
    tx.mettre(controle?.(tx, o, "params", null) ?? o);
  };
}

/** Modification `{ modifications }` d'une ou plusieurs cibles de la classe. */
export function fabriqueModification<T extends TypeCommande>(classes: readonly ClasseObjet[], controle?: ControleObjet, interdits: readonly string[] = []): Corps<T> {
  return (tx, c) => {
    const cibles = exigerCibles(tx, c.cibles, classes);
    if (!cibles) return;
    const mods = (c.params as { modifications?: unknown }).modifications;
    const cles = typeof mods === "object" && mods !== null ? Object.keys(mods) : [];
    for (const o of cibles) {
      const m = fusionnerModifications(tx, o, mods, "params.modifications", interdits);
      if (!m) return;
      tx.mettre(controle?.(tx, m, "params.modifications", cles) ?? m);
    }
  };
}

/** Suppression d'une ou plusieurs cibles de la classe (références « à réparer »). */
export function fabriqueSuppression<T extends TypeCommande>(classes: readonly ClasseObjet[]): Corps<T> {
  return (tx, c) => {
    const cibles = exigerCibles(tx, c.cibles, classes);
    if (!cibles) return;
    for (const o of cibles) supprimerObjet(tx, o.id);
  };
}

// --- Contrôles géométriques et de catalogue ---------------------------------

/** Le type (`typeId`) existe au catalogue pour la classe, ou vaut « non-type ». */
export function controlerType(tx: Transaction, classe: ClasseTypee, typeId: unknown, chemin: string): boolean {
  if (typeId === ID_NON_TYPE) return true;
  if (typeof typeId === "string" && tx.catalogue().definitions[cleDefinition(classe, typeId)] !== undefined) return true;
  tx.refuser("precondition", chemin, motif(`Type ${String(typeId)}`, `inconnu au catalogue pour la classe ${classe}`, "choisir un type existant ou le définir (type.definir)"));
  return false;
}

/** Longueur d'un segment ≥ `longueurMin` (D-012). Ne contrôle que des points bien formés (le reste : validation). */
export function controlerLongueurMin(tx: Transaction, a: unknown, b: unknown, chemin: string, objet: string): boolean {
  if (!estPointLocal(a) || !estPointLocal(b)) return true;
  const l = distance(a, b);
  if (l < TOLERANCES.longueurMin) {
    tx.refuser("parametre-invalide", chemin, motif(objet, `longueur ${l} m inférieure au minimum ${TOLERANCES.longueurMin} m`, "allonger le segment"));
    return false;
  }
  return true;
}

/** Contour (≥ 3 sommets bien formés) : aire ≥ `aireMin`, pas de sommets consécutifs confondus, pas d'auto-intersection si `simple`. */
export function controlerContour(tx: Transaction, contour: unknown, chemin: string, objet: string, simple: boolean): boolean {
  if (!Array.isArray(contour) || contour.length < 3 || !contour.every(estPointLocal)) return true;
  const pts = contour as PointLocal[];
  const i = sommetsConfondus(pts, true);
  if (i !== null) {
    tx.refuser("parametre-invalide", `${chemin}[${i}]`, motif(objet, `sommets ${i} et ${(i + 1) % pts.length} confondus`, "supprimer le sommet en double"));
    return false;
  }
  const aire = Math.abs(aireSignee(pts));
  if (aire < TOLERANCES.aireMin) {
    tx.refuser("parametre-invalide", chemin, motif(objet, `aire ${aire} m² inférieure au minimum ${TOLERANCES.aireMin} m²`, "agrandir le contour"));
    return false;
  }
  if (simple && contourAutoSecant(pts)) {
    tx.refuser("parametre-invalide", chemin, motif(objet, "contour auto-sécant", "corriger le contour (un contour simple est exigé)"));
    return false;
  }
  return true;
}

/** Trous : chacun est un contour valide dont tous les sommets sont dans le contour extérieur. */
export function controlerTrous(tx: Transaction, contour: unknown, trous: unknown, chemin: string, objet: string): boolean {
  if (!Array.isArray(trous) || !Array.isArray(contour) || !contour.every(estPointLocal)) return true;
  let ok = true;
  trous.forEach((t: unknown, i) => {
    const poly = typeof t === "object" && t !== null ? (t as { polygone?: unknown }).polygone : undefined;
    if (!controlerContour(tx, poly, `${chemin}[${i}].polygone`, objet, true)) ok = false;
    else if (Array.isArray(poly) && poly.every(estPointLocal) && !poly.every((p: PointLocal) => pointDansPolygone(p, contour as PointLocal[]))) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}[${i}]`, motif(objet, `le trou ${i} sort du contour`, "ramener le trou à l'intérieur du contour"));
    }
  });
  return ok;
}

/** Vrai si deux arêtes non adjacentes du contour fermé se coupent. */
export function contourAutoSecant(pts: readonly PointLocal[]): boolean {
  const n = pts.length;
  const seg = (i: number): [PointLocal, PointLocal] => [pts[i % n] as PointLocal, pts[(i + 1) % n] as PointLocal];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const [a, b] = seg(i);
      const [c, d] = seg(j);
      const r = intersectionDroites(a, sous(b, a), c, sous(d, c));
      if (r && r.s > -1e-12 && r.s < 1 + 1e-12 && r.u > -1e-12 && r.u < 1 + 1e-12) return true;
    }
  }
  return false;
}

/** Contrôle `niveauHaut` d'un mur : niveau existant, au-dessus du niveau du mur. */
export function controlerNiveauHaut(tx: Transaction, niveauId: IdObjet | undefined, niveauHaut: unknown, chemin: string, objet: string): boolean {
  if (niveauHaut === undefined) return true;
  const haut = controlerNiveau(tx, niveauHaut, chemin);
  const bas = niveauId !== undefined ? tx.objet(niveauId) : undefined;
  if (!haut) return false;
  if (bas?.classe === "niveau" && !(haut.params.elevation.value > bas.params.elevation.value)) {
    tx.refuser(
      "precondition",
      chemin,
      motif(objet, `le niveau haut ${haut.id} (${haut.params.elevation.value} m) n'est pas au-dessus du niveau ${bas.id} (${bas.params.elevation.value} m)`, "choisir un niveau supérieur ou une hauteur"),
    );
    return false;
  }
  return true;
}

/** Signale un paramètre « non évaluée » (R3) : information, rien n'est deviné. */
export function signalerNonEvaluees(tx: Transaction, o: ObjetModele, cles: readonly string[]): void {
  const params = o.params as unknown as Record<string, unknown>;
  for (const k of cles) {
    const v = params[k];
    if (estNonEvaluee(v)) {
      tx.signaler({
        code: "valeur-non-evaluee",
        gravite: "information",
        message: `${nomObjet(o)} : « ${k} » non évaluée (${(v as NonEvaluee).motif}).`,
        objetIds: [o.id],
        chemin: `params.${k}`,
        ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
      });
    }
  }
}
