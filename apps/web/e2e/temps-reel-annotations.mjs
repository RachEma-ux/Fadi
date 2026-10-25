#!/usr/bin/env node
/**
 * Recette des annotations enregistrées en session (RTC-3, Issue #283 ; critères RT-R3, RT-R5 ; test TR-T04) dans deux
 * navigateurs réels : le propriétaire (hôte) et un lecteur. API, canal et base réels ; drapeau `FADI_TEMPS_REEL=1`.
 *
 *   1. Le propriétaire annote (Ctrl+Alt+Maj+A) : note réservée à l'équipe — le lecteur n'en reçoit rien (canal, liste).
 *   2. Note visible par les lecteurs (Alt+Maj+1 dans le formulaire) : annoncée au lecteur, avec point de vue (repères
 *      `local-2d` / `local-3d`, mètres), révision source et objets cités ; c'est un commentaire Studio (même identifiant).
 *   3. Rejeu : même requestId = une seule annotation ; autre point de vue avec le même requestId = 409 ; un lecteur ne
 *      peut pas viser l'équipe (422).
 *   4. R03 → R04 : la session passe à la nouvelle révision, les annotations gardent leur révision source.
 *   5. « Voir le point de vue » : le cadre enregistré est reposé, la navigation devient libre.
 *   6. Clôture : les annotations survivent ; promotion en observation par le circuit Studio.
 *   7. Règle d'or, axe-core, passe anglaise du formulaire et de la liste ; aucune erreur JavaScript.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/temps-reel-annotations.mjs
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
const credentials = (n) => ({ email: `tra-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
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
  const moiA = (await A.api("GET", "/auth/me")).body;
  const idA = moiA?.user?.id ?? moiA?.id;
  const projet = (await A.api("POST", "/projects", { code: `TRA_${randomUUID().slice(0, 6)}`, name: "Annotations en direct (recette synthétique)" })).body;
  check("lecteur ajouté", (await A.api("POST", `/projects/${projet.id}/members`, { email: cB.email, role: "lecteur" })).status === 201);
  const etude = (await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude annotée" })).body;
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const r1 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `tra-${randomUUID()}`, baseRevisionId: etude.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-a", type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } } },
    { toolId: "studio.dessin.rectangle", params: { id: "rect-b", type: "rectangle", origin: { x: 2, y: 3 }, width: 4, height: 2 } },
  ] })).body;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`;
  const tr = `/projects/${projet.id}/temps-reel`;
  const lues = async (s) => (await s.api("GET", `${tr}/annotations?variantId=${etude.variant.id}`)).body?.annotations ?? [];
  for (const s of [A, B]) {
    await s.page.goto(url);
    await s.page.locator('svg [data-studio-objet="ligne-a"]').waitFor({ state: "attached" });
  }
  await ouvrirEntree(A.page);
  await A.page.getByRole("button", { name: /Ouvrir une session en direct/ }).click();
  await A.page.locator('[data-tr-connexion="connecte"]').waitFor();
  await B.page.reload();
  await rejoindre(B.page);
  const sessionId = await bandeau(A.page).getAttribute("data-tr-session");
  check("session ouverte, le lecteur l'a rejointe", !!sessionId);

  // 1. Note réservée à l'équipe.
  await A.page.locator('svg [data-studio-objet="rect-b"]').first().click({ force: true });
  await A.page.keyboard.press("Control+Alt+Shift+KeyA");
  await A.page.locator("[data-tr-annotation-form]").waitFor();
  check("Ctrl+Alt+Maj+A ouvre le formulaire d'annotation", true);
  check("le formulaire propose de citer la sélection", (await A.page.locator("[data-tr-annotation-citer]").isChecked()));
  await A.page.locator("[data-tr-annotation-texte]").fill("Note interne de l'équipe");
  await A.page.locator("[data-tr-annotation-form] button[data-commande-collaboration=enregistrer-annotation]").click();
  await A.page.locator("[data-tr-annotations] [data-tr-annotation]").first().waitFor();
  const interne = (await lues(A))[0];
  check("note de l'équipe enregistrée : audience équipe, révision source, objets cités, point de vue tagué",
    interne?.audience === "equipe" && interne.sourceRevisionId === r1.revision.id && interne.objectIds.join() === "rect-b" && interne.sessionId === sessionId
      && interne.pointDeVue?.reperes?.plan === "local-2d" && interne.pointDeVue?.unites === "m" && !!interne.pointDeVue?.plan, JSON.stringify(interne));
  await new Promise((r) => setTimeout(r, 1200));
  check("le lecteur ne reçoit pas la note de l'équipe (liste et canal)", (await lues(B)).length === 0 && (await B.page.getByRole("button", { name: "Annotations (0)" }).count()) === 1);
  const commentaires = (await A.api("GET", `${chemin}/comments`)).body?.comments ?? [];
  check("l'annotation est un commentaire Studio (même identifiant, ancré à la révision source)", commentaires.some((c) => c.id === interne?.commentId && c.revisionId === r1.revision.id));

  // 2. Note visible par les lecteurs.
  const vbAnnot = await viewBox(A.page);
  await A.page.getByRole("button", { name: /^Annoter/ }).click();
  await A.page.locator("[data-tr-annotation-texte]").fill("Vérifier l'alignement du rectangle");
  await A.page.locator("[data-tr-annotation-texte]").press("Alt+Shift+Digit1");
  check("Alt+Maj+1 coche « Visible par les lecteurs » dans le formulaire", await A.page.locator("[data-tr-annotation-lecteurs]").isChecked());
  await A.page.keyboard.press("Control+Alt+Shift+KeyE");
  await B.page.getByRole("button", { name: "Annotations (1)" }).waitFor();
  check("Ctrl+Alt+Maj+E enregistre ; le lecteur est prévenu par le canal", true);
  const visibles = await lues(B);
  check("le lecteur lit seulement la note visible", visibles.length === 1 && visibles[0].audience === "projet" && visibles[0].body === "Vérifier l'alignement du rectangle");

  // 3. Rejeu et refus.
  const saisie = { body: "Question du lecteur", requestId: `tra-${randomUUID()}`, vue: { affichage: "2d", plan: { x: 0, y: 0, w: 10, h: 5 } } };
  const p1 = await B.api("POST", `${tr}/sessions/${sessionId}/annotations`, saisie);
  const p2 = await B.api("POST", `${tr}/sessions/${sessionId}/annotations`, saisie);
  check("rejeu : même requestId = même annotation (201 puis 200)", p1.status === 201 && p2.status === 200 && p2.body?.rejoue === true && p1.body?.annotation?.id === p2.body?.annotation?.id, `${p1.status}/${p2.status}`);
  check("aucun doublon après le rejeu", (await lues(B)).length === 2);
  const p3 = await B.api("POST", `${tr}/sessions/${sessionId}/annotations`, { ...saisie, vue: { affichage: "2d", plan: { x: 1, y: 1, w: 10, h: 5 } } });
  check("même requestId, autre point de vue : 409", p3.status === 409, String(p3.status));
  const p4 = await B.api("POST", `${tr}/sessions/${sessionId}/annotations`, { ...saisie, requestId: `tra-${randomUUID()}`, audience: "equipe" });
  check("un lecteur ne vise pas l'équipe : 422", p4.status === 422, String(p4.status));
  const p5 = await B.api("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Sans vue", requestId: `tra-${randomUUID()}`, vue: { affichage: "2d" } });
  check("point de vue sans cadre ni caméra : 422", p5.status === 422, String(p5.status));

  // 4. R03 → R04 : révision source conservée.
  const r2 = (await A.api("POST", `${chemin}/commands`, { contractVersion: "studio-commands/1", requestId: `tra-${randomUUID()}`, baseRevisionId: r1.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "ligne-c", type: "line", start: { x: 0, y: 6 }, end: { x: 6, y: 6 } } },
  ] })).body;
  check("la session passe à la nouvelle révision", (await A.api("POST", `${tr}/sessions/${sessionId}/revision`, { revisionId: r2.revision.id })).status === 200);
  const p6 = await A.api("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Sur la nouvelle révision", requestId: `tra-${randomUUID()}`, audience: "projet", vue: { affichage: "2d", plan: { x: 0, y: 0, w: 8, h: 8 } } });
  const apres = await lues(A);
  check("les annotations gardent leur révision source", p6.status === 201 && apres.filter((a) => a.sourceRevisionId === r1.revision.id).length === 3 && apres.filter((a) => a.sourceRevisionId === r2.revision.id).length === 1, JSON.stringify(apres.map((a) => a.sourceRevisionId)));

  // 5. Voir le point de vue.
  const planB = B.page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  await B.page.keyboard.press("Control+Alt+Shift+KeyF");
  await B.page.locator('[data-tr-suivi="libre"]').waitFor();
  await planB.hover();
  await B.page.mouse.wheel(0, 500);
  await new Promise((r) => setTimeout(r, 300));
  const vbAvant = await viewBox(B.page);
  await B.page.getByRole("button", { name: /^Annotations \(/ }).click();
  await B.page.locator("[data-tr-annotations] [data-tr-annotation]").first().locator("button[data-commande-collaboration=voir-point-de-vue]").click();
  check("« Voir le point de vue » repose le cadre enregistré", await attendreQue(async () => (await viewBox(B.page)) === vbAnnot), `${vbAvant} → ${await viewBox(B.page)} / ${vbAnnot}`);
  check("revoir un point de vue laisse la navigation libre", (await B.page.locator('[data-tr-suivi="libre"]').count()) === 1);

  // 7. Règle d'or, accessibilité, anglais (avant la clôture).
  await A.page.getByRole("button", { name: /^Annoter/ }).click();
  await A.page.locator("[data-tr-annotation-form]").waitFor();
  const commandes = A.page.locator("[data-tr-bandeau] button[data-commande-collaboration]");
  const n = await commandes.count();
  let completes = 0;
  for (let i = 0; i < n; i++) {
    const b = commandes.nth(i);
    const c = await b.getAttribute("data-commande-collaboration");
    if ((await b.locator(`svg[data-icone-collaboration="${c}"]`).count()) === 1 && (await b.locator(`kbd[data-raccourci-collaboration="${c}"]`).count()) === 1 && /^Control\+Alt\+Shift\+[A-Z]$/.test((await b.getAttribute("aria-keyshortcuts")) ?? "")) completes += 1;
  }
  check("règle d'or : Annoter, Enregistrer, Voir le point de vue ont icône et raccourci", n > 0 && completes === n
    && (await A.page.locator("[data-tr-bandeau] [data-commande-collaboration=enregistrer-annotation]").count()) === 1
    && (await A.page.locator("[data-tr-bandeau] [data-commande-collaboration=voir-point-de-vue]").count()) >= 1, `${completes}/${n}`);
  await axe(B.page, "liste des annotations");
  await axe(A.page, "formulaire d'annotation");
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "en"); });
  await B.page.reload();
  await rejoindre(B.page);
  await B.page.locator("[data-tr-annotations-bouton]").click();
  await B.page.getByRole("button", { name: /^Annotate/ }).click();
  await B.page.locator("[data-tr-annotation-form]").waitFor();
  const anglais = await bandeau(B.page).innerText();
  check("passe anglaise : formulaire et liste traduits", anglais.includes("Annotate") && anglais.includes("Save the annotation") && anglais.includes("Show the viewpoint") && anglais.includes("Visible to readers")
    && !anglais.includes("Point de vue enregistré") && !anglais.includes("Réservée"), anglais);
  await B.page.evaluate(() => { localStorage.setItem("fadi.langue", "fr"); });

  // 6. Clôture : les annotations survivent ; promotion en observation.
  check("clôture par l'hôte", (await A.api("POST", `${tr}/sessions/${sessionId}/clore`, {})).status === 200);
  const closes = await lues(A);
  check("après la clôture, les annotations restent (auteur, audience, point de vue, révision source)", closes.length === 4 && closes.every((a) => a.pointDeVue && a.auteur && a.sourceRevisionId));
  const p7 = await A.api("POST", `${tr}/sessions/${sessionId}/annotations`, { body: "Trop tard", requestId: `tra-${randomUUID()}`, vue: { affichage: "2d", plan: { x: 0, y: 0, w: 8, h: 8 } } });
  check("session close : plus d'annotation en direct (409)", p7.status === 409, String(p7.status));
  const obs = await A.api("POST", `${chemin}/comments/${interne.commentId}/observation`, { responsableId: idA, requestId: `tra-${randomUUID()}` });
  check("une annotation devient une observation par le circuit Studio", obs.status === 201 && (await lues(A)).find((a) => a.commentId === interne.commentId)?.observation === true, `${obs.status} ${JSON.stringify(obs.body).slice(0, 200)}`);
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  check("déroulé sans erreur inattendue", false, e.message);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} vérification(s) en échec` : "\nRecette des annotations en session : tout est vert.");
process.exit(echecs ? 1 : 0);
