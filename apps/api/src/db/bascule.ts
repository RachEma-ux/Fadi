/**
 * Migration de bascule (lot 4, cahier §5.5) — appliquée après `init.sql` par `npm run db:migrate` et par le
 * démarrage `MIGRATE_ON_START=1`, idempotente :
 *
 * 1. chaque projet qui n'a encore que l'ancien magasin du moteur V14 (`atelier_store`) reçoit son modèle typé par
 *    l'importeur à sens unique du lot 1 (sans arrondi, rapport d'import au journal) — aucun dessin n'est perdu ;
 * 2. les tables de l'ancien moteur (`atelier_store`, `architectural_objects`, `levels`) sont supprimées.
 *
 * Seule lecture restante du format de clés du moteur V14 dans le serveur.
 */
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import {
  CONTRAT_COMMANDES,
  TYPE_RESTAURER,
  importerModeleNatif,
} from "@parcours/atelier-model";
import * as schema from "./schema.js";
import { atelierCommands } from "./schema.js";
import { remplacerModele } from "../lib/atelier-modele.js";

const PREFIXE_V14 = "design.v13.";

export async function basculerAncienMoteur(
  pool: Pool,
): Promise<{ convertis: number; supprimees: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    const existe = (
      await client.query<{ t: string | null }>(
        "SELECT to_regclass('public.atelier_store')::text AS t",
      )
    ).rows[0]?.t;
    if (!existe) return { convertis: 0, supprimees: false };
    const db = drizzle(client, { schema });
    // Même connexion : les lectures brutes (`client.query`) font partie de la transaction drizzle.
    return await db.transaction(async (tx) => {
      const sansModele = await client.query<{
        project_id: string;
        model_revision: number;
        owner_id: string;
      }>(
        "SELECT DISTINCT s.project_id, p.model_revision, p.owner_id FROM atelier_store s JOIN projects p ON p.id = s.project_id WHERE NOT EXISTS (SELECT 1 FROM atelier_site a WHERE a.project_id = s.project_id)",
      );
      let convertis = 0;
      for (const row of sansModele.rows) {
        const lignes = (
          await client.query<{ key: string; value: unknown }>(
            "SELECT key, value FROM atelier_store WHERE project_id = $1",
            [row.project_id],
          )
        ).rows;
        const valeur = (cle: string) =>
          lignes.find((l) => l.key === cle)?.value;
        const actif = valeur(`${PREFIXE_V14}activeProject`);
        if (typeof actif !== "string") continue;
        const domaine = (d: string) =>
          valeur(`${PREFIXE_V14}project.${actif}.${d}`);
        const registres = valeur(`${PREFIXE_V14}registry`);
        const registry = Array.isArray(registres)
          ? registres.find((r) => (r as { id?: unknown })?.id === actif)
          : undefined;
        const { modele, rapport } = importerModeleNatif({
          nativeId: actif,
          registry: registry as never,
          domains: {
            levels: domaine("levels"),
            floorDesign: domaine("floorDesign"),
            nativeParcel: domaine("nativeParcel"),
            buildingFootprint: domaine("buildingFootprint"),
            ui: domaine("ui"),
          },
        });
        const revision = Math.max(1, row.model_revision);
        await remplacerModele(tx, row.project_id, modele, actif, revision);
        const journalId = randomUUID();
        await tx
          .insert(atelierCommands)
          .values({
            id: journalId,
            projectId: row.project_id,
            requestId: `bascule-${journalId}`,
            kind: "commande",
            contract: CONTRAT_COMMANDES,
            label: "Reprise du dessin de l'ancien Atelier (bascule)",
            baseRevision: revision - 1,
            resultRevision: revision,
            commands: [
              { type: "interne.import-natif", params: { nativeId: actif } },
            ],
            inverse: {
              type: TYPE_RESTAURER,
              params: { diff: { avant: {}, crees: {} } },
            },
            effets: {
              crees: Object.keys(modele.objets),
              modifies: [],
              supprimes: [],
              problemes: rapport.problemes,
              referencesAReparer: [],
              niveauxTouches: Object.keys(modele.niveaux),
            },
            reponse: { revision, journalId, rapport },
            inverseOf: null,
            authorId: row.owner_id,
            createdAt: new Date(),
          });
        await client.query(
          "UPDATE projects SET model_revision = $2 WHERE id = $1",
          [row.project_id, revision],
        );
        convertis += 1;
      }
      await client.query("DROP TABLE IF EXISTS architectural_objects");
      await client.query("DROP TABLE IF EXISTS levels");
      await client.query("DROP TABLE IF EXISTS atelier_store");
      return { convertis, supprimees: true };
    });
  } finally {
    client.release();
  }
}
