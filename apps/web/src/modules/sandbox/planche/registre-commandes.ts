/**
 * Registre des commandes de la Planche (lot 9, EX-CMD-01) : toutes les commandes livrées (objets, contexte, lien,
 * Navigateur, vue, débit, pièce) dans une seule liste — identifiant stable, icône, libellé, raccourci, famille — et une
 * seule résolution du clavier. Identifiant, famille, icône, raccourci et ordre viennent du registre unique du Sandbox
 * (`REGISTRE_SANDBOX`, lot 2) ; seul le libellé (clé du catalogue de messages) vient des listes de chaque famille. Les
 * barres, « Outils ▾ », le menu et le clavier lisent ces mêmes entrées ; l'exécution et la disponibilité restent celles
 * de chaque famille (aucune logique d'opération dupliquée ici). Sans React ni DOM.
 */
import { ENTREE_DEUX_TEMPS, entreesSandbox, normaliserRaccourci, secondTemps, type FamilleCommandeSandbox, type Pictogramme } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";
import { COMMANDE_DETACHER_LIEN, COMMANDES_CONTEXTE, COMMANDES_CONTROLE, COMMANDES_DEBIT, COMMANDES_DYNAMIQUE, COMMANDES_EMPLACEMENT, COMMANDES_NAVIGATEUR, COMMANDES_NIVEAUX, COMMANDES_LOCAUX, COMMANDES_NUMEROTATION, COMMANDES_MUR, COMMANDES_PLAN, COMMANDES_FEUILLES, COMMANDES_ACCROCHAGE, COMMANDES_RESERVES, COMMANDES_ENVELOPPE, COMMANDES_CONSULTATION, COMMANDES_FONDS, COMMANDES_REFERENCES, COMMANDES_PDF, COMMANDES_DXF, COMMANDES_TRAVAUX, COMMANDES_IFC, COMMANDES_SCRIPTS, COMMANDES_PIECE, COMMANDES_OBJETS, COMMANDES_VUE } from "./commandes-objets";
import { COMMANDES_REPERES } from "./commandes-reperes";
import { type Cle, raccourciClavier } from "./outils-planche";

export type FamilleCommande = FamilleCommandeSandbox;

export interface EntreeRegistre {
  readonly id: string;
  readonly famille: FamilleCommande;
  readonly picto: Pictogramme;
  readonly libelle: CleMessage;
  /** Raccourci canonique (forme du catalogue : « Alt+Maj+U »). */
  readonly raccourci: string;
}

/** Libellé de chaque commande livrée, par identifiant. */
const LIBELLES: ReadonlyMap<string, CleMessage> = new Map(
  [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, COMMANDE_DETACHER_LIEN, ...COMMANDES_NAVIGATEUR, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE, ...COMMANDES_REPERES, ...COMMANDES_CONTROLE, ...COMMANDES_DYNAMIQUE, ...COMMANDES_EMPLACEMENT, ...COMMANDES_SCRIPTS, ...COMMANDES_NIVEAUX, ...COMMANDES_LOCAUX, ...COMMANDES_NUMEROTATION, ...COMMANDES_MUR, ...COMMANDES_PLAN, ...COMMANDES_FEUILLES, ...COMMANDES_ACCROCHAGE, ...COMMANDES_RESERVES, ...COMMANDES_ENVELOPPE, ...COMMANDES_CONSULTATION, ...COMMANDES_FONDS, ...COMMANDES_REFERENCES, ...COMMANDES_PDF, ...COMMANDES_DXF, ...COMMANDES_TRAVAUX, ...COMMANDES_IFC].map((c) => [c.id, c.libelle] as const),
);

export const REGISTRE_COMMANDES: readonly EntreeRegistre[] = entreesSandbox("commande").map((e) => {
  const libelle = LIBELLES.get(e.id);
  if (!libelle || e.raccourci === null) throw new Error(`Registre du Sandbox : commande « ${e.id} » sans libellé ni raccourci`);
  return { id: e.id, famille: e.famille as FamilleCommande, picto: e.pictogramme, libelle, raccourci: e.raccourci };
});

/** Commande dont le raccourci correspond à l'événement clavier (touche physique relue sous Alt, macOS), sinon `null`. */
export function commandeDuClavier(c: Cle): EntreeRegistre | null {
  const r = raccourciClavier(c);
  if (!r) return null;
  return REGISTRE_COMMANDES.find((e) => normaliserRaccourci(e.raccourci) === r) ?? null;
}

/** Commandes en deux temps (« Ctrl+Maj+Espace, R »), dans l'ordre du registre. */
export const COMMANDES_DEUX_TEMPS: readonly EntreeRegistre[] = REGISTRE_COMMANDES.filter((e) => secondTemps(e.raccourci) !== null);

/** Second temps : commande dont la seconde touche correspond à l'événement, sinon `null`. */
export function commandeDuSecondTemps(c: Cle): EntreeRegistre | null {
  const r = raccourciClavier(c);
  if (!r) return null;
  return COMMANDES_DEUX_TEMPS.find((e) => secondTemps(e.raccourci) === r) ?? null;
}

/** L'événement est la touche d'entrée des raccourcis en deux temps. */
export const estEntreeDeuxTemps = (c: Cle): boolean => raccourciClavier(c) === ENTREE_DEUX_TEMPS;

/**
 * Commandes que le clavier route par le registre : celles qui ont un modificateur ou une touche de fonction. Les touches
 * nues (G Créer un composant) et Échap / Origine (Fermer) gardent leur garde propre dans la Planche (saisie en cours,
 * outil Sélection).
 */
export const routeeParLeRegistre = (e: EntreeRegistre): boolean => secondTemps(e.raccourci) !== null || /^(Ctrl\+)?(Alt\+)?(Maj\+)?F\d+$/.test(e.raccourci) || /^(Ctrl\+|Alt\+|Maj\+)+[A-Z0-9]$/.test(e.raccourci);
