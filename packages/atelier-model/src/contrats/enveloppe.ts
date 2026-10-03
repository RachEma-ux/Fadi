/**
 * Enveloppe du contrat `atelier-commands/1` (cahier §5.3). Un lot est atomique (tout ou rien), idempotent
 * par `requestId`, et appliqué seulement si `baseRevision` est la révision courante (sinon 409, D-015).
 */
import type { Commande, TypeCommande } from "./commandes.js";

export const CONTRAT_COMMANDES = "atelier-commands/1";
export type ContratCommandes = typeof CONTRAT_COMMANDES;
export const VERSION_CONTRAT_COMMANDES = 1;

export interface EnveloppeCommandes {
  /** UUID fourni par le client ; une requête répétée renvoie la réponse enregistrée (T06). */
  readonly requestId: string;
  readonly baseRevision: number;
  readonly contract: ContratCommandes;
  /** Libellé lisible de l'historique (« Tracer un mur »). */
  readonly label: string;
  readonly commands: readonly Commande[];
}

/** Liste exhaustive des types de commande du contrat (validation à l'exécution, schémas, droits). */
export const TYPES_COMMANDE = [
  "niveau.creer",
  "niveau.modifier",
  "niveau.supprimer",
  "mur.tracer",
  "mur.modifier",
  "mur.scinder",
  "mur.joindre",
  "mur.supprimer",
  "ouverture.poser",
  "ouverture.modifier",
  "ouverture.deplacer",
  "ouverture.supprimer",
  "dalle.creer",
  "dalle.modifier",
  "dalle.supprimer",
  "toiture.creer",
  "toiture.modifier",
  "toiture.supprimer",
  "escalier.creer",
  "escalier.modifier",
  "escalier.supprimer",
  "piece.detecter",
  "piece.creer",
  "piece.modifier",
  "piece.supprimer",
  "espace.creer",
  "espace.modifier",
  "espace.supprimer",
  "zone.creer",
  "zone.modifier",
  "zone.supprimer",
  "poteau.creer",
  "poteau.modifier",
  "poteau.supprimer",
  "solide.extruder",
  "solide.modifier",
  "solide.supprimer",
  "esquisse.ligne",
  "esquisse.polyligne",
  "esquisse.arc",
  "esquisse.cercle",
  "esquisse.rectangle",
  "esquisse.polygone",
  "esquisse.spline",
  "esquisse.construction",
  "esquisse.hachure",
  "esquisse.modifier",
  "esquisse.supprimer",
  "transformer.deplacer",
  "transformer.copier",
  "transformer.tourner",
  "transformer.miroir",
  "transformer.echelle",
  "transformer.etirer",
  "transformer.ajuster",
  "transformer.prolonger",
  "transformer.decaler",
  "transformer.repeter",
  "transformer.decomposer",
  "transformer.pointsDeControle",
  "cotation.creer",
  "cotation.modifier",
  "cotation.rattacher",
  "cotation.supprimer",
  "texte.creer",
  "texte.modifier",
  "texte.supprimer",
  "etiquette.creer",
  "etiquette.modifier",
  "etiquette.supprimer",
  "calque.creer",
  "calque.modifier",
  "calque.reordonner",
  "calque.affecter",
  "calque.supprimer",
  "groupe.creer",
  "groupe.dissoudre",
  "bloc.definir",
  "bloc.placer",
  "type.definir",
  "type.modifier",
  "propriete.definir",
  "classification.affecter",
  "reference.reparer",
  "site.parcelle.definir",
  "site.emprise.definir",
] as const satisfies readonly TypeCommande[];

// Exhaustivité vérifiée à la compilation : tout `TypeCommande` figure dans `TYPES_COMMANDE`.
type Manquants = Exclude<TypeCommande, (typeof TYPES_COMMANDE)[number]>;
const exhaustivite: [Manquants] extends [never] ? true : Manquants = true;
void exhaustivite;
