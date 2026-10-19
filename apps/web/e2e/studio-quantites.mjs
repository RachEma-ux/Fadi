#!/usr/bin/env node
/**
 * Recette Studio — ajustements manuels du métré enregistrés et versionnés par variante (E.3-05), par l'interface et
 * l'API réelles (même origine, base migrée : table `studio_quantity_adjustments` dans init.sql). Comptes, projet et
 * dessin synthétiques créés par les vraies routes (deux lignes sur un calque « Murs », une ligne hors calque).
 *   1. un ajustement d'objet (motif obligatoire) est saisi dans le panneau : brute, ajustement (écart) et ajustée
 *      s'affichent ensemble ; il est enregistré (séquence 1, révision de tête, auteur, brute calculée par le serveur) ;
 *   2. après rechargement, il est toujours là (journal du serveur), en vigueur ;
 *   3. un ajustement du total d'un calque remplace le total retenu du calque (brute conservée) ;
 *   4. refus : motif absent (400), journal périmé (409), révision non de tête (409), lecteur (403), variante archivée (409) ;
 *   5. l'objet ajusté est modifié (nouvelle révision) : l'ajustement est « à revoir », plus appliqué, la brute est retenue ;
 *      un objet du calque modifié rend le total du calque « à revoir » ;
 *   6. le CSV exporté porte les colonnes d'ajustement (écart, statut, révision, valeur à revoir).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-quantites.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}
/** Client d'API à cookie de session (comptes secondaires). */
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
const credentials = () => ({ email: `studio-quantites-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") });
const n = (s) => (s ?? "").replace(/\s+/g, " ").trim();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const email = `studio-quantites-${Date.now()}@example.com`;
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "studio-quantites-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };

  const projet = (await api("post", "/projects", { code: `P.MET.${randomUUID().slice(0, 6)}`, name: "Studio — métré (recette)" })).body;
  const racine = `/projects/${projet.id}/studio/studies`;
  const etude = (await api("post", racine, { name: "Étude métré" })).body;
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variante = `${racine}/${studyId}/variants/${variantId}`;
  const ajustements = `${variante}/ajustements-quantites`;
  const envoyer = async (base, commands) => api("post", `${variante}/commands`, { contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: base, commands });
  const pose = await envoyer(etude.revision.id, [
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
    { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
    { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", layerId: "murs", start: { x: 0, y: 1 }, end: { x: 6, y: 1 } } },
    { toolId: "studio.dessin.ligne", params: { id: "l3", type: "line", start: { x: 0, y: 2 }, end: { x: 2, y: 2 } } },
  ]);
  check("préparation : calque et trois lignes posés par commandes", pose.status === 200, String(pose.status));
  const rev1 = pose.body.revision.id;
  const vide = await api("get", ajustements);
  check("journal vide au départ (aucun ajustement fourni)", vide.status === 200 && vide.body.sequence === 0 && vide.body.ajustements.length === 0 && vide.body.peutAjuster === true && vide.body.headRevisionId === rev1, JSON.stringify(vide.body));

  const ouvrir = async () => {
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`);
    await page.getByRole("toolbar", { name: /^(Outils de dessin|Drawing tools)$/ }).waitFor();
    const panneau = page.locator("[data-studio-quantites]");
    await panneau.waitFor();
    await panneau.locator('[data-studio-quantites-objet="l1"]').waitFor();
    return panneau;
  };
  let panneau = await ouvrir();
  const form = panneau.locator("[data-studio-quantites-ajustement]");
  const saisir = async ({ type = "objet", cible, grandeur, valeur, motif }) => {
    await form.locator("[data-studio-quantites-type-cible]").selectOption(type);
    await form.locator("[data-studio-quantites-cible]").selectOption(cible);
    await form.locator("[data-studio-quantites-grandeur]").selectOption(grandeur);
    await form.locator("[data-studio-quantites-valeur]").fill(valeur);
    await form.locator("[data-studio-quantites-motif]").fill(motif);
    await form.locator("[data-studio-quantites-ajouter]").click();
  };

  // 1. Ajustement d'objet saisi dans le panneau.
  await form.locator("fieldset:not([disabled])").waitFor();
  await form.locator("[data-studio-quantites-cible]").selectOption("l1");
  await form.locator("[data-studio-quantites-grandeur]").selectOption("longueur");
  await form.locator("[data-studio-quantites-valeur]").fill("4,5");
  await form.locator("[data-studio-quantites-ajouter]").click();
  check("motif obligatoire : sans motif, rien n'est envoyé", (await api("get", ajustements)).body.sequence === 0);
  await saisir({ cible: "l1", grandeur: "longueur", valeur: "4,5", motif: "Relevé sur site" });
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"][data-statut="en-vigueur"]').waitFor();
  const cellule = () => panneau.locator('[data-studio-quantites-objet="l1"] td[data-grandeur="longueur"]');
  const texte1 = n(await cellule().textContent());
  check("affichage : brute, ajustement (écart) et ajustée ensemble", (await cellule().getAttribute("data-ajustee")) !== null && /brute 4(?![0-9,.])/.test(texte1) && /ajustement \+0[,.]5/.test(texte1) && /ajustée 4[,.]5/.test(texte1), texte1);
  const lu1 = (await api("get", ajustements)).body;
  const a1 = lu1.ajustements[0];
  check("serveur : séquence 1, révision de tête, valeur et unité, brute calculée, motif, auteur et date du serveur",
    lu1.sequence === 1 && a1.sequence === 1 && a1.revisionId === rev1 && a1.valeur === 4.5 && a1.unite === "m" && a1.derivee === 4 && a1.motif === "Relevé sur site"
    && a1.auteurEmail === email && /^\d{4}-\d{2}-\d{2}T/.test(a1.date) && a1.cible.type === "objet" && a1.cible.id === "l1" && lu1.statuts[0].statut === "en-vigueur", JSON.stringify(lu1));

  // 2. Rechargement : l'ajustement vient du serveur.
  panneau = await ouvrir();
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"][data-statut="en-vigueur"]').waitFor();
  const texte2 = n(await cellule().textContent());
  check("rechargement : ajustement persistant, toujours affiché et appliqué", /ajustée 4[,.]5/.test(texte2) && /brute 4(?![0-9,.])/.test(texte2), texte2);
  const journal2 = n(await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"]').textContent());
  check("journal : auteur, motif, révision et statut", journal2.includes(email) && journal2.includes("Relevé sur site") && journal2.includes(rev1) && /en vigueur/.test(journal2), journal2);

  // 3. Ajustement du total du calque « Murs ».
  await saisir({ type: "calque", cible: "murs", grandeur: "longueur", valeur: "11", motif: "Métré contradictoire du calque" });
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="2"][data-statut="en-vigueur"]').waitFor();
  const totalMurs = n(await panneau.locator('[data-studio-quantites-total-calque="murs"] td[data-grandeur="longueur"]').textContent());
  check("total du calque ajusté : 11 retenu, brute 10 conservée, écart affiché", /^11(?![0-9,.])/.test(totalMurs) && /brute 10(?![0-9,.])/.test(totalMurs) && /ajustement \+1(?![0-9,.])/.test(totalMurs) && /total du calque ajusté/.test(totalMurs), totalMurs);

  // 4. Refus.
  const base = { baseSequence: 2, revisionId: rev1, cible: { type: "objet", id: "l2" }, grandeur: "longueur", unite: "m", valeur: 6.1 };
  const sansMotif = await api("post", ajustements, { ...base, motif: " " });
  check("refus : motif vide (400)", sansMotif.status === 400, JSON.stringify(sansMotif.body));
  const perime = await api("post", ajustements, { ...base, baseSequence: 1, motif: "Relevé" });
  check("refus : journal périmé (409 journal_perime)", perime.status === 409 && perime.body.error === "journal_perime" && perime.body.currentSequence === 2, JSON.stringify(perime.body));
  const unite = await api("post", ajustements, { ...base, unite: "m2", motif: "Relevé" });
  check("refus : unité incohérente (400)", unite.status === 400 && unite.body.error === "unite_incoherente", JSON.stringify(unite.body));
  const forge = await api("post", ajustements, { ...base, motif: "Relevé", auteur: "quelqu'un", date: "2020-01-01T00:00:00Z" });
  check("refus : auteur et date ne se saisissent pas (400)", forge.status === 400, JSON.stringify(forge.body));
  const lecteur = client();
  const lc = credentials();
  await lecteur("POST", "/auth/register", lc);
  const ajout = await api("post", `/projects/${projet.id}/members`, { email: lc.email, role: "lecteur" });
  const lecture = await lecteur("GET", ajustements);
  const ecriture = await lecteur("POST", ajustements, { ...base, motif: "Relevé du lecteur" });
  check("lecteur : lit le journal (peutAjuster faux), n'ajuste pas (403)", ajout.status === 201 && lecture.status === 200 && lecture.body.ajustements.length === 2 && lecture.body.peutAjuster === false && ecriture.status === 403, `${lecture.status} ${ecriture.status}`);
  const derivee = (await api("post", `${racine}/${studyId}/variants`, { name: "Variante archivée", fromVariantId: variantId })).body;
  await api("post", `${racine}/${studyId}/variants/${derivee.variant.id}/archive`, {});
  const archivee = await api("post", `${racine}/${studyId}/variants/${derivee.variant.id}/ajustements-quantites`, { ...base, baseSequence: 0, revisionId: derivee.variant.headRevisionId, motif: "Relevé" });
  check("variante archivée : écriture refusée (409 archived), journal intact", archivee.status === 409 && archivee.body.error === "archived", JSON.stringify(archivee.body));

  // 5. L'objet ajusté change : nouvelle révision, l'ajustement est « à revoir ».
  const modif = await envoyer(rev1, [{ toolId: "studio.dessin.modifier", params: { id: "l1", type: "line", layerId: "murs", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } } }]);
  check("objet modifié : nouvelle révision enregistrée", modif.status === 200, String(modif.status));
  const rev2 = modif.body.revision.id;
  const ancienne = await api("post", ajustements, { ...base, motif: "Relevé" });
  check("refus : saisie sur une révision qui n'est plus la tête (409 revision_perimee)", ancienne.status === 409 && ancienne.body.error === "revision_perimee" && ancienne.body.headRevisionId === rev2, JSON.stringify(ancienne.body));
  const lu3 = (await api("get", ajustements)).body;
  check("serveur : statuts pour la tête — ajustement de l1 et total du calque « à revoir »", lu3.statuts.map((s) => `${s.statut}:${s.revue ?? ""}`).join() === "a-revoir:cible-modifiee,a-revoir:cible-modifiee", JSON.stringify(lu3.statuts));
  panneau = await ouvrir();
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"][data-statut="a-revoir"]').waitFor();
  const texte3 = n(await cellule().textContent());
  check("affichage : « à revoir », non appliqué, la brute 5 est retenue", (await cellule().getAttribute("data-ajustee")) === null && (await cellule().locator("[data-a-revoir]").count()) === 1 && /^5(?![0-9,.])/.test(texte3) && /à revoir : 4[,.]5 proposé, non appliqué/.test(texte3), texte3);
  const total3 = n(await panneau.locator('[data-studio-quantites-total-calque="murs"] td[data-grandeur="longueur"]').textContent());
  check("total du calque : « à revoir », la brute 11 est retenue", /^11(?![0-9,.])/.test(total3) && /à revoir/.test(total3), total3);
  check("avis : 2 ajustements à revoir signalés", (await panneau.locator('[data-studio-quantites-a-revoir="2"]').count()) === 1);
  const journal3 = n(await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"]').textContent());
  check("journal : motif de revue affiché", /la cible a changé depuis la révision de l’ajustement/.test(journal3), journal3);

  // Un nouvel ajustement sur la tête est en vigueur ; l'ancien est remplacé.
  await saisir({ cible: "l1", grandeur: "longueur", valeur: "5,2", motif: "Nouveau relevé" });
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="3"][data-statut="en-vigueur"]').waitFor();
  check("nouvel ajustement sur la tête : en vigueur, le précédent est « remplacé »", (await panneau.locator('[data-studio-quantites-journal] li[data-sequence="1"][data-statut="remplace"]').count()) === 1);

  // 6. CSV : colonnes d'ajustement.
  const lien = panneau.locator("[data-studio-quantites-csv]");
  await page.waitForFunction(() => document.querySelector("[data-studio-quantites-csv]")?.getAttribute("href")?.startsWith("blob:"));
  const href = await lien.getAttribute("href");
  const csv = await page.evaluate(async (h) => (await fetch(h)).text(), href);
  const lignes = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);
  const entetes = lignes[0].split(";");
  check("CSV : colonnes brute, ajustée, retenue, motif, auteur, date, écart, statut, révision, valeur à revoir",
    ["Valeur dérivée", "Valeur ajustée", "Valeur retenue", "Motif de l’ajustement", "Auteur", "Date", "Écart d’ajustement", "Statut de l’ajustement", "Révision de l’ajustement", "Valeur à revoir (non retenue)"].every((c) => entetes.includes(c)), lignes[0]);
  const col = (l, nom) => l.split(";")[entetes.indexOf(nom)];
  const ligneL1 = lignes.find((l) => l.split(";")[2] === "l1" && l.split(";")[5] === "Longueur") ?? "";
  check("CSV : l1 brute 5, ajustée 5,2, écart 0,2, en vigueur, révision de tête, motif et auteur",
    col(ligneL1, "Valeur dérivée") === "5" && col(ligneL1, "Valeur ajustée") === "5,2" && col(ligneL1, "Valeur retenue") === "5,2" && col(ligneL1, "Écart d’ajustement") === "0,2"
    && col(ligneL1, "Statut de l’ajustement") === "en vigueur" && col(ligneL1, "Révision de l’ajustement") === rev2 && col(ligneL1, "Motif de l’ajustement") === "Nouveau relevé" && col(ligneL1, "Auteur") === email, ligneL1);
  const totalCsv = lignes.find((l) => l.split(";")[0] === "Murs" && l.split(";")[2] === "TOTAL DU CALQUE" && l.split(";")[5] === "Longueur") ?? "";
  check("CSV : total du calque « à revoir », valeur proposée 11 non retenue, révision d'origine", col(totalCsv, "Statut de l’ajustement")?.startsWith("à revoir") && col(totalCsv, "Valeur à revoir (non retenue)") === "11" && col(totalCsv, "Révision de l’ajustement") === rev1 && col(totalCsv, "Valeur ajustée") === "", totalCsv);

  // Interface en anglais : le panneau (brute, ajustement, à revoir, journal) est traduit ; les données restent telles quelles.
  await page.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  panneau = await ouvrir();
  await panneau.locator('[data-studio-quantites-journal] li[data-sequence="3"]').waitFor();
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page.waitForTimeout(500);
  const anglais = n(await panneau.innerText());
  const restes = ["Ajustements manuels", "brute", "à revoir", "Enregistrer l’ajustement", "en vigueur", "remplacé", "Revenir à la valeur", "Total du calque", "ajustée", "révision"].filter((x) => anglais.includes(x));
  check("anglais : panneau traduit (gross, adjustment, to review, in force, superseded), données inchangées", restes.length === 0 && /gross/.test(anglais) && /to review/.test(anglais) && /in force/.test(anglais) && /superseded/.test(anglais) && anglais.includes("Nouveau relevé"), restes.join(", ") || anglais.slice(0, 300));
  await page.evaluate(() => localStorage.removeItem("fadi.langue"));

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette du métré Studio : tous les contrôles passent.");
