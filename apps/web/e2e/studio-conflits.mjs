#!/usr/bin/env node
/**
 * Recette du contrat de commandes Studio (A.5-01 à A.5-11) : deux comptes (propriétaire A, éditeur B), chacun dans son
 * propre navigateur (deux onglets sur la même variante), sur l'application construite servie par l'API.
 * 1. Prévisualisation (A.5-03) : un tracé commencé montre un aperçu, aucun pas ni commande ; Échap l'annule.
 * 2. Conflit en ligne (A.5-06) : A enregistre ; B, resté sur l'ancienne tête, enregistre → refus stale_revision signalé,
 *    tête de A intacte, brouillon de B conservé ; « Reporter » revalide les commandes sur la nouvelle tête, puis
 *    l'enregistrement garde les deux écritures.
 * 3. Chevauchement : A déplace une ligne ; B, sur l'ancienne tête, la supprime → le report nomme la ligne et demande
 *    confirmation ; refusé, rien ne change ; accepté, la suppression de B est enregistrée par son choix explicite.
 * 4. Annulation concurrente (A.5-08) : A dessine puis annule → aucune écriture, les changements de B restent.
 * 5. Coupure après envoi (A.5-05, A.5-09) : la réponse est perdue ; « Réessayer » renvoie le même requestId → rejeu,
 *    une seule révision.
 * 6. Serveur (A.5-02, A.5-04, A.5-07, A.5-10) : anonyme 401, auteur forgé dans l'enveloppe 400, lot refusé au milieu
 *    sans aucune écriture, base périmée 409 avec chevauchements, rejeu ancien sans effet sur la tête, commandes et
 *    delta d'une révision relus tels qu'envoyés.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-conflits.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const identifiants = (nom) => ({ email: `studio-conflits-${nom}-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`, password: `studio-conflits-${randomUUID()}` });

/** Session d'un compte : navigateur isolé, appels API avec ses propres cookies. */
async function session(nom) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  const dialogues = [];
  /** Politique des boîtes de confirmation : accepter par défaut ; `refuserProchaine` refuse la suivante. */
  const politique = { refuserProchaine: false };
  page.on("dialog", (d) => { dialogues.push(d.message()); if (politique.refuserProchaine) { politique.refuserProchaine = false; void d.dismiss(); } else void d.accept(); });
  const brut = async (method, path, data) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, "content-type": "application/json" }, ...(data === undefined ? {} : { data }) });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  const api = async (method, path, data) => {
    const r = await brut(method, path, data);
    if (r.status >= 400) throw new Error(`${nom} : ${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  return { nom, context, page, dialogues, politique, brut, api };
}

/** Barre compacte : un bouton rangé dans un menu « ▾ » est atteint en ouvrant ce menu, comme le ferait l'utilisateur. */
async function cliquer(page, nom) {
  // Palette du domaine et barre de l'espace (Annuler, Rétablir, Enregistrer, Outils, palette).
  const barre = page.locator('[role="toolbar"][aria-label="Outils de dessin"], [role="toolbar"][data-studio-actions-espace]');
  const el = barre.locator(`:is(button,a)[aria-label="${nom}"]`).first();
  await el.waitFor({ state: "attached" });
  if (!(await el.isVisible())) {
    const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
    if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
    await el.waitFor({ state: "visible" });
  }
  await el.click();
}
async function rectangle(page, x, y) {
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  await cliquer(page, "Rectangle");
  for (const [nom, v] of [["X", x], ["Y", y], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
}
const enregistrer = (page) => cliquer(page, "Enregistrer");
const reessayer = (page) => cliquer(page, "Réessayer la sauvegarde");
const enregistre = (page) => page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
const enAttente = async (page) => Number((await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre")) ?? NaN);
/** JSON à clés triées : jsonb ne conserve pas l'ordre des clés (le contenu, lui, est celui envoyé). */
const canonique = (v) => (Array.isArray(v) ? `[${v.map(canonique).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(",")}}` : JSON.stringify(v));
const enveloppe = (requestId, baseRevisionId, commands) => ({ contractVersion: "studio-commands/1", requestId, baseRevisionId, commands });
const ligne = (id, x, y = 0) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y }, end: { x: x + 3, y } } });
const deplacer = (id, dx) => ({ toolId: "studio.dessin.deplacer", params: { id, dx, dy: 0 } });
/** Point du repère de la planche → écran (la planche est ramenée dans la fenêtre au besoin). */
const versEcran = (page, point) => page.getByRole("group", { name: "Planche de dessin 2D", exact: true }).evaluate((svg, p) => {
  const ecran = () => new DOMPoint(p.x, p.y).matrixTransform(svg.getScreenCTM());
  const s = ecran();
  if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
  const e = ecran();
  return { x: e.x, y: e.y };
}, point);

const A = await session("A"), B = await session("B");
try {
  const credA = identifiants("a"), credB = identifiants("b");
  check("compte A (propriétaire) créé", (await A.brut("POST", "/auth/register", credA)).status === 201);
  check("compte B (éditeur) créé", (await B.brut("POST", "/auth/register", credB)).status === 201);
  const projet = await A.api("POST", "/projects", { code: `P.STU.CF${Date.now() % 100000}`, name: "Studio — conflits" });
  check("B ajouté au projet comme éditeur", (await inviterEtAccepter(A.brut, B.brut, projet.id, credB.email, "editeur")).ok);
  const etude = await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude conflits" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const chemin = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const url = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const tete = async () => (await A.api("GET", chemin)).revision;
  const revisions = async () => (await A.api("GET", `${chemin}/revisions`)).revisions;
  const envInit = enveloppe(`init-${randomUUID()}`, etude.revision.id, [ligne("ligne-a", 0, 0), ligne("ligne-b", 0, 4)]);
  const r1 = await A.api("POST", `${chemin}/commands`, envInit);

  const envoisB = [];
  B.page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === `${chemin}/commands`) envoisB.push(r.postDataJSON()); });
  for (const s of [A, B]) {
    await s.page.goto(url);
    await s.page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
    await s.page.locator('svg [data-studio-objet="ligne-a"]').waitFor({ state: "attached" });
  }
  check("deux comptes ouvrent la même variante sur la même tête", (await tete()).id === r1.revision.id);

  // 1. Prévisualisation séparée de la modification confirmée.
  await cliquer(A.page, "Ligne");
  const p1 = await versEcran(A.page, { x: 10, y: 10 }), p2 = await versEcran(A.page, { x: 14, y: 12 });
  await A.page.mouse.click(p1.x, p1.y);
  await A.page.mouse.move(p2.x, p2.y, { steps: 4 });
  await A.page.locator("g.studio-apercu line").first().waitFor({ state: "attached" });
  check("aperçu du tracé affiché, aucune commande en attente", (await enAttente(A.page)) === 0);
  await A.page.keyboard.press("Escape");
  await A.page.locator("g.studio-apercu line").first().waitFor({ state: "detached" });
  check("Échap : aperçu annulé, aucune commande, rien envoyé", (await enAttente(A.page)) === 0 && (await tete()).id === r1.revision.id);
  await cliquer(A.page, "Sélection");

  // 2. Conflit en ligne, revalidation par le report, aucune écriture écrasée.
  await rectangle(A.page, 2, 8);
  await enregistrer(A.page);
  await enregistre(A.page);
  const r2 = await tete();
  check("A enregistre : nouvelle tête", r2.parentRevisionId === r1.revision.id && r2.document.objects.filter((o) => o.type === "rectangle").length === 1);
  await rectangle(B.page, 8, 8);
  await enregistrer(B.page);
  await B.page.locator('[data-studio-hors-ligne="conflit"]').waitFor();
  await B.page.locator("[data-studio-erreur-planche]").filter({ hasText: "Conflit de révision" }).waitFor();
  check("B sur l'ancienne tête : conflit signalé, tête de A intacte", (await tete()).id === r2.id && (await revisions()).length === 3);
  check("conflit : brouillon de B conservé dans la page, report et rechargement proposés",
    (await enAttente(B.page)) === 1 && (await B.page.locator("[data-studio-reporter]").isEnabled()) && (await B.page.locator("[data-studio-recharger]").count()) === 1);
  check("conflit en ligne : rien d'écrit sur l'appareil", (await B.page.locator("[data-studio-hors-ligne]").getAttribute("data-studio-conserve")) === "non");
  await B.page.locator("[data-studio-reporter]").click();
  await B.page.locator(".studio-info").filter({ hasText: "reportée(s) sur la nouvelle version courante" }).waitFor();
  check("report sans chevauchement : aucune confirmation demandée, rectangle de A visible chez B", B.dialogues.length === 0 && (await B.page.locator('svg [role="button"][aria-label^="Rectangle "]').count()) === 2);
  envoisB.length = 0;
  await enregistrer(B.page);
  await enregistre(B.page);
  const r3 = await tete();
  check("report enregistré : nouvelle enveloppe sur la tête de A, les deux rectangles conservés",
    r3.parentRevisionId === r2.id && envoisB.length === 1 && envoisB[0].baseRevisionId === r2.id && r3.document.objects.filter((o) => o.type === "rectangle").length === 2);

  // 3. Chevauchement : A déplace `ligne-a` (autre onglet, par l'API), B la supprime sur l'ancienne tête.
  const r4 = await A.api("POST", `${chemin}/commands`, enveloppe(`a-deplace-${randomUUID()}`, r3.id, [deplacer("ligne-a", 1)]));
  // Sélection au clavier (la ligne, sur le bord de la planche, peut être hors de la fenêtre), puis Supprimer.
  await cliquer(B.page, "Sélection");
  await B.page.locator('svg [data-studio-objet="ligne-a"]').press("Enter");
  await cliquer(B.page, "Supprimer");
  check("B supprime ligne-a dans son brouillon (une commande)", (await enAttente(B.page)) === 1);
  await enregistrer(B.page);
  await B.page.locator('[data-studio-hors-ligne="conflit"]').waitFor();
  const refusB = envoisB.at(-1);
  const corps409 = await B.brut("POST", `${chemin}/commands`, refusB);
  check("serveur : 409 stale_revision nommant le chevauchement (ligne-a)", corps409.status === 409 && corps409.body?.error === "stale_revision" && corps409.body?.headRevisionId === r4.revision.id
    && JSON.stringify(corps409.body?.overlaps) === JSON.stringify(["objects:ligne-a"]), JSON.stringify(corps409.body));
  B.politique.refuserProchaine = true;
  await B.page.locator("[data-studio-reporter]").click();
  await B.page.locator("[data-studio-erreur-planche]").filter({ hasText: "Report abandonné" }).waitFor();
  check("report à chevauchement : confirmation nommant ligne-a ; refusée, rien ne change", B.dialogues.at(-1)?.includes("ligne-a") && (await tete()).id === r4.revision.id
    && (await B.page.locator('[data-studio-hors-ligne="conflit"]').count()) === 1, B.dialogues.at(-1));
  await B.page.locator("[data-studio-reporter]").click();
  await B.page.locator(".studio-info").filter({ hasText: "reportée(s) sur la nouvelle version courante" }).waitFor();
  await enregistrer(B.page);
  await enregistre(B.page);
  const r5 = await tete();
  check("report confirmé : la suppression de B est enregistrée par son choix explicite, sur la tête de A", r5.parentRevisionId === r4.revision.id && !r5.document.objects.some((o) => o.id === "ligne-a") && r5.document.objects.some((o) => o.id === "ligne-b"));

  // 4. Annulation concurrente : A (resté sur une ancienne tête) dessine puis annule.
  await rectangle(A.page, 14, 2);
  check("A dessine : une commande en attente", (await enAttente(A.page)) === 1);
  await A.page.keyboard.press("Escape");
  await A.page.keyboard.press("Control+z");
  await A.page.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "0");
  check("annuler chez A : rien n'est écrit, les changements de B restent dans la tête", (await tete()).id === r5.id && (await revisions()).length === 6);

  // 5. Coupure après envoi : le serveur enregistre, la réponse se perd ; le nouvel essai rejoue le même requestId.
  await B.page.route(`**${chemin}/commands`, async (route) => { await route.fetch(); await route.abort("connectionreset"); }, { times: 1 });
  envoisB.length = 0;
  await rectangle(B.page, 20, 2);
  await enregistrer(B.page);
  await B.page.getByRole("status").filter({ hasText: /^Sauvegarde non confirmée$/ }).waitFor();
  const apresCoupure = (await revisions()).length;
  await reessayer(B.page);
  await enregistre(B.page);
  check("coupure : même requestId renvoyé, rejeu reconnu, une seule révision", envoisB.length === 2 && envoisB[0].requestId === envoisB[1].requestId && apresCoupure === 7 && (await revisions()).length === 7,
    `${envoisB.map((e) => e.requestId).join()} ${apresCoupure}`);

  // 6. Contrôles serveur du contrat.
  const r7 = await tete();
  const anonyme = await browser.newContext();
  const anon = await anonyme.request.fetch(`${BASE}${chemin}/commands`, { method: "POST", headers: { origin: BASE }, data: enveloppe(`anon-${randomUUID()}`, r7.id, [ligne("x", 0)]) });
  check("anonyme : 401", anon.status() === 401);
  await anonyme.close();
  check("auteur forgé dans l'enveloppe : 400, rien d'écrit", (await B.brut("POST", `${chemin}/commands`, { ...enveloppe(`forge-${randomUUID()}`, r7.id, [ligne("forge", 0)]), authorId: "autre" })).status === 400);
  const atomique = await B.brut("POST", `${chemin}/commands`, enveloppe(`atom-${randomUUID()}`, r7.id, [ligne("atome-1", 0, 20), ligne("atome-2", 0, 22), deplacer("inconnu", 1)]));
  const apresAtome = await tete();
  check("lot refusé au milieu : 400, aucune des commandes précédentes appliquée", atomique.status === 400 && apresAtome.id === r7.id && !apresAtome.document.objects.some((o) => o.id.startsWith("atome-")));
  const ancien = await A.brut("POST", `${chemin}/commands`, enveloppe(`a-deplace-x-${randomUUID()}`, r3.id, [deplacer("ligne-b", 1)]));
  check("base périmée : 409, tête intacte", ancien.status === 409 && ancien.body?.baseKnown === true && (await tete()).id === r7.id);
  const rejeuAncien = await A.brut("POST", `${chemin}/commands`, envInit);
  check("rejeu d'une requête ancienne : révision d'origine rendue, tête courante inchangée", rejeuAncien.status === 200 && rejeuAncien.body?.replayed === true && rejeuAncien.body?.revision?.id === r1.revision.id && (await tete()).id === r7.id);
  const premier = (await A.api("GET", `${chemin}/revisions/${r4.revision.id}/changes`));
  check("historique hybride : commandes de la révision telles qu'envoyées, delta par rapport au parent",
    canonique(premier.commands) === canonique([deplacer("ligne-a", 1)]) && JSON.stringify(premier.changedKeys) === JSON.stringify(["objects:ligne-a"]) && premier.parentRevisionId === r3.id, JSON.stringify(premier));
  const initChanges = await B.api("GET", `${chemin}/revisions/${etude.revision.id}/changes`);
  check("historique hybride : révision d'initialisation sans commandes, lisible par l'éditeur", initChanges.commands.length === 0 && initChanges.requestId === null);
  check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs++;
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.stack : e}`);
} finally {
  await browser.close();
}
if (echecs) { console.log(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette studio-conflits : tous les contrôles sont passés.");
