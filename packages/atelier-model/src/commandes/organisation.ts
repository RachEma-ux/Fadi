/**
 * Commandes d'organisation et de site : niveaux, calques, groupes, définitions (types), propriétés typées,
 * classification, références (rattacher / réparer), parcelle et emprise.
 */
import { codesProches, referentielDu } from "./referentiels.js";
import { lireCouches } from "../compositions.js";
import { axesDesMurs, boucles, type AxeMur } from "../geometrie.js";
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
    // Réaffectation (D-044) : `reaffecterA` = niveau qui reçoit les objets (ouvertures avec leur mur) avant la
    // suppression ; un escalier ou un mur dont le niveau haut ne serait plus au-dessus : refus motivé.
    const reaffecterA = lire.chaineOuNull(p, "reaffecterA");
    if (reaffecterA !== null) {
      const cible = etat.niveaux[reaffecterA];
      if (!cible || reaffecterA === id) throw new ErreurCommande("precondition", "reaffecterA", `niveau de réaffectation inconnu ou identique : ${reaffecterA}`);
      let objetsR = { ...etat.objets };
      for (const o of objetsDuNiveau(etat, id)) {
        if (o.classe === "escalier") throw new ErreurCommande("precondition", "reaffecterA", `${o.id} : un escalier ne change pas de niveau (niveaux de départ et d'arrivée à redéfinir)`);
        if (o.classe === "mur" && o.params.niveauHautId) {
          const haut = etat.niveaux[o.params.niveauHautId];
          if (haut && haut.elevation <= cible.elevation) throw new ErreurCommande("precondition", "reaffecterA", `mur ${o.id} : son niveau haut « ${haut.nom} » ne serait plus au-dessus de « ${cible.nom} »`);
        }
        objetsR = { ...objetsR, [o.id]: { ...o, niveauId: reaffecterA } as OccurrenceQuelconque };
      }
      const moved = objetsDuNiveau(etat, id).map((o) => o.id);
      const sansObjets = reducteursNiveau.supprimer({ ...etat, objets: objetsR }, { id }, ctx);
      sansObjets.effets.modifies.push(...moved);
      sansObjets.effets.niveauxTouches.push(reaffecterA);
      return sansObjets;
    }
    const objets = objetsDuNiveau(etat, id);
    if (objets.length > 0 && !lire.booleen(p, "avecObjets", false)) {
      throw new ErreurCommande("precondition", "id", `le niveau ${id} contient ${objets.length} objet(s) : indiquer avecObjets = true pour les supprimer avec lui, ou reaffecterA`);
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
    // Vues 3D enregistrées (D-053) qui retenaient ce niveau comme niveau actif : elles n'en retiennent plus aucun.
    let definitions = r.etat.definitions;
    for (const d of Object.values(definitions)) {
      if (((d.classe as string) !== "vue-3d" && (d.classe as string) !== "ensemble-affichage") || (d.params as { niveauId?: string | null }).niveauId !== id) continue;
      definitions = { ...definitions, [d.id]: { ...d, params: { ...d.params, niveauId: null }, version: d.version + 1 } };
      r.effets.modifies.push(d.id);
    }
    return { etat: { ...r.etat, niveaux, definitions }, effets: r.effets };
  },
};

// ---------------------------------------------------------------------------
// Calques et groupes
// ---------------------------------------------------------------------------

/** Sous-calques d'un calque, transitivement (D-080). */
export function descendantsCalque(etat: ModeleAtelier, id: string): string[] {
  const out: string[] = [];
  const pile = [id];
  while (pile.length) {
    const p = pile.pop()!;
    for (const c of Object.values(etat.calques)) if (c.parentId === p && !out.includes(c.id) && c.id !== id) { out.push(c.id); pile.push(c.id); }
  }
  return out.sort();
}

function lireParent(etat: ModeleAtelier, p: Brut, id: string): string | null {
  const parent = lire.chaineOuNull(p, "parentId");
  if (!parent) return null;
  if (!etat.calques[parent]) throw new ErreurCommande("precondition", "parentId", `calque parent inconnu : ${parent}`);
  if (parent === id || descendantsCalque(etat, id).includes(parent)) throw new ErreurCommande("precondition", "parentId", "cycle : un calque ne peut pas être rangé sous lui-même ou sous un de ses sous-calques");
  return parent;
}

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
    const parent = lireParent(etat, p, id);
    if (parent) calque.parentId = parent;
    if (lire.booleen(p, "gele", false)) calque.gele = true;
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
    if (p["parentId"] !== undefined) {
      const parent = lireParent(etat, p, id);
      delete calque.parentId;
      if (parent) calque.parentId = parent;
    }
    // Gel (D-103) : clé absente quand le calque n'est pas gelé.
    if (p["gele"] !== undefined) {
      delete calque.gele;
      if (lire.booleen(p, "gele", false)) calque.gele = true;
    }
    const effets = effetsVides();
    effets.modifies.push(id);
    let calques = { ...etat.calques, [id]: calque };
    // Calques imbriqués (D-080) : masquer, afficher, verrouiller ou libérer un calque l'applique à ses descendants
    // (même commande, même révision) ; un sous-calque reste ensuite réglable seul.
    for (const cle of ["visible", "verrouille"] as const) {
      if (p[cle] === undefined || calque[cle] === existant[cle]) continue;
      for (const d of descendantsCalque(etat, id)) {
        if (calques[d]![cle] === calque[cle]) continue;
        calques = { ...calques, [d]: { ...calques[d]!, [cle]: calque[cle] } };
        effets.modifies.push(d);
      }
    }
    if (p["gele"] !== undefined && !!calque.gele !== !!existant.gele) {
      for (const d of descendantsCalque(etat, id)) {
        if (!!calques[d]!.gele === !!calque.gele) continue;
        const { gele: _g, ...reste } = calques[d]!;
        void _g;
        calques = { ...calques, [d]: calque.gele ? { ...reste, gele: true } : reste };
        effets.modifies.push(d);
      }
    }
    return { etat: { ...etat, calques }, effets };
  },
  supprimer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    if (!etat.calques[id]) throw new ErreurCommande("precondition", "id", `calque inconnu : ${id}`);
    const utilise = Object.values(etat.objets).filter((o) => o.calqueId === id);
    if (utilise.length > 0) throw new ErreurCommande("precondition", "id", `le calque ${id} porte ${utilise.length} objet(s) : les réaffecter d'abord (calque.affecter)`);
    const calques = { ...etat.calques };
    const parentSupprime = calques[id]!.parentId;
    delete calques[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    // Sous-calques (D-080) : rattachés au parent du calque supprimé.
    for (const c of Object.values(calques)) {
      if (c.parentId !== id) continue;
      const { parentId: _p, ...reste } = c;
      void _p;
      calques[c.id] = parentSupprime ? { ...reste, parentId: parentSupprime } : reste;
      effets.modifies.push(c.id);
    }
    // Vues (D-057) et ensembles d'affichage partagés (D-066) qui masquaient ce calque : il sort de leur liste.
    let definitions = etat.definitions;
    for (const d of Object.values(definitions)) {
      // États de calques (D-119) : le calque supprimé sort de l'instantané.
      const instantane = d.classe === ("etat-calques" as typeof d.classe) ? (d.params as { calques?: Record<string, unknown> }).calques : undefined;
      if (instantane && id in instantane) {
        const { [id]: _x, ...calquesRestants } = instantane;
        void _x;
        definitions = { ...definitions, [d.id]: { ...d, params: { ...d.params, calques: calquesRestants }, version: d.version + 1 } };
        effets.modifies.push(d.id);
        continue;
      }
      const masques = (d.params as { calquesMasques?: string[] }).calquesMasques;
      if (d.classe === ("ensemble-affichage" as typeof d.classe) && masques?.includes(id)) {
        definitions = { ...definitions, [d.id]: { ...d, params: { ...d.params, calquesMasques: masques.filter((c) => c !== id) }, version: d.version + 1 } };
        effets.modifies.push(d.id);
        continue;
      }
      if (d.classe !== "vue" || !masques?.includes(id)) continue;
      const reste = masques.filter((c) => c !== id);
      const { calquesMasques: _m, ...params } = d.params as { calquesMasques?: string[] } & Record<string, unknown>;
      void _m;
      definitions = { ...definitions, [d.id]: { ...d, params: reste.length ? { ...params, calquesMasques: reste } : params, version: d.version + 1 } };
      effets.modifies.push(d.id);
    }
    return { etat: { ...etat, calques, definitions }, effets };
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
  /**
   * Modifier un groupe (D-041) : renommer, ajouter ou retirer des membres. Un objet déjà membre d'un autre groupe
   * n'y est pas arraché en silence (refus) ; un groupe vidé est refusé (le dissoudre). Verrouiller ou déverrouiller
   * le groupe (D-052) ; retirer un membre d'un groupe verrouillé est refusé (déverrouiller d'abord).
   */
  modifier(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const groupe = etat.groupes[id];
    if (!groupe) throw new ErreurCommande("precondition", "id", `groupe inconnu : ${id}`);
    const liste = (cle: string) => (p[cle] === undefined ? [] : Array.isArray(p[cle]) && (p[cle] as unknown[]).every((x) => typeof x === "string") ? (p[cle] as string[]) : (() => { throw new ErreurCommande("invalide", cle, `« ${cle} » : liste d'identifiants`); })());
    const ajouter = liste("ajouter");
    const retirer = liste("retirer");
    const nom = p["nom"] === undefined ? groupe.nom : lire.chaine(p, "nom").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom du groupe requis");
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const oid of ajouter) {
      const o = objets[oid];
      if (!o) throw new ErreurCommande("precondition", "ajouter", `objet inconnu : ${oid}`);
      if (o.groupeId === id) continue;
      if (o.groupeId) throw new ErreurCommande("precondition", "ajouter", `${oid} appartient déjà au groupe « ${etat.groupes[o.groupeId]?.nom ?? o.groupeId} » : l'en retirer d'abord`);
      objets[oid] = { ...o, groupeId: id } as OccurrenceQuelconque;
      effets.modifies.push(oid);
    }
    for (const oid of retirer) {
      const o = objets[oid];
      if (!o || o.groupeId !== id) throw new ErreurCommande("precondition", "retirer", `${oid} n'est pas membre du groupe`);
      objets[oid] = { ...o, groupeId: null } as OccurrenceQuelconque;
      effets.modifies.push(oid);
    }
    if (!Object.values(objets).some((o) => o.groupeId === id)) throw new ErreurCommande("precondition", "retirer", "le groupe serait vide : le dissoudre");
    // Verrou du groupe (D-052) : `verrouille` true / false ; ses membres sont alors tenus (voir controlerVerrous).
    const verrou = p["verrouille"] === undefined ? groupe.verrouille === true : lire.booleen(p, "verrouille", false);
    if (nom !== groupe.nom || verrou !== (groupe.verrouille === true)) effets.modifies.push(id);
    const { verrouille: _v, ...reste } = groupe;
    void _v;
    return { etat: { ...etat, groupes: { ...etat.groupes, [id]: { ...reste, nom, ...(verrou ? { verrouille: true as const } : {}) } }, objets }, effets };
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
    // Composition d'un type de mur : couches validées (matériau nommé, épaisseur), jamais supposées (D-026).
    if (classe === "mur" && params["couches"] !== undefined) params["couches"] = lireCouches(params["couches"]);
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
    if (existant.classe === "mur" && definition.params["couches"] !== undefined) {
      const couches = lireCouches(definition.params["couches"]);
      definition.params = { ...definition.params };
      if (couches) definition.params["couches"] = couches;
      else delete definition.params["couches"];
    }
    const effets = effetsVides();
    effets.modifies.push(id);
    // Propagation explicite, jamais silencieuse : les occurrences qui utilisent la définition sont signalées modifiées.
    for (const o of Object.values(etat.objets)) if (o.definitionId === id) effets.modifies.push(o.id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: definition } }, effets };
  },
};

export function definirPropriete(etat: ModeleAtelier, p: Brut): ResultatCommande {
  // Propriété d'un groupe ou d'un calque (D-088) : même forme, cible nommée par groupeId ou calqueId.
  const groupeId = lire.chaineOuNull(p, "groupeId");
  const calqueCible = lire.chaineOuNull(p, "calqueCible");
  if (groupeId !== null || calqueCible !== null) {
    const nomP = lire.chaine(p, "nom");
    const provenanceP = lire.enumeration(p, "provenance", ["saisie", "import", "calcul", "regle"] as const, "saisie");
    const statutP = lire.enumeration(p, "statut", ["declaree", "verifiee", "a-verifier"] as const, "declaree");
    const uniteP = lire.chaineOuNull(p, "unite");
    if (typeof p["valeur"] === "number" && !uniteP) throw new ErreurCommande("invalide", "unite", `propriété numérique « ${nomP} » sans unité : refusée`);
    const prop: Propriete = uniteP === null ? { valeur: p["valeur"], provenance: provenanceP, statut: statutP } : { valeur: p["valeur"], unite: uniteP, provenance: provenanceP, statut: statutP };
    const maj = <T extends { proprietes?: Record<string, Propriete> }>(x: T): T => {
      const proprietes = { ...(x.proprietes ?? {}) };
      if (p["valeur"] === undefined) delete proprietes[nomP];
      else proprietes[nomP] = prop;
      const { proprietes: _p, ...reste } = x;
      void _p;
      return (Object.keys(proprietes).length ? { ...reste, proprietes } : reste) as T;
    };
    const effetsG = effetsVides();
    if (groupeId !== null) {
      const g = etat.groupes[groupeId];
      if (!g) throw new ErreurCommande("precondition", "groupeId", `groupe inconnu : ${groupeId}`);
      effetsG.modifies.push(groupeId);
      return { etat: { ...etat, groupes: { ...etat.groupes, [groupeId]: maj(g) } }, effets: effetsG };
    }
    const c = etat.calques[calqueCible!];
    if (!c) throw new ErreurCommande("precondition", "calqueCible", `calque inconnu : ${calqueCible}`);
    effetsG.modifies.push(calqueCible!);
    return { etat: { ...etat, calques: { ...etat.calques, [calqueCible!]: maj(c) } }, effets: effetsG };
  }
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
  // Référentiel chargé pour ce système (D-065) : le code doit y figurer ; il est alors « vérifié » et son libellé noté.
  const ref = code === null ? null : referentielDu(etat, systeme);
  if (ref && !(code! in ref.params.codes)) {
    const proches = codesProches(ref.params, code!);
    throw new ErreurCommande("precondition", "code", `code « ${code} » absent du référentiel ${ref.nom} (source : ${ref.params.source})${proches.length ? ` ; codes proches : ${proches.join(", ")}` : ""}`);
  }
  if (code === null) {
    delete proprietes[`classification:${systeme}`];
    delete proprietes[`classification:${systeme}:libelle`];
  } else {
    proprietes[`classification:${systeme}`] = { valeur: code, provenance: "saisie", statut: ref ? "verifiee" : "declaree" };
    const libelle = ref?.params.codes[code];
    if (libelle) proprietes[`classification:${systeme}:libelle`] = { valeur: libelle, provenance: "import", statut: "verifiee" };
    else delete proprietes[`classification:${systeme}:libelle`];
  }
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
  const axes: AxeMur[] = axesDesMurs(murs as Occurrence<"mur">[]);
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

// ---------------------------------------------------------------------------
// Phases (lot 5)
// ---------------------------------------------------------------------------

/** Affecte une phase (existant / nouveau / à démolir) à une sélection, ou la retire (null). */
export function affecterPhase(etat: ModeleAtelier, p: Brut, cibles: string[]): ResultatCommande {
  const ids = [...new Set([...(Array.isArray(p["cibles"]) ? (p["cibles"] as unknown[]).filter((x): x is string => typeof x === "string") : []), ...cibles])];
  if (!ids.length) throw new ErreurCommande("invalide", "cibles", "sélection vide");
  const phase = p["phase"] === null || p["phase"] === undefined ? null : lire.enumeration(p, "phase", ["existant", "nouveau", "a-demolir"] as const);
  const objets = { ...etat.objets };
  const effets = effetsVides();
  ids.forEach((id, i) => {
    const o = objets[id];
    if (!o) throw new ErreurCommande("precondition", `cibles[${i}]`, `objet inconnu : ${id}`);
    const calque = o.calqueId ? etat.calques[o.calqueId] : null;
    if (calque?.verrouille) throw new ErreurCommande("precondition", `cibles[${i}]`, `calque verrouillé : ${calque.nom}`);
    if (o.phase === phase) return;
    objets[id] = { ...o, phase };
    effets.modifies.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  });
  return { etat: { ...etat, objets }, effets };
}

// ---------------------------------------------------------------------------
// Définitions : suppression, substitution (D-044)
// ---------------------------------------------------------------------------

const occurrencesDe = (etat: ModeleAtelier, id: string) => Object.values(etat.objets).filter((o) => o.definitionId === id);

export const reducteursDefinition = {
  /**
   * Supprimer une définition (type, bloc, composant). Utilisée : refus, sauf pour un type avec `detacher` (les
   * occurrences deviennent « sans type » — leurs paramètres ne changent pas). Un bloc ou un composant utilisé se
   * décompose d'abord ; vues, feuilles et références externes ont leurs propres commandes.
   */
  supprimer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const id = lire.chaine(p, "id");
    const d = etat.definitions[id];
    if (!d) throw new ErreurCommande("precondition", "id", `définition inconnue : ${id}`);
    if (["vue", "feuille", "reference-externe", "vue-3d", "referentiel-classification", "ensemble-affichage", "etat-calques"].includes(d.classe as string)) throw new ErreurCommande("precondition", "id", `${d.nom} : utiliser la commande propre aux ${d.classe === "reference-externe" ? "références externes (refexterne.detacher)" : d.classe === "vue-3d" ? "vues 3D (vue3d.supprimer)" : d.classe === "referentiel-classification" ? "référentiels (referentiel.retirer)" : d.classe === "ensemble-affichage" ? "ensembles d'affichage (ensemble.supprimer)" : d.classe === "etat-calques" ? "états de calques (etatCalques.supprimer)" : "vues et feuilles"}`);
    const occ = occurrencesDe(etat, id);
    const detacher = lire.booleen(p, "detacher", false);
    // Bloc placé dans un autre bloc (D-078) : la définition qui l'imbrique est nommée.
    const parent = (d.classe === "bloc" || d.classe === "composant") ? Object.values(etat.definitions).find((x) => x.id !== id && ((x.params["contenu"] as { definitionId?: string | null }[] | undefined) ?? []).some((e) => e.definitionId === id)) : undefined;
    if (parent) throw new ErreurCommande("precondition", "id", `« ${d.nom} » est imbriqué dans le bloc « ${parent.nom} » : redéfinir ce bloc d'abord`);
    if (occ.length && (d.classe === "bloc" || d.classe === "composant")) throw new ErreurCommande("precondition", "id", `« ${d.nom} » a ${occ.length} occurrence(s) : les décomposer ou les supprimer d'abord`);
    if (occ.length && !detacher) throw new ErreurCommande("precondition", "id", `le type « ${d.nom} » est utilisé par ${occ.length} objet(s) : indiquer detacher = true (objets sans type) ou substituer un autre type`);
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const o of occ) {
      objets[o.id] = { ...o, definitionId: null } as OccurrenceQuelconque;
      effets.modifies.push(o.id);
    }
    const definitions = { ...etat.definitions };
    delete definitions[id];
    effets.supprimes.push(id);
    return { etat: { ...etat, objets, definitions }, effets };
  },
  /** Substituer une définition par une autre de même nature : toutes ses occurrences passent sur la nouvelle. */
  substituer(etat: ModeleAtelier, p: Brut): ResultatCommande {
    const ancienne = etat.definitions[lire.chaine(p, "ancienne")];
    const nouvelle = etat.definitions[lire.chaine(p, "nouvelle")];
    if (!ancienne || !nouvelle) throw new ErreurCommande("precondition", ancienne ? "nouvelle" : "ancienne", "définition inconnue");
    if (ancienne.id === nouvelle.id) throw new ErreurCommande("invalide", "nouvelle", "définition identique");
    const blocs = ["bloc", "composant"];
    const compatibles = ancienne.classe === nouvelle.classe || (blocs.includes(ancienne.classe as string) && blocs.includes(nouvelle.classe as string));
    if (!compatibles || ["vue", "feuille", "reference-externe", "vue-3d", "referentiel-classification", "ensemble-affichage", "etat-calques"].includes(ancienne.classe as string)) throw new ErreurCommande("precondition", "nouvelle", `« ${nouvelle.nom} » (${nouvelle.classe}) ne peut pas remplacer « ${ancienne.nom} » (${ancienne.classe})`);
    const objets = { ...etat.objets };
    const effets = effetsVides();
    for (const o of occurrencesDe(etat, ancienne.id)) {
      objets[o.id] = { ...o, definitionId: nouvelle.id } as OccurrenceQuelconque;
      effets.modifies.push(o.id);
      if (o.niveauId && !effets.niveauxTouches.includes(o.niveauId)) effets.niveauxTouches.push(o.niveauId);
    }
    if (!effets.modifies.length) throw new ErreurCommande("precondition", "ancienne", `« ${ancienne.nom} » n'a aucune occurrence`);
    return { etat: { ...etat, objets }, effets };
  },
};

