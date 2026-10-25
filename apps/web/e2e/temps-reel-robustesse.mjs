#!/usr/bin/env node
/**
 * Recette de robustesse du temps réel dans le navigateur (RTC-5, Issue #283 ; RT-R6 ; TR-T10, TR-T16) :
 *
 *   1. Pointeur 3D : le présentateur pointe dans la vue 3D, le lecteur voit une marque nommée (jamais une donnée du
 *      document) ; elle disparaît quand le pointeur sort.
 *   2. Réservation d'édition du projet (RT-R6, TR-T10) : titulaire et échéance affichés en session ; l'hôte quitte, la
 *      réservation reste à son titulaire (auteur inchangé) ; le propriétaire la libère par la route existante.
 *   3. TR-T16 : téléphone tactile (cibles de 44 px au moins, aucun débordement), mouvement réduit (aucune animation),
 *      clavier seul (Tab atteint les commandes, Entrée les déclenche), passe anglaise.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/temps-reel-robustesse.mjs
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

async function compte(nom, viewport = { width: 1280, height: 900 }, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
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
const credentials = (n) => ({ email: `trb-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
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
  const projet = (await A.api("POST", "/projects", { code: `TRB_${randomUUID().slice(0, 6)}`, name: "Robustesse (recette synthétique)" })).body;
  check("lecteur ajouté", (await A.api("POST", `/projects/${projet.id}/members`, { email: cB.email, role: "lecteur" })).status === 201);
  const etude = (await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude" })).body;
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `trb-${randomUUID()}`, baseRevisionId: etude.revision.id, commands: [
    { toolId: "studio.dessin.rectangle", params: { id: "rect-b", type: "rectangle", origin: { x: 0, y: 0 }, width: 4, height: 2 } },
  ] });
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
  const url3d = `${url}?domaine=dessin&planche=3d`;
  for (const s of [A, B]) {
    await s.page.goto(url3d);
    await s.page.locator("[data-studio-vue3d-canvas]").waitFor();
  }
  await ouvrirEntree(A.page);
  await A.page.getByRole("button", { name: /Ouvrir une session en direct/ }).click();
  await A.page.locator('[data-tr-connexion="connecte"]').waitFor();
  await B.page.reload();
  await B.page.locator("[data-studio-vue3d-canvas]").waitFor();
  await rejoindre(B.page);
  check("session ouverte en vue 3D, lecteur entré", true);

  // 1. Pointeur 3D.
  const toile = A.page.locator("[data-studio-vue3d-canvas]");
  const r = await toile.boundingBox();
  for (const f of [0.45, 0.5, 0.55]) { await A.page.mouse.move(r.x + r.width * f, r.y + r.height * f); await new Promise((x) => setTimeout(x, 150)); }
  check("pointeur 3D du présentateur visible chez le lecteur, nommé", await attendreQue(async () => (await B.page.locator("[data-tr-pointeur-3d]").count()) === 1)
    && ((await B.page.locator("[data-tr-pointeur-3d]").textContent()) ?? "").length > 0);
  check("la marque 3D n'est pas une donnée du document (aucun objet ajouté)", (await B.page.locator("[data-tr-pointeur-3d] [data-studio-objet]").count()) === 0);
  await A.page.mouse.move(r.x - 40, r.y - 40);
  check("pointeur sorti : la marque disparaît", await attendreQue(async () => (await B.page.locator("[data-tr-pointeur-3d]").count()) === 0));

  // 2. Réservation d'édition du projet.
  const res = await A.api("PUT", `/projects/${projet.id}/lock`);
  check("le propriétaire réserve l'édition (route existante)", res.status === 200, String(res.status));
  await B.page.locator(`[data-tr-reservation="${res.body.lock.userId}"]`).waitFor({ timeout: 40_000 });
  const texteRes = await B.page.locator("[data-tr-reservation]").innerText();
  check("réservation visible en session : titulaire et échéance", texteRes.includes(cA.email) && /\d{2}:\d{2}/.test(texteRes), texteRes);
  await A.page.locator("[data-tr-bandeau] button[data-commande-collaboration=quitter-session]").click();
  await A.page.locator("[data-tr-entree-bouton]").waitFor();
  const lock = (await B.api("GET", `/projects/${projet.id}/lock`)).body;
  check("l'hôte quitte : la réservation reste à son titulaire (auteur inchangé)", lock?.lock?.userId === res.body.lock.userId && lock.lock.expiresAt === res.body.lock.expiresAt);
  check("le lecteur ne peut pas la lever (403)", (await B.api("DELETE", `/projects/${projet.id}/lock`)).status === 403);
  check("le propriétaire la libère (204)", (await A.api("DELETE", `/projects/${projet.id}/lock`)).status === 204);
  await B.page.locator("[data-tr-reservation]").waitFor({ state: "detached", timeout: 40_000 });
  check("réservation libérée : l'avis disparaît", true);

  // 3. TR-T16.
  await B.page.emulateMedia({ reducedMotion: "reduce" });
  const anim = await B.page.locator(".tr-direct").evaluate((e) => getComputedStyle(e).animationName);
  check("mouvement réduit : aucune animation", anim === "none", anim);
  await B.page.emulateMedia({ reducedMotion: "no-preference" });
  const T = await compte("telephone", { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await T.context.addCookies(await B.context.cookies());
  await T.page.goto(url);
  await ouvrirEntree(T.page);
  await bandeau(T.page).waitFor();
  const petites = await T.page.locator("[data-tr-bandeau] button").evaluateAll((l) => l.filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent));
  check("téléphone tactile : cibles d'au moins 44 px", petites.length === 0, petites.join(" | "));
  check("téléphone tactile : aucun débordement horizontal", await T.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await T.context.close();
  await B.page.locator("[data-tr-bandeau] [data-commande-collaboration=quitter-session]").focus();
  check("clavier : les commandes reçoivent le focus", await B.page.evaluate(() => document.activeElement?.getAttribute("data-commande-collaboration") === "quitter-session"));
  await B.page.keyboard.press("Enter");
  await B.page.locator("[data-tr-entree-bouton]").waitFor();
  check("clavier : Entrée déclenche la commande (le lecteur quitte)", (await B.page.locator("[data-tr-connexion]").count()) === 0);
  await B.page.locator("[data-tr-entree-bouton]").focus();
  await B.page.keyboard.press("Enter");
  await bandeau(B.page).waitFor();
  check("clavier : Entrée ouvre l'entrée « En direct », Échap la referme", true);
  await B.page.keyboard.press("Escape");
  await B.page.locator("[data-tr-bandeau]").waitFor({ state: "detached" });
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "en"); });
  await B.page.reload();
  await ouvrirEntree(B.page);
  await bandeau(B.page).waitFor();
  const anglais = await bandeau(B.page).innerText();
  check("passe anglaise hors session", anglais.includes("Live sessions") && !anglais.includes("Sessions en direct"), anglais);
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "fr"); });
  await axe(B.page, "bandeau hors session");
  const sessions = (await A.api("GET", `/projects/${projet.id}/temps-reel/sessions?variantId=${etude.variant.id}`)).body?.sessions ?? [];
  for (const s of sessions) await A.api("POST", `/projects/${projet.id}/temps-reel/sessions/${s.id}/clore`, {});
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  check("déroulé sans erreur inattendue", false, e.message);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette de robustesse du temps réel : tout est vert.");
process.exit(echecs ? 1 : 0);
