/**
 * Mesure du verrou de projet de l'Atelier (chantier bases-de-donnees, BD-9 ; décision du maître d'ouvrage du
 * 3 novembre 2026 : mesurer d'abord, ne rien changer à l'Atelier tant que la mesure ne montre pas de gêne).
 *
 * Chaque écriture de l'Atelier prend le verrou du projet (`lockProject`, SELECT … FOR UPDATE) : les écritures d'un même
 * projet s'enchaînent dans un ordre unique. On mesure, sans rien changer à ce comportement :
 * - l'attente : temps passé à obtenir le verrou (un autre écrivain le tenait) ;
 * - la tenue : temps entre l'obtention du verrou et la validation de la transaction (le verrou est rendu à ce moment).
 * Une ligne par écriture dans `admin.atelier_mesures_verrou` (projet, nature, nombre de commandes, durées, résultat) :
 * aucune donnée personnelle, aucun contenu. Écriture après coup, hors de la transaction mesurée ; un échec d'écriture de
 * la mesure n'a aucun effet sur l'action. Mesures de plus de 90 jours retirées. `ATELIER_MESURES=0` coupe la mesure.
 * Lecture : `node apps/api/dist/atelier-mesures.js [jours]` (médiane, 95ᵉ centile, part au-delà du seuil proposé).
 */
import { pool, db } from "../db/client.js";
import { lockProject } from "./step-rows.js";

export type NatureVerrou = "commande" | "import-ifc" | "import-nuage" | "import-step" | "script" | "assistant" | "script-enregistre";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const actif = (env: Record<string, string | undefined> = process.env) =>
  env["ATELIER_MESURES"] === "1" || (env["ATELIER_MESURES"] !== "0" && env["VITEST"] !== "true" && env["NODE_ENV"] !== "test");

let dernierePurge = 0;

function consigner(projectId: string, nature: NatureVerrou, commandes: number, attenteMs: number, tenueMs: number, resultat: "valide" | "refuse" | "erreur"): void {
  const purger = Date.now() - dernierePurge > 3_600_000;
  if (purger) dernierePurge = Date.now();
  void pool
    .query(
      `INSERT INTO admin.atelier_mesures_verrou (project_id, nature, commandes, attente_ms, tenue_ms, resultat) VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, nature, commandes, Math.round(attenteMs), Math.round(tenueMs), resultat],
    )
    .then(() => (purger ? pool.query("DELETE FROM admin.atelier_mesures_verrou WHERE mesure_le < now() - interval '90 days'") : undefined))
    .catch(() => undefined);
}

/**
 * Transaction sous le verrou du projet, mesurée. Même comportement que `db.transaction` + `lockProject` : le verrou est
 * pris en premier, la fonction s'exécute, la transaction est validée (ou annulée si la fonction lève).
 */
export async function sousVerrouProjet<T>(projectId: string, nature: NatureVerrou, commandes: number, f: (tx: Tx) => Promise<T>, estRefus: (e: unknown) => boolean = () => false): Promise<T> {
  const mesurer = actif();
  const t0 = performance.now();
  let t1 = t0;
  try {
    const r = await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      t1 = performance.now();
      return f(tx);
    });
    if (mesurer) consigner(projectId, nature, commandes, t1 - t0, performance.now() - t1, "valide");
    return r;
  } catch (e) {
    if (mesurer && t1 !== t0) consigner(projectId, nature, commandes, t1 - t0, performance.now() - t1, estRefus(e) ? "refuse" : "erreur");
    throw e;
  }
}

export { centile, statistiquesVerrou, type StatistiquesVerrou } from "./atelier-mesures-stats.js";
