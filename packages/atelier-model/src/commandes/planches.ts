/**
 * Planches (cahier-planche lot 7, P-1 / D-167) : une Planche est une définition `planche` du modèle de l'Atelier —
 * nom, niveau de référence facultatif (origine en altitude), modèle de géométrie libre (`@parcours/planche-model`) et
 * empreinte reproductible. Plusieurs Planches nommées par projet ; aucune présence dans les métrés (ce ne sont pas des
 * objets) ; représentation en lecture seule en 3D et dans l'IFC (`IfcBuildingElementProxy`).
 *
 * Chaque pas de la Planche est une commande `planche.operation` : le navigateur envoie la différence structurelle
 * (`DeltaPlanche`) et l'empreinte du modèle d'arrivée ; le serveur applique le même delta avec la même fonction pure
 * et refuse le lot (précondition, 409) si l'empreinte obtenue n'est pas celle annoncée. L'inverse est l'instantané
 * différentiel de l'Atelier (la définition d'avant), comme pour toute commande.
 */
import { appliquerDeltaPlanche, empreintePlanche, estDeltaPlanche, lireModelePlanche, modeleVide as plancheVide, type Modele as ModelePlanche } from "@parcours/planche-model";
import type { Definition, ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

type Brut = Record<string, unknown>;

export const CLASSE_PLANCHE = "planche" as Definition["classe"];

export interface ParamsPlanche {
  nom: string;
  /** Niveau de référence (origine en altitude) ; `null` = altitude 0 du projet. */
  niveauId: string | null;
  modele: ModelePlanche;
  empreinte: string;
}

export type DefinitionPlanche = Definition & { params: ParamsPlanche };

/** Planches du projet, par nom puis identifiant. */
export const planches = (etat: ModeleAtelier): DefinitionPlanche[] =>
  Object.values(etat.definitions)
    .filter((d): d is DefinitionPlanche => d.classe === CLASSE_PLANCHE)
    .sort((a, b) => a.params.nom.localeCompare(b.params.nom, "fr") || (a.id < b.id ? -1 : 1));

export function planche(etat: ModeleAtelier, id: string): DefinitionPlanche {
  const d = etat.definitions[id];
  if (!d || d.classe !== CLASSE_PLANCHE) throw new ErreurCommande("precondition", "id", `Planche inconnue : ${id}`);
  return d as DefinitionPlanche;
}

function nomValide(p: Brut, cle = "nom"): string {
  const nom = lire.chaine(p, cle).trim();
  if (!nom || nom.length > 120) throw new ErreurCommande("invalide", cle, "nom de la Planche requis (120 caractères au plus)");
  return nom;
}

function nomLibre(etat: ModeleAtelier, nom: string, saufId: string | null): void {
  if (planches(etat).some((d) => d.id !== saufId && d.params.nom.localeCompare(nom, "fr", { sensitivity: "accent" }) === 0)) throw new ErreurCommande("precondition", "nom", `une Planche porte déjà le nom « ${nom} »`);
}

function niveauRef(etat: ModeleAtelier, p: Brut): string | null {
  const id = lire.chaineOuNull(p, "niveauId");
  if (id !== null && !etat.niveaux[id]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${id}`);
  return id;
}

/** Paramètres d'une Planche relus (archive, import) : modèle validé, empreinte recalculée et comparée, niveau connu ou retiré. */
export function lireParamsPlanche(etat: ModeleAtelier, p: Brut): ParamsPlanche {
  const nom = nomValide(p);
  const niveauId = typeof p["niveauId"] === "string" && etat.niveaux[p["niveauId"]] ? p["niveauId"] : null;
  const modele = lireModelePlanche(p["modele"]);
  if (!modele) throw new ErreurCommande("invalide", "modele", "modèle de Planche mal formé");
  const empreinte = empreintePlanche(modele);
  if (typeof p["empreinte"] === "string" && p["empreinte"] !== empreinte) throw new ErreurCommande("invalide", "empreinte", `empreinte ${p["empreinte"]} annoncée, ${empreinte} calculée`);
  return { nom, niveauId, modele, empreinte };
}

const poser = (etat: ModeleAtelier, def: Definition): ModeleAtelier => ({ ...etat, definitions: { ...etat.definitions, [def.id]: def } });

export const reducteursPlanche: Record<string, Reducteur> = {
  /** Nouvelle Planche (vide, ou reprise d'un brouillon local : `modele` fourni, validé). */
  "planche.creer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("planche");
    if (etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const nom = nomValide(p);
    nomLibre(etat, nom, null);
    const niveauId = niveauRef(etat, p);
    let modele: ModelePlanche = plancheVide();
    if (p["modele"] !== undefined && p["modele"] !== null) {
      const lu = lireModelePlanche(p["modele"]);
      if (!lu) throw new ErreurCommande("invalide", "modele", "modèle de Planche mal formé");
      modele = lu;
    }
    const params: ParamsPlanche = { nom, niveauId, modele, empreinte: empreintePlanche(modele) };
    const effets = effetsVides();
    effets.crees.push(id);
    return { etat: poser(etat, { id, classe: CLASSE_PLANCHE, nom, params: params as unknown as Brut, version: 1 }), effets };
  },
  /** Renommer et / ou changer le niveau de référence. */
  "planche.renommer": (etat, p) => {
    const d = planche(etat, lire.chaine(p, "id"));
    const nom = p["nom"] === undefined ? d.params.nom : nomValide(p);
    if (nom !== d.params.nom) nomLibre(etat, nom, d.id);
    const niveauId = p["niveauId"] === undefined ? d.params.niveauId : niveauRef(etat, p);
    const params: ParamsPlanche = { ...d.params, nom, niveauId };
    const effets = effetsVides();
    effets.modifies.push(d.id);
    return { etat: poser(etat, { ...d, nom, params: params as unknown as Brut, version: d.version + 1 }), effets };
  },
  "planche.supprimer": (etat, p) => {
    const d = planche(etat, lire.chaine(p, "id"));
    const definitions = { ...etat.definitions };
    delete definitions[d.id];
    const effets = effetsVides();
    effets.supprimes.push(d.id);
    return { etat: { ...etat, definitions }, effets };
  },
  /** « Enregistrer sous » : copie de la Planche sous un autre nom (même modèle, même niveau de référence). */
  "planche.copier": (etat, p, ctx) => {
    const source = planche(etat, lire.chaine(p, "source"));
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("planche");
    if (etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const nom = nomValide(p);
    nomLibre(etat, nom, null);
    const params: ParamsPlanche = { ...source.params, nom };
    const effets = effetsVides();
    effets.crees.push(id);
    return { etat: poser(etat, { id, classe: CLASSE_PLANCHE, nom, params: params as unknown as Brut, version: 1 }), effets };
  },
  /** Un pas de la Planche : delta appliqué par la même fonction pure, empreinte d'arrivée vérifiée. */
  "planche.operation": (etat, p) => {
    const d = planche(etat, lire.chaine(p, "id"));
    const libelle = lire.chaine(p, "libelle").trim().slice(0, 200);
    const delta = p["delta"];
    if (!estDeltaPlanche(delta)) throw new ErreurCommande("invalide", "delta", "delta de Planche mal formé");
    const empreinteApres = lire.chaine(p, "empreinteApres");
    if (!/^[0-9a-f]{16}$/.test(empreinteApres)) throw new ErreurCommande("invalide", "empreinteApres", "empreinte attendue : 16 caractères hexadécimaux");
    const modele = appliquerDeltaPlanche(d.params.modele, delta);
    const obtenue = empreintePlanche(modele);
    if (obtenue !== empreinteApres) throw new ErreurCommande("precondition", "empreinteApres", `la Planche « ${d.params.nom} » a changé depuis cette opération (${libelle || "opération"}) : empreinte ${obtenue} obtenue, ${empreinteApres} annoncée`);
    const params: ParamsPlanche = { ...d.params, modele, empreinte: obtenue };
    const effets = effetsVides();
    effets.modifies.push(d.id);
    return { etat: poser(etat, { ...d, params: params as unknown as Brut, version: d.version + 1 }), effets };
  },
};
