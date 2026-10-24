#!/usr/bin/env node
/**
 * Recette des règles communes de collaboration — écarts graves E1, E2, E3 (cadrage de la PR #273, demande du maître
 * d'ouvrage du 2026-10-24), par l'API et l'interface réelles. Comptes (propriétaire, éditeur, lecteur) et projet
 * synthétiques créés par les vraies routes.
 *   1. E1 audience : un commentaire du propriétaire est réservé à l'équipe par défaut ; « Visible par les lecteurs »
 *      l'ouvre au lecteur. Le lecteur ne reçoit la note interne sur aucune route (liste, fil d'étape, vue Collaboration,
 *      journal, historique, notifications, Studio : fil, observation, détail) ; l'éditeur la lit ; le changement
 *      d'audience par le propriétaire est journalisé.
 *   2. E2 export : un nouveau lecteur n'exporte pas (archive, copie) ; le propriétaire le lui accorde
 *      depuis l'écran des membres.
 *   3. E3 journal : chaque changement d'accès laisse son entrée (vérifiée par la base quand DATABASE_URL est donnée).
 *   4. Interface : le formulaire porte « Visible par les lecteurs » ; le lecteur ne voit dans Collaboration que le fil
 *      ouvert ; la case « Export » des membres accorde l'export. Règle d'or : chaque commande porte son icône et son
 *      raccourci (Alt+Maj+1 audience à la rédaction, Alt+Maj+2 bascule d'un fil, Alt+Maj+3 export du lecteur),
 *      exercés ici au clavier.
 *   5. E7 (CR-D5 (a)) : le lecteur retiré du projet recharge la page ; la copie locale du projet (cache persistant
 *      IndexedDB) est oubliée.
 *
 * BASE_URL=http://localhost:3001 [DATABASE_URL=…] node apps/web/e2e/collaboration-audience.mjs
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
const credentials = (n) => ({ email: `audience-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const owner = client(), editor = client(), reader = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cReader = credentials("l");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [reader, cReader]]) check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
const idOf = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const ids = { owner: await idOf(owner), editor: await idOf(editor), reader: await idOf(reader) };
const project = await owner("POST", "/projects", { code: `AU_${randomUUID().slice(0, 6)}`, name: "Audience et export (recette synthétique)" });
const pid = project.body?.id;
check("projet créé", project.status === 201, String(project.status));
check("éditeur et lecteur ajoutés", (await owner("POST", `/projects/${pid}/members`, { email: cEditor.email, role: "editeur" })).status === 201
  && (await owner("POST", `/projects/${pid}/members`, { email: cReader.email, role: "lecteur" })).status === 201);

// ---------------------------------------------------------------------------
// 1. E1 — commentaires du projet.
const com = `/projects/${pid}/collaboration/comments`;
const NOTE = "Note interne de recette : marge à négocier";
const interne = await owner("POST", com, { body: NOTE, stepNumber: 4 });
const ouvert = await owner("POST", com, { body: "Question ouverte de recette : date de visite ?", audience: "projet" });
check("E1 défaut : réservé à l'équipe ; choix explicite « projet »", interne.body?.audience === "equipe" && ouvert.body?.audience === "projet", `${interne.body?.audience} ${ouvert.body?.audience}`);
const contient = (r) => JSON.stringify(r.body ?? "").includes(NOTE);
const lectures = {
  liste: await reader("GET", com), etape: await reader("GET", `${com}?step=4`), collaboration: await reader("GET", `/projects/${pid}/collaboration`),
  historique: await reader("GET", `/projects/${pid}/history`), notifications: await reader("GET", "/notifications"),
};
for (const [route, r] of Object.entries(lectures)) check(`E1 lecteur : la note interne est absente (${route})`, r.status === 200 && !contient(r), `${r.status}`);
check("E1 lecteur : le fil ouvert est lu", lectures.liste.body?.some?.((c) => c.id === ouvert.body?.id));
check("E1 lecteur : ni réponse, ni changement, ni suppression du fil interne (404)", (await reader("POST", com, { body: "x", parentId: interne.body?.id })).status === 404
  && (await reader("PATCH", `${com}/${interne.body?.id}`, { audience: "projet" })).status === 404 && (await reader("DELETE", `${com}/${interne.body?.id}`)).status === 404);
check("E1 éditeur : lit la note interne et en est notifié", contient(await editor("GET", com)) && contient(await editor("GET", "/notifications")));
check("E1 lecteur : écrit pour tout le projet, jamais pour l'équipe", (await reader("POST", com, { body: "Lu." })).body?.audience === "projet"
  && (await reader("POST", com, { body: "x", audience: "equipe" })).body?.error === "audience_interdite");

// Studio : fil, observation, détail.
const etude = await owner("POST", `/projects/${pid}/studio/studies`, { name: "Étude audience" });
const vp = `/projects/${pid}/studio/studies/${etude.body?.study?.id}/variants/${etude.body?.variant?.id}`;
const sInterne = await owner("POST", `${vp}/comments`, { body: "Studio interne de recette" });
const obs = await owner("POST", `${vp}/observations`, { body: "Observation interne de recette", responsableId: ids.editor });
check("E1 Studio : fil et observation réservés à l'équipe par défaut", sInterne.body?.audience === "equipe" && obs.status === 201);
check("E1 Studio lecteur : ni le fil, ni l'observation, ni son détail", !(await reader("GET", `${vp}/comments`)).body?.comments?.some((c) => c.id === sInterne.body?.id || c.id === obs.body?.id)
  && (await reader("GET", `${vp}/observations`)).body?.observations?.length === 0 && (await reader("GET", `${vp}/observations/${obs.body?.id}`)).status === 404);
const notesLecteur = JSON.stringify((await reader("GET", "/notifications")).body);
check("E1 Studio lecteur : aucune notification ni extrait des fils de l'équipe", !notesLecteur.includes("Studio interne de recette") && !notesLecteur.includes("Observation interne de recette"));
check("E1 Studio éditeur : notifié du fil de l'équipe", JSON.stringify((await editor("GET", "/notifications")).body).includes("Studio interne de recette"));
check("E1 Studio éditeur : lit l'observation qui lui est confiée", (await editor("GET", `${vp}/observations/${obs.body?.id}`)).status === 200);

// ---------------------------------------------------------------------------
// 2. E2 — export du lecteur (archive, copie) ; l'accord du propriétaire passe par l'interface (section 3).
check("E2 lecteur sans export par défaut : archive 403, copie 403", (await reader("GET", `/projects/${pid}/archive`)).status === 403 && (await reader("POST", `/projects/${pid}/copies`, {})).status === 403);
check("E2 éditeur : exporte toujours", (await editor("GET", `/projects/${pid}/archive`)).status === 200);
const accesLecteur = (await reader("GET", `/projects/${pid}/collaboration`)).body?.access;
check("E2 lecteur : droit relu (canExport false)", accesLecteur?.role === "lecteur" && accesLecteur?.canExport === false, JSON.stringify(accesLecteur));

/** axe-core (WCAG 2.2 AA) sans violation critique ni sérieuse — cases de 24 px au moins comprises (target-size). */
async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}

// ---------------------------------------------------------------------------
// 3. Interface.
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
const pOwner = await session(cOwner);
await pOwner.goto(`${BASE}/projets/${pid}?module=collaboration`);
await pOwner.waitForSelector("#collab-comments", { timeout: 20000 });
const formulaire = pOwner.locator("section[aria-labelledby='collab-comments'] form.comment-form").last();
check("interface propriétaire : « Visible par les lecteurs » au formulaire, décoché", await formulaire.locator("[data-comment-audience]").count() === 1 && !(await formulaire.locator("[data-comment-audience]").isChecked()));
check("règle d'or : chaque commande du propriétaire porte son icône, son raccourci affiché et déclaré",
  await pOwner.evaluate(() => ["visible-lecteurs", "rendre-visible", "export-lecteur"].every((c) => {
    const el = document.querySelector(`[data-commande-collaboration="${c}"]`);
    const bloc = el?.closest("label, button") ?? el;
    return el?.getAttribute("aria-keyshortcuts")?.startsWith("Alt+Shift+") && bloc?.querySelector(".collab-icon") && bloc?.querySelector(".collab-raccourci");
  })));
await formulaire.locator("textarea").fill("Fil ouvert écrit dans l'interface");
await formulaire.locator("textarea").focus();
await pOwner.keyboard.press("Alt+Shift+Digit1");
check("raccourci Alt+Maj+1 : la rédaction devient « Visible par les lecteurs »", await formulaire.locator("[data-comment-audience]").isChecked());
await formulaire.locator("button[type=submit]").click();
await pOwner.waitForFunction(() => [...document.querySelectorAll(".comment")].some((li) => li.textContent?.includes("Fil ouvert écrit dans l'interface")), null, { timeout: 15000 });
const fil = pOwner.locator(".comment", { hasText: "Fil ouvert écrit dans l'interface" }).first();
check("interface propriétaire : le fil porte « Visible par les lecteurs »", (await fil.locator(".comment-audience").getAttribute("data-audience")) === "projet");
const filInterne = pOwner.locator(`.comment[data-comment="${interne.body?.id}"]`);
check("interface propriétaire : la note interne porte « Équipe » et un bouton « Rendre visible aux lecteurs »", (await filInterne.locator(".comment-audience").getAttribute("data-audience")) === "equipe"
  && (await filInterne.locator(`[data-audience-toggle="${interne.body?.id}"]`).count()) === 1);
await axe(pOwner, "Collaboration du propriétaire (case d'audience, colonne Export)");
// Export accordé depuis l'écran des membres.
const ligne = pOwner.locator(`.members-table tr[data-member="${cReader.email}"]`);
await ligne.waitFor({ timeout: 10000 });
check("interface propriétaire : export « non accordé » au lecteur", (await ligne.locator("[data-member-export]").getAttribute("data-member-export")) === "non");
await ligne.locator("[data-member-export] input[type=checkbox]").focus();
await pOwner.keyboard.press("Alt+Shift+Digit3"); // raccourci de la ligne ; case pilotée par la réponse du serveur
await pOwner.waitForFunction((email) => document.querySelector(`.members-table tr[data-member="${email}"] [data-member-export]`)?.getAttribute("data-member-export") === "oui", cReader.email, { timeout: 10000 });
check("interface propriétaire : export accordé au lecteur (raccourci Alt+Maj+3)", (await ligne.locator("[data-member-export]").getAttribute("data-member-export")) === "oui");
check("E2 lecteur : l'archive s'exporte après l'accord", (await reader("GET", `/projects/${pid}/archive`)).status === 200);

const pReader = await session(cReader);
await pReader.goto(`${BASE}/projets/${pid}?module=collaboration`);
await pReader.waitForSelector("#collab-comments", { timeout: 20000 });
await pReader.waitForFunction(() => [...document.querySelectorAll(".comment")].some((li) => li.textContent?.includes("Fil ouvert écrit dans l'interface")), null, { timeout: 15000 });
const texteLecteur = await pReader.locator(".collaboration-module").textContent();
check("interface lecteur : les fils ouverts sont lus, la note interne n'apparaît nulle part (commentaires, journal)", texteLecteur.includes("Question ouverte de recette") && !texteLecteur.includes(NOTE));
check("interface lecteur : pas de choix d'audience, avis « lisible par tous les membres »", (await pReader.locator("[data-comment-audience]").count()) === 0 && /lisible par tous les membres du projet/.test(texteLecteur));
check("interface lecteur : aucun bouton de changement d'audience", (await pReader.locator(".comment-audience-toggle").count()) === 0);
await axe(pReader, "Collaboration du lecteur");

// Changement d'audience par le propriétaire dans l'interface : le lecteur lit ensuite le fil.
await filInterne.locator(`[data-audience-toggle="${interne.body?.id}"]`).focus();
await pOwner.keyboard.press("Alt+Shift+Digit2");
await pOwner.waitForFunction((id) => document.querySelector(`.comment[data-comment="${id}"] .comment-audience`)?.getAttribute("data-audience") === "projet", interne.body?.id, { timeout: 10000 });
check("E1 changement d'audience (raccourci Alt+Maj+2) : le lecteur lit désormais le fil", contient(await reader("GET", com)));

// E7 (CR-D5 (a)) : la copie locale d'un projet retiré est oubliée au premier refus du serveur.
const copieLocale = (page) => page.evaluate(() => new Promise((ok) => {
  const ouverture = indexedDB.open("fadi-local");
  ouverture.onerror = () => ok("");
  ouverture.onsuccess = () => {
    const lecture = ouverture.result.transaction("keyValue").objectStore("keyValue").getAll();
    lecture.onsuccess = () => ok(JSON.stringify(lecture.result));
    lecture.onerror = () => ok("");
  };
}));
await pReader.waitForTimeout(600); // écriture regroupée du cache persistant (200 ms)
check("E7 avant retrait : la copie locale du lecteur contient le fil ouvert", (await copieLocale(pReader)).includes("Question ouverte de recette"));
check("E7 : le propriétaire retire le lecteur", (await owner("DELETE", `/projects/${pid}/members/${ids.reader}`)).status === 204);
await pReader.reload();
await pReader.waitForFunction(async (texte) => {
  const v = await new Promise((ok) => { const o = indexedDB.open("fadi-local"); o.onsuccess = () => { const r = o.result.transaction("keyValue").objectStore("keyValue").getAll(); r.onsuccess = () => ok(JSON.stringify(r.result)); }; o.onerror = () => ok(""); });
  return !v.includes(texte);
}, "Question ouverte de recette", { timeout: 15000, polling: 500 }).catch(() => undefined);
check("E7 après retrait : la copie locale du projet est oubliée (aucun fil, aucune note)", !(await copieLocale(pReader)).includes("Question ouverte de recette") && !(await copieLocale(pReader)).includes(NOTE));
check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
await browser.close();

// ---------------------------------------------------------------------------
// 4. E3 — journal (base de la recette, quand elle est donnée).
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  const journal = (await sql.query("SELECT action, metadata FROM admin.audit_log WHERE target_type = 'project' AND target_id = $1 ORDER BY id", [pid])).rows;
  await sql.end();
  const actions = journal.map((e) => e.action);
  check("E3 journal : deux ajouts, l'export accordé, le changement d'audience et le retrait", JSON.stringify(actions) === JSON.stringify(["project.member.added", "project.member.added", "project.member.export_changed", "comment.audience_changed", "project.member.removed"]), JSON.stringify(actions));
  check("E3 journal : membre visé et avant → après, sans adresse", journal[2]?.metadata?.memberId === ids.reader && journal[2]?.metadata?.canExportBefore === false && journal[2]?.metadata?.canExportAfter === true && !JSON.stringify(journal).includes("@example.test"));
} else console.log("E3 journal : NON EXÉCUTÉ (DATABASE_URL absente) — couvert par app.test.ts (DB-3).");

console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette des règles communes (E1, E2, E3) : tout est vert.");
process.exit(echecs ? 1 : 0);
