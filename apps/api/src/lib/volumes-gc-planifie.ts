/**
 * BD-1.3 (chantier base-donnees, constat Q7) : le ramasse-miettes des volumes ne tourne plus dans la requête
 * `DELETE /projects/:id`. Il pose des verrous `SHARE ROW EXCLUSIVE` sur six tables et relit des colonnes `jsonb` de
 * toute la base : dans la requête, il gelait les écritures de tous les utilisateurs pendant la réponse d'un seul.
 *
 * Désormais :
 * - une suppression de projet (ou une anonymisation) *demande* un nettoyage, exécuté peu après, hors de la requête ;
 * - les demandes rapprochées sont regroupées en un seul passage ; deux passages ne se chevauchent jamais ;
 * - la boucle horaire des tâches de fond fait aussi un passage (volumes laissés par un échec ou un redémarrage).
 * Un échec ne supprime rien (voir `nettoyerVolumes`) ; `npm run db:volumes-gc` reste disponible.
 */
import type { Pool } from "pg";
import { nettoyerVolumes, type BilanNettoyageVolumes } from "./volumes-gc.js";

export interface PlanificateurVolumes {
  demander(): void;
  executerMaintenant(): Promise<BilanNettoyageVolumes | null>;
  arreter(): void;
}

export function planificateurVolumes(
  pool: Pool | (() => Pool),
  options: { delaiMs?: number; log?: (line: string) => void; nettoyer?: typeof nettoyerVolumes } = {},
): PlanificateurVolumes {
  const delaiMs = options.delaiMs ?? 5_000;
  // eslint-disable-next-line no-console
  const log = options.log ?? ((l: string) => console.log(l));
  const nettoyer = options.nettoyer ?? nettoyerVolumes;
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let enCours: Promise<BilanNettoyageVolumes | null> | null = null;
  let redemander = false;
  let arrete = false;

  const passage = async (): Promise<BilanNettoyageVolumes | null> => {
    try {
      const bilan = await nettoyer(typeof pool === "function" ? pool() : pool);
      if (bilan.supprimes) log(JSON.stringify({ level: "info", message: "volumes-gc", supprimes: bilan.supprimes }));
      return bilan;
    } catch (error) {
      log(JSON.stringify({ level: "warn", message: `volumes-gc : ${error instanceof Error ? error.message : String(error)}` }));
      return null;
    }
  };

  const executerMaintenant = async (): Promise<BilanNettoyageVolumes | null> => {
    if (enCours) { redemander = true; return enCours; }
    enCours = passage().finally(() => {
      enCours = null;
      if (redemander && !arrete) { redemander = false; demander(); }
    });
    return enCours;
  };

  const demander = (): void => {
    if (arrete || minuterie) return;
    minuterie = setTimeout(() => { minuterie = null; void executerMaintenant(); }, delaiMs);
    minuterie.unref?.();
  };

  return {
    demander,
    executerMaintenant,
    arreter: () => { arrete = true; if (minuterie) clearTimeout(minuterie); minuterie = null; },
  };
}
