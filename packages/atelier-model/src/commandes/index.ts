/**
 * Registre des commandes du contrat `atelier-commands/1` (annexe B du cahier des charges) et application
 * atomique d'un lot : même code dans le navigateur (aperçu) et sur le serveur (validation). L'inverse d'un lot
 * est un instantané différentiel (`interne.restaurer`), appliqué par annuler / rétablir comme une nouvelle
 * microversion.
 */
import type { ModeleAtelier } from "../modele.js";
import type { Classe } from "../ontologie.js";
import {
  appliquerDifferentiel,
  commandeInverse,
  CONTRAT_COMMANDES,
  differentiel,
  effetsVides,
  ErreurCommande,
  fusionnerEffets,
  generateurIds,
  TYPE_RESTAURER,
  type Commande,
  type ContexteCommande,
  type Effets,
  type Enveloppe,
  type InstantaneDiff,
  type Reducteur,
} from "./base.js";
import { reducteursBloc } from "./bloc.js";
import { controlerContraintes, reducteursContrainte } from "./contrainte.js";
import { reducteursDocuments } from "./documents.js";
import { joindreMurs, scinderMur } from "./mur.js";
import { creerOccurrence, modifierOccurrence, supprimerOccurrence } from "./objets.js";
import { affecterClassification, affecterPhase, definirPropriete, rattacherReference, reducteursCalque, reducteursGroupe, reducteursNiveau, reducteursSite, reducteursType, reparerReference } from "./organisation.js";
import { dupliquerNiveau, reducteursTransformer } from "./transformer.js";
import { verifierModele } from "../archive.js";
import { reducteursRefExterne } from "./refexterne.js";

const triplet = (classe: Classe, prefixe: string, creer = "creer"): Record<string, Reducteur> => ({
  [`${prefixe}.${creer}`]: (etat, p, ctx) => creerOccurrence(etat, p, ctx, classe),
  [`${prefixe}.modifier`]: (etat, p, ctx) => modifierOccurrence(etat, p, ctx, classe),
  [`${prefixe}.supprimer`]: (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, classe),
});

const FORMES = ["ligne", "polyligne", "arc", "cercle", "rectangle", "polygone", "spline", "construction", "hachure"] as const;

export const REDUCTEURS: Record<string, Reducteur> = {
  // Objets, générique
  "objet.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx),
  "objet.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx),
  "objet.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx),
  // Niveaux
  "niveau.creer": (etat, p, ctx) => reducteursNiveau.creer(etat, p, ctx),
  "niveau.modifier": (etat, p) => reducteursNiveau.modifier(etat, p),
  "niveau.supprimer": (etat, p, ctx) => reducteursNiveau.supprimer(etat, p, ctx),
  "niveau.dupliquer": (etat, p, ctx) => dupliquerNiveau(etat, p, ctx, (e, q) => reducteursNiveau.creer(e, q, ctx)),
  // Murs
  ...triplet("mur", "mur", "tracer"),
  "mur.scinder": (etat, p, ctx) => scinderMur(etat, p, ctx),
  "mur.joindre": (etat, p, ctx) => joindreMurs(etat, p, ctx),
  // Ouvertures (classe choisie par `classe` : porte / fenetre / ouverture)
  "ouverture.poser": (etat, p, ctx) => {
    const classe = (p["classe"] as Classe | undefined) ?? "ouverture";
    if (classe !== "porte" && classe !== "fenetre" && classe !== "ouverture") throw new ErreurCommande("invalide", "classe", "classe d'ouverture : porte / fenetre / ouverture");
    return creerOccurrence(etat, p, ctx, classe);
  },
  "ouverture.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "ouverture"),
  "ouverture.deplacer": (etat, p, ctx) => modifierOccurrence(etat, { id: p["id"], params: { position: p["position"] } }, ctx, "ouverture"),
  "ouverture.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "ouverture"),
  // Dalles, toitures, escaliers, pièces, espaces, zones, poteaux, solides
  ...triplet("dalle", "dalle"),
  ...triplet("toiture", "toiture"),
  ...triplet("escalier", "escalier"),
  ...triplet("piece", "piece"),
  ...triplet("espace", "espace"),
  ...triplet("zone", "zone"),
  ...triplet("poteau", "poteau"),
  ...triplet("solide", "solide", "extruder"),
  ...triplet("reference-plan", "referencePlan"),
  ...triplet("garde-corps", "gardeCorps"),
  ...triplet("objet-importe", "objetImporte"),
  // Esquisse : une commande par forme + modifier / supprimer
  ...Object.fromEntries(FORMES.map((forme) => [`esquisse.${forme}`, ((etat, p, ctx) => creerOccurrence(etat, { ...p, params: { ...((p["params"] as Record<string, unknown> | undefined) ?? p), forme } }, ctx, "esquisse")) as Reducteur])),
  "esquisse.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "esquisse"),
  "esquisse.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "esquisse"),
  // Transformations
  "transformer.deplacer": reducteursTransformer.deplacer,
  "transformer.copier": reducteursTransformer.copier,
  "transformer.tourner": reducteursTransformer.tourner,
  "transformer.miroir": reducteursTransformer.miroir,
  "transformer.echelle": reducteursTransformer.echelle,
  "transformer.etirer": reducteursTransformer.etirer,
  "transformer.ajuster": reducteursTransformer.ajuster,
  "transformer.prolonger": reducteursTransformer.prolonger,
  "transformer.decaler": reducteursTransformer.decaler,
  "transformer.repeter": reducteursTransformer.repeter,
  "transformer.decomposer": reducteursTransformer.decomposer,
  "transformer.pointsDeControle": reducteursTransformer.pointsDeControle,
  "transformer.raccorder": reducteursTransformer.raccorder,
  "transformer.chanfreiner": reducteursTransformer.chanfreiner,
  // Annotations
  ...triplet("cotation", "cotation"),
  "cotation.rattacher": (etat, p, ctx) => rattacherReference(etat, p, ctx),
  ...triplet("texte", "texte"),
  ...triplet("etiquette", "etiquette"),
  // Organisation
  "calque.creer": (etat, p, ctx) => reducteursCalque.creer(etat, p, ctx),
  "calque.modifier": (etat, p) => reducteursCalque.modifier(etat, p),
  "calque.supprimer": (etat, p) => reducteursCalque.supprimer(etat, p),
  "calque.affecter": (etat, p, ctx, c) => reducteursCalque.affecter(etat, p, ctx, c),
  "groupe.creer": (etat, p, ctx, c) => reducteursGroupe.creer(etat, p, ctx, c),
  "groupe.dissoudre": (etat, p) => reducteursGroupe.dissoudre(etat, p),
  "type.definir": (etat, p, ctx) => reducteursType.definir(etat, p, ctx),
  "type.modifier": (etat, p) => reducteursType.modifier(etat, p),
  "propriete.definir": (etat, p) => definirPropriete(etat, p),
  "classification.affecter": (etat, p) => affecterClassification(etat, p),
  "reference.reparer": (etat, p) => reparerReference(etat, p),
  // Documents dérivés (lot 5) : vues et feuilles
  ...reducteursDocuments,
  // Blocs et composants, contraintes d'esquisse, phases (lot 5)
  "bloc.definir": (etat, p, ctx) => reducteursBloc.definir(etat, p, ctx),
  "bloc.placer": (etat, p, ctx) => reducteursBloc.placer(etat, p, ctx),
  "contrainte.ajouter": (etat, p, ctx) => reducteursContrainte.ajouter(etat, p, ctx),
  "contrainte.modifier": (etat, p) => reducteursContrainte.modifier(etat, p),
  "contrainte.supprimer": (etat, p) => reducteursContrainte.supprimer(etat, p),
  "phase.affecter": (etat, p, _ctx, c) => affecterPhase(etat, p, c),
  // Site
  "site.parcelle.definir": (etat, p) => reducteursSite.parcelle(etat, p),
  "site.emprise.definir": (etat, p) => reducteursSite.emprise(etat, p),
  // Références externes (DA-05-11)
  ...reducteursRefExterne,
  // Réutilisation de modèle (DA-21-09) : ajouts préparés par `planifierReprise`, revalidés comme une archive.
  "modele.reprendre": (etat, p) => reprendreModele(etat, p),
  // Inverse
  [TYPE_RESTAURER]: (etat, p) => {
    const diff = p["diff"] as InstantaneDiff | undefined;
    if (!diff) throw new ErreurCommande("invalide", "diff", "instantané différentiel requis");
    const suivant = appliquerDifferentiel(etat, diff);
    const effets = effetsVides();
    for (const cle of Object.keys(diff.avant) as (keyof InstantaneDiff["avant"])[]) effets.modifies.push(...Object.keys(diff.avant[cle] ?? {}));
    for (const cle of Object.keys(diff.crees) as (keyof InstantaneDiff["crees"])[]) effets.supprimes.push(...(diff.crees[cle] ?? []));
    return { etat: suivant, effets };
  },
};

const TABLES_REPRISE = ["niveaux", "objets", "relations", "definitions", "calques", "groupes", "references"] as const;

function reprendreModele(etat: ModeleAtelier, p: Record<string, unknown>): { etat: ModeleAtelier; effets: Effets } {
  const ajouts = (p["ajouts"] ?? {}) as Partial<Record<(typeof TABLES_REPRISE)[number], Record<string, unknown>>>;
  const site = (p["site"] ?? {}) as Partial<ModeleAtelier["site"]>;
  const fusion = { ...etat, site: { ...etat.site, ...site } } as unknown as Record<string, unknown>;
  const crees: string[] = [];
  for (const cle of TABLES_REPRISE) {
    const t = ajouts[cle] ?? {};
    if (typeof t !== "object" || Array.isArray(t)) throw new ErreurCommande("invalide", `ajouts.${cle}`, "table attendue");
    for (const id of Object.keys(t)) {
      if ((etat[cle] as Record<string, unknown>)[id]) throw new ErreurCommande("precondition", `ajouts.${cle}.${id}`, `identifiant déjà présent : ${id}`);
      crees.push(id);
    }
    fusion[cle] = { ...(etat[cle] as Record<string, unknown>), ...t };
  }
  if (crees.length > 20000) throw new ErreurCommande("invalide", "ajouts", "reprise trop volumineuse (20 000 éléments au plus)");
  // Revalidation complète du modèle obtenu (mêmes validateurs qu'une archive) ; les éléments existants restent inchangés.
  const v = verifierModele(fusion);
  if (!v.ok) throw new ErreurCommande("invalide", "ajouts", `reprise refusée : ${v.erreurs.slice(0, 5).join(" ; ")}`);
  const suivant: ModeleAtelier = { ...etat, site: { ...etat.site, ...site } };
  for (const cle of TABLES_REPRISE) {
    const t = ajouts[cle] ?? {};
    if (!Object.keys(t).length) continue;
    const valides = v.modele[cle] as Record<string, unknown>;
    (suivant as unknown as Record<string, Record<string, unknown>>)[cle] = { ...(etat[cle] as Record<string, unknown>), ...Object.fromEntries(Object.keys(t).map((id) => [id, valides[id]])) };
  }
  const effets = effetsVides();
  effets.crees.push(...crees);
  for (const o of Object.values(ajouts.objets ?? {}) as { niveauId?: string | null }[]) if (o.niveauId && !effets.niveauxTouches.includes(o.niveauId)) effets.niveauxTouches.push(o.niveauId);
  return { etat: suivant, effets };
}

export const TYPES_COMMANDES: readonly string[] = Object.keys(REDUCTEURS);

export function appliquerCommande(etat: ModeleAtelier, commande: Commande, ctx: ContexteCommande): { etat: ModeleAtelier; effets: Effets } {
  const reducteur = REDUCTEURS[commande.type];
  if (!reducteur) throw new ErreurCommande("inconnue", "type", `commande inconnue : ${commande.type}`);
  if (typeof commande.params !== "object" || commande.params === null) throw new ErreurCommande("invalide", "params", "paramètres requis");
  const r = reducteur(etat, commande.params, ctx, commande.cibles ?? []);
  return controlerContraintes(etat, r.etat, commande.type, r.effets, ctx);
}

export interface ResultatLot {
  etat: ModeleAtelier;
  effets: Effets;
  /** Effets de chaque commande du lot, dans l'ordre. */
  parCommande: Effets[];
  /** Commande inverse (instantané différentiel) : l'appliquer revient à l'état de départ. */
  inverse: Commande;
}

/** Applique un lot de commandes de façon atomique : une erreur laisse l'état de départ intact (immuable). */
export function appliquerLot(etat: ModeleAtelier, enveloppe: Enveloppe): ResultatLot {
  if (enveloppe.contract !== CONTRAT_COMMANDES) throw new ErreurCommande("invalide", "contract", `contrat non pris en charge : ${enveloppe.contract} (attendu ${CONTRAT_COMMANDES})`);
  if (!Array.isArray(enveloppe.commands) || enveloppe.commands.length === 0) throw new ErreurCommande("invalide", "commands", "lot vide");
  if (enveloppe.commands.length > 500) throw new ErreurCommande("invalide", "commands", "lot trop grand (500 commandes maximum)");
  const ctx: ContexteCommande = { ids: generateurIds(enveloppe.requestId) };
  let courant = etat;
  let effets = effetsVides();
  const parCommande: Effets[] = [];
  enveloppe.commands.forEach((commande, i) => {
    try {
      const r = appliquerCommande(courant, commande, ctx);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
      parCommande.push(r.effets);
    } catch (err) {
      if (err instanceof ErreurCommande) throw new ErreurCommande(err.code, `commands[${i}].${err.chemin}`, `commands[${i}].${err.chemin} : ${err.message}`);
      throw err;
    }
  });
  return { etat: courant, effets, parCommande, inverse: commandeInverse(differentiel(etat, courant)) };
}

/** Identifiants d'objets qu'un lot cible explicitement (pour le calcul des conflits côté serveur). */
export function identifiantsCibles(enveloppe: Enveloppe): string[] {
  const ids = new Set<string>();
  for (const c of enveloppe.commands) {
    for (const k of ["id", "id1", "id2", "murHoteId", "limiteId", "autreId", "objetId", "referenceId", "vueId", "definitionId", "objetA", "objetB", "redefinir"]) {
      const v = c.params[k];
      if (typeof v === "string") ids.add(v);
    }
    for (const v of c.cibles ?? []) ids.add(v);
    const cibles = c.params["cibles"];
    if (Array.isArray(cibles)) for (const v of cibles) if (typeof v === "string") ids.add(v);
  }
  return [...ids];
}

export { CONTRAT_COMMANDES, ErreurCommande, TYPE_RESTAURER, generateurIds, differentiel, appliquerDifferentiel, commandeInverse };
export type { Commande, Enveloppe, Effets, ContexteCommande, InstantaneDiff, Reducteur };
export { detecterPieces, type PropositionPiece } from "./organisation.js";
export { transformerOccurrence } from "./transformer.js";
export { validerParams } from "./validation.js";
