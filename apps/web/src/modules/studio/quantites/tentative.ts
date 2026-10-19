/**
 * Tentative d'enregistrement d'un ajustement (E.3-05) : cycle de vie de son `requestId`. Pur : ni React, ni DOM.
 *
 * Si le serveur a enregistré l'ajustement mais que la réponse s'est perdue, un nouvel essai doit être reconnu comme le
 * MÊME envoi : on renvoie alors le même corps (même `requestId`, même `baseSequence`, même révision), et le serveur
 * répond avec l'ajustement d'origine (`replayed: true`) au lieu d'en ajouter un second au journal.
 *
 * - Même contenu de formulaire (cible, grandeur, unité, valeur, motif) qu'une tentative non confirmée : même corps.
 * - Contenu différent : nouvelle tentative, nouvel identifiant.
 * - Issue connue (succès, ou refus du serveur 4xx : rien n'a été écrit) : la tentative est close ; issue inconnue
 *   (réseau, réponse perdue, 5xx) : elle est conservée pour le prochain essai.
 */
import type { SaisieAjustementQuantite } from "@parcours/atelier-model";
import { jsonStable } from "../taches/empreinte";

export interface CorpsAjustement extends SaisieAjustementQuantite { baseSequence: number; revisionId: string; requestId: string }
export interface TentativeAjustement { cle: string; corps: CorpsAjustement }

/** Clé du contenu saisi : ce qui, s'il change, fait une autre demande. */
export const cleSaisieAjustement = (s: SaisieAjustementQuantite): string =>
  jsonStable({ cible: s.cible, grandeur: s.grandeur, unite: s.unite, valeur: s.valeur, motif: s.motif });

/** Tentative à envoyer : la précédente si elle porte le même contenu (non confirmée), sinon une nouvelle. */
export function preparerTentative(
  precedente: TentativeAjustement | null, saisie: SaisieAjustementQuantite, contexte: { baseSequence: number; revisionId: string }, nouvelId: () => string,
): TentativeAjustement {
  const cle = cleSaisieAjustement(saisie);
  if (precedente && precedente.cle === cle) return precedente;
  return { cle, corps: { ...saisie, ...contexte, requestId: nouvelId() } };
}

/** Après un envoi : `null` si l'issue est connue (succès ou refus 4xx), sinon la tentative est conservée. */
export function apresEnvoi(tentative: TentativeAjustement, issue: { ok: true } | { ok: false; status?: number }): TentativeAjustement | null {
  if (issue.ok) return null;
  return issue.status !== undefined && issue.status >= 400 && issue.status < 500 ? null : tentative;
}
