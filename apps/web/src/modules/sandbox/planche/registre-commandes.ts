/**
 * Registre des commandes de la Planche (lot 9, EX-CMD-01) : toutes les commandes livrées (objets, contexte, lien,
 * Navigateur, vue, débit, pièce) dans une seule liste — identifiant stable, icône, libellé, raccourci, famille — et une
 * seule résolution du clavier. Identifiant, famille, icône, raccourci et ordre viennent du registre unique du Sandbox
 * (`REGISTRE_SANDBOX`, lot 2) ; seul le libellé (clé du catalogue de messages) vient des listes de chaque famille. Les
 * barres, « Outils ▾ », le menu et le clavier lisent ces mêmes entrées ; l'exécution et la disponibilité restent celles
 * de chaque famille (aucune logique d'opération dupliquée ici). Sans React ni DOM.
 */
import { entreesSandbox, normaliserRaccourci, type FamilleCommandeSandbox } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";
import { COMMANDE_DETACHER_LIEN, COMMANDES_CONTEXTE, COMMANDES_DEBIT, COMMANDES_NAVIGATEUR, COMMANDES_PIECE, COMMANDES_OBJETS, COMMANDES_VUE } from "./commandes-objets";
import { type Cle, raccourciClavier } from "./outils-planche";

export type FamilleCommande = FamilleCommandeSandbox;

export interface EntreeRegistre {
  readonly id: string;
  readonly famille: FamilleCommande;
  readonly picto: string;
  readonly libelle: CleMessage;
  /** Raccourci canonique (forme du catalogue : « Alt+Maj+U »). */
  readonly raccourci: string;
}

/** Libellé de chaque commande livrée, par identifiant. */
const LIBELLES: ReadonlyMap<string, CleMessage> = new Map(
  [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, COMMANDE_DETACHER_LIEN, ...COMMANDES_NAVIGATEUR, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE].map((c) => [c.id, c.libelle] as const),
);

export const REGISTRE_COMMANDES: readonly EntreeRegistre[] = entreesSandbox("commande").map((e) => {
  const libelle = LIBELLES.get(e.id);
  if (!libelle || e.raccourci === null) throw new Error(`Registre du Sandbox : commande « ${e.id} » sans libellé ni raccourci`);
  return { id: e.id, famille: e.famille as FamilleCommande, picto: e.picto, libelle, raccourci: e.raccourci };
});

/** Commande dont le raccourci correspond à l'événement clavier (touche physique relue sous Alt, macOS), sinon `null`. */
export function commandeDuClavier(c: Cle): EntreeRegistre | null {
  const r = raccourciClavier(c);
  if (!r) return null;
  return REGISTRE_COMMANDES.find((e) => normaliserRaccourci(e.raccourci) === r) ?? null;
}

/**
 * Commandes que le clavier route par le registre : celles qui ont un modificateur ou une touche de fonction. Les touches
 * nues (G Créer un composant) et Échap / Origine (Fermer) gardent leur garde propre dans la Planche (saisie en cours,
 * outil Sélection).
 */
export const routeeParLeRegistre = (e: EntreeRegistre): boolean => /^F\d+$/.test(e.raccourci) || /^(Ctrl\+|Alt\+|Maj\+)+[A-Z]$/.test(e.raccourci);
