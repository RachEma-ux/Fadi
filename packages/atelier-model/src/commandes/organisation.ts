/**
 * Commandes d'organisation et de site : niveaux, calques, groupes, définitions (types), propriétés typées,
 * classification, références (rattacher / réparer), parcelle et emprise.
 */
import { boucles, type AxeMur } from "../geometrie.js";
import type { Calque, CoordonneeCadastrale, Definition, Groupe, ModeleAtelier, Niveau, Occurrence, OccurrenceQuelconque, Propriete, Reference } from "../modele.js";
import { objetsDeClasse, objetsDuNiveau } from "../modele.js";
import { CLASSES, estClasse } from "../ontologie.js";
import { estPoint2, type Point2, type SommetParcelle } from "../unites.js";
import { ErreurCommande, effetsVides, lire, type ContexteCommande, type ResultatCommande } from "./base.js";
import { supprimerIds } from "./objets.js";

type Brut = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Niveaux
// ---------------------------------------------------------------------------

export const reducteursNiveau = {
  creer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("niveau");
    if (etat.niveaux[id]) throw new ErreurCommande("precondition", "id", `niveau déjà existant : ${id}`);
    const elevation = lire.nombre(p, "elevation")!;
    const hauteur = lire.nombre(p, "hauteur", { optionnel: true, min: 0 });
    const ordre = lire.nombre(p, "ordre", { optionnel: true, entier: true }) ?? Object.keys(etat.niveaux).length;
    const niveau: Niveau = { id, nom: lire.chaine(p, "nom"), elevation, hauteur, ordre };
    const effets = effetsVides();
    effets.crees.push(id);
    effets.niveauxTouches.push(id);
    return { etat: { ...etat, niveaux: { ...etat.niveaux, [id]: niveau } }, effets };
  },
  modifier(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const existant = etat.niveaux[id];
    if (!existant) throw new ErreurCommande("precondition", "id", `niveau inconnu : ${id}`);
    const niveau: Niveau = {
      ...existant,
      nom: p["nom"] === undefined ? existant.nom : lire.chaine(p, "nom"),
      elevation: p["elevation"] === undefined ? existant.elevation : lire.nombre(p, "elevation")!,
      hauteur: p["hauteur"] === undefined ? existant.hauteur : lire.nombre(p, "hauteur", { optionnel: true, min: 0 }),
      ordre: p["ordre"] === undefined ? existant.ordre : lire.nombre(p, "ordre", { entier: true })!,
    };
    const effets = effetsVides();
    effets.modifies.push(id);
    effets.niveauxTouches.push(id);
    return { etat: { ...etat, niveaux: { ...etat.niveaux, [id]: niveau } }, effets };
  },
  supprimer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const id = lire.chaine(p, "id");
    if (!etat.niveaux[id]) throw new ErreurCommande("precondition", "id", `niveau inconnu : ${id}`);
    const objets = objetsDuNiveau(etat, id);
    if (objets.length > 0 && !lire.booleen(p, "avecObjets", false)) {
      throw new ErreurCommande("precondition", "id", `le niveau ${id} contient ${objets.length} objet(s) : indiquer avecObjets = true pour les supprimer avec lui`);
    }
    for (const o of Object.values(etat.objets)) {
      if ((o.classe === "mur" && o.params.niveauHautId === id) || (o.classe === "escalier" && (o.params.niveauArriveeId === id || o.params.niveauDepartId === id) && o.niveauId !== id)) {
        throw new ErreurCommande("precondition", "id", `${o.id} référence le niveau ${id} (niveau haut ou d'arrivée) : à modifier d'abord`);
      }
    }
    const r = objets.length ? supprimerIds(etat, objets.map((o) => o.id), ctx) : { etat, effets: effetsVides() };
    const niveaux = { ...r.etat.niveaux };
    delete niveaux[id];
    r.effets.supprimes.push(id);
    r.effets.niveauxTouches.push(id);
    return { etat: { ...r.etat, niveaux }, effets: r.effets };
  },
};

// ---------------------------------------------------------------------------
// Calques et groupes
// ---------------------------------------------------------------------------

export const reducteursCalque = {
  creer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("calque");
    if (etat.calques[id]) throw new ErreurCommande("precondition", "id", `calque déjà existant : ${id}`);
    const calque: Calque = {
      id,
      nom: lire.chaine(p, "nom"),
      couleur: lire.chaineOuNull(p, "couleur"),
      remplissage: lire.chaineOuNull(p, "remplissage"),
      visible: lire.booleen(p, "visible", true),
      verrouille: lire.booleen(p, "verrouille", false),
      ordre: lire.nombre(p, "ordre", { optionnel: true, entier: true }) ?? Object.keys(etat.calques).length,
    };
    const effets = effetsVides();
    effets.crees.push(id);
    return { etat: { ...etat, calques: { ...etat.calques, [id]: calque } }, effets };
  },
  modifier(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const existant = etat.calques[id];
    if (!existant) throw new ErreurCommande("precondition", "id", `calque inconnu : ${id}`);
    const calque: Calque = {
      ...existant,
      nom: p["nom"] === undefined ? existant.nom : lire.chaine(p, "nom"),
      couleur: p["couleur"] === undefined ? existant.couleur : lire.chaineOuNull(p, "couleur"),
      remplissage: p["remplissage"] === undefined ? existant.remplissage : lire.chaineOuNull(p, "remplissage"),
      visible: lire.booleen(p, "visible", existant.visible),
      verrouille: lire.booleen(p, "verrouille", existant.verrouille),
      ordre: p["ordre"] === undefined ? existant.ordre : lire.nombre(p, "ordre", { entier: true })!,
    };
    const effets = effetsVides();
    effets.modifies.push(id);
    return { etat: { ...etat, calques: { ...etat.calques, [id]: calque } }, effets };
  },
  supprimer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    if (!etat.calques[id]) throw new ErreurCommande("precondition", "id", `calque inconnu : ${id}`);
    const utilise = Object.values(etat.objets).filter((o) => o.calqueId === id);
    if (utilise.length > 0) throw new ErreurCommande("precondition", "id", `le calque ${id} porte ${utilise.length} objet(s) : les réaffecter d'abord (calque.affecter)`);
    const calques = { ...etat.calques };
    delete calques[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, calques }, effets };
  },
  affecter(etat: ModeleAtelier, p: Brut, _ctx: ContexteCommande, c: string[]): ResultatCommande {
    const calqueId = lire.calque(etat, p);
    const ids = Array.isArray(p["cibles"]) ? (p["cibles"] as string[]) : c;
    if (ids.length === 0) throw new ErreurCommande("invalide", "cibles", "sélection vide");
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const id of ids) {
      const o = objets[id];
      if (!o) throw new ErreurCommande("precondition", "cibles", `objet inconnu : ${id}`);
      const ancien = o.calqueId ? etat.calques[o.calqueId] : null;
      if (ancien?.verrouille) throw new ErreurCommande("precondition", "cibles", `calque verrouillé : ${ancien.nom}`);
      objets[id] = { ...o, calqueId } as OccurrenceQuelconque;
      effets.modifies.push(id);
      if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    }
    return { etat: { ...etat, objets }, effets };
  },
};

export const reducteursGroupe = {
  creer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const ids = Array.isArray(p["cibles"]) ? (p["cibles"] as string[]) : c;
    if (ids.length === 0) throw new ErreurCommande("invalide", "cibles", "sélection vide");
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("groupe");
    if (etat.groupes[id]) throw new ErreurCommande("precondition", "id", `groupe déjà existant : ${id}`);
    const groupe: Groupe = { id, nom: lire.chaine(p, "nom", { optionnel: true }) || id };
    const objets = { ...etat.objets };
    const effets = effetsVides();
    effets.crees.push(id);
    for (const oid of ids) {
      const o = objets[oid];
      if (!o) throw new ErreurCommande("precondition", "cibles", `objet inconnu : ${oid}`);
      objets[oid] = { ...o, groupeId: id } as OccurrenceQuelconque;
      effets.modifies.push(oid);
    }
    return { etat: { ...etat, groupes: { ...etat.groupes, [id]: groupe }, objets }, effets };
  },
  dissoudre(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    if (!etat.groupes[id]) throw new ErreurCommande("precondition", "id", `groupe inconnu : ${id}`);
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const o of Object.values(objets)) if (o.groupeId === id) {
      objets[o.id] = { ...o, groupeId: null } as OccurrenceQuelconque;
      effets.modifies.push(o.id);
    }
    const groupes = { ...etat.groupes };
    delete groupes[id];
    effets.supprimes.push(id);
    return { etat: { ...etat, groupes, objets }, effets };
  },
};

// ---------------------------------------------------------------------------
// Définitions (types), propriétés, classification
// ---------------------------------------------------------------------------

export const reducteursType = {
  definir(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("type");
    if (etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const classe = lire.chaine(p, "classe");
    if (!estClasse(classe) && classe !== "bloc" && classe !== "composant") throw new ErreurCommande("invalide", "classe", `classe inconnue : ${classe}`);
    const params = (p["params"] as Brut | undefined) ?? {};
    const definition: Definition = { id, classe: classe as Definition["classe"], nom: lire.chaine(p, "nom"), params, version: 1 };
    const effets = effetsVides();
    effets.crees.push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: definition } }, effets };
  },
  modifier(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const existant = etat.definitions[id];
    if (!existant) throw new ErreurCommande("precondition", "id", `définition inconnue : ${id}`);
    const definition: Definition = {
      ...existant,
      nom: p["nom"] === undefined ? existant.nom : lire.chaine(p, "nom"),
      params: p["params"] === undefined ? existant.params : { ...existant.params, ...(p["params"] as Brut) },
      version: existant.version + 1,
    };
    const effets = effetsVides();
    effets.modifies.push(id);
    // Propagation explicite, jamais silencieuse : les occurrences qui utilisent la définition sont signalées modifiées.
    for (const o of Object.values(etat.objets)) if (o.definitionId === id) effets.modifies.push(o.id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: definition } }, effets };
  },
};

export function definirPropriete(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const nom = lire.chaine(p, "nom");
  const o = etat.objets[id]!;
  const provenance = lire.enumeration(p, "provenance", ["saisie", "import", "calcul", "regle"] as const, "saisie");
  const statut = lire.enumeration(p, "statut", ["declaree", "verifiee", "a-verifier"] as const, "declaree");
  const unite = lire.chaineOuNull(p, "unite");
  const propriete: Propriete = unite === null ? { valeur: p["valeur"], provenance, statut } : { valeur: p["valeur"], unite, provenance, statut };
  const proprietes = { ...o.proprietes };
  if (p["valeur"] === undefined) delete proprietes[nom];
  else proprietes[nom] = propriete;
  const effets = effetsVides();
  effets.modifies.push(id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, proprietes } as OccurrenceQuelconque } }, effets };
}

/** Classification : la classe IFC vient de l'ontologie (jamais devinée autrement) ; un code de classification externe est déclaré, avec son système. */
export function affecterClassification(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const systeme = lire.chaine(p, "systeme");
  const code = lire.chaineOuNull(p, "code");
  const o = etat.objets[id]!;
  const proprietes = { ...o.proprietes };
  if (code === null) delete proprietes[`classification:${systeme}`];
  else proprietes[`classification:${systeme}`] = { valeur: code, provenance: "saisie", statut: "declaree" };
  proprietes["classeIfc"] = { valeur: CLASSES[o.classe].ifc, provenance: "regle", statut: "verifiee" };
  const effets = effetsVides();
  effets.modifies.push(id);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, proprietes } as OccurrenceQuelconque } }, effets };
}

// ---------------------------------------------------------------------------
// Références
// ---------------------------------------------------------------------------

export function rattacherReference(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
  const proprietaireId = lire.objet(etat, p, "id");
  const objetId = lire.objet(etat, p, "objetId");
  const caracteristique = lire.chaine(p, "caracteristique");
  const objet = etat.objets[objetId]!;
  const base = caracteristique.replace(/\[\d+\]$/, "");
  if (!CLASSES[objet.classe].caracteristiques.includes(base)) throw new ErreurCommande("precondition", "caracteristique", `${objet.classe} n'a pas de caractéristique « ${caracteristique} »`);
  const existante = Object.values(etat.references).find((r) => r.proprietaireId === proprietaireId && (p["referenceId"] === undefined || r.id === p["referenceId"]));
  const id = existante?.id ?? lire.chaineOuNull(p, "referenceId") ?? ctx.ids.nouveau("ref");
  const reference: Reference = { id, proprietaireId, objetId, caracteristique, etat: "ok", propositions: [] };
  const effets = effetsVides();
  effets.modifies.push(proprietaireId);
  const problemes = { ...etat.problemes };
  for (const pb of Object.values(problemes)) if (pb.type === "reference-a-reparer" && pb.objetId === proprietaireId) delete problemes[pb.id];
  return { etat: { ...etat, references: { ...etat.references, [id]: reference }, problemes }, effets };
}

export function reparerReference(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.chaine(p, "referenceId");
  const ref = etat.references[id];
  if (!ref) throw new ErreurCommande("precondition", "referenceId", `référence inconnue : ${id}`);
  const detacher = lire.booleen(p, "detacher", false);
  let suivante: Reference;
  if (detacher) suivante = { ...ref, objetId: null, caracteristique: null, etat: "libre", propositions: [] };
  else {
    const objetId = lire.objet(etat, p, "objetId");
    const caracteristique = lire.chaine(p, "caracteristique");
    suivante = { ...ref, objetId, caracteristique, etat: "ok", propositions: [] };
  }
  const problemes = { ...etat.problemes };
  for (const pb of Object.values(problemes)) if (pb.type === "reference-a-reparer" && pb.objetId === ref.proprietaireId) delete problemes[pb.id];
  const effets = effetsVides();
  effets.modifies.push(ref.proprietaireId);
  return { etat: { ...etat, references: { ...etat.references, [id]: suivante }, problemes }, effets };
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

function lireOrigine(p: Brut): CoordonneeCadastrale {
  const v = p["origineLocale"] as Partial<CoordonneeCadastrale> | undefined;
  if (!v || v.frame !== "cadastral" || typeof v.crs !== "string" || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    throw new ErreurCommande("invalide", "origineLocale", "origine du repère local attendue : { x, y, frame: 'cadastral', crs, unit: 'm' }");
  }
  return { x: v.x!, y: v.y!, frame: "cadastral", crs: v.crs, unit: "m" };
}

function lireSommetsParcelle(p: Brut, origine: CoordonneeCadastrale): SommetParcelle[] {
  const v = p["sommets"];
  if (!Array.isArray(v) || v.length < 3) throw new ErreurCommande("invalide", "sommets", "au moins trois sommets");
  return v.map((s, i) => {
    const q = s as Partial<SommetParcelle>;
    if (!q || typeof q.id !== "string" || !q.cadastral || q.cadastral.frame !== "cadastral" || typeof q.cadastral.crs !== "string" || !Number.isFinite(q.cadastral.x) || !Number.isFinite(q.cadastral.y)) {
      throw new ErreurCommande("invalide", `sommets[${i}]`, "sommet { id, cadastral: { x, y, frame: 'cadastral', crs, unit: 'm' }, local? } attendu");
    }
    const local: Point2 = estPoint2(q.local) ? (q.local as Point2) : { x: q.cadastral.x - origine.x, y: q.cadastral.y - origine.y, frame: "local", unit: "m" };
    return { id: q.id, cadastral: { x: q.cadastral.x, y: q.cadastral.y, frame: "cadastral", crs: q.cadastral.crs, unit: "m" }, local };
  });
}

export const reducteursSite = {
  parcelle(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const origineLocale = lireOrigine(p);
    const sommets = lireSommetsParcelle(p, origineLocale);
    const crs = lire.chaine(p, "crs");
    const aire = p["aire"] === undefined || p["aire"] === null ? null : { value: lire.nombre(p, "aire", { min: 0 })!, unit: "m2" as const };
    const aireOfficielle = p["aireOfficielle"] === undefined || p["aireOfficielle"] === null ? null : { value: lire.nombre(p, "aireOfficielle", { min: 0 })!, unit: "m2" as const };
    const champs = (p["champs"] as Brut | undefined) ?? {};
    const effets = effetsVides();
    effets.modifies.push("site:parcelle");
    return { etat: { ...etat, site: { ...etat.site, parcelle: { sommets, crs, sourceCrs: lire.chaineOuNull(p, "sourceCrs"), origineLocale, aire, aireOfficielle, champs } } }, effets };
  },
  emprise(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const champs = (p["champs"] as Brut | undefined) ?? {};
    let sommets: Point2[];
    let sommetsCadastraux: CoordonneeCadastrale[];
    if (Array.isArray(p["sommetsCadastraux"])) {
      const origine = etat.site.parcelle?.origineLocale;
      if (!origine) throw new ErreurCommande("precondition", "sommetsCadastraux", "aucune parcelle définie : l'origine du repère local est inconnue");
      sommetsCadastraux = (p["sommetsCadastraux"] as Partial<CoordonneeCadastrale>[]).map((c, i) => {
        if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) throw new ErreurCommande("invalide", `sommetsCadastraux[${i}]`, "coordonnée cadastrale attendue");
        return { x: c.x!, y: c.y!, frame: "cadastral", crs: c.crs ?? origine.crs, unit: "m" };
      });
      if (sommetsCadastraux.length < 3) throw new ErreurCommande("invalide", "sommetsCadastraux", "au moins trois sommets");
      sommets = sommetsCadastraux.map((c) => ({ x: c.x - origine.x, y: c.y - origine.y, frame: "local" as const, unit: "m" as const }));
    } else {
      sommets = lire.points(p, "sommets", { min: 3 });
      const origine = etat.site.parcelle?.origineLocale;
      sommetsCadastraux = origine ? sommets.map((q) => ({ x: q.x + origine.x, y: q.y + origine.y, frame: "cadastral" as const, crs: origine.crs, unit: "m" as const })) : [];
    }
    const effets = effetsVides();
    effets.modifies.push("site:emprise");
    return { etat: { ...etat, site: { ...etat.site, emprise: { sommets, sommetsCadastraux, champs } } }, effets };
  },
};

// ---------------------------------------------------------------------------
// Détection de pièces (proposition, jamais une commande)
// ---------------------------------------------------------------------------

export interface PropositionPiece {
  contour: Point2[];
  murs: string[];
  aire: number;
  /** Pièce existante dont le contour recouvre la proposition (même boucle), le cas échéant. */
  pieceExistante: string | null;
}

/** Boucles fermées des axes de murs d'un niveau ; les boucles déjà représentées par une pièce sont marquées. */
export function detecterPieces(etat: ModeleAtelier, niveauId: string): PropositionPiece[] {
  const murs = objetsDeClasse(etat, "mur", niveauId);
  const axes: AxeMur[] = murs.map((m) => ({ id: m.id, a: m.params.a, b: m.params.b }));
  const pieces = objetsDeClasse(etat, "piece", niveauId) as Occurrence<"piece">[];
  return boucles(axes).map((b) => {
    const c = b.contour;
    const cx = c.reduce((s, q) => s + q.x, 0) / c.length;
    const cy = c.reduce((s, q) => s + q.y, 0) / c.length;
    const existante = pieces.find((pc) => pointDansContour({ x: cx, y: cy }, pc.params.contour) && Math.abs(aireContour(pc.params.contour) - b.aire) <= Math.max(0.5, 0.1 * b.aire));
    return { contour: c, murs: b.murs, aire: b.aire, pieceExistante: existante?.id ?? null };
  });
}

function pointDansContour(p: { x: number; y: number }, poly: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function aireContour(poly: readonly Point2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s / 2);
}
