/**
 * Registre des commandes de la Planche (lot 9, EX-CMD-01) : toutes les commandes livrées (objets, contexte, lien,
 * Navigateur, vue, débit, pièce) dans une seule liste — identifiant stable, icône, libellé, raccourci, famille — et une
 * seule résolution du clavier. Identifiant, famille, icône, raccourci et ordre viennent du registre unique du Sandbox
 * (`REGISTRE_SANDBOX`, lot 2) ; seul le libellé (clé du catalogue de messages) vient des listes de chaque famille. Les
 * barres, « Outils ▾ », le menu et le clavier lisent ces mêmes entrées ; l'exécution et la disponibilité restent celles
 * de chaque famille (aucune logique d'opération dupliquée ici). Sans React ni DOM.
 */
import { ENTREE_DEUX_TEMPS, entreesSandbox, FAMILLES_DEUX_TEMPS, normaliserRaccourci, secondTemps, texteRecherche, troisTemps, type FamilleCommandeSandbox, type FamilleDeuxTemps, type Pictogramme } from "@parcours/sandbox-planche-model";
import type { CleMessage } from "../messages";
import { COMMANDE_DETACHER_LIEN, COMMANDES_CONTEXTE, COMMANDES_CONTROLE, COMMANDES_DEBIT, COMMANDES_DYNAMIQUE, COMMANDES_EMPLACEMENT, COMMANDES_NAVIGATEUR, COMMANDES_NIVEAUX, COMMANDES_LOCAUX, COMMANDES_NUMEROTATION, COMMANDES_MUR, COMMANDES_PLAN, COMMANDES_FEUILLES, COMMANDES_ACCROCHAGE, COMMANDES_RESERVES, COMMANDES_ENVELOPPE, COMMANDES_CONSULTATION, COMMANDES_FONDS, COMMANDES_REFERENCES, COMMANDES_PDF, COMMANDES_DXF, COMMANDES_TRAVAUX, COMMANDES_BALISE, COMMANDES_SCENE, COMMANDES_GABARIT, COMMANDES_ECHANGE, COMMANDES_VERSION, COMMANDES_MODELISATION, COMMANDES_IFC, COMMANDES_FABRICANT, COMMANDES_KML, COMMANDES_REDRESSEMENT, COMMANDES_VISIONNEUSE, COMMANDES_SCRIPTS, COMMANDES_PIECE, COMMANDES_OBJETS, COMMANDES_VUE } from "./commandes-objets";
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
  [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, COMMANDE_DETACHER_LIEN, ...COMMANDES_NAVIGATEUR, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE, ...COMMANDES_REPERES, ...COMMANDES_CONTROLE, ...COMMANDES_DYNAMIQUE, ...COMMANDES_EMPLACEMENT, ...COMMANDES_SCRIPTS, ...COMMANDES_NIVEAUX, ...COMMANDES_LOCAUX, ...COMMANDES_NUMEROTATION, ...COMMANDES_MUR, ...COMMANDES_PLAN, ...COMMANDES_FEUILLES, ...COMMANDES_ACCROCHAGE, ...COMMANDES_RESERVES, ...COMMANDES_ENVELOPPE, ...COMMANDES_CONSULTATION, ...COMMANDES_FONDS, ...COMMANDES_REFERENCES, ...COMMANDES_PDF, ...COMMANDES_DXF, ...COMMANDES_TRAVAUX, ...COMMANDES_BALISE, ...COMMANDES_SCENE, ...COMMANDES_GABARIT, ...COMMANDES_ECHANGE, ...COMMANDES_VERSION, ...COMMANDES_MODELISATION, ...COMMANDES_IFC, ...COMMANDES_FABRICANT, ...COMMANDES_KML, ...COMMANDES_REDRESSEMENT, ...COMMANDES_VISIONNEUSE].map((c) => [c.id, c.libelle] as const),
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
  // Cas 2, lot 8 : secondes touches en chiffres, lues sur la touche physique (AZERTY donne « & », Maj donne « ! »).
  const chiffre = c.code && /^(Digit|Numpad)[0-9]$/.test(c.code) ? c.code.slice(-1) : null;
  // Copie champ par champ : un KeyboardEvent étalé (`...e`) perd ses accesseurs (shiftKey, ctrlKey…).
  const r = raccourciClavier(chiffre ? { key: chiffre, code: c.code, ctrlKey: c.ctrlKey, shiftKey: c.shiftKey, altKey: c.altKey, ...(c.metaKey !== undefined ? { metaKey: c.metaKey } : {}) } : c);
  if (!r) return null;
  return COMMANDES_DEUX_TEMPS.find((e) => secondTemps(e.raccourci) === r) ?? null;
}

/** Touche lue au second ou au troisième temps : chiffres sur la touche physique, Ctrl et Alt ignorés (Maj gardé). */
function toucheDuTemps(c: Cle): string | null {
  const chiffre = c.code && /^(Digit|Numpad)[0-9]$/.test(c.code) ? c.code.slice(-1) : null;
  return raccourciClavier({ key: chiffre ?? c.key, ...(c.code !== undefined ? { code: c.code } : {}), ctrlKey: false, shiftKey: c.shiftKey, altKey: false }) || null;
}

/** Menu par familles (28 novembre 2026) : commandes en trois temps (« Ctrl+Maj+Espace, Maj+I, N »), dans l'ordre du registre. */
export const COMMANDES_TROIS_TEMPS: readonly EntreeRegistre[] = REGISTRE_COMMANDES.filter((e) => troisTemps(e.raccourci) !== null);
/** Familles qui ont au moins une commande : seules elles s'affichent dans l'encadré. */
export const FAMILLES_AFFICHEES = FAMILLES_DEUX_TEMPS.filter((f) => COMMANDES_TROIS_TEMPS.some((e) => troisTemps(e.raccourci)!.famille === f.id));
/** Famille dont la porte (Maj + lettre) correspond à l'événement au second temps, sinon `null`. */
export function familleDeLaPorte(c: Cle, familles: readonly { readonly id: FamilleDeuxTemps; readonly porte: string }[] = FAMILLES_AFFICHEES): FamilleDeuxTemps | null {
  const r = toucheDuTemps(c);
  return (r ? familles.find((f) => f.porte === r)?.id : undefined) ?? null;
}
/** Commandes d'une famille, dans l'ordre du registre. */
export const commandesDeLaFamille = (f: FamilleDeuxTemps, liste: readonly EntreeRegistre[] = COMMANDES_TROIS_TEMPS): readonly EntreeRegistre[] =>
  liste.filter((e) => troisTemps(e.raccourci)?.famille === f);
/** Troisième temps : commande de la famille ouverte dont la touche correspond à l'événement, sinon `null`. */
export function commandeDuTroisiemeTemps(f: FamilleDeuxTemps, c: Cle, liste: readonly EntreeRegistre[] = COMMANDES_TROIS_TEMPS): EntreeRegistre | null {
  const r = toucheDuTemps(c);
  return (r && commandesDeLaFamille(f, liste).find((e) => troisTemps(e.raccourci)!.touche === r)) || null;
}
/** Touches affichées après l'entrée : « N » (deux temps) ou « Maj+I, N » (trois temps). */
export function touchesApresEntree(e: EntreeRegistre): string {
  const t = troisTemps(e.raccourci);
  if (t) return `${FAMILLES_DEUX_TEMPS.find((f) => f.id === t.famille)!.porte}, ${t.touche}`;
  return secondTemps(e.raccourci) ?? "";
}
/**
 * Recherche de l'encadré : commandes en deux ou trois temps (de la famille ouverte seulement, si une famille est ouverte)
 * dont le libellé contient le texte tapé, sans casse ni accents. Texte vide : aucune.
 */
export function rechercherCommandes(texte: string, libelleDe: (e: EntreeRegistre) => string, famille: FamilleDeuxTemps | null = null, liste: readonly EntreeRegistre[] = [...COMMANDES_DEUX_TEMPS, ...COMMANDES_TROIS_TEMPS]): readonly EntreeRegistre[] {
  const q = texteRecherche(texte);
  if (!q) return [];
  return liste.filter((e) => (famille === null || troisTemps(e.raccourci)?.famille === famille) && texteRecherche(libelleDe(e)).includes(q));
}

/** L'événement est la touche d'entrée des raccourcis en deux temps. */
export const estEntreeDeuxTemps = (c: Cle): boolean => raccourciClavier(c) === ENTREE_DEUX_TEMPS;

/**
 * Commandes que le clavier route par le registre : celles qui ont un modificateur ou une touche de fonction. Les touches
 * nues (G Créer un composant) et Échap / Origine (Fermer) gardent leur garde propre dans la Planche (saisie en cours,
 * outil Sélection).
 */
export const routeeParLeRegistre = (e: EntreeRegistre): boolean => secondTemps(e.raccourci) !== null || troisTemps(e.raccourci) !== null || /^(Ctrl\+)?(Alt\+)?(Maj\+)?F\d+$/.test(e.raccourci) || /^(Ctrl\+|Alt\+|Maj\+)+[A-Z0-9]$/.test(e.raccourci);
