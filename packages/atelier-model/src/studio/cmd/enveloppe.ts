import { applyStudioCommands } from "../composition/commandes.js";
import type { StudioCommand, StudioDocument } from "../composition/types.js";
import { studioEffetsCommande } from "./effets.js";

/**
 * Commande métier (IF-006) : attributs logiques de l'enveloppe de transport au-delà de `contractVersion`, `requestId`,
 * `baseRevisionId` et `commands[toolId, params]` — tous **facultatifs** (un client antérieur reste valide) :
 *
 * - `scope` : portée déclarée `{ projectId, studyId, variantId }` ; elle doit être **exactement** celle de l'adresse de
 *   la requête (le serveur ne lit jamais la portée dans le corps : il la compare) ;
 * - `mode` : `appliquer` (défaut, nouvelle révision) ou `essai` (validation complète et effets calculés, **rien n'est
 *   écrit** : ni révision, ni journal, ni quota consommé — `supportsDryRun` du registre) ;
 * - par commande, `targetIds` (objets visés) et `operation` (`creer`, `modifier`, `supprimer`) : **vérifiés** par le
 *   serveur contre les effets réellement produits par cette commande, appliquée à son tour sur le document du serveur.
 *   Chaque cible déclarée doit être affectée par la commande, et de la façon déclarée : `creer` → absente avant,
 *   présente après ; `modifier` → présente avant et après, changée ; `supprimer` → présente avant, absente après. Les
 *   effets en cascade (ouvertures d'un mur supprimé, cote liée qui suit) ne sont pas exigés dans `targetIds`.
 *
 * L'identité de l'auteur n'est jamais un attribut de l'enveloppe : c'est la session authentifiée du serveur (un
 * `actorId` dans le corps est refusé par le schéma strict). Un écart refuse le lot entier, avant toute écriture.
 * Pur : ni React, ni DOM, ni base.
 */
export const STUDIO_MODES_ENVELOPPE = Object.freeze(["appliquer", "essai"] as const);
export type StudioModeEnveloppe = (typeof STUDIO_MODES_ENVELOPPE)[number];
export const STUDIO_OPERATIONS_COMMANDE = Object.freeze(["creer", "modifier", "supprimer"] as const);
export type StudioOperationCommande = (typeof STUDIO_OPERATIONS_COMMANDE)[number];

export interface StudioPorteeEnveloppe { projectId: string; studyId: string; variantId: string }

/** Commande avec ses attributs logiques facultatifs (IF-006). */
export type StudioCommandeMetier = StudioCommand & { targetIds?: string[]; operation?: StudioOperationCommande };

export type StudioEcartEnveloppe =
  | { code: "scope_mismatch"; path: string; message: string }
  | { code: "target_mismatch"; path: string; message: string; cible: string }
  | { code: "operation_mismatch"; path: string; message: string; cible: string };

/** Portée déclarée ≠ portée de l'adresse : écart nommé (champ par champ), sinon null. */
export function studioControlerPortee(declaree: StudioPorteeEnveloppe | undefined, adresse: StudioPorteeEnveloppe): StudioEcartEnveloppe | null {
  if (!declaree) return null;
  for (const k of ["projectId", "studyId", "variantId"] as const) {
    if (declaree[k] !== adresse[k]) return { code: "scope_mismatch", path: `scope.${k}`, message: `Portée déclarée (${k} = ${declaree[k]}) différente de celle de l’adresse : rien n’est appliqué.` };
  }
  return null;
}

/** Commande nue (`toolId`, `params`) : ce que le noyau applique ; les attributs logiques ne sont que vérifiés. */
export const studioCommandeNue = (c: StudioCommandeMetier): StudioCommand => ({ toolId: c.toolId, params: c.params } as StudioCommand);

/**
 * Vérifie les `targetIds` / `operation` déclarés de chaque commande en appliquant le lot commande par commande sur
 * `document` (le document de la tête du serveur). Rend le premier écart, ou null. Une commande refusée par le noyau
 * lève l'erreur de validation habituelle (le lot est refusé de la même façon qu'à l'application).
 */
export function studioControlerCibles(document: StudioDocument, commands: readonly StudioCommandeMetier[]): StudioEcartEnveloppe | null {
  let courant = document;
  for (const [i, c] of commands.entries()) {
    const nue = studioCommandeNue(c);
    const suivant = applyStudioCommands(courant, [nue]);
    if (c.targetIds !== undefined || c.operation !== undefined) {
      const e = studioEffetsCommande(courant, suivant, [nue], { revisionBase: null, revisionSortie: "controle", source: "controle", auteurId: "controle", requestId: null });
      const affectes = new Set([...e.crees, ...e.modifies, ...e.supprimes]);
      const attendu = c.operation === undefined ? null : c.operation === "creer" ? new Set(e.crees) : c.operation === "modifier" ? new Set(e.modifies) : new Set(e.supprimes);
      for (const cible of c.targetIds ?? []) {
        if (!affectes.has(cible)) return { code: "target_mismatch", path: `commands[${i}].targetIds`, cible, message: `La commande ${i} (${c.toolId}) ne touche pas la cible déclarée ${cible} : rien n’est appliqué.` };
        if (attendu && !attendu.has(cible)) return { code: "operation_mismatch", path: `commands[${i}].operation`, cible, message: `La commande ${i} (${c.toolId}) ne fait pas « ${c.operation} » sur ${cible} : rien n’est appliqué.` };
      }
      // Une opération déclarée sans cibles doit au moins se produire une fois.
      if (attendu && !(c.targetIds?.length) && attendu.size === 0) return { code: "operation_mismatch", path: `commands[${i}].operation`, cible: "", message: `La commande ${i} (${c.toolId}) ne fait aucune opération « ${c.operation} » : rien n’est appliqué.` };
    }
    courant = suivant;
  }
  return null;
}
