#!/usr/bin/env node
/**
 * Recette des règles communes de collaboration — écarts E5, E6 et E10 (CR-C2, demande du maître d'ouvrage du
 * 2026-10-24), par l'API et l'interface réelles. Comptes (propriétaire, éditeur, lecteur) et projet synthétiques créés
 * par les vraies routes.
 *   1. E5 : sans affectation, ni l'éditeur ni le lecteur n'approuvent une publication Studio soumise ; le propriétaire
 *      désigne le lecteur Approbateur (il approuve, ne diffuse pas) et l'éditeur Diffuseur (il diffuse) ; le journal de
 *      la publication porte la base d'autorité de chaque transition.
 *   2. E10 : le gardien du contenu est déclaré, sans aucun droit (ni écriture, ni export).
 *   3. E6 : le retrait de l'éditeur libère sa réservation d'édition ; l'observation qu'il portait reste à lui et est
 *      listée « à réattribuer » au propriétaire.
 *   4. Interface : colonne « Affectations » de l'écran des membres ; règle d'or — chaque commande porte son icône et son
 *      raccourci (Alt+Maj+4 Approbateur, Alt+Maj+5 Diffuseur, Alt+Maj+6 Gardien du contenu), exercés ici au clavier ;
 *      liste « Responsabilités à réattribuer » ; journal Studio « au titre d'approbateur désigné » ; axe-core.
 *   5. Journal des accès relu en base quand DATABASE_URL est donnée.
 *
 * BASE_URL=http://localhost:3001 [DATABASE_URL=…] node apps/web/e2e/collaboration-affectations.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
const credentials = (n) => ({ email: `affect-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const owner = client(), editor = client(), reader = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cReader = credentials("l");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [reader, cReader]]) check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
const idOf = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const ids = { owner: await idOf(owner), editor: await idOf(editor), reader: await idOf(reader) };
const project = await owner("POST", "/projects", { code: `AF_${randomUUID().slice(0, 6)}`, name: "Affectations (recette synthétique)" });
const pid = project.body?.id;
check("projet créé", project.status === 201, String(project.status));
check("éditeur et lecteur ajoutés", (await owner("POST", `/projects/${pid}/members`, { email: cEditor.email, role: "editeur" })).status === 201
  && (await owner("POST", `/projects/${pid}/members`, { email: cReader.email, role: "lecteur" })).status === 201);
const etude = await owner("POST", `/projects/${pid}/studio/studies`, { name: "Étude des affectations" });
check("étude Studio créée", etude.status === 201, String(etude.status));
const study = etude.body?.study?.id, variant = etude.body?.variant?.id;
const vp = `/projects/${pid}/studio/studies/${study}/variants/${variant}`;
const sp = `/projects/${pid}/studio/studies/${study}/publications`;
const presente = (v) => ({ manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash });

// ---------------------------------------------------------------------------
// 1. E5 — Approbateur et Diffuseur (API).
const pub = await editor("POST", `${vp}/publications`, { title: "Dossier R03", contenu: "dessin-2d" });
const soumis = await editor("POST", `${sp}/${pub.body?.id}/soumettre`, {});
check("E5 : publication préparée et soumise par l'éditeur", pub.status === 201 && soumis.status === 200, `${pub.status} ${soumis.status}`);
for (const [nom, c] of [["éditeur", editor], ["lecteur", reader]]) {
  const r = await c("POST", `${sp}/${pub.body.id}/approuver`, presente(soumis.body));
  check(`E5 : sans affectation, le ${nom} n'approuve pas (403)`, r.status === 403, String(r.status));
}
check("E5 : un éditeur ne désigne pas d'approbateur (403)", (await editor("PATCH", `/projects/${pid}/members/${ids.reader}`, { approbateur: true })).status === 403);

// ---------------------------------------------------------------------------
// 2. Interface : affectations au clavier (règle d'or).
async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
async function session(cred) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  const r = await page.request.post(`${BASE}/auth/login`, { data: cred, headers: { origin: BASE } });
  check(`interface : connexion (${cred.email.split("-")[1]})`, r.status() === 200, String(r.status()));
  return page;
}
const affectationsDe = async (page, email) => (await page.locator(`tr[data-member="${email}"] [data-member-affectations]`).getAttribute("data-member-affectations")) ?? "";
async function attendreAffectations(page, email, attendu) {
  try {
    await page.waitForFunction(([e, a]) => document.querySelector(`tr[data-member="${e}"] [data-member-affectations]`)?.getAttribute("data-member-affectations") === a, [email, attendu], { timeout: 10000 });
  } catch { /* le contrôle suivant rend le constat */ }
  return affectationsDe(page, email);
}
const pOwner = await session(cOwner);
await pOwner.goto(`${BASE}/projets/${pid}?module=collaboration`);
await pOwner.waitForSelector(`tr[data-member="${cReader.email}"]`, { timeout: 20000 });
check("règle d'or : Approbateur, Diffuseur et Gardien du contenu portent chacun leur icône, leur raccourci affiché et déclaré",
  await pOwner.evaluate((email) => ["approbateur", "diffuseur", "gardien-contenu"].every((c, i) => {
    const el = document.querySelector(`tr[data-member="${email}"] [data-commande-collaboration="${c}"]`);
    const bloc = el?.closest("label");
    return el?.getAttribute("aria-keyshortcuts") === `Alt+Shift+${i + 4}` && bloc?.querySelector(`[data-icone-collaboration="${c}"]`) && bloc?.querySelector(".collab-raccourci")?.textContent === `Alt+Maj+${i + 4}`;
  }), cReader.email));
await axe(pOwner, "membres du propriétaire (colonne Affectations)");
await pOwner.locator(`tr[data-member="${cReader.email}"] select`).focus();
await pOwner.keyboard.press("Alt+Shift+Digit4");
check("interface : Alt+Maj+4 désigne le lecteur Approbateur", (await attendreAffectations(pOwner, cReader.email, "approbateur")) === "approbateur", await affectationsDe(pOwner, cReader.email));
await pOwner.locator(`tr[data-member="${cEditor.email}"] select`).focus();
await pOwner.keyboard.press("Alt+Shift+Digit5");
check("interface : Alt+Maj+5 désigne l'éditeur Diffuseur", (await attendreAffectations(pOwner, cEditor.email, "diffuseur")) === "diffuseur", await affectationsDe(pOwner, cEditor.email));
await pOwner.locator(`tr[data-member="${cReader.email}"] select`).focus();
await pOwner.keyboard.press("Alt+Shift+Digit6");
check("interface : Alt+Maj+6 déclare le lecteur gardien du contenu", (await attendreAffectations(pOwner, cReader.email, "approbateur gardien")) === "approbateur gardien", await affectationsDe(pOwner, cReader.email));

// ---------------------------------------------------------------------------
// 3. E5 et E10 après les affectations (API).
const vueLecteur = await reader("GET", `${sp}/${pub.body.id}`);
check("E5 : le lecteur approbateur voit « approuver » et « refuser », rien d'autre", JSON.stringify(vueLecteur.body?.allowed) === JSON.stringify(["approuver", "refuser"]), JSON.stringify(vueLecteur.body?.allowed));
check("E5 : le lecteur approbateur approuve", (await reader("POST", `${sp}/${pub.body.id}/approuver`, presente(soumis.body))).status === 200);
check("E5 : l'approbateur ne diffuse pas (403)", (await reader("POST", `${sp}/${pub.body.id}/diffuser`, {})).status === 403);
check("E5 : le diffuseur (éditeur) diffuse", (await editor("POST", `${sp}/${pub.body.id}/diffuser`, {})).status === 200);
const evts = (await owner("GET", `${sp}/${pub.body.id}`)).body?.events ?? [];
check("E5 : base d'autorité de chaque transition au journal",
  JSON.stringify(evts.map((e) => `${e.action}:${e.authority?.base}:${e.authority?.role}`)) === JSON.stringify(["creer:role-projet:editeur", "soumettre:role-projet:editeur", "approuver:affectation:approbateur", "diffuser:affectation:diffuseur"]),
  JSON.stringify(evts.map((e) => [e.action, e.authority])));
check("E10 : le gardien du contenu n'écrit pas (403)", (await reader("PATCH", `/projects/${pid}/steps/2`, { fields: { f1: "x" } })).status === 403);
check("E10 : le gardien du contenu n'exporte pas (403)", (await reader("GET", `/projects/${pid}/archive`)).status === 403);

// Journal Studio dans l'interface : « au titre d'approbateur désigné ».
await pOwner.goto(`${BASE}/studio/projets/${pid}/etudes/${study}`);
try {
  await pOwner.locator(".studio-publication-journal-bouton").first().click({ timeout: 20000 });
  await pOwner.waitForSelector("[data-studio-publication-autorite='approbateur']", { timeout: 10000 });
} catch { /* constat ci-dessous */ }
check("interface : le journal de la publication affiche la base d'autorité", await pOwner.locator("[data-studio-publication-autorite='approbateur']").count() === 1
  && (await pOwner.locator("[data-studio-publication-autorite='approbateur']").textContent())?.includes("au titre d’approbateur désigné"));

// ---------------------------------------------------------------------------
// 4. E6 — fin de participation (API puis interface).
check("E6 : l'éditeur réserve l'édition", (await editor("PUT", `/projects/${pid}/lock`)).status === 200);
const obs = await owner("POST", `${vp}/observations`, { body: "Reprendre l'acrotère", responsableId: ids.editor });
check("E6 : observation confiée à l'éditeur", obs.status === 201, String(obs.status));
check("E6 : réservation de l'éditeur → le propriétaire est bloqué (423)", (await owner("PATCH", `/projects/${pid}/steps/2`, { fields: { f1: "x" } })).status === 423);
check("E6 : retrait de l'éditeur", (await owner("DELETE", `/projects/${pid}/members/${ids.editor}`)).status === 204);
check("E6 : réservation libérée par le retrait", (await owner("GET", `/projects/${pid}/lock`)).body?.lock === null);
check("E6 : le propriétaire écrit de nouveau", (await owner("PATCH", `/projects/${pid}/steps/2`, { fields: { f1: "y" } })).status === 200);
const liste = (await owner("GET", `/projects/${pid}/members`)).body?.aReattribuer ?? [];
check("E6 : l'observation reste à l'éditeur, listée à réattribuer", liste.length === 1 && liste[0].id === obs.body?.id && liste[0].responsable?.id === ids.editor, JSON.stringify(liste));
check("E6 : la liste n'est pas montrée au lecteur", (await reader("GET", `/projects/${pid}/members`)).body?.aReattribuer === undefined);
await pOwner.goto(`${BASE}/projets/${pid}?module=collaboration`);
try { await pOwner.waitForSelector("[data-a-reattribuer] [data-responsabilite='observation']", { timeout: 20000 }); } catch { /* constat ci-dessous */ }
check("interface : « Responsabilités à réattribuer » liste l'observation et renvoie vers Studio",
  await pOwner.locator("[data-a-reattribuer] [data-responsabilite='observation']").count() === 1
  && (await pOwner.locator("[data-a-reattribuer] a").first().getAttribute("href"))?.startsWith(`/studio/projets/${pid}/`));
await axe(pOwner, "membres du propriétaire (responsabilités à réattribuer)");
// Passe anglaise (D-163) : les nouveaux textes de l'écran des membres sont traduits.
await pOwner.evaluate(() => localStorage.setItem("fadi.langue", "en"));
await pOwner.reload();
try { await pOwner.waitForSelector("[data-a-reattribuer]", { timeout: 20000 }); await pOwner.waitForFunction(() => document.documentElement.lang === "en" || document.body.innerText.includes("Assignments"), null, { timeout: 10000 }); } catch { /* constat ci-dessous */ }
const texte = await pOwner.evaluate(() => document.querySelector(".members-panel")?.innerText ?? "");
const attendus = ["Assignments", "Approver", "Publisher", "Content custodian", "Responsibilities to reassign", "Open in Studio", "Alt+Shift+4"];
const restes = ["Affectations", "Approbateur", "Diffuseur", "Gardien du contenu", "Responsabilités à réattribuer", "Ouvrir dans Studio", "Alt+Maj+4"];
check("interface anglaise : affectations et responsabilités traduites", attendus.every((t) => texte.includes(t)) && restes.every((t) => !texte.includes(t)),
  `manquants : ${attendus.filter((t) => !texte.includes(t)).join(", ")} ; restés : ${restes.filter((t) => texte.includes(t)).join(", ")}`);
await pOwner.evaluate(() => localStorage.removeItem("fadi.langue"));
check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
await browser.close();

// ---------------------------------------------------------------------------
// 5. Journal (base de la recette, quand elle est donnée).
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  const journal = (await sql.query("SELECT action, metadata FROM admin.audit_log WHERE target_type = 'project' AND target_id = $1 ORDER BY id", [pid])).rows;
  await sql.end();
  const affect = journal.filter((e) => e.action === "project.member.assignment_changed").map((e) => `${e.metadata.assignment}:${e.metadata.after}`);
  check("journal : trois affectations écrites", JSON.stringify(affect) === JSON.stringify(["approbateur:true", "diffuseur:true", "gardien:true"]), JSON.stringify(affect));
  const retrait = journal.find((e) => e.action === "project.member.removed");
  check("journal : le retrait note la réservation libérée, sans adresse", retrait?.metadata?.releasedEditingLock === true && !JSON.stringify(journal).includes("@example.test"), JSON.stringify(retrait?.metadata));
} else console.log("journal : NON EXÉCUTÉ (DATABASE_URL absente) — couvert par app.test.ts (DB-3).");

console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette des règles communes (E5, E6, E10) : tout est vert.");
process.exit(echecs ? 1 : 0);
