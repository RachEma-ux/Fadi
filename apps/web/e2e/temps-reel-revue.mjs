#!/usr/bin/env node
/**
 * Recette de la revue en direct sur une publication figée (RTC-4, Issue #283 ; RT-D5 § 8 ; critères RT-R1, RT-R2,
 * RT-R7 ; tests TR-T05 et TR-T06 dans la limite des rôles de projet actuels) : le propriétaire et un lecteur.
 *
 *   1. Publication « Dossier R03 » (manifeste figé) sur r1, puis r2 enregistrée : la tête avance.
 *   2. Ctrl+Alt+Maj+U ouvre la revue : portée `paquet-revue`, révision publiée épinglée, mention « revue figée ».
 *   3. Le lecteur rejoint et affiche la révision publiée (jamais la tête) ; une nouvelle révision n'est pas annoncée ;
 *      changer la révision de la revue est refusé (409).
 *   4. Note de l'équipe jamais servie au lecteur ; note visible reçue.
 *   5. L'hôte (le lecteur, après transmission) n'en tire aucun droit : approbation refusée (403) ; aucune commande
 *      d'export ni d'approbation dans le bandeau.
 *   6. Refus à l'ouverture : publication d'une autre variante (404), révision différente de la publiée (422).
 *   7. Règle d'or, axe-core, passe anglaise ; clôture ; aucune erreur JavaScript.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/temps-reel-revue.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
const erreurs = [];
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function compte(nom, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  const api = async (method, path, data) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, "content-type": "application/json" }, ...(data === undefined ? {} : { data }) });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  return { nom, context, page, api };
}
const credentials = (n) => ({ email: `trv-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const viewBox = (page) => page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).getAttribute("viewBox");
const bandeau = (page) => page.locator("[data-tr-bandeau]");
/** Hors session : ouvre l'entrée « En direct » de la barre de l'espace (panneau des sessions). */
async function ouvrirEntree(page) {
  const b = page.locator("[data-tr-entree-bouton]");
  await b.waitFor();
  if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
}
/** Hors session : ouvre l'entrée, puis rejoint la première session (sinon, déjà connecté). */
async function rejoindre(page) {
  await page.locator('[data-tr-entree-bouton], [data-tr-connexion="connecte"]').first().waitFor();
  if (await page.locator('[data-tr-connexion="connecte"]').count()) return;
  await ouvrirEntree(page);
  await page.locator('[data-tr-session] button[data-commande-collaboration="rejoindre-session"]').first().click();
  await page.locator('[data-tr-connexion="connecte"]').waitFor();
}
async function attendreQue(f, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async () => (await window.axe.run(document.querySelector("[data-tr-bandeau]") ?? document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id));
  check(`axe-core : aucune violation grave (${nom})`, r.length === 0, r.join(", "));
}

const A = await compte("proprietaire"), B = await compte("lecteur");
try {
  const cA = credentials("p"), cB = credentials("l");
  check("comptes créés", (await A.api("POST", "/auth/register", cA)).status === 201 && (await B.api("POST", "/auth/register", cB)).status === 201);
  const moiB = (await B.api("GET", "/auth/me")).body;
  const idB = moiB?.user?.id ?? moiB?.id;
  const projet = (await A.api("POST", "/projects", { code: `TRV_${randomUUID().slice(0, 6)}`, name: "Revue en direct (recette synthétique)" })).body;
  check("lecteur ajouté", (await A.api("POST", `/projects/${projet.id}/members`, { email: cB.email, role: "lecteur" })).status === 201);
  const etude = (await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude revue" })).body;
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const pubs = `/projects/${projet.id}/studio/studies/${etude.study.id}/publications`;
  const r1 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trv-${randomUUID()}`, baseRevisionId: etude.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-a", type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
  ] })).body;
  const pub = await A.api("POST", `${chemin}/publications`, { title: "Dossier R03", requestId: `trv-${randomUUID()}` });
  check("publication au manifeste figé sur r1", pub.status === 201 && !!pub.body?.manifestHash && pub.body.revisionId === r1.revision.id, JSON.stringify(pub.body).slice(0, 200));
  const r2 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trv-${randomUUID()}`, baseRevisionId: r1.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-r04", type: "line", start: { x: 0, y: 6 }, end: { x: 6, y: 6 } } },
  ] })).body;
  check("r2 enregistrée : la tête avance après la publication", !!r2?.revision?.id);
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
  const tr = `/projects/${projet.id}/temps-reel`;
  for (const s of [A, B]) {
    await s.page.goto(url);
    await s.page.locator('svg [data-studio-objet="ligne-r04"]').waitFor({ state: "attached" });
  }

  // 2. Ouverture de la revue.
  await ouvrirEntree(A.page);
  const bouton = A.page.locator("[data-tr-bandeau] button[data-commande-collaboration=ouvrir-revue]");
  await bouton.waitFor();
  check("« Ouvrir une revue en direct » : icône propre, raccourci affiché et déclaré", (await bouton.locator("svg[data-icone-collaboration=ouvrir-revue]").count()) === 1
    && (await bouton.locator("kbd[data-raccourci-collaboration=ouvrir-revue]").count()) === 1 && (await bouton.getAttribute("aria-keyshortcuts")) === "Control+Alt+Shift+U");
  check("la publication figée est nommée", (await bandeau(A.page).innerText()).includes("Dossier R03"));
  await A.page.keyboard.press("Control+Alt+Shift+KeyU");
  await A.page.locator('[data-tr-connexion="connecte"]').waitFor();
  const sessionId = await bandeau(A.page).getAttribute("data-tr-session");
  const detail = (await A.api("GET", `${tr}/sessions/${sessionId}`)).body?.session;
  check("Ctrl+Alt+Maj+U : revue ouverte, portée paquet-revue, révision publiée épinglée", detail?.portee === "paquet-revue" && detail.publicationId === pub.body.id && detail.revisionId === r1.revision.id, JSON.stringify(detail));
  check("mention « revue figée » affichée", (await A.page.locator("[data-tr-revue-figee]").count()) === 1);
  check("aucun passage à la tête proposé dans une revue", (await A.page.locator("[data-tr-bandeau] [data-commande-collaboration=passer-revision]").count()) === 0);

  // 3. Le lecteur rejoint et affiche la révision publiée.
  await B.page.reload();
  await rejoindre(B.page);
  await B.page.locator("[data-tr-revision-differente]").waitFor();
  check("le lecteur voit que la revue montre la révision publiée, pas la tête", true);
  await B.page.locator("[data-tr-bandeau] button[data-commande-collaboration=afficher-revision-session]").click();
  await B.page.locator(`[data-studio-revision-vue="${r1.revision.id}"]`).waitFor();
  await B.page.locator('[data-tr-connexion="connecte"]').waitFor();
  check("affichage explicite de la révision publiée (R03) pendant que la tête est R04", (await B.page.locator('svg [data-studio-objet="ligne-r04"]').count()) === 0
    && (await B.page.locator('svg [data-studio-objet="ligne-a"]').count()) > 0);
  const r3 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trv-${randomUUID()}`, baseRevisionId: r2.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-r05", type: "line", start: { x: 0, y: 8 }, end: { x: 6, y: 8 } } },
  ] })).body;
  await new Promise((r) => setTimeout(r, 1200));
  check("nouvelle révision non annoncée dans une revue figée", !!r3?.revision?.id && (await B.page.locator("[data-tr-revision-disponible]").count()) === 0);
  const chg = await A.api("POST", `${tr}/sessions/${sessionId}/revision`, { revisionId: r3.revision.id });
  check("changer la révision d'une revue : refusé (409 revue_figee)", chg.status === 409 && chg.body?.error === "revue_figee", JSON.stringify(chg.body));

  const act = await A.api("POST", `${pubs}/${pub.body.id}/actualiser`, {});
  const apresAct = (await A.api("GET", `${tr}/sessions/${sessionId}`)).body?.session;
  check("publication actualisée pendant la revue : la revue reste sur R03 et le signale", act.status === 200 && apresAct?.revisionId === r1.revision.id && apresAct.publicationChangee === true,
    `${act.status} ${JSON.stringify(act.body).slice(0, 120)} ${JSON.stringify(apresAct)}`);
  await A.page.reload();
  await rejoindre(A.page);
  await A.page.locator("[data-tr-publication-changee]").waitFor({ timeout: 40_000 });
  check("l'écran de l'hôte affiche l'avis « la publication a changé »", true);

  // 4. Audiences.
  const vue = { affichage: "2d", plan: { x: 0, y: 0, w: 10, h: 6 } };
  const interne = await A.api("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Note interne de revue", requestId: `trv-${randomUUID()}`, vue });
  const visible = await A.api("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Remarque pour le lecteur", audience: "projet", requestId: `trv-${randomUUID()}`, vue });
  await B.page.locator("[data-tr-annotations-bouton]", { hasText: "Annotations (1)" }).waitFor();
  const luesB = (await B.api("GET", `${tr}/annotations?variantId=${etude.variant.id}`)).body?.annotations ?? [];
  check("revue : note de l'équipe jamais servie au lecteur, note visible reçue, ancrées à la révision publiée", interne.status === 201 && visible.status === 201
    && luesB.length === 1 && luesB[0].body === "Remarque pour le lecteur" && luesB[0].sourceRevisionId === r1.revision.id, JSON.stringify(luesB));

  // 5. L'hôte n'en tire aucun droit.
  check("l'animation est transmise au lecteur", (await A.api("POST", `${tr}/sessions/${sessionId}/hote`, { userId: idB })).status === 200);
  await B.page.locator("[data-tr-bandeau] button[data-commande-collaboration=clore-session]").waitFor();
  const appro = await B.api("POST", `${pubs}/${pub.body.id}/approuver`, { manifestHash: pub.body.manifestHash, revisionId: pub.body.revisionId, documentHash: pub.body.documentHash });
  check("TR-T06 : le lecteur hôte de la revue ne peut pas approuver (403)", appro.status === 403, String(appro.status));
  const commandesB = await B.page.locator("[data-tr-bandeau] [data-commande-collaboration]").evaluateAll((l) => l.map((e) => e.getAttribute("data-commande-collaboration")));
  check("aucune commande d'export ni d'approbation dans le bandeau", commandesB.length > 0 && !commandesB.some((c) => /export|approuv|diffus/.test(c ?? "")), commandesB.join(","));

  // 6. Refus à l'ouverture.
  const autre = (await A.api("POST", `/projects/${projet.id}/studio/studies/${etude.study.id}/variants`, { name: "Autre variante" })).body;
  const autreId = autre?.variant?.id ?? autre?.id;
  const o1 = await A.api("POST", `${tr}/sessions`, { studyId: etude.study.id, variantId: autreId, publicationId: pub.body.id, requestId: `trv-${randomUUID()}` });
  check("publication d'une autre variante : 404", o1.status === 404, `${o1.status} ${JSON.stringify(o1.body)}`);
  const o2 = await A.api("POST", `${tr}/sessions`, { studyId: etude.study.id, variantId: etude.variant.id, publicationId: pub.body.id, revisionId: r2.revision.id, requestId: `trv-${randomUUID()}` });
  check("révision différente de la publiée : 422", o2.status === 422, `${o2.status} ${JSON.stringify(o2.body)}`);

  // 7. Accessibilité, anglais, clôture.
  await axe(B.page, "bandeau de revue");
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "en"); });
  await B.page.reload();
  await rejoindre(B.page);
  const anglais = await bandeau(B.page).innerText();
  check("passe anglaise : la revue figée est traduite", anglais.includes("Frozen review") && !anglais.includes("Revue figée"), anglais);
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "fr"); });
  check("clôture par l'hôte (le lecteur)", (await B.api("POST", `${tr}/sessions/${sessionId}/clore`, {})).status === 200);
  await A.page.locator('[data-tr-connexion="session-close"]').waitFor();
  check("les participants voient la clôture", true);
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  check("déroulé sans erreur inattendue", false, e.message);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette de la revue en direct : tout est vert.");
process.exit(echecs ? 1 : 0);
