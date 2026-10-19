/**
 * Section Studio de l'archive de projet (R.1-02) : lecture des tables Studio d'un projet (études, variantes, révisions
 * immuables et leurs documents, commentaires, observations et leur journal, liens d'étapes du Parcours, publications,
 * leur journal et les fichiers figés de leurs paquets, droits du projet, préférences d'outils des comptes du projet) et
 * réinsertion TELLE QUELLE dans un nouveau projet. La logique pure (manifeste, contrôle, réattribution, signature) est
 * dans `studio-archive-manifest.ts` et `archive-signature.ts`.
 *
 * Immuabilité : les révisions et les journaux sont INSÉRÉS (le déclencheur `studio_revisions_no_update` ne porte que
 * sur UPDATE et reste en place) ; aucune révision n'est recalculée ni réécrite, les empreintes de contenu sont celles
 * de l'archive. Identifiants conservés : si l'un d'eux existe déjà dans la base cible (archive réimportée dans sa base
 * d'origine, projet d'origine encore présent), la partie Studio n'est pas restaurée et une réserve le dit.
 *
 * Confiance (décision du développeur principal) : chaque export est signé (HMAC-SHA256 de l'empreinte globale du
 * manifeste, clé du serveur). À l'import, seule une signature vérifiée par une clé de CE serveur conserve les auteurs et
 * les approbations (comptes retrouvés par adresse). Signature absente, inconnue ou invalide : l'import reste permis mais
 * rien n'est cru — tout acteur devient le compte qui restaure, les adresses d'origine ne restent qu'en réserve
 * (« auteurs d'origine déclarés »), les publications approuvées ou diffusées reviennent « à relire » (travail en revue, diffusion retirée à la restauration : modèle E.4), droits et
 * préférences ne sont pas repris. Les contrôles d'intégrité (manifeste, empreintes) refusent toujours (422).
 */
import { sql } from "drizzle-orm";
import { newId } from "./ids.js";
import type { Querier, Tx } from "./step-rows.js";
import { signManifestHash, verifyArchiveSignature, type ArchiveTrust } from "./archive-signature.js";
import { currentSigningKey, verificationKeys } from "./archive-signing-key.js";
import {
  STUDIO_ARCHIVE_SCHEMA, STUDIO_ARCHIVE_SCHEMA_VERSION, STUDIO_ARCHIVE_TABLES, STUDIO_IDENTITY_TABLES, STUDIO_TABLE_KEYS,
  buildStudioManifest, checkStudioArchive, distrustStudioPublications, emptyStudioTables, mapStudioAccounts, packageVolumeIds, remapStudioRows, studioAccountIds,
  type StudioArchiveRow, type StudioArchiveSection, type StudioArchiveTable,
} from "./studio-archive-manifest.js";

/** Section Studio refusée à la relecture : la transaction d'import est annulée, rien n'est créé. */
export class StudioArchiveError extends Error {
  constructor(public readonly erreurs: string[]) {
    super(`Section Studio de l'archive refusée : ${erreurs.slice(0, 3).join(" ; ")}${erreurs.length > 3 ? ` (+ ${erreurs.length - 3})` : ""}`);
  }
}

async function rows(q: Querier, query: ReturnType<typeof sql>): Promise<StudioArchiveRow[]> {
  const res = await q.execute(query);
  return (res.rows as { row: StudioArchiveRow }[]).map((r) => r.row);
}
const table = (t: StudioArchiveTable) => sql.raw(`"${t}"`);

/** Lignes Studio du projet, telles que PostgreSQL les stocke (`to_jsonb`). */
export async function loadStudioTables(q: Querier, projectId: string, ownerId: string) {
  const tables = emptyStudioTables();
  tables.studio_studies = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_studies t WHERE project_id = ${projectId} ORDER BY id`);
  const inStudies = sql`(SELECT id FROM studio_studies WHERE project_id = ${projectId})`;
  const inVariants = sql`(SELECT v.id FROM studio_variants v JOIN studio_studies s ON s.id = v.study_id WHERE s.project_id = ${projectId})`;
  tables.studio_variants = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_variants t WHERE study_id IN ${inStudies} ORDER BY id`);
  tables.studio_revisions = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_revisions t WHERE variant_id IN ${inVariants} ORDER BY id`);
  tables.studio_comments = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_comments t WHERE variant_id IN ${inVariants} ORDER BY id`);
  tables.studio_observations = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_observations t WHERE variant_id IN ${inVariants} ORDER BY comment_id`);
  tables.studio_observation_events = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_observation_events t WHERE observation_id IN (SELECT comment_id FROM studio_observations WHERE variant_id IN ${inVariants}) ORDER BY id`);
  tables.studio_study_steps = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_study_steps t WHERE study_id IN ${inStudies} ORDER BY study_id, step_number`);
  tables.studio_publications = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_publications t WHERE project_id = ${projectId} ORDER BY id`);
  tables.studio_publication_events = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_publication_events t WHERE publication_id IN (SELECT id FROM studio_publications WHERE project_id = ${projectId}) ORDER BY id`);
  const volumeIds = packageVolumeIds(tables.studio_publications);
  tables.volumes = volumeIds.length ? await rows(q, sql`SELECT to_jsonb(t) AS row FROM volumes t WHERE id IN (${sql.join(volumeIds.map((id) => sql`${id}`), sql`, `)}) ORDER BY id`) : [];
  tables.project_members = await rows(q, sql`SELECT to_jsonb(t) AS row FROM project_members t WHERE project_id = ${projectId} ORDER BY user_id`);
  // Préférences d'outils des comptes du projet (propriétaire et membres) : visibilité seulement, jamais un droit.
  const accountsOfProject = [ownerId, ...tables.project_members.map((m) => m["user_id"] as string)];
  tables.studio_tool_preferences = await rows(q, sql`SELECT to_jsonb(t) AS row FROM studio_tool_preferences t WHERE user_id IN (${sql.join(accountsOfProject.map((id) => sql`${id}`), sql`, `)}) ORDER BY user_id`);
  return tables;
}

/** Section Studio de l'archive, signée ; `null` quand le projet n'a ni donnée Studio ni membre (archives inchangées). */
export async function exportStudioArchive(q: Querier, project: { id: string; ownerId: string }): Promise<StudioArchiveSection | null> {
  const tables = await loadStudioTables(q, project.id, project.ownerId);
  const meaningful = STUDIO_ARCHIVE_TABLES.some((t) => t !== "studio_tool_preferences" && tables[t].length > 0);
  if (!meaningful) return null;
  const ids = studioAccountIds(tables, project.ownerId);
  const found = await rows(q, sql`SELECT jsonb_build_object('id', id, 'email', email) AS row FROM users WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) ORDER BY id`);
  const emails = new Map(found.map((r) => [r["id"] as string, r["email"] as string]));
  // Un compte supprimé depuis (cascade impossible : RESTRICT) n'arrive pas ici ; l'adresse vide le signalerait.
  const accounts = ids.map((id) => ({ id, email: emails.get(id) ?? "" }));
  const manifest = buildStudioManifest(tables, { sourceProjectId: project.id, ownerId: project.ownerId, accounts });
  return {
    schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, sourceProjectId: project.id, ownerId: project.ownerId,
    accounts, tables, manifest, signature: signManifestHash(await currentSigningKey(q), manifest.hash),
  };
}

async function insertRows(tx: Tx, t: StudioArchiveTable, list: StudioArchiveRow[], conflict: "fail" | "ignore" = "fail") {
  if (!list.length) return;
  const json = JSON.stringify(list);
  const onConflict = conflict === "ignore" ? sql` ON CONFLICT DO NOTHING` : sql``;
  await tx.execute(sql`INSERT INTO ${table(t)} SELECT * FROM jsonb_populate_recordset(NULL::${table(t)}, ${json}::jsonb)${onConflict}`);
}

const TRUST_WARNING: Readonly<Record<Exclude<ArchiveTrust, "verifiee">, string>> = Object.freeze({
  absente: "Archive non signée : rien n'en est cru.",
  inconnue: "Archive signée par une clé inconnue de ce serveur : rien n'en est cru.",
  invalide: "Signature de l'archive invalide (contenu modifié après l'export) : rien n'en est cru.",
});

export interface StudioImportOutcome {
  warnings: string[];
  /** Confiance accordée à la section Studio (signature), `null` sans section. */
  trust: ArchiveTrust | null;
  /** Lignes Studio réinsérées (faux si collision d'identifiants ou section vide). */
  restored: boolean;
  /** Publications approuvées ou diffusées remises « à relire » (archive non vérifiée). */
  downgraded: number;
}

/**
 * Restaure la section Studio d'une archive dans le projet `projectId` (créé par le même import, propriété de
 * `importerId`). Refus (`StudioArchiveError`) si la section est altérée ; réserves si elle ne peut être reprise ou
 * n'est pas vérifiée.
 */
export async function importStudioArchive(tx: Tx, projectId: string, importerId: string, raw: unknown): Promise<StudioImportOutcome> {
  const checked = checkStudioArchive(raw);
  if (!checked.ok) throw new StudioArchiveError(checked.errors);
  const { section } = checked;
  const warnings: string[] = [];
  const trust = verifyArchiveSignature(section.signature, section.manifest.hash, await verificationKeys(tx));
  const trusted = trust === "verifiee";

  let map: Map<string, string>;
  let reassigned: string[] = [];
  if (trusted) {
    const emails = [...new Set(section.accounts.map((a) => a.email.toLowerCase()).filter(Boolean))];
    const found = emails.length ? await rows(tx, sql`SELECT jsonb_build_object('id', id, 'email', lower(email)) AS row FROM users WHERE lower(email) IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`) : [];
    ({ map, reassigned } = mapStudioAccounts(section.accounts, new Map(found.map((r) => [r["email"] as string, r["id"] as string])), importerId));
  } else {
    // Rien n'est cru : tout acteur cité (auteur, approbateur, diffuseur, responsable) devient le compte qui restaure.
    map = new Map(section.accounts.map((a) => [a.id, importerId]));
  }
  const tables = Object.fromEntries(STUDIO_ARCHIVE_TABLES.map((t) => [t, remapStudioRows(t, section.tables[t], projectId, map)])) as Record<StudioArchiveTable, StudioArchiveRow[]>;

  // Identifiants globaux déjà présents : la base est celle d'origine (ou en a reçu une copie) — rien n'est écrasé.
  let collision = false;
  for (const t of STUDIO_IDENTITY_TABLES) {
    const key = STUDIO_TABLE_KEYS[t][0]!;
    const ids = tables[t].map((r) => r[key] as string);
    if (!ids.length) continue;
    const res = await tx.execute(sql`SELECT 1 FROM ${table(t)} WHERE ${sql.raw(`"${key}"`)} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) LIMIT 1`);
    if (res.rows.length) { collision = true; break; }
  }
  const studioCount = tables.studio_studies.length;
  let restored = false;
  let downgraded = 0;
  if (!trusted) {
    warnings.push(TRUST_WARNING[trust]);
    warnings.push("Auteurs, approbations, acteurs des publications et responsables des observations attribués au compte qui restaure ; droits et préférences d'outils non repris.");
    const declared = [...new Set(section.accounts.map((a) => a.email).filter(Boolean))].sort();
    if (declared.length) warnings.push(`Auteurs d'origine déclarés (non vérifiés) : ${declared.join(", ")}.`);
  }
  if (collision) {
    warnings.push(`Données Studio non restaurées : leurs identifiants existent déjà dans cette base (projet d'origine présent) ; ${studioCount} étude(s) restent dans le projet d'origine.`);
  } else if (studioCount || tables.studio_publications.length) {
    let publications = tables.studio_publications;
    let extraEvents: StudioArchiveRow[] = [];
    if (!trusted) {
      const d = distrustStudioPublications(publications, tables.studio_variants, importerId, new Date().toISOString(), () => newId("studio_publication_event"));
      ({ publications, downgraded } = d);
      extraEvents = d.events;
    }
    for (const t of ["studio_studies", "studio_variants", "studio_revisions", "studio_comments", "studio_observations", "studio_observation_events", "studio_study_steps"] as const) await insertRows(tx, t, tables[t]);
    // Volumes adressés par leur contenu : un volume déjà présent est le même fichier (même SHA-256).
    await insertRows(tx, "volumes", tables.volumes, "ignore");
    await insertRows(tx, "studio_publications", publications);
    await insertRows(tx, "studio_publication_events", [...tables.studio_publication_events, ...extraEvents]);
    restored = true;
    if (downgraded) warnings.push(`${downgraded} publication(s) approuvée(s) ou diffusée(s) remise(s) « à relire » (en revue, diffusion retirée à la restauration) : manifeste et paquet conservés et lisibles, nouvelle approbation exigée avant toute diffusion.`);
    if (reassigned.length) warnings.push(`Historique Studio : auteur technique réattribué au compte qui restaure pour ${reassigned.length} compte(s) absent(s) de cette base (${reassigned.join(", ")}).`);
  }
  if (!trusted) return { warnings, trust, restored, downgraded };

  // Droits : membres retrouvés par leur adresse, rôle et date conservés ; le compte qui restaure est propriétaire.
  const reassignedIds = new Set(section.accounts.filter((a) => reassigned.includes(a.email || a.id)).map((a) => a.id));
  const retrouve = (row: StudioArchiveRow) => !reassignedIds.has(row["user_id"] as string);
  const members = remapStudioRows("project_members", section.tables.project_members.filter(retrouve), projectId, map).filter((m) => m["user_id"] !== importerId);
  await insertRows(tx, "project_members", members, "ignore");
  const lostMembers = section.tables.project_members.length - members.length;
  if (lostMembers > 0) warnings.push(`Droits : ${lostMembers} membre(s) non repris (compte absent de cette base ou compte qui restaure).`);
  const owner = section.accounts.find((a) => a.id === section.ownerId);
  if (owner && map.get(owner.id) !== importerId) warnings.push(`Droits : le propriétaire d'origine (${owner.email}) n'est pas propriétaire du projet restauré.`);
  // Préférences d'outils : reprises seulement pour un compte retrouvé qui n'en a pas (jamais écrasées).
  await insertRows(tx, "studio_tool_preferences", remapStudioRows("studio_tool_preferences", section.tables.studio_tool_preferences.filter(retrouve), projectId, map), "ignore");
  return { warnings, trust, restored, downgraded };
}
