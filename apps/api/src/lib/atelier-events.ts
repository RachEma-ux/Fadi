/**
 * Événements du nouvel Atelier (cahier §5.4, lot 2) — **interface figée par le chef de projet** avant la phase 2.
 *
 * - Le service de commandes (L2.2, `lib/atelier-commands.ts`) écrit, dans la même transaction que le journal,
 *   une ligne `atelier_outbox` par événement avec `ecrireEvenement`, puis, après validation de la transaction,
 *   appelle `declencherTraitement(projetId)`.
 * - Le traitement (L2.3, ce fichier) lit les lignes non traitées et applique les effets : fraîcheur des documents,
 *   péremption du bilan Harmonie, invalidation de l'aperçu conceptuel, notifications. Il est idempotent par
 *   identifiant de ligne : un événement déjà traité (`processed_at` posé) n'est jamais rejoué ; un échec incrémente
 *   `attempts` et garde `last_error`.
 *
 * Seules les signatures ci-dessous sont figées ; les corps sont écrits en L2.3.
 *
 * Mécanique (L2.3) :
 * - une ligne par transaction : `SELECT … FOR UPDATE SKIP LOCKED` (deux traitements parallèles ne prennent jamais la
 *   même ligne ; une ligne déjà traitée est exclue par la relecture de `processed_at IS NULL` sous verrou), effets
 *   dans un point de sauvegarde, puis `processed_at` dans la même transaction. Un échec annule les effets seuls
 *   (point de sauvegarde), incrémente `attempts`, garde `last_error` ; la ligne reste rejouable. Un même appel ne
 *   tente chaque ligne qu'une fois (pas de boucle sur une ligne en échec).
 * - effets de `atelier.commande.validee`, sous verrou de la ligne du projet (`FOR NO KEY UPDATE`, sérialisé avec
 *   `lockProject` des autres écritures du dossier) — même résultat observable que l'ancien Atelier :
 *   1. documents dérivés : périmés par l'avance de `projects.model_revision`, faite par le service de commandes dans
 *      la transaction du lot (révision partagée, D-030) — exactement le mécanisme de l'ancien Atelier
 *      (`writeStoreEntry`) : `documentFreshness` compare la révision de production à la révision courante. Le
 *      traitement ne réécrit pas cette révision (un seul écrivain de la révision qui fait autorité) ;
 *   2. bilan Harmonie : la revue archivée (`harmony.designReviewV62`) antérieure au lot reçoit la marque
 *      `perimeeParAtelier` ; `loadDesignContext` la lit (`revuePerimeeParAtelier`) et rend `analysis.stale` vrai.
 *      Nécessaire parce que l'empreinte d'entrée du bilan est encore calculée sur le modèle de l'ancien Atelier
 *      jusqu'au lot 4. Une nouvelle revue (« Actualiser ») remplace l'objet et efface la marque ;
 *   3. aperçu conceptuel : `projects.updated_at` avancé, clé de cache de l'aperçu côté client (accueil et en-tête
 *      du projet), comme `writeStoreEntry` ;
 *   4. notifications : l'événement traité est la notification ; `GET /notifications` relit les événements traités
 *      des projets du compte, écrits par d'autres, **regroupés par projet** (`regrouperModifications`), avec la
 *      révision et l'auteur — une seule notification par projet, jamais une par lot.
 */
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Executeur } from "./atelier-rows.js";

export const EVENEMENT_COMMANDE_VALIDEE = "atelier.commande.validee";

/** Charge utile de `atelier.commande.validee` (§5.4). */
export interface ChargeCommandeValidee {
  readonly projectId: string;
  readonly revision: number;
  readonly objetIds: readonly string[];
  readonly types: readonly string[];
  readonly auteur: string | null;
  /** `commande`, `annulation`, `retablissement` ou `import` (colonne `nature` du journal, D-030). */
  readonly nature: string;
}

export interface EvenementAtelier {
  readonly event: typeof EVENEMENT_COMMANDE_VALIDEE;
  readonly payload: ChargeCommandeValidee;
}

/** Longueur maximale conservée de `last_error`. */
const ERREUR_MAX = 2000;

function chargeValide(p: unknown): p is ChargeCommandeValidee {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const c = p as Record<string, unknown>;
  const chaines = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  return (
    typeof c["projectId"] === "string" &&
    c["projectId"] !== "" &&
    Number.isInteger(c["revision"]) &&
    (c["revision"] as number) >= 0 &&
    chaines(c["objetIds"]) &&
    chaines(c["types"]) &&
    (c["auteur"] === null || typeof c["auteur"] === "string") &&
    typeof c["nature"] === "string"
  );
}

/**
 * Écrit l'événement dans `atelier_outbox` (à appeler dans la transaction du journal). Idempotent par
 * `(command_id, event)` : une seconde écriture pour la même entrée du journal est sans effet.
 */
export async function ecrireEvenement(ex: Executeur, commandId: string, evenement: EvenementAtelier): Promise<void> {
  if (evenement.event !== EVENEMENT_COMMANDE_VALIDEE) throw new Error(`atelier-events : événement inconnu « ${String(evenement.event)} »`);
  if (!chargeValide(evenement.payload)) throw new Error("atelier-events : charge utile de atelier.commande.validee invalide");
  const p = evenement.payload;
  const charge: ChargeCommandeValidee = { projectId: p.projectId, revision: p.revision, objetIds: [...p.objetIds], types: [...p.types], auteur: p.auteur, nature: p.nature };
  await ex.execute(sql`
    INSERT INTO atelier_outbox (id, project_id, command_id, event, payload)
    VALUES (${`evt_${randomUUID()}`}, ${p.projectId}, ${commandId}, ${evenement.event}, ${JSON.stringify(charge)}::jsonb)
    ON CONFLICT (command_id, event) DO NOTHING`);
}

// ---------------------------------------------------------------------------
// Traitement
// ---------------------------------------------------------------------------

/** Base ou transaction Drizzle capable d'ouvrir une transaction (ou un point de sauvegarde). */
interface Transactionnel extends Executeur {
  transaction<T>(f: (tx: Transactionnel) => Promise<T>): Promise<T>;
}

function transactionnel(ex: Executeur): Transactionnel {
  if (typeof (ex as Partial<Transactionnel>).transaction !== "function") throw new Error("atelier-events : l'exécuteur doit permettre une transaction (base ou transaction Drizzle)");
  return ex as Transactionnel;
}

interface LigneBoite {
  id: string;
  project_id: string;
  command_id: string;
  event: string;
  payload: unknown;
  cree_ms: number;
}

/** Marque posée sur la revue de conception archivée par un lot de l'Atelier validé après elle. */
export interface PeremptionAtelier {
  readonly revision: number;
  readonly auteur: string | null;
  readonly commandeId: string;
  readonly nature: string;
  /** Date du lot (création de l'événement), ISO 8601. */
  readonly le: string;
}

/** La marque `perimeeParAtelier` d'une revue archivée (`harmony.designReviewV62`), ou `null`. */
export function revuePerimeeParAtelier(revue: unknown): PeremptionAtelier | null {
  if (!revue || typeof revue !== "object") return null;
  const m = (revue as Record<string, unknown>)["perimeeParAtelier"];
  if (!m || typeof m !== "object") return null;
  const r = m as Record<string, unknown>;
  return Number.isInteger(r["revision"]) && typeof r["le"] === "string" ? (m as PeremptionAtelier) : null;
}

async function appliquerCommandeValidee(tx: Executeur, ligne: LigneBoite): Promise<void> {
  const charge = ligne.payload;
  if (!chargeValide(charge)) throw new Error("charge utile invalide");
  if (charge.projectId !== ligne.project_id) throw new Error(`projet de la charge (${charge.projectId}) différent de la ligne (${ligne.project_id})`);
  const projet = (await tx.execute(sql`SELECT harmony FROM projects WHERE id = ${ligne.project_id} FOR NO KEY UPDATE`)).rows[0] as { harmony: unknown } | undefined;
  if (!projet) return; // projet supprimé entre-temps : rien à périmer (la ligne disparaîtrait d'ailleurs en cascade)

  // 2. Bilan Harmonie : revue archivée antérieure au lot → périmée (une marque plus récente n'est jamais remplacée).
  const harmony = projet.harmony && typeof projet.harmony === "object" && !Array.isArray(projet.harmony) ? (projet.harmony as Record<string, unknown>) : null;
  const revue = harmony?.["designReviewV62"];
  if (harmony && revue && typeof revue === "object" && !Array.isArray(revue)) {
    const at = Date.parse(String((revue as Record<string, unknown>)["at"] ?? ""));
    const deja = revuePerimeeParAtelier(revue);
    const anterieure = !Number.isFinite(at) || at <= ligne.cree_ms;
    if (anterieure && (!deja || deja.revision < charge.revision)) {
      const marque: PeremptionAtelier = { revision: charge.revision, auteur: charge.auteur, commandeId: ligne.command_id, nature: charge.nature, le: new Date(ligne.cree_ms).toISOString() };
      await tx.execute(sql`UPDATE projects SET harmony = jsonb_set(harmony, '{designReviewV62,perimeeParAtelier}', ${JSON.stringify(marque)}::jsonb) WHERE id = ${ligne.project_id}`);
    }
  }

  // 3. Aperçu conceptuel (et listes de projets) : la date de mise à jour du projet est la clé de cache côté client.
  await tx.execute(sql`UPDATE projects SET updated_at = GREATEST(updated_at, clock_timestamp()) WHERE id = ${ligne.project_id}`);

  // 1. Documents : périmés par la révision avancée par le service (aucune écriture ici, voir l'en-tête).
  // 4. Notifications : relues des événements traités (`processed_at`), aucune écriture ici.
}

async function appliquer(tx: Executeur, ligne: LigneBoite): Promise<void> {
  if (ligne.event === EVENEMENT_COMMANDE_VALIDEE) return appliquerCommandeValidee(tx, ligne);
  throw new Error(`événement inconnu « ${ligne.event} »`);
}

/**
 * Traite les événements non traités (d'un projet, ou de tous) ; rend le nombre de lignes traitées.
 * Idempotent : peut être appelé plusieurs fois, en parallèle, sans double effet.
 */
export async function traiterBoiteDeSortie(ex: Executeur, projetId?: string): Promise<number> {
  const base = transactionnel(ex);
  const tentees: string[] = [];
  let traitees = 0;
  for (;;) {
    const issue = await base.transaction(async (tx) => {
      const ligne = (
        await tx.execute(sql`
          SELECT id, project_id, command_id, event, payload, (extract(epoch FROM created_at) * 1000)::float8 AS cree_ms
          FROM atelier_outbox
          WHERE processed_at IS NULL
            ${projetId === undefined ? sql`` : sql`AND project_id = ${projetId}`}
            AND id NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(tentees)}::jsonb))
          ORDER BY created_at, id
          LIMIT 1
          FOR UPDATE SKIP LOCKED`)
      ).rows[0] as LigneBoite | undefined;
      if (!ligne) return null;
      try {
        await tx.transaction((sp) => appliquer(sp, ligne));
      } catch (e) {
        const message = (e instanceof Error ? e.message : String(e)).slice(0, ERREUR_MAX);
        await tx.execute(sql`UPDATE atelier_outbox SET attempts = attempts + 1, last_error = ${message} WHERE id = ${ligne.id}`);
        return { id: ligne.id, ok: false };
      }
      await tx.execute(sql`UPDATE atelier_outbox SET processed_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ${ligne.id}`);
      return { id: ligne.id, ok: true };
    });
    if (!issue) return traitees;
    tentees.push(issue.id);
    if (issue.ok) traitees += 1;
    else journaliser("atelier-outbox : échec du traitement d'un événement (rejouable)", { id: issue.id });
  }
}

// ---------------------------------------------------------------------------
// Déclenchement asynchrone
// ---------------------------------------------------------------------------

const TOUS = "*";
/** Traitements en cours par clé (projet ou `*`) : `true` = un nouveau passage est demandé pendant le passage courant. */
const enCours = new Map<string, boolean>();
const promesses = new Set<Promise<void>>();

function journaliser(message: string, detail: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: "error", message, ...detail }));
}

function planifier(projetId: string | undefined): void {
  const cle = projetId ?? TOUS;
  if (enCours.has(cle)) {
    enCours.set(cle, true); // regroupé : un seul passage supplémentaire après le passage courant
    return;
  }
  enCours.set(cle, false);
  const p = new Promise<void>((resolve) => setImmediate(resolve))
    .then(async () => {
      const { db } = await import("../db/client.js");
      do {
        enCours.set(cle, false);
        await traiterBoiteDeSortie(db, projetId);
      } while (enCours.get(cle) === true);
    })
    .catch((e: unknown) => journaliser("atelier-outbox : traitement interrompu (lignes rejouables)", { projet: projetId ?? null, erreur: e instanceof Error ? e.message : String(e) }))
    .finally(() => {
      enCours.delete(cle);
      promesses.delete(p);
    });
  promesses.add(p);
}

/** Déclenche un traitement asynchrone après validation (ne lève jamais, ne bloque pas la réponse HTTP). */
export function declencherTraitement(projetId: string): void {
  try {
    planifier(projetId);
  } catch (e) {
    journaliser("atelier-outbox : déclenchement impossible", { projet: projetId, erreur: e instanceof Error ? e.message : String(e) });
  }
}

/** Rattrapage au démarrage du serveur : traite les lignes restées non traitées de tous les projets (ne lève jamais). */
export function rattraperBoiteDeSortie(): void {
  try {
    planifier(undefined);
  } catch (e) {
    journaliser("atelier-outbox : rattrapage impossible", { erreur: e instanceof Error ? e.message : String(e) });
  }
}

/** Attend la fin des traitements déclenchés (tests, arrêt propre). */
export async function attendreTraitements(): Promise<void> {
  while (promesses.size) await Promise.all([...promesses]);
}

// ---------------------------------------------------------------------------
// Notifications (pur) : événements traités → une notification par projet
// ---------------------------------------------------------------------------

export interface EvenementTraite {
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly payload: unknown;
  /** Date du lot, ISO 8601. */
  readonly at: string;
}

export interface NotificationModele {
  readonly id: string;
  readonly at: string;
  readonly kind: "modele";
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly stepNumber: null;
  readonly text: string;
  readonly revision: number;
  readonly auteurs: readonly string[];
  readonly lots: number;
}

/**
 * Regroupe les lots validés par d'autres (`auteur` différent du compte) en **une notification par projet** : les
 * lots postérieurs à la dernière consultation (`seenAt`) s'il y en a — nombre de lots, révision la plus haute,
 * auteurs —, sinon le dernier lot seul (déjà lu). `libelleAuteur` traduit l'identifiant d'auteur (courriel…).
 */
export function regrouperModifications(
  evenements: readonly EvenementTraite[],
  compte: { readonly userId: string; readonly seenAt: string | null },
  libelleAuteur: (auteur: string | null) => string,
): NotificationModele[] {
  const parProjet = new Map<string, (EvenementTraite & { charge: ChargeCommandeValidee })[]>();
  for (const e of evenements) {
    if (!chargeValide(e.payload) || e.payload.auteur === compte.userId) continue;
    const liste = parProjet.get(e.projectId) ?? [];
    liste.push({ ...e, charge: e.payload });
    parProjet.set(e.projectId, liste);
  }
  const out: NotificationModele[] = [];
  for (const liste of parProjet.values()) {
    liste.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.charge.revision - a.charge.revision));
    const nouveaux = compte.seenAt === null ? liste : liste.filter((e) => e.at > compte.seenAt!);
    const groupe = nouveaux.length ? nouveaux : liste.slice(0, 1);
    const dernier = groupe[0]!;
    const revision = Math.max(...groupe.map((e) => e.charge.revision));
    const auteurs = [...new Set(groupe.map((e) => libelleAuteur(e.charge.auteur)))];
    const qui = auteurs.length > 2 ? `${auteurs.slice(0, 2).join(", ")} et ${auteurs.length - 2} autre${auteurs.length > 3 ? "s" : ""}` : auteurs.join(" et ");
    const lots = groupe.length;
    out.push({
      id: `modele:${dernier.projectId}:${revision}`,
      at: dernier.at,
      kind: "modele",
      projectId: dernier.projectId,
      projectCode: dernier.projectCode,
      projectName: dernier.projectName,
      stepNumber: null,
      text: `${qui} ${auteurs.length > 1 ? "ont" : "a"} modifié le modèle de ${dernier.projectCode} — ${dernier.projectName} dans l’Atelier${lots > 1 ? ` (${lots} lots)` : ""} : révision ${revision}. Les documents produits avant sont périmés.`,
      revision,
      auteurs,
      lots,
    });
  }
  return out;
}
