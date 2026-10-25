#!/usr/bin/env node
/**
 * Recette de la vue partagée Studio (RTC-2, Issue #283 ; critères RT-R2, RT-R3, RT-R7 ; tests TR-T03, TR-T16 partiel)
 * dans deux navigateurs réels : le propriétaire (hôte et présentateur) et un lecteur du projet. API, canal et base réels ;
 * drapeau `FADI_TEMPS_REEL=1`.
 *
 *   1. Bandeau « Sessions en direct » dans la variante ; ouverture par le propriétaire ; le lecteur rejoint.
 *   2. Toujours affichés : portée (variante, révision), qui voit, suivi, état de la connexion.
 *   3. Suivre : le cadre de la planche du lecteur suit celui du présentateur ; « Naviguer librement » (raccourci
 *      Ctrl+Alt+Maj+F) le libère ; le suivi revient par le bouton.
 *   4. Pointeur et sélection du présentateur visibles chez le lecteur, avec son nom ; jamais dans le document.
 *   5. Nouvelle révision enregistrée : annoncée, jamais appliquée ; l'hôte passe la session à cette révision ; le
 *      lecteur l'affiche explicitement.
 *   6. Règle d'or : chaque commande porte son icône, son raccourci affiché et déclaré ; axe-core sans violation grave ;
 *      passe anglaise du bandeau ; téléphone sans débordement horizontal.
 *   7. Le lecteur quitte la session ; l'hôte la clôt.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/temps-reel-studio.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { inviterEtAccepter } from "./lib-invitations.mjs";

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
const credentials = (n) => ({ email: `trs-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const viewBox = (page) => page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).getAttribute("viewBox");
const bandeau = (page) => page.locator("[data-tr-bandeau]");
/** Hors session : ouvre l'entrée « En direct » de la barre, puis rejoint la première session (sinon, déjà connecté). */
async function rejoindre(page) {
  await page.locator('[data-tr-entree-bouton], [data-tr-connexion="connecte"]').first().waitFor();
  if (await page.locator('[data-tr-connexion="connecte"]').count()) return;
  if ((await page.locator("[data-tr-entree-bouton]").getAttribute("aria-expanded")) !== "true") await page.locator("[data-tr-entree-bouton]").click();
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
  const projet = (await A.api("POST", "/projects", { code: `TRS_${randomUUID().slice(0, 6)}`, name: "Vue partagée (recette synthétique)" })).body;
  // Invitation acceptée (Issue #262, phase 3) : plus d'ajout direct d'un compte existant.
  check("lecteur ajouté", (await inviterEtAccepter(A.api, B.api, projet.id, cB.email, "lecteur")).ok);
  const etude = (await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude partagée" })).body;
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const r1 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trs-${randomUUID()}`, baseRevisionId: etude.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-a", type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
    { toolId: "studio.dessin.rectangle", params: { id: "rect-b", type: "rectangle", origin: { x: 2, y: 3 }, width: 4, height: 2 } },
  ] })).body;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
  for (const s of [A, B]) {
    await s.page.goto(url);
    await s.page.locator('svg [data-studio-objet="ligne-a"]').waitFor({ state: "attached" });
  }

  // 1. Ouverture et entrée.
  const vbAvantEntree = await A.page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).boundingBox();
  await A.page.locator("[data-studio-barre-espace] [data-tr-entree-bouton]").click();
  await bandeau(A.page).filter({ has: A.page.getByText("Sessions en direct", { exact: true }) }).waitFor();
  check("entrée « En direct » dans la barre de l'espace ; le panneau des sessions s'ouvre par-dessus", await bandeau(A.page).getAttribute("data-tr-bandeau") === "hors-session");
  const vbApresEntree = await A.page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).boundingBox();
  check("hors session, le canevas garde toute sa hauteur", Math.abs(vbApresEntree.height - vbAvantEntree.height) < 1 && Math.abs(vbApresEntree.y - vbAvantEntree.y) < 1, `${vbAvantEntree.height} → ${vbApresEntree.height}`);
  const ouvrir = A.page.getByRole("button", { name: /Ouvrir une session en direct/ });
  check("« Ouvrir une session » : icône propre et raccourci déclaré", (await ouvrir.locator("svg[data-icone-collaboration=ouvrir-session]").count()) === 1
    && (await ouvrir.getAttribute("aria-keyshortcuts")) === "Control+Alt+Shift+O");
  await ouvrir.click();
  await A.page.locator('[data-tr-connexion="connecte"]').waitFor();
  check("le propriétaire est connecté et présente", (await A.page.locator('[data-tr-suivi="presentateur"]').count()) === 1);
  await B.page.reload();
  await rejoindre(B.page);
  check("le lecteur rejoint et suit le présentateur", (await B.page.locator('[data-tr-suivi="suit"]').count()) === 1);
  await A.page.locator("[data-tr-participants-bouton]", { hasText: "Participants (2)" }).waitFor();
  check("présence : deux participants", true);

  // 2. Toujours affichés.
  const texteB = await bandeau(B.page).innerText();
  check("portée, révision, audience et connexion affichées", texteB.includes("Variante") && texteB.includes(r1.revision.id.slice(-8)) && texteB.includes("Visible par") && texteB.includes("Connecté"), texteB);

  // 3. Suivre puis naviguer librement.
  const planA = A.page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  await planA.hover();
  await A.page.mouse.wheel(0, -400);
  const vbA = await viewBox(A.page);
  check("le cadre du lecteur suit celui du présentateur", await attendreQue(async () => (await viewBox(B.page)) === vbA), `${vbA} / ${await viewBox(B.page)}`);
  await B.page.keyboard.press("Control+Alt+Shift+KeyF");
  await B.page.locator('[data-tr-suivi="libre"]').waitFor();
  check("Ctrl+Alt+Maj+F : navigation libre", true);
  const vbLibre = await viewBox(B.page);
  await planA.hover();
  await A.page.mouse.wheel(0, 300);
  await new Promise((r) => setTimeout(r, 800));
  check("navigation libre : la vue du lecteur ne bouge plus", (await viewBox(B.page)) === vbLibre);
  await B.page.getByRole("button", { name: /Suivre le présentateur/ }).click();
  await planA.hover();
  await A.page.mouse.wheel(0, -200);
  const vbA2 = await viewBox(A.page);
  check("suivi repris par le bouton", await attendreQue(async () => (await viewBox(B.page)) === vbA2));

  // 4. Pointeur et sélection.
  const box = await planA.boundingBox();
  await A.page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await A.page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
  check("pointeur du présentateur visible chez le lecteur, avec son nom", await attendreQue(async () => (await B.page.locator("[data-tr-pointeur]").count()) === 1)
    && ((await B.page.locator("[data-tr-pointeur] text").textContent()) ?? "").length > 0);
  await A.page.locator('svg [data-studio-objet="rect-b"]').first().click({ force: true });
  check("sélection du présentateur montrée chez le lecteur", await attendreQue(async () => (await B.page.locator('[data-tr-selection-distante="rect-b"]').count()) === 1));
  check("la surimpression n'est pas une donnée du document", (await B.page.locator('[data-tr-superposition] [data-studio-objet]').count()) === 0);

  // 5. Révision : annoncée, passée par l'hôte, affichée explicitement.
  const r2 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trs-${randomUUID()}`, baseRevisionId: r1.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-c", type: "line", start: { x: 0, y: 6 }, end: { x: 6, y: 6 } } },
  ] })).body;
  await B.page.locator(`[data-tr-revision-disponible="${r2.revision.id}"]`).waitFor();
  check("nouvelle révision annoncée au lecteur, sans bascule", (await B.page.locator('svg [data-studio-objet="ligne-c"]').count()) === 0);
  await A.page.getByRole("button", { name: /Passer la session à la nouvelle révision/ }).click();
  await B.page.locator("[data-tr-revision-differente]").waitFor();
  check("le lecteur voit que la session montre une autre révision", true);
  await B.page.getByRole("button", { name: /Afficher la révision de la session/ }).click();
  await B.page.locator('svg [data-studio-objet="ligne-c"]').waitFor({ state: "attached" });
  check("affichage explicite : la nouvelle révision est montrée, la session continue", (await B.page.locator('[data-tr-connexion="connecte"]').count()) === 1
    && (await B.page.locator("[data-tr-revision-differente]").count()) === 0);

  // 6. Règle d'or, accessibilité, anglais, téléphone.
  const commandes = B.page.locator("[data-tr-bandeau] button[data-commande-collaboration]");
  const n = await commandes.count();
  let completes = 0;
  for (let i = 0; i < n; i++) {
    const b = commandes.nth(i);
    const c = await b.getAttribute("data-commande-collaboration");
    if ((await b.locator(`svg[data-icone-collaboration="${c}"]`).count()) === 1 && (await b.locator(`kbd[data-raccourci-collaboration="${c}"]`).count()) === 1 && /^Control\+Alt\+Shift\+[A-Z]$/.test((await b.getAttribute("aria-keyshortcuts")) ?? "")) completes += 1;
  }
  check("règle d'or : chaque commande du bandeau a son icône et son raccourci affiché et déclaré", n > 0 && completes === n, `${completes}/${n}`);
  await B.page.locator("[data-tr-participants-bouton]", { hasText: "Participants (2)" }).click();
  await axe(B.page, "bandeau et participants");
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "en"); });
  await B.page.reload();
  await rejoindre(B.page);
  const anglais = await bandeau(B.page).innerText();
  check("passe anglaise : le bandeau est traduit", anglais.includes("Live") && anglais.includes("Connected") && !anglais.includes("Connecté") && !anglais.includes("Quitter"), anglais);
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "fr"); });
  const T = await compte("telephone", { width: 390, height: 844 });
  await T.context.addCookies(await B.context.cookies());
  await T.page.goto(url);
  await T.page.locator("[data-tr-entree-bouton]").click();
  await bandeau(T.page).waitFor();
  check("téléphone : aucun débordement horizontal", await T.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await T.context.close();

  // 7. Quitter, clore.
  await B.page.locator("[data-tr-bandeau] button[data-commande-collaboration=quitter-session]").click();
  await B.page.locator("[data-tr-entree-bouton]").waitFor();
  check("le lecteur a quitté la session (l'entrée compacte revient)", (await B.page.locator("[data-tr-bandeau]").count()) === 0);
  await A.page.getByRole("button", { name: /Clore la session/ }).click();
  await A.page.locator('[data-tr-connexion="session-close"]').waitFor();
  check("l'hôte clôt la session", true);
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  check("déroulé sans erreur inattendue", false, e.message);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette de la vue partagée Studio : tout est vert.");
process.exit(echecs ? 1 : 0);
