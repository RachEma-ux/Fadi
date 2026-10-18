/**
 * Enregistrement d'un brouillon en plusieurs enveloppes `studio-commands/1`. Le serveur borne une enveloppe à 500
 * commandes et le corps de la requête à 1 Mo : un brouillon plus grand (un import DXF, typiquement) part en lots
 * successifs, dans l'ordre, chacun sur la révision que le lot précédent a produite. Chaque lot a son `requestId` fixé
 * à la création du plan : un nouvel essai après une erreur réseau rejoue exactement le même lot (jamais de double
 * effet), puis reprend au suivant. Pur : ni React ni DOM ni réseau.
 */
import { STUDIO_CONTRACT, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";

/** Bornes de l'API (`apps/api/src/lib/studio-commands.ts` : 500 commandes ; `routes/studio.ts` : corps de 1 Mo). */
export const ENVELOPPE_MAX_COMMANDES = 500;
/** Marge sous le 1 Mo du serveur pour l'en-tête de l'enveloppe (contrat, identifiants). */
export const ENVELOPPE_MAX_OCTETS = 900_000;

const octets = (c: StudioCommand): number => new TextEncoder().encode(JSON.stringify(c)).length + 1;

/** Lots consécutifs de ≤ `maxCommandes` commandes et ≤ `maxOctets` octets JSON, ordre conservé. */
export function decouperCommandes(commandes: readonly StudioCommand[], maxCommandes = ENVELOPPE_MAX_COMMANDES, maxOctets = ENVELOPPE_MAX_OCTETS): StudioCommand[][] {
  const lots: StudioCommand[][] = [];
  let lot: StudioCommand[] = [], taille = 0;
  for (const c of commandes) {
    const t = octets(c);
    if (t > maxOctets) throw new RangeError("Commande trop volumineuse pour une enveloppe.");
    if (lot.length && (lot.length >= maxCommandes || taille + t > maxOctets)) {
      lots.push(lot);
      lot = [];
      taille = 0;
    }
    lot.push(c);
    taille += t;
  }
  if (lot.length) lots.push(lot);
  return lots;
}

export interface PlanEnvoi {
  readonly lots: readonly (readonly StudioCommand[])[];
  readonly requestIds: readonly string[];
  /** Lots confirmés par le serveur. */
  readonly envoyes: number;
  /** Révision sur laquelle part le prochain lot (la tête chargée, puis la révision du lot précédent). */
  readonly base: string;
}

export function planEnvoi(commandes: readonly StudioCommand[], base: string, nouvelId: () => string): PlanEnvoi {
  const lots = decouperCommandes(commandes);
  return { lots, requestIds: lots.map(() => nouvelId()), envoyes: 0, base };
}

/** Prochaine enveloppe à envoyer, ou `null` quand tous les lots sont confirmés. */
export function enveloppeSuivante(plan: PlanEnvoi): StudioEnvelope | null {
  const lot = plan.lots[plan.envoyes];
  if (!lot) return null;
  return { contractVersion: STUDIO_CONTRACT, requestId: plan.requestIds[plan.envoyes]!, baseRevisionId: plan.base, commands: [...lot] };
}

/** Le serveur a confirmé le lot courant par la révision `revisionId` (rejeu compris) : le suivant part sur elle. */
export function accuserLot(plan: PlanEnvoi, revisionId: string): PlanEnvoi {
  if (plan.envoyes >= plan.lots.length) return plan;
  return { ...plan, envoyes: plan.envoyes + 1, base: revisionId };
}

/** Commandes des lots non confirmés, dans l'ordre : ce qui reste à enregistrer après un refus en cours d'envoi. */
export const commandesNonEnvoyees = (plan: PlanEnvoi): StudioCommand[] => plan.lots.slice(plan.envoyes).flat();

export const envoiTermine =(plan: PlanEnvoi): boolean => plan.envoyes >= plan.lots.length;
/** Une partie seulement est enregistrée : la tête serveur contient les premiers lots, pas les suivants. */
export const envoiPartiel = (plan: PlanEnvoi): boolean => plan.envoyes > 0 && plan.envoyes < plan.lots.length;
