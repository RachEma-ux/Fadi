#!/usr/bin/env node
/**
 * Recette Studio — lot DEC (ADR-STUDIO-PILOTE-01, P-12), par l'interface et l'API réelles (application construite servie
 * par l'API, base migrée jetable). Comptes, projets et dessins synthétiques ; aucune donnée de projet réelle.
 *
 *   1. TR-EX-013 / TR-INV-003 : dérivation « copie indépendante » choisie dans l'interface — nouvelles identités,
 *      provenance par élément, la source reste inchangée quand la copie est modifiée ;
 *   2. TR-EX-036 : bascule Planche 2D ⇄ 3D (Maj+D) — le focus passe, visible, à la planche qui apparaît ; flèches sur la
 *      planche 2D : la vue se déplace sans pointeur ;
 *   3. TR-IF-002 [−] : geste Ligne commencé puis Échap — aucune commande, document inchangé ;
 *   4. X.2-02 : invitation et acceptation d'exigence refusées sous le verrou d'un autre compte (423) et sur le projet de
 *      référence (403 reference-protegee) ; admises une fois le verrou rendu ;
 *   5. TR-EX-046 (avec DATABASE_URL) : refus et export journalisés dans `studio_access_events`, minimisés ;
 *   6. MIG-COEX-04 : base locale v5 (brouillons Studio sans propriétaire) montée par l'application réelle — les lignes
 *      passent en quarantaine, consultables dans Paramètres et exportables en JSON.
 *
 * BASE_URL=http://localhost:3001 [DATABASE_URL=…] [MAILPIT_URL=… | API_LOG=…] node apps/web/e2e/studio-dec.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail && !ok ? ` — ${String(detail).slice(0, 600)}` : ""}`);
  if (!ok) echecs += 1;
}
const court = (x) => JSON.stringify(x).slice(0, 400);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });

async function session(nom) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(`${nom} : ${e.message}`));
  page.on("dialog", (d) => void d.accept());
  const cred = { email: `studio-dec-${nom}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`, password: `studio-dec-${randomUUID()}` };
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', cred.email);
  await page.fill('input[name="password"]', cred.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const brut = async (method, path, data) => {
    const r = await context.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, "content-type": "application/json" }, ...(data === undefined ? {} : { data }) });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  const api = async (method, path, data) => {
    const r = await brut(method, path, data);
    if (r.status >= 400) throw new Error(`${nom} : ${method} ${path} → ${r.status} ${court(r.body)}`);
    return r.body;
  };
  return { nom, context, page, cred, brut, api };
}
async function partie(nom, f) {
  try { await f(); } catch (e) { check(`${nom} : déroulé complet`, false, e?.stack ?? String(e)); }
}
const enveloppe = (requestId, baseRevisionId, commands) => ({ contractVersion: "studio-commands/1", requestId, baseRevisionId, commands });
const flou = (page) => page.evaluate(() => document.activeElement?.blur());

try {
  const A = await session("proprio");
  const projet = await A.api("POST", "/projects", { code: `DEC-${Date.now() % 100000}`, name: "Recette DEC" });
  const etude = await A.api("POST", `/projects/${projet.id}/studio/studies`, { name: "Étude DEC" });
  const S = `/projects/${projet.id}/studio/studies/${etude.study.id}`;
  const V = `${S}/variants/${etude.variant.id}`;
  const ligne = (id, y) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 4, y } } });
  const mur = { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }], thickness: 0.2, height: 3, base: 0, justification: "center" } };
  const baie = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };
  await A.api("POST", `${V}/commands`, enveloppe(`dec-${randomUUID()}`, etude.variant.headRevisionId, [ligne("l1", 0), mur, { toolId: "studio.architecture.ouverture", params: baie }]));

  // ——— 1. TR-EX-013 / TR-INV-003 : copie indépendante par l'interface ———
  await partie("TR-EX-013", async () => {
    const { page } = A;
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}`);
    await page.locator(`[data-studio-deriver="${etude.variant.id}"]`).click();
    const form = page.locator(`[data-studio-deriver-formulaire="${etude.variant.id}"]`);
    await form.locator("[data-studio-deriver-copie]").check();
    await form.getByLabel("Nom de la variante dérivée").fill("Copie indépendante DEC");
    await form.getByRole("button", { name: "Créer la variante dérivée" }).click();
    await page.waitForURL(new RegExp(`/variantes/(?!${etude.variant.id})[^/?]+`));
    const copieId = /variantes\/([^/?]+)/.exec(page.url())[1];
    const source = await A.api("GET", V);
    const copie = await A.api("GET", `${S}/variants/${copieId}`);
    const idsSource = new Set([...source.revision.document.objects, ...source.revision.document.architecture].map((o) => o.id));
    const idsCopie = [...copie.revision.document.objects, ...copie.revision.document.architecture].map((o) => o.id);
    check("TR-EX-013 : copie indépendante créée depuis l'interface — provenance « copie » vers la source et sa révision", copie.derivedFrom?.mode === "copie" && copie.derivedFrom.variantId === etude.variant.id && copie.derivedFrom.revisionId === source.variant.headRevisionId, court(copie.derivedFrom));
    check("TR-INV-003 : la copie porte de nouvelles identités (aucun identifiant de la source réutilisé), chacune reliée à sa source", idsCopie.length === idsSource.size && idsCopie.every((id) => !idsSource.has(id) && idsSource.has(copie.derivedFrom.identites[id])), idsCopie.join(","));
    const baieCopie = copie.revision.document.architecture.find((a) => a.type === "opening");
    await A.api("POST", `${S}/variants/${copieId}/commands`, enveloppe(`dec-${randomUUID()}`, copie.variant.headRevisionId, [{ toolId: "studio.architecture.modifier", params: { ...baieCopie, width: 0.8 } }]));
    const sourceApres = await A.api("GET", V);
    check("TR-INV-003 : modifier la copie ne propage rien vers la source (révision et document inchangés)", sourceApres.variant.headRevisionId === source.variant.headRevisionId && JSON.stringify(sourceApres.revision.document) === JSON.stringify(source.revision.document));
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}`);
    const carte = page.locator(`[data-studio-variante-carte="${copieId}"] [data-studio-provenance-mode="copie"]`);
    check("TR-EX-013 : la liste des variantes nomme la provenance « Copie indépendante de »", ((await carte.textContent()) ?? "").startsWith("Copie indépendante de :"));
  });

  // ——— 2. TR-EX-036 : focus visible à la bascule 2D ⇄ 3D ; panoramique au clavier ———
  await partie("TR-EX-036", async () => {
    const { page } = A;
    await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
    const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
    await planche.waitFor();
    await flou(page);
    await page.keyboard.press("Shift+D");
    await page.waitForFunction(() => document.activeElement?.matches("section[data-studio-vue3d]"), null, { timeout: 30000 });
    const focus3d = await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { bascule: el.getAttribute("data-studio-focus-bascule"), outline: s.outlineStyle, largeur: parseFloat(s.outlineWidth) }; });
    check("TR-EX-036 : Maj+D (2D → 3D) déplace le focus sur la vue 3D, avec un contour visible", focus3d.bascule === "3d" && focus3d.outline !== "none" && focus3d.largeur >= 2, court(focus3d));
    await page.keyboard.press("Shift+D");
    await page.waitForFunction(() => document.activeElement?.matches('svg[aria-label="Planche de dessin 2D"]'), null, { timeout: 20000 });
    const focus2d = await page.evaluate(() => { const el = document.activeElement; const s = getComputedStyle(el); return { bascule: el.getAttribute("data-studio-focus-bascule"), outline: s.outlineStyle }; });
    check("TR-EX-036 : Maj+D (3D → 2D) ramène le focus sur la planche 2D, avec un contour visible", focus2d.bascule === "2d" && focus2d.outline !== "none", court(focus2d));
    const avant = await planche.getAttribute("viewBox");
    await page.keyboard.press("ArrowRight");
    const apres = await planche.getAttribute("viewBox");
    const [x0] = avant.split(" ").map(Number), [x1, , w1] = apres.split(" ").map(Number);
    check("TR-EX-036 : flèche droite sur la planche ayant le focus — la vue se déplace d'un dixième, sans pointeur", Math.abs(x1 - x0 - w1 * 0.1) < 1e-9, `${avant} → ${apres}`);
  });

  // ——— 3. TR-IF-002 [−] : Échap sur un geste Ligne commencé ———
  await partie("TR-IF-002", async () => {
    const { page } = A;
    const avant = await A.api("GET", V);
    const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
    await flou(page);
    await page.keyboard.press("l");
    const boite = await planche.boundingBox();
    await page.mouse.click(boite.x + boite.width * 0.3, boite.y + boite.height * 0.4);
    await page.mouse.move(boite.x + boite.width * 0.6, boite.y + boite.height * 0.5);
    await page.keyboard.press("Escape");
    const attente = await page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
    const apres = await A.api("GET", V);
    check("TR-IF-002 [−] Ligne commencée puis Échap : aucune commande en attente, document du serveur inchangé", attente === "0" && apres.variant.headRevisionId === avant.variant.headRevisionId, `en attente ${attente}`);
  });

  // ——— 4. X.2-02 : verrou d'un autre compte et projet de référence ———
  await partie("X.2-02", async () => {
    const E = await session("editeur");
    const inviteE = await inviterEtAccepter(A.brut, E.brut, projet.id, E.cred.email, "editeur");
    check("X.2-02 [+] sans verrou : invitation de l'éditeur envoyée et acceptée", inviteE.ok, court(inviteE));
    const exigence = { id: "ref1", libelle: "Exigence partenaire (essai)", metrique: { type: "nombre" }, comparaison: "<=", valeur: 10, unite: "u", source: "Référence partenaire d'essai", origine: { reference: "Partenaire — référence R-1 (essai)" } };
    const jeu = await A.api("POST", `${S}/exigences`, { baseVersion: 0, exigences: [exigence] });
    check("X.2-02 : verrou d'édition posé par l'éditeur", (await E.brut("PUT", `/projects/${projet.id}/lock`)).status === 200);
    const sousVerrou = await A.brut("POST", `/projects/${projet.id}/members`, { email: `dec-f-${randomUUID().slice(0, 8)}@example.com`, role: "lecteur" });
    check("X.2-02 [−] invitation refusée sous le verrou d'un autre compte (423 locked)", sousVerrou.status === 423 && sousVerrou.body?.error === "locked", court(sousVerrou));
    const accepteSousVerrou = await A.brut("POST", `${S}/exigences/acceptations`, { baseVersion: jeu.version, exigenceId: "ref1" });
    check("X.2-02 [−] acceptation d'exigence refusée sous le verrou d'un autre compte (423)", accepteSousVerrou.status === 423, court(accepteSousVerrou));
    const membres = await A.api("GET", `/projects/${projet.id}/members`);
    check("X.2-02 [−] refus sans écriture : aucune invitation en attente créée", !(membres.invitations ?? []).some((i) => /dec-f-/.test(i.email ?? "")), court(membres.invitations));
    check("X.2-02 : verrou rendu par l'éditeur", (await E.brut("DELETE", `/projects/${projet.id}/lock`)).status === 204);
    const libre = await A.brut("POST", `/projects/${projet.id}/members`, { email: `dec-g-${randomUUID().slice(0, 8)}@example.com`, role: "lecteur" });
    check("X.2-02 [+] verrou rendu : invitation admise (202)", libre.status === 202, court(libre));
    const accepte = await A.brut("POST", `${S}/exigences/acceptations`, { baseVersion: jeu.version, exigenceId: "ref1" });
    check("X.2-02 [+] verrou rendu : acceptation d'exigence admise (201)", accepte.status === 201, court(accepte));
    const reference = await A.api("POST", "/examples/p118-exemple-complet/import");
    const surReference = await A.brut("POST", `/projects/${reference.id}/members`, { email: `dec-h-${randomUUID().slice(0, 8)}@example.com`, role: "lecteur" });
    check("X.2-02 [−] invitation refusée sur le projet de référence (403 reference-protegee)", surReference.status === 403 && surReference.body?.motif === "reference-protegee", court(surReference));
    const etudesRef = await A.api("GET", `/projects/${reference.id}/studio/studies`);
    const etudeRef = etudesRef.studies[0];
    if (etudeRef) {
      const acceptRef = await A.brut("POST", `/projects/${reference.id}/studio/studies/${etudeRef.id}/exigences/acceptations`, { baseVersion: 1, exigenceId: "x" });
      check("X.2-02 [−] acceptation d'exigence refusée sur le projet de référence (403 reference-protegee)", acceptRef.status === 403 && acceptRef.body?.motif === "reference-protegee", court(acceptRef));
    } else check("X.2-02 : étude exemple présente dans le projet de référence", false, court(etudesRef));
    await E.context.close();
  });

  // ——— 5. TR-EX-046 : journal d'accès Studio (lecture directe de la base jetable) ———
  await partie("TR-EX-046", async () => {
    const X = await session("etranger");
    check("TR-EX-046 : un compte étranger est refusé sur la variante (404)", (await X.brut("GET", V)).status === 404);
    check("TR-EX-046 : export SVG de la variante par le propriétaire (200)", (await A.brut("GET", `${V}/export?format=svg`)).status === 200);
    if (!process.env.DATABASE_URL) { console.log("TR-EX-046 base : NON EXÉCUTÉ (DATABASE_URL absente) — couvert par routes/studio-journal-acces.test.ts (DB-3)."); return; }
    const pg = (await import("pg")).default;
    const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await sql.connect();
    let lignes = [];
    for (let i = 0; i < 20 && lignes.length < 2; i++) {
      lignes = (await sql.query("SELECT actor_id, method, route, status, kind, motif, row_to_json(e)::text AS brut FROM studio_access_events e WHERE project_id = $1 AND route LIKE '/studies/:studyId/variants/:variantId%' AND (status = 404 OR kind = 'export') ORDER BY occurred_at", [projet.id])).rows;
      if (lignes.length < 2) await new Promise((r) => setTimeout(r, 250));
    }
    await sql.end();
    check("TR-EX-046 : le refus et l'export sont journalisés, route générique, statut et genre", lignes.some((l) => l.kind === "refus" && l.status === 404 && l.route === "/studies/:studyId/variants/:variantId") && lignes.some((l) => l.kind === "export" && l.route === "/studies/:studyId/variants/:variantId/export"), court(lignes));
    check("TR-EX-046 : minimisation — ni courriel, ni adresse IP, ni identifiant d'étude dans le journal", lignes.every((l) => !/@|127\.0\.0\.1|::1/.test(l.brut) && !l.brut.includes(etude.study.id)), court(lignes));
    await X.context.close();
  });

  // ——— 6. MIG-COEX-04 : quarantaine des données locales sans propriétaire ———
  await partie("MIG-COEX-04", async () => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    // Origine de l'application sans l'application (aucune base locale ouverte) : une base v5 est préparée telle qu'un
    // ancien build l'aurait laissée (brouillons et contextes Studio sans propriétaire).
    await page.goto(`${BASE}/sw.js`);
    const pret = await page.evaluate(() => new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase("fadi-local");
      del.onerror = () => reject(new Error("suppression"));
      del.onsuccess = () => {
        const req = indexedDB.open("fadi-local", 50);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("modelCache", { keyPath: "projectId" });
          db.createObjectStore("keyValue", { keyPath: "key" });
          const lots = db.createObjectStore("lots", { keyPath: "id" }); lots.createIndex("projectId", "projectId"); lots.createIndex("ordre", "ordre");
          db.createObjectStore("studioBrouillons", { keyPath: "cle" }).createIndex("projectId", "projectId");
          db.createObjectStore("studioContextes", { keyPath: "cle" }).createIndex("projectId", "projectId");
        };
        req.onerror = () => reject(new Error("ouverture"));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["studioBrouillons", "studioContextes"], "readwrite");
          tx.objectStore("studioBrouillons").put({ cle: "p-ancien|s|v", projectId: "p-ancien", stamp: "a", donnees: "{\"commandes\":[\"ligne d'essai\"]}", majA: "2026-05-01T00:00:00.000Z" });
          tx.objectStore("studioContextes").put({ cle: "p-ancien|s|v", projectId: "p-ancien", contexte: "{}", luA: "2026-05-01T00:00:00.000Z" });
          tx.oncomplete = () => { db.close(); resolve(true); };
          tx.onerror = () => reject(new Error("écriture"));
        };
      };
    }));
    check("MIG-COEX-04 : base locale v5 préparée (deux lignes Studio sans propriétaire)", pret === true);
    await page.goto(`${BASE}/connexion`);
    await page.fill('input[name="email"]', A.cred.email);
    await page.fill('input[name="password"]', A.cred.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(accueil|projets)$/);
    await page.goto(`${BASE}/parametres`);
    const bloc = page.locator("[data-quarantaine-locale]");
    await page.waitForFunction(() => document.querySelector("[data-quarantaine-locale]")?.getAttribute("data-quarantaine-locale") === "2", null, { timeout: 20000 });
    check("MIG-COEX-04 [+] montée réelle v5 → v9 : les deux lignes sans propriétaire sont en quarantaine, consultables dans Paramètres", (await bloc.locator("[data-quarantaine-entree]").count()) === 2 && (await bloc.locator('[data-quarantaine-entree="studioBrouillons"]').count()) === 1);
    const telechargement = page.waitForEvent("download");
    await page.locator("[data-quarantaine-exporter]").click();
    const fichier = await telechargement;
    const chemin = await fichier.path();
    const contenu = JSON.parse((await import("node:fs")).readFileSync(chemin, "utf8"));
    check("MIG-COEX-04 [+] export JSON : les lignes d'origine sont restituées intactes", contenu.format === "fadi-quarantaine-locale/1" && contenu.entrees.some((e) => e.table === "studioBrouillons" && e.ligne.donnees === "{\"commandes\":[\"ligne d'essai\"]}"), court(contenu));
    const restes = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open("fadi-local");
      req.onsuccess = () => { const db = req.result; const tx = db.transaction(["studioBrouillons", "quarantaine"]); const out = {}; let n = 0;
        for (const t of ["studioBrouillons", "quarantaine"]) { const c = tx.objectStore(t).count(); c.onsuccess = () => { out[t] = c.result; if (++n === 2) { db.close(); resolve({ ...out, version: db.version }); } }; } };
    }));
    check("MIG-COEX-04 [−] les lignes ne sont ni rejouées ni perdues : brouillons sans propriétaire retirés de leur table, quarantaine conservée", restes.studioBrouillons === 0 && restes.quarantaine === 2 && restes.version === 90, court(restes));
    await context.close();
  });
} catch (e) {
  check("déroulé de la recette", false, e?.stack ?? String(e));
} finally {
  await browser.close();
}
check("aucune erreur JavaScript dans les pages", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette DEC : tous les contrôles passent.");
process.exit(echecs ? 1 : 0);
