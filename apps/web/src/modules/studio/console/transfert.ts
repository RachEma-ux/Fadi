/**
 * Enregistrer le travail de la Console dans un projet : crée une NOUVELLE étude (donc sa variante initiale) dans le
 * projet choisi, puis envoie à cette variante les commandes dessinées dans la Console, par enveloppes
 * (`import/envoi.ts`, 500 commandes au plus). Aucun projet existant n'est modifié ; la Console n'est pas liée au projet
 * (c'est une copie). Reprenable : un échec en cours d'envoi garde l'étude créée et les lots déjà confirmés ; un nouvel
 * essai rejoue les mêmes identifiants de demande (le serveur reconnaît un rejeu : ni étude ni révision en double).
 * Pur côté DOM : le client HTTP est passé en paramètre.
 */
import type { StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { accuserLot, enveloppeSuivante, planEnvoi, type PlanEnvoi } from "../import/envoi";

export interface EtatTransfert {
  projectId: string;
  nom: string;
  studyId: string;
  variantId: string;
  plan: PlanEnvoi;
}

export interface ClientTransfert {
  createStudioStudy: (projectId: string, nom: string, requestId?: string) => Promise<StudioContext>;
  studioCommands: (projectId: string, studyId: string, variantId: string, enveloppe: NonNullable<ReturnType<typeof enveloppeSuivante>>) => Promise<StudioContext>;
}

export interface Cible { projectId: string; studyId: string; variantId: string }

/**
 * Crée l'étude (une seule fois, tant que `etat` la garde) puis envoie les lots restants. `etat` est mis à jour au fil de
 * l'envoi : en cas d'échec il décrit exactement ce qui est fait, pour la reprise. Rend la variante créée.
 */
export async function transfererVersProjet(o: {
  client: ClientTransfert;
  projectId: string;
  nom: string;
  commandes: readonly StudioCommand[];
  /** Identifiant de la demande de création, fixe pour une même tentative (rejeu sans doublon). */
  requestId: string;
  etat: { current: EtatTransfert | null };
  nouvelId?: () => string;
}): Promise<Cible> {
  const { client, projectId, nom, commandes, requestId, etat } = o;
  if (!etat.current) {
    const c = await client.createStudioStudy(projectId, nom, requestId);
    etat.current = { projectId, nom, studyId: c.study.id, variantId: c.variant.id, plan: planEnvoi(commandes, c.revision.id, o.nouvelId ?? (() => crypto.randomUUID())) };
  }
  const e = etat.current;
  for (let lot = enveloppeSuivante(e.plan); lot; lot = enveloppeSuivante(e.plan)) {
    const accuse = await client.studioCommands(e.projectId, e.studyId, e.variantId, lot);
    e.plan = accuserLot(e.plan, accuse.revision.id);
  }
  return { projectId: e.projectId, studyId: e.studyId, variantId: e.variantId };
}
