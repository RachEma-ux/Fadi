#!/usr/bin/env node
/**
 * Organisations, participation et revue externe (Issue #262, phase 6) — contrôle APRÈS déploiement, en LECTURE SEULE.
 * Runbook : docs/workstreams/organisations-participation/RUNBOOK-deploiement.md (§ 6).
 *
 *   DATABASE_URL=postgresql://<rôle en lecture>@<hôte>/<base> node scripts/validation/organisations-participation-post-deploiement.mjs
 *       [--instantane <fichier.json>]   avant le déploiement : relève les accès actuels (projets, propriétaires, partages et,
 *                                       si la vue existe déjà, les accès effectifs `project_effective_access`)
 *       [--reference <fichier.json>]    après : chaque accès relevé avant doit exister encore (aucune perte d'accès) ; avec
 *                                       les accès effectifs relevés (lot OP-PONT), chacun doit être IDENTIQUE
 *
 * Garanties : une seule transaction `BEGIN TRANSACTION READ ONLY` (et `default_transaction_read_only = on` pour la
 * session) ; une sonde vérifie que PostgreSQL REFUSE une écriture (25006) avant tout contrôle, sinon le script s'arrête
 * sans rien lire ; la transaction est annulée (ROLLBACK) à la fin. Aucune adresse, aucun nom n'est affiché : seulement des
 * identifiants techniques et des comptes. Rôle conseillé en production : `fadi_backup` (SELECT seul, D-7).
 *
 * Sortie : ✓ contrôle réussi, ❌ échec (code de sortie 1), ⚠ à examiner (n'échoue pas), ℹ information.
 * Contrôles (critères du runbook) :
 *  1. schéma : tables, colonnes, vue `project_effective_access`, pont `op_sync_access` RETIRÉ (lot OP-PONT : aucune
 *     fonction ni déclencheur du miroir, `project_members` vue de compatibilité en lecture seule), index d'unicité ;
 *  2. reprise : chaque propriétaire a sa participation active et l'accès `proprietaire` ; chaque partage
 *     (`project_members`) a sa participation non terminée et son rôle de partage `acces` ; AUCUN membre existant sans
 *     accès effectif hors participation suspendue, non commencée ou échéance d'accès passée (comptés à part) ;
 *  3. participations : aucune participation active, commencée, non expirée, portant un rôle de portée projet, sans accès
 *     effectif ; aucune participation sans personne ni organisation ; une participation « revue seule » n'ouvre rien ;
 *  4. revue externe : paquet partagé toujours figé (manifeste, empreinte, fichiers) ; affectation acceptée liée à un compte ;
 *  5. organisations : organisation active avec des membres = au moins un administrateur actif ; mandat actif = adhésion
 *     active ;
 *  6. journal : append-only (déclencheurs), aucune adresse en clair dans les métadonnées des familles du chantier ;
 *  7. D-7 : `fadi_app` sans DDL ni UPDATE / DELETE du journal, avec lecture / écriture des tables du chantier ;
 *  8. conservation des contacts (OP-2) : contacts dont l'effacement est dû (⚠ si la tâche horaire n'est pas active).
 */
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const snapshotOut = opt("--instantane");
const referenceIn = opt("--reference");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL requis."); process.exit(2); }

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "fadi-op-post-deploiement" });
await client.connect();
let failures = 0, warnings = 0;
const ok = (m) => console.log(`✓ ${m}`);
const ko = (m) => { failures += 1; console.log(`❌ ${m}`); };
const warn = (m) => { warnings += 1; console.log(`⚠ ${m}`); };
const info = (m) => console.log(`ℹ ${m}`);
const check = (cond, m, detail) => (cond ? ok(m) : ko(`${m}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}`}`));
const one = async (q, p = []) => (await client.query(q, p)).rows[0];
const all = async (q, p = []) => (await client.query(q, p)).rows;
const exists = async (rel) => (await one("SELECT to_regclass($1) IS NOT NULL AS e", [rel])).e;

try {
  await client.query("SET SESSION default_transaction_read_only = on");
  await client.query("BEGIN TRANSACTION READ ONLY");
  // Sonde : une écriture doit être refusée par PostgreSQL lui-même (25006 read_only_sql_transaction), sinon on s'arrête.
  await client.query("SAVEPOINT sonde");
  let refused = false;
  try { await client.query("UPDATE projects SET name = name WHERE false"); } catch (e) { refused = e.code === "25006"; }
  await client.query("ROLLBACK TO SAVEPOINT sonde");
  if (!refused) throw new Error("la transaction n'est pas en lecture seule : arrêt sans contrôle");
  ok("transaction en lecture seule : écriture refusée par PostgreSQL (25006)");
  const meta = await one("SELECT current_database() AS db, current_user AS usr, current_setting('transaction_read_only') AS ro, now() AS at");
  info(`base ${meta.db}, rôle ${meta.usr}, lecture seule = ${meta.ro}, ${meta.at.toISOString()}`);

  // --- Instantané AVANT déploiement (fonctionne aussi sur l'ancien schéma : seules projects et project_members) ---------
  if (snapshotOut) {
    const projects = await all("SELECT id, owner_id FROM projects ORDER BY id");
    const members = await all("SELECT project_id, user_id, role FROM project_members ORDER BY project_id, user_id");
    // Base où la vue d'accès existe déjà (phases 2 et suivantes) : relevé exact des accès effectifs, pour prouver après le
    // retrait du pont qu'ils sont IDENTIQUES (rôle, export, approbation, diffusion).
    const access = (await exists("project_effective_access"))
      ? (await all("SELECT project_id, user_id, role, can_export, can_approve, can_publish FROM project_effective_access ORDER BY 1, 2")).map((r) => [r.project_id, r.user_id, r.role, r.can_export, r.can_approve, r.can_publish])
      : null;
    writeFileSync(snapshotOut, `${JSON.stringify({ schema: "fadi-op-acces/2", takenAt: meta.at, database: meta.db, projects: projects.map((r) => [r.id, r.owner_id]), members: members.map((r) => [r.project_id, r.user_id, r.role]), access })}\n`);
    ok(`instantané écrit : ${projects.length} projets, ${members.length} partages${access ? `, ${access.length} accès effectifs` : ""} → ${snapshotOut} (identifiants seulement)`);
    await client.query("ROLLBACK");
    await client.end();
    process.exit(0);
  }

  // --- 1. Schéma -------------------------------------------------------------------------------------------------------
  const relations = ["people", "organizations", "project_participations", "project_role_assignments", "project_effective_access", "organization_memberships",
    "organization_groups", "organization_group_members", "organization_templates", "organization_template_versions", "organization_template_applications",
    "organization_mandates", "review_packages", "review_assignments", "review_findings", "review_package_notes"];
  const missing = [];
  for (const r of relations) if (!(await exists(r))) missing.push(r);
  check(missing.length === 0, `schéma : ${relations.length} tables et vue du chantier présentes`, missing.join(", "));
  if (missing.length) throw new Error("schéma incomplet : migration non appliquée, contrôles suivants impossibles");
  const cols = [["public", "project_participations", "can_export"], ["public", "project_participations", "access_expires_at"], ["public", "projects", "closed_at"],
    ["public", "project_participations", "access_granted_by"], ["public", "project_participations", "access_granted_at"],
    ["public", "projects", "organization_id"], ["public", "people", "erased_at"], ["auth", "invitations", "participation_id"], ["auth", "invitations", "proposed_roles"],
    ["auth", "invitations", "organization_id"], ["auth", "invitations", "review_assignment_id"], ["public", "studio_comments", "review_package_id"]];
  const missingCols = [];
  for (const [s, t, c] of cols) if (!(await one("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS e", [s, t, c])).e) missingCols.push(`${s}.${t}.${c}`);
  check(missingCols.length === 0, `schéma : ${cols.length} colonnes additives présentes`, missingCols.join(", "));
  // Lot OP-PONT : plus aucun déclencheur ni fonction du miroir ; `project_members` est une vue de compatibilité.
  const triggers = (await all(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1::text[])`, [["project_members_op_mirror", "projects_op_owner_mirror"]])).map((r) => r.tgname);
  const mirrorFns = (await all("SELECT proname FROM pg_proc WHERE proname = ANY($1::text[])", [["op_sync_access", "op_project_members_mirror", "op_projects_owner_mirror"]])).map((r) => r.proname);
  const pmKind = (await one("SELECT relkind FROM pg_class WHERE oid = to_regclass('public.project_members')"))?.relkind ?? null;
  check(triggers.length === 0 && mirrorFns.length === 0 && pmKind === "v", "pont op_sync_access retiré : aucun déclencheur ni fonction du miroir, project_members est une vue", { triggers, mirrorFns, pmKind });
  const indexes = (await all("SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[])", [["people_user_unique", "project_participations_current_person", "project_participations_current_org", "project_role_assignments_unique"]])).map((r) => r.indexname);
  check(indexes.length === 4, "unicité : une personne par compte, une participation en cours par personne / organisation et projet, rôles sans doublon", indexes);

  // --- 2. Reprise de l'existant -----------------------------------------------------------------------------------------
  const counts = await one(`SELECT (SELECT count(*) FROM projects)::int AS projects, (SELECT count(*) FROM project_members)::int AS members,
    (SELECT count(*) FROM people)::int AS people, (SELECT count(*) FROM people WHERE user_id IS NULL)::int AS contacts,
    (SELECT count(*) FROM project_participations)::int AS participations, (SELECT count(*) FROM project_role_assignments)::int AS roles,
    (SELECT count(*) FROM organizations)::int AS organizations, (SELECT count(*) FROM review_packages)::int AS packages`);
  info(`volumes : ${JSON.stringify(counts)}`);
  const ownerNoAccess = await one(`SELECT count(*)::int AS n FROM projects p WHERE NOT EXISTS (SELECT 1 FROM project_effective_access v WHERE v.project_id = p.id AND v.user_id = p.owner_id AND v.role = 'proprietaire')`);
  check(ownerNoAccess.n === 0, "reprise : chaque propriétaire garde l'accès « proprietaire »", ownerNoAccess);
  const ownerNoPart = await one(`SELECT count(*)::int AS n FROM projects p WHERE NOT EXISTS (SELECT 1 FROM people pe JOIN project_participations pp ON pp.person_id = pe.id
      WHERE pe.user_id = p.owner_id AND pp.project_id = p.id AND pp.status = 'active')`);
  check(ownerNoPart.n === 0, "reprise : chaque propriétaire a sa participation active", ownerNoPart);
  const bridge = await one(`SELECT count(*)::int AS n FROM project_members m WHERE NOT EXISTS (
      SELECT 1 FROM people pe JOIN project_participations pp ON pp.person_id = pe.id AND pp.project_id = m.project_id AND pp.status <> 'terminee'
        JOIN project_role_assignments ra ON ra.participation_id = pp.id AND ra.origin = 'acces' AND ra.scope_type = 'projet'
         AND ra.role = CASE m.role WHEN 'editeur' THEN 'concepteur' ELSE 'lecteur' END
       WHERE pe.user_id = m.user_id)`);
  check(bridge.n === 0, "vue de compatibilité : chaque partage a sa participation non terminée et son rôle de partage « acces »", bridge);
  const memberStates = await all(`SELECT CASE WHEN pp.id IS NULL THEN 'sans-participation' WHEN pp.status = 'suspendue' THEN 'suspendue'
        WHEN pp.status = 'contact' THEN 'contact' WHEN pp.starts_on > current_date THEN 'non-commencee'
        WHEN pp.access_expires_at IS NOT NULL AND pp.access_expires_at <= now() THEN 'echeance-passee' ELSE 'perte' END AS etat, count(*)::int AS n
      FROM project_members m JOIN projects p ON p.id = m.project_id AND p.owner_id <> m.user_id
      LEFT JOIN people pe ON pe.user_id = m.user_id
      LEFT JOIN project_participations pp ON pp.project_id = m.project_id AND pp.person_id = pe.id AND pp.status <> 'terminee'
      WHERE NOT EXISTS (SELECT 1 FROM project_effective_access v WHERE v.project_id = m.project_id AND v.user_id = m.user_id) GROUP BY 1`);
  const lost = memberStates.filter((r) => ["perte", "sans-participation", "contact"].includes(r.etat)).reduce((a, r) => a + r.n, 0);
  check(lost === 0, "aucun membre existant sans accès effectif (hors suspension, début futur, échéance passée)", memberStates);
  for (const r of memberStates.filter((s) => !["perte", "sans-participation", "contact"].includes(s.etat))) info(`partages sans accès effectif par décision : ${r.etat} = ${r.n}`);
  const downgraded = await one(`SELECT count(*)::int AS n FROM project_members m JOIN project_effective_access v ON v.project_id = m.project_id AND v.user_id = m.user_id
      WHERE m.role = 'editeur' AND v.role NOT IN ('editeur', 'proprietaire')`);
  check(downgraded.n === 0, "aucun éditeur existant réduit à la lecture", downgraded);
  if (referenceIn) {
    const ref = JSON.parse(readFileSync(referenceIn, "utf8"));
    if (!["fadi-op-acces/1", "fadi-op-acces/2"].includes(ref.schema)) throw new Error(`instantané inconnu : ${ref.schema}`);
    const view = new Map((await all("SELECT project_id, user_id, role FROM project_effective_access")).map((r) => [`${r.project_id} ${r.user_id}`, r.role]));
    const states = new Map((await all(`SELECT pp.project_id, pe.user_id, pp.status, (pp.access_expires_at IS NOT NULL AND pp.access_expires_at <= now()) AS expired
      FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pe.user_id IS NOT NULL AND pp.status <> 'contact'
      ORDER BY pp.created_at`)).map((r) => [`${r.project_id} ${r.user_id}`, r]));
    const owners = new Map((await all("SELECT id, owner_id FROM projects")).map((r) => [r.id, r.owner_id]));
    const rank = { lecteur: 1, editeur: 2, proprietaire: 3 };
    const lostRef = [];
    let decided = 0, gone = 0, noneBefore = 0;
    // Instantané avec accès effectifs (fadi-op-acces/2) : un partage listé SANS accès effectif avant (suspension, échéance,
    // dérive) n'en avait pas à perdre.
    const hadAccess = ref.access ? new Set(ref.access.map(([p, u]) => `${p} ${u}`)) : null;
    for (const [pid, uid, role] of [...ref.projects.map(([p, o]) => [p, o, "proprietaire"]), ...ref.members]) {
      if (!owners.has(pid)) { gone += 1; continue; }                                    // projet supprimé depuis
      if (hadAccess && role !== "proprietaire" && !hadAccess.has(`${pid} ${uid}`)) { noneBefore += 1; continue; }
      const now = view.get(`${pid} ${uid}`);
      if (now && rank[now] >= rank[role]) continue;                                     // accès conservé (ou élargi)
      if (role === "proprietaire" && owners.get(pid) !== uid) { decided += 1; continue; } // transfert de propriété tracé
      const st = states.get(`${pid} ${uid}`);
      if (!now && st && (["suspendue", "terminee"].includes(st.status) || st.expired)) { decided += 1; continue; }
      lostRef.push([pid, uid, role, now ?? null]);
    }
    check(lostRef.length === 0, `instantané ${ref.takenAt} : chaque accès relevé avant le déploiement existe encore (${ref.projects.length} propriétaires, ${ref.members.length} partages)`, lostRef.slice(0, 5));
    info(`instantané : ${decided} accès retirés depuis par une décision tracée (suspension, fin, échéance), ${gone} projets supprimés depuis${hadAccess ? `, ${noneBefore} partage(s) déjà sans accès effectif avant` : ""}`);
    if (ref.access) {
      // Accès effectifs relevés avant (lot OP-PONT, application arrêtée pendant la migration) : chacun IDENTIQUE après.
      const nowAccess = new Map((await all("SELECT project_id, user_id, role, can_export, can_approve, can_publish FROM project_effective_access"))
        .map((r) => [`${r.project_id} ${r.user_id}`, [r.role, r.can_export, r.can_approve, r.can_publish].join("|")]));
      const changed = ref.access.filter(([pid, uid, ...rest]) => owners.has(pid) && nowAccess.get(`${pid} ${uid}`) !== rest.join("|"));
      check(changed.length === 0, `instantané : ${ref.access.length} accès effectifs relevés avant, identiques après (rôle, export, approbation, diffusion)`, changed.slice(0, 5));
      const before = new Set(ref.access.map(([pid, uid]) => `${pid} ${uid}`));
      info(`instantané : ${[...nowAccess.keys()].filter((k) => !before.has(k)).length} accès effectif(s) nouveau(x) depuis (partages repris par la migration, ou accordés depuis)`);
    }
  } else info("aucun instantané de référence (--reference) : comparaison avant / après non faite");

  // --- 3. Participations ------------------------------------------------------------------------------------------------
  const activeNoAccess = await one(`SELECT count(*)::int AS n FROM project_participations pp JOIN people pe ON pe.id = pp.person_id AND pe.user_id IS NOT NULL
      WHERE pp.status = 'active' AND (pp.starts_on IS NULL OR pp.starts_on <= current_date) AND (pp.access_expires_at IS NULL OR pp.access_expires_at > now())
        AND EXISTS (SELECT 1 FROM project_role_assignments ra WHERE ra.participation_id = pp.id AND ra.scope_type = 'projet')
        AND NOT EXISTS (SELECT 1 FROM project_effective_access v WHERE v.project_id = pp.project_id AND v.user_id = pe.user_id)`);
  check(activeNoAccess.n === 0, "aucune participation active portant un rôle de projet sans accès effectif", activeNoAccess);
  const rolesNoAccount = await one(`SELECT count(*)::int AS n FROM project_role_assignments ra JOIN project_participations pp ON pp.id = ra.participation_id
      LEFT JOIN people pe ON pe.id = pp.person_id WHERE pp.status = 'active' AND ra.origin = 'attribution' AND (pe.user_id IS NULL)`);
  check(rolesNoAccount.n === 0, "aucun rôle attribué à un contact sans compte ni à une organisation (aucune invitation implicite)", rolesNoAccount);
  const reviewOnly = await one(`SELECT count(*)::int AS n FROM review_assignments a JOIN project_participations pp ON pp.id = a.participation_id
      JOIN people pe ON pe.id = pp.person_id
      JOIN project_effective_access v ON v.project_id = a.project_id AND v.user_id = pe.user_id
      WHERE NOT EXISTS (SELECT 1 FROM project_role_assignments ra JOIN project_participations q ON q.id = ra.participation_id
                         WHERE q.person_id = pe.id AND q.project_id = a.project_id AND ra.scope_type = 'projet')
        AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a.project_id AND p.owner_id = pe.user_id)`);
  check(reviewOnly.n === 0, "revue seule : un destinataire de revue sans rôle de projet n'a aucun accès au projet", reviewOnly);
  const partStates = await all("SELECT status, count(*)::int AS n FROM project_participations GROUP BY 1 ORDER BY 1");
  info(`participations par statut : ${partStates.map((r) => `${r.status}=${r.n}`).join(", ") || "aucune"}`);
  const narrow = await one("SELECT count(*)::int AS n FROM project_role_assignments WHERE scope_type <> 'projet'");
  info(`rôles de portée étroite (étude, variante, révision, documents) : ${narrow.n}`);

  // --- 4. Revue externe -------------------------------------------------------------------------------------------------
  const unfrozen = await one(`SELECT count(*)::int AS n FROM review_packages WHERE status <> 'brouillon'
      AND (manifest_hash IS NULL OR revision_id IS NULL OR document_hash IS NULL OR files IS NULL OR jsonb_array_length(files) = 0)`);
  check(unfrozen.n === 0, "paquets partagés, clos ou remplacés : copie figée complète (révision, empreintes, fichiers)", unfrozen);
  const pkgStates = await all("SELECT status, count(*)::int AS n FROM review_packages GROUP BY 1 ORDER BY 1");
  info(`paquets de revue : ${pkgStates.map((r) => `${r.status}=${r.n}`).join(", ") || "aucun"}`);
  const acceptedNoUser = await one("SELECT count(*)::int AS n FROM review_assignments WHERE status IN ('en-cours', 'terminee') AND user_id IS NULL");
  check(acceptedNoUser.n === 0, "affectations de revue acceptées liées à un compte", acceptedNoUser);

  // --- 5. Organisations -------------------------------------------------------------------------------------------------
  const noAdmin = await one(`SELECT count(*)::int AS n FROM organizations o WHERE o.status = 'active'
      AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active')
      AND NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id = o.id AND m.status = 'active' AND m.role = 'administrateur')`);
  check(noAdmin.n === 0, "organisation active avec des membres : au moins un administrateur actif", noAdmin);
  const mandates = await one(`SELECT count(*)::int AS n FROM organization_mandates md JOIN organization_memberships m ON m.id = md.membership_id
      WHERE md.status = 'actif' AND m.status <> 'active'`);
  check(mandates.n === 0, "mandat actif : adhésion du représentant active", mandates);

  // --- 6. Journal -------------------------------------------------------------------------------------------------------
  const auditTriggers = await one(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'admin' AND c.relname = 'audit_log' AND NOT t.tgisinternal`);
  check(auditTriggers.n >= 1, "journal : déclencheurs append-only présents sur admin.audit_log", auditTriggers);
  const leaks = await all(`SELECT action, count(*)::int AS n FROM admin.audit_log
      WHERE (action LIKE 'participation.%' OR action LIKE 'person.%' OR action LIKE 'organization.%' OR action LIKE 'review.%' OR action LIKE 'invitation.%'
             OR action LIKE 'project.member.%' OR action IN ('project.closed', 'project.reopened'))
        AND metadata::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' GROUP BY 1`);
  check(leaks.length === 0, "journal : aucune adresse e-mail en clair dans les métadonnées du chantier", leaks);

  // --- 7. D-7 -----------------------------------------------------------------------------------------------------------
  if ((await one("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fadi_app') AS e")).e) {
    const priv = await one(`SELECT has_schema_privilege('fadi_app', 'public', 'CREATE') AS ddl, has_table_privilege('fadi_app', 'admin.audit_log', 'UPDATE') AS au,
        has_table_privilege('fadi_app', 'admin.audit_log', 'DELETE') AS ad`);
    check(!priv.ddl && !priv.au && !priv.ad, "D-7 : fadi_app sans DDL, sans UPDATE ni DELETE du journal", priv);
    const noRw = [];
    for (const r of relations.filter((x) => x !== "project_effective_access")) {
      const p = await one(`SELECT has_table_privilege('fadi_app', $1, 'SELECT') AND has_table_privilege('fadi_app', $1, 'INSERT') AND has_table_privilege('fadi_app', $1, 'UPDATE') AS rw`, [`public.${r}`]);
      if (!p.rw) noRw.push(r);
    }
    check(noRw.length === 0 && (await one("SELECT has_table_privilege('fadi_app', 'public.project_effective_access', 'SELECT') AS s")).s, "D-7 : fadi_app lit et écrit les tables du chantier, lit la vue d'accès", noRw);
  } else warn("D-7 : rôle fadi_app absent (base non provisionnée D-7) — droits non contrôlés");

  // --- 8. Conservation des contacts (OP-2) -----------------------------------------------------------------------------
  const due = await one(`SELECT count(*)::int AS n FROM people pe WHERE pe.user_id IS NULL AND pe.erased_at IS NULL
      AND EXISTS (SELECT 1 FROM project_participations pp WHERE pp.person_id = pe.id)
      AND NOT EXISTS (SELECT 1 FROM project_participations pp JOIN projects p ON p.id = pp.project_id
                       WHERE pp.person_id = pe.id AND (p.closed_at IS NULL OR p.closed_at > now() - interval '2 years'))`);
  if (due.n === 0) ok("conservation des contacts : aucun effacement dû en attente");
  else warn(`conservation des contacts : ${due.n} contact(s) dont l'effacement est dû (tâche horaire inactive, ou réserve juridique d'OP-2 encore levée ?)`);
  const pendingOld = await one("SELECT count(*)::int AS n FROM auth.invitations WHERE purpose = 'project_participation' AND status = 'pending' AND participation_id IS NULL");
  if (pendingOld.n) info(`invitations de projet en attente émises avant la phase 3 (sans participation rattachée) : ${pendingOld.n} — elles restent acceptables`);
} catch (e) {
  ko(`contrôle interrompu : ${e.message}`);
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
console.log(failures ? `\n${failures} échec(s), ${warnings} point(s) à examiner` : `\nContrôle après déploiement : conforme${warnings ? ` (${warnings} point(s) à examiner)` : ""}`);
process.exit(failures ? 1 : 0);
