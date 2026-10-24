#!/usr/bin/env node
/**
 * Recette du journal d'activité et de l'historique (Issue #262, phase 3 bis, OP-D13 (a)) sur l'API réelle qui sert
 * l'application construite (`FADI_ADMIN_ENABLED=true`, `FADI_ENCRYPTION_KEY` posée). Comptes et projet synthétiques
 * créés par les vraies routes ; administrateur promu par `apps/api/scripts/create-admin.mjs`, double authentification
 * activée depuis sa session (UM-18).
 *
 *  1. API : chaque audience ne voit que son périmètre — administration (filtres, curseur, export déclaré indisponible,
 *     404 pour un non-administrateur), « Mon historique » (ses actions, le support sur ses projets, jamais d'IP), historique
 *     du projet (propriétaire et coordinateur : 200 ; éditeur, lecteur, accès support : 403 `responsable-requis` ;
 *     étranger : 404) ;
 *  2. navigateur : /admin/journal (filtre par famille), Mon compte → « Mon historique », Collaboration → « Historique »
 *     chez le propriétaire, absent chez le lecteur ; axe-core sans violation critique ni sérieuse, bureau et téléphone ;
 *  3. passe anglaise : les mêmes écrans en anglais, libellés traduits.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… node apps/web/e2e/journal-activite.mjs
 * Sans DATABASE_URL, la promotion de l'administrateur et le cas du coordinateur ne peuvent pas tourner : déclarés
 * NON EXÉCUTÉS (couverts par app.test.ts, DB-3).
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CREATE_ADMIN = fileURLToPath(new URL("../../api/scripts/create-admin.mjs", import.meta.url));
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const uid = () => randomUUID().replaceAll("-", "").slice(0, 12);
const email = (role) => `journal-${role}-${uid()}@example.test`;
const password = () => `phrase de passe ${randomBytes(6).toString("hex")}`;

function base32(text) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const ch of text.replace(/[\s=]/g, "").toUpperCase()) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30_000)) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1_000_000).padStart(6, "0");
}

async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}

async function api(ctx, method, path, data) {
  const r = await ctx.request[method](`${BASE}${path}`, { headers: { origin: BASE }, ...(data === undefined ? {} : { data }) });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pageErrors = [];
const contexts = [];

/** Compte neuf ; ses cookies restent dans un contexte de bureau. */
async function person(role) {
  const ctx = await browser.newContext(desktop);
  contexts.push(ctx);
  const cred = { email: email(role), password: password() };
  const r = await api(ctx, "post", "/auth/register", cred);
  if (r.status !== 201) throw new Error(`inscription ${role} : ${r.status}`);
  const me = await api(ctx, "get", "/auth/me");
  return { ctx, ...cred, id: me.body?.id };
}

/** Ouvre une page du compte, en français ou en anglais (`fadi.langue`, D-163), suivie pour les erreurs. */
async function open(ctx, path, langue = "fr", viewport = desktop.viewport) {
  const page = await ctx.newPage();
  await page.setViewportSize(viewport);
  await page.addInitScript((l) => { try { localStorage.setItem("fadi.langue", l); } catch { /* stockage indisponible */ } }, langue);
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${BASE}${path}`);
  return page;
}

try {
  // -------------------------------------------------------------------------------------------------------------------
  // Mise en place : propriétaire, éditeur, lecteur, étranger, administrateur (support).
  const owner = await person("proprio");
  const editor = await person("editeur");
  const reader = await person("lecteur");
  const stranger = await person("etranger");
  const admin = await person("admin");
  const project = await api(owner.ctx, "post", "/projects", { code: `JA_${uid().slice(0, 6)}`, name: "Journal d’activité (recette synthétique)" });
  const pid = project.body?.id;
  check("projet créé", project.status === 201, String(project.status));
  check("éditeur et lecteur ajoutés", (await api(owner.ctx, "post", `/projects/${pid}/members`, { email: editor.email, role: "editeur" })).status < 300
    && (await api(owner.ctx, "post", `/projects/${pid}/members`, { email: reader.email, role: "lecteur" })).status < 300);
  const invited = await api(owner.ctx, "post", `/projects/${pid}/members`, { email: email("invite"), role: "lecteur" });
  check("invitation d’une adresse sans compte", invited.status === 202, String(invited.status));

  let adminReady = false;
  if (process.env.DATABASE_URL) {
    execFileSync(process.execPath, [CREATE_ADMIN, admin.email], { env: { ...process.env, DATABASE_URL: process.env.CREATE_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL }, encoding: "utf8" });
    // La promotion ferme les sessions : reconnexion, puis double authentification activée depuis cette session (UM-18).
    const login = await api(admin.ctx, "post", "/auth/login", { email: admin.email, password: admin.password });
    const setup = await api(admin.ctx, "post", "/auth/me/mfa/setup");
    const enabled = await api(admin.ctx, "post", "/auth/me/mfa/enable", { code: totp(setup.body?.secret ?? "") });
    adminReady = login.status === 200 && enabled.status === 200;
    check("administrateur promu, double authentification activée depuis sa session", adminReady, `${login.status} ${setup.status} ${enabled.status}`);
  } else console.log("administrateur : NON EXÉCUTÉ (DATABASE_URL absente pour create-admin.mjs) — couvert par app.test.ts (DB-3).");

  if (adminReady) {
    check("accès support accordé par le propriétaire", (await api(owner.ctx, "post", `/projects/${pid}/support-grants`, { adminId: admin.id, hours: 1, purpose: "Recette du journal" })).status === 201);
    check("lecture du projet par le support (journalisée)", (await api(admin.ctx, "get", `/projects/${pid}`)).status === 200);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // 1. API — périmètre de chaque audience.
  const journal = (ctx, q = "") => api(ctx, "get", `/projects/${pid}/journal${q}`);
  const pj = await journal(owner.ctx);
  const pjActions = (pj.body?.entries ?? []).map((e) => e.action);
  check("projet : le propriétaire lit l’historique de la participation", pj.status === 200 && pjActions.includes("project.member.added") && pjActions.includes("invitation.created"), `${pj.status} ${pjActions.join(",")}`);
  check("projet : aucune adresse IP, membre visé nommé, aucun identifiant brut", (pj.body?.entries ?? []).every((e) => !("ip" in e) && !("memberId" in e.details))
    && (pj.body?.entries ?? []).filter((e) => e.action === "project.member.added").every((e) => e.subjects?.memberId?.email));
  for (const [nom, who, status] of [["éditeur", editor, 403], ["lecteur", reader, 403], ["étranger", stranger, 404]]) {
    const r = await journal(who.ctx);
    check(`projet : ${nom} → ${status}${status === 403 ? " (responsable-requis)" : ""}`, r.status === status && (status !== 403 || r.body?.motif === "responsable-requis"), `${r.status} ${r.body?.motif ?? ""}`);
  }
  if (adminReady) {
    const s = await journal(admin.ctx);
    check("projet : l’accès support lit le projet, pas son historique de participation (403)", s.status === 403, String(s.status));
    const vus = ((await journal(owner.ctx)).body?.entries ?? []).map((e) => e.action);
    check("projet : accès support accordé et utilisé visibles des responsables", ["support.granted", "support.accessed"].every((a) => vus.includes(a)), vus.join(","));
  }
  const famille = await journal(owner.ctx, "?family=invitation");
  check("projet : filtre par famille appliqué par le serveur", famille.status === 200 && famille.body.entries.length > 0 && famille.body.entries.every((e) => e.action.startsWith("invitation.")));

  if (process.env.DATABASE_URL) {
    const pg = (await import("pg")).default;
    const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await sql.connect();
    await sql.query(`INSERT INTO project_role_assignments (id, participation_id, role, scope_type, origin)
      SELECT 'pra_recette_' || md5(random()::text), pp.id, 'coordinateur', 'projet', 'attribution' FROM project_participations pp
        JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2 AND pp.status = 'active'`, [pid, editor.id]);
    await sql.end();
    check("projet : l’éditeur devenu coordinateur (portée projet) lit l’historique", (await journal(editor.ctx)).status === 200);
  } else console.log("coordinateur : NON EXÉCUTÉ (DATABASE_URL absente) — couvert par app.test.ts (DB-3).");

  const mine = await api(owner.ctx, "get", "/auth/me/history");
  const mineActions = (mine.body?.entries ?? []).map((e) => e.action);
  check("Mon historique : ses actions (inscription, ajout de membres, invitation)", mine.status === 200 && ["auth.register", "project.member.added", "invitation.created"].every((a) => mineActions.includes(a)), mineActions.join(","));
  check("Mon historique : jamais d’adresse IP", (mine.body?.entries ?? []).every((e) => !("ip" in e)));
  if (adminReady) check("Mon historique : l’accès support utilisé sur son projet, administrateur nommé", (mine.body?.entries ?? []).some((e) => e.action === "support.accessed" && e.actor?.email === admin.email));
  const theirs = await api(stranger.ctx, "get", "/auth/me/history");
  check("Mon historique : l’étranger ne voit rien du projet ni du propriétaire", theirs.status === 200 && (theirs.body?.entries ?? []).every((e) => e.projectId !== pid && e.actor?.kind === "vous"));
  const page1 = await api(owner.ctx, "get", "/auth/me/history?limit=1");
  const page2 = page1.body?.nextCursor ? await api(owner.ctx, "get", `/auth/me/history?limit=1&before=${page1.body.nextCursor}`) : null;
  check("Mon historique : pagination par curseur, récent d’abord", !!page2 && page2.body.entries[0].id < page1.body.entries[0].id);

  check("administration : 404 pour un utilisateur", (await api(owner.ctx, "get", "/admin/audit")).status === 404);
  if (adminReady) {
    const all = await api(admin.ctx, "get", `/admin/audit?actor=${encodeURIComponent(owner.email)}`);
    check("administration : journal filtré par acteur (adresse), identité et IP présentes", all.status === 200 && all.body.entries.length > 0
      && all.body.entries.every((e) => e.actor?.email === owner.email && "ip" in e), String(all.status));
    check("administration : export déclaré indisponible (UM-20)", all.body?.export?.available === false);
    const fam = await api(admin.ctx, "get", `/admin/audit?family=support&targetId=${pid}`);
    check("administration : filtre famille + cible", fam.status === 200 && fam.body.entries.length >= 2 && fam.body.entries.every((e) => e.action.startsWith("support.")));
    check("administration : date invalide refusée (400)", (await api(admin.ctx, "get", "/admin/audit?from=x")).status === 400);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // 2. Navigateur, en français : bureau puis téléphone.
  for (const [nom, viewport] of [["bureau", desktop.viewport], ["téléphone", phone.viewport]]) {
    const compte = await open(owner.ctx, "/parametres", "fr", viewport);
    await compte.locator("[data-account-history] [data-journal-table]").waitFor();
    check(`Mon compte (${nom}) : « Mon historique » liste ses entrées`, (await compte.locator("[data-account-history] [data-journal-entry]").count()) > 0
      && (await compte.locator('[data-account-history] [data-journal-entry="project.member.added"]').count()) > 0);
    await axe(compte, `Mon compte — Mon historique (${nom})`);
    await compte.close();

    const collab = await open(owner.ctx, `/projets/${pid}?module=collaboration`, "fr", viewport);
    await collab.locator("[data-historique-projet] [data-journal-table]").waitFor();
    check(`Collaboration (${nom}) : section « Historique » du propriétaire`, (await collab.locator('[data-historique-projet] [data-journal-entry="project.member.added"]').count()) >= 2);
    await collab.locator('[data-historique-famille="invitation"]').click();
    await collab.locator('[data-historique-projet] [data-journal-entry="invitation.created"]').waitFor();
    check(`Collaboration (${nom}) : filtre « Invitations »`, (await collab.locator('[data-historique-projet] [data-journal-entry="project.member.added"]').count()) === 0);
    await axe(collab, `Collaboration — Historique (${nom})`);
    await collab.close();

    const lecteur = await open(reader.ctx, `/projets/${pid}?module=collaboration`, "fr", viewport);
    await lecteur.locator("#collab-members").waitFor();
    await lecteur.waitForLoadState("networkidle").catch(() => undefined);
    check(`Collaboration (${nom}) : aucune section « Historique » pour le lecteur`, (await lecteur.locator("[data-historique-projet]").count()) === 0);
    await lecteur.close();

    if (adminReady) {
      const adm = await open(admin.ctx, "/admin/journal", "fr", viewport);
      await adm.locator("[data-admin-journal] [data-journal-table]").waitFor();
      check(`administration (${nom}) : journal affiché, export indisponible annoncé`, (await adm.locator("[data-journal-entry]").count()) > 0 && (await adm.locator('[data-journal-export="indisponible"]').count()) === 1);
      await adm.selectOption('select[name="family"]', "support");
      await adm.click('[data-admin-journal] button[type="submit"]');
      await adm.waitForFunction(() => {
        const rows = [...document.querySelectorAll("[data-journal-entry]")];
        return rows.length > 0 && rows.every((r) => r.getAttribute("data-journal-entry").startsWith("support."));
      }, null, { timeout: 10_000 }).then(() => check(`administration (${nom}) : filtre « Accès support »`, true), () => check(`administration (${nom}) : filtre « Accès support »`, false));
      await axe(adm, `administration — journal d’activité (${nom})`);
      await adm.close();
    }
  }

  // -------------------------------------------------------------------------------------------------------------------
  // 3. Passe anglaise.
  const enCompte = await open(owner.ctx, "/parametres", "en");
  await enCompte.locator("[data-account-history] [data-journal-table]").waitFor();
  check("anglais : html lang=en", (await enCompte.evaluate(() => document.documentElement.lang)) === "en");
  const enHist = await enCompte.locator("[data-account-history]").innerText();
  check("anglais : « My history » et libellés d’actions traduits", enHist.includes("My history") && enHist.includes("Member added to the project") && !enHist.includes("Mon historique") && !enHist.includes("Membre ajouté"), enHist.slice(0, 200));
  await axe(enCompte, "Mon compte — Mon historique (anglais)");
  await enCompte.close();
  const enCollab = await open(owner.ctx, `/projets/${pid}?module=collaboration`, "en");
  await enCollab.locator("[data-historique-projet] [data-journal-table]").waitFor();
  const enSection = await enCollab.locator("[data-historique-projet]").innerText();
  check("anglais : section « History » du projet traduite", /History/.test(enSection) && enSection.includes("Invitation sent") && !enSection.includes("Invitation envoyée"), enSection.slice(0, 200));
  await enCollab.close();
  if (adminReady) {
    const enAdm = await open(admin.ctx, "/admin/journal", "en");
    await enAdm.locator("[data-admin-journal] [data-journal-table]").waitFor();
    const enText = await enAdm.locator("[data-admin-journal]").innerText();
    // (Le nom du projet de la recette, donnée affichée telle quelle, contient « Journal d’activité ».)
    const restes = ["Administration — journal", "Type de cible", "Filtrer","Afficher plus", "Acteur", "Export non disponible"].filter((t) => enText.includes(t));
    check("anglais : journal d’administration traduit", enText.includes("Administration — activity log") && enText.includes("Export not available") && restes.length === 0,
      `restes : ${restes.join(", ")} · ${enText.match(/Export[^\n]*/)?.[0] ?? "pas de mention d’export"}`);
    await axe(enAdm, "administration — journal d’activité (anglais)");
    await enAdm.close();
  }

  check("aucune erreur JavaScript dans les pages", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("recette menée à son terme", false, err instanceof Error ? err.stack ?? err.message : String(err));
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
}

console.log(failures ? `\n${failures} contrôle(s) en échec` : "\n✅ journal d’activité et historique vérifiés");
process.exit(failures ? 1 : 0);
