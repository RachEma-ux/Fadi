#!/usr/bin/env node
/**
 * Recette des preuves du groupe C (point 2, Studio) sur l'API réelle et l'application construite (même origine, base
 * migrée, service worker actif) :
 *
 *  - EX-043 (offline véridique, cas négatif) : une action exigeant l'autorité centrale (approbation, puis diffusion
 *    d'une publication) tentée hors connexion n'est jamais affichée « approuvée » ni « diffusée » : l'interface annonce
 *    l'action non confirmée, la carte garde l'état lu du serveur, et le serveur n'a rien enregistré. Revenue en ligne,
 *    la même action est validée par le serveur et alors seulement affichée.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-preuves-c.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-preuves-c-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-preuves-c-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`Préparation : ${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };

  const projet = await api("post", "/projects", { code: "P.STU.PRC", name: "Studio — preuves C" });
  const root = `/projects/${projet.id}/studio`;
  const etude = await api("post", `${root}/studies`, { name: "Étude preuves C" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
  const pubs = `${root}/studies/${studyId}/publications`;
  await api("post", `${variantPath}/commands`, { contractVersion: "studio-commands/1", requestId: `prc-${randomUUID()}`, baseRevisionId: etude.revision.id,
    commands: [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 2 } } }] });
  const pub = await api("post", `${variantPath}/publications`, { title: "Dossier hors ligne", requestId: `prc-${randomUUID()}` });
  await api("post", `${pubs}/${pub.id}/soumettre`, { comment: "Pour revue" });

  // --- EX-043 : approbation tentée hors connexion -------------------------------------------------------------------
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  const carte = page.locator(`li[data-studio-publication="${pub.id}"]`);
  await carte.waitFor();
  check("préparation : publication soumise affichée « en revue »", (await carte.getAttribute("data-travail")) === "en-revue" && (await carte.getAttribute("data-statut")) === "soumis");
  const confirmer = async () => {
    const auto = carte.locator("[data-auto-controle-confirmer]");
    await page.waitForTimeout(300);
    if (await auto.count()) await auto.check();
    await carte.locator(".studio-publication-confirmer button", { hasText: "Confirmer" }).click();
  };
  await carte.locator('[data-studio-publication-action="approuver"]').click();
  await context.setOffline(true);
  await confirmer();
  const alerte = carte.locator('[role="alert"]');
  await alerte.waitFor();
  check("hors connexion : approbation annoncée non confirmée", ((await alerte.textContent()) ?? "").includes("Action non confirmée"), await alerte.textContent());
  check("hors connexion : la carte n'est jamais affichée « approuvée » (état lu du serveur conservé)",
    (await carte.getAttribute("data-travail")) === "en-revue" && (await carte.getAttribute("data-statut")) === "soumis" && (await page.locator(`li[data-studio-publication="${pub.id}"][data-travail="approuve"]`).count()) === 0);
  await context.setOffline(false);
  const relu = await api("get", `${pubs}/${pub.id}`);
  check("de retour en ligne : le serveur n'a rien enregistré (toujours soumis, aucune approbation)", relu.status === "soumis" && relu.approval === null, JSON.stringify({ status: relu.status, approval: relu.approval }));

  // Validation centrale : la même action, en ligne, est approuvée par le serveur puis affichée.
  await page.reload();
  await carte.waitFor();
  await carte.locator('[data-studio-publication-action="approuver"]').click();
  await confirmer();
  await page.locator(`li[data-studio-publication="${pub.id}"][data-travail="approuve"]`).waitFor();
  check("en ligne : approbation validée par le serveur, puis affichée « approuvée »", (await api("get", `${pubs}/${pub.id}`)).status === "approuve");

  // --- EX-043 : diffusion tentée hors connexion ---------------------------------------------------------------------
  await carte.locator('[data-studio-publication-action="diffuser"]').click();
  await context.setOffline(true);
  await carte.locator(".studio-publication-confirmer button", { hasText: "Confirmer" }).click();
  await carte.locator('[role="alert"]').waitFor();
  check("hors connexion : diffusion annoncée non confirmée, jamais affichée « diffusée »",
    ((await carte.locator('[role="alert"]').textContent()) ?? "").includes("Action non confirmée") && (await carte.getAttribute("data-diffusion")) === "non-diffuse");
  await context.setOffline(false);
  const relu2 = await api("get", `${pubs}/${pub.id}`);
  check("de retour en ligne : aucune diffusion enregistrée par le serveur", relu2.diffusionStatus === "non-diffuse" && relu2.diffusion === null, JSON.stringify({ d: relu2.diffusionStatus }));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ exception : ${e instanceof Error ? e.stack : e}`);
} finally {
  await browser.close();
}
if (echecs) { console.log(`Recette des preuves du groupe C : ${echecs} échec(s).`); process.exit(1); }
console.log("Recette des preuves du groupe C : tous les contrôles passent.");
