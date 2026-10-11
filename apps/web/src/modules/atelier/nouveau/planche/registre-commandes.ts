/**
 * Registre unique des commandes de la Planche (lot 9, EX-CMD-01) : toutes les commandes livrées (objets, contexte, lien,
 * Navigateur, vue) dans une seule liste — identifiant stable, icône, libellé, raccourci, famille — et une seule
 * résolution du clavier. Les barres, « Outils ▾ », le menu et le clavier lisent ces mêmes entrées ; l'exécution et la
 * disponibilité restent celles de chaque famille (aucune logique d'opération dupliquée ici). Sans React ni DOM.
 */
import { normaliserRaccourci } from "@parcours/planche-model";
import type { CleMessage } from "../messages";
import { COMMANDE_DETACHER_LIEN, COMMANDES_CONTEXTE, COMMANDES_DEBIT, COMMANDES_NAVIGATEUR, COMMANDES_PIECE, COMMANDES_OBJETS, COMMANDES_VUE } from "./commandes-objets";
import { type Cle, raccourciClavier } from "./outils-planche";

export type FamilleCommande = "objet" | "contexte" | "lien" | "navigateur" | "vue" | "debit" | "piece";

export interface EntreeRegistre {
  readonly id: string;
  readonly famille: FamilleCommande;
  readonly picto: string;
  readonly libelle: CleMessage;
  /** Raccourci canonique (forme du catalogue : « Alt+Maj+U »). */
  readonly raccourci: string;
}

export const REGISTRE_COMMANDES: readonly EntreeRegistre[] = [
  ...COMMANDES_OBJETS.map((c) => ({ id: c.id, famille: "objet" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
  ...COMMANDES_CONTEXTE.map((c) => ({ id: c.id, famille: "contexte" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
  { id: COMMANDE_DETACHER_LIEN.id, famille: "lien", picto: COMMANDE_DETACHER_LIEN.picto, libelle: COMMANDE_DETACHER_LIEN.libelle, raccourci: COMMANDE_DETACHER_LIEN.raccourci },
  ...COMMANDES_NAVIGATEUR.map((c) => ({ id: c.id, famille: "navigateur" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
  ...COMMANDES_VUE.map((c) => ({ id: c.id, famille: "vue" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
  ...COMMANDES_DEBIT.map((c) => ({ id: c.id, famille: "debit" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
  ...COMMANDES_PIECE.map((c) => ({ id: c.id, famille: "piece" as const, picto: c.picto, libelle: c.libelle, raccourci: c.raccourci })),
];

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
