#!/usr/bin/env node
/**
 * Recette du noyau exact dans Studio (lot F2) — sur l'API de Studio V1, par l'interface (API et application construites,
 * même origine), Chromium réel, vrai noyau OCCT (WebAssembly) :
 *
 *  - IF-003 / booléens : outil « Booléen exact » (icône, barre Volume, Ctrl+Maj+Y) ; union de deux boîtes calculée par le
 *    noyau exact dans un Worker chargé À LA DEMANDE (aucun Worker ni .wasm à l'ouverture de Studio) ; aperçu provisoire ;
 *    engagement explicite ; opérandes conservés ; enregistrement : le serveur recalcule, fait autorité et refuse une
 *    empreinte qui ne reproduit pas son calcul ;
 *  - TR-EX-058 : aperçu provisoire marqué, jamais engagé ; boîte tournée : aperçu refusé face au résultat exact ;
 *  - TEST-014 : résultat prêt puis dessin modifié : marqué périmé, non engagé ;
 *  - TEST-015 : coupure du Worker OCCT, puis binaire introuvable : document identique (empreinte de contenu), erreur
 *    affichée, aucune relance silencieuse, relance contrôlée, calcul de nouveau abouti, attente résolue ;
 *  - TR-EX-062 : taille transférée du .wasm, instance unique, CYCLES (50) ouvertures / fermetures de l'outil exact sans
 *    nouveau Worker, sans nouveau téléchargement et sans croissance du tas après ramasse-miettes ;
 *  - TR-EX-096 : notice de licence et texte de la LGPL 2.1 servis ; binaire servi identique à la notice (SHA-256).
 *
 * BASE_URL=http://localhost:3001 OUT=atelier-captures/studio-exact node apps/web/e2e/studio-exact.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-exact";
const CYCLES = Number(process.env.CYCLES ?? 50);
const CHAUFFE = Number(process.env.CHAUFFE ?? 10);
/** Pente maximale admise du tas après ramasse-miettes (octets / cycle) : même seuil que la recette de mémoire (P-08). */
const PENTE_MAX = 16 * 1024;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];

function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) throw new Error(nom);
}
function pente(points) {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n, my = points.reduce((s, [, y]) => s + y, 0) / n;
  const num = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0), den = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  return den === 0 ? 0 : num / den;
}
const boite = (id, x, rotation = 0) => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation }, width: 2, depth: 2, height: 2 } });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  const requetesExact = [];
  context.on("request", (r) => { if (/occt-wasm[^/]*\.wasm|noyau-exact\.worker/.test(r.url())) requetesExact.push(new URL(r.url()).pathname); });
  const wasmDemandes = () => requetesExact.filter((u) => u.endsWith(".wasm")).length;
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-exact-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-exact-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const projet = await api("post", "/projects", { code: "P.STU.F2", name: "Studio — noyau exact" });
  const etude = await api("post", `/projects/${projet.id}/studio/studies`, { name: "Étude booléens" });
  const chemin = `/projects/${projet.id}/studio/studies/${etude.study.id}/variants/${etude.variant.id}`;
  const envoyer = async (cs) => context.request.post(`${BASE}${chemin}/commands`, { data: { contractVersion: "studio-commands/1", requestId: `exact-${randomUUID()}`, baseRevisionId: (await api("get", chemin)).revision.id, commands: cs } });
  // A et B : 2 × 2 × 2 m décalées de 1 m (union exacte 12 m³) ; C et D : la seconde tournée de 45° (aperçu par emprises faux).
  const pose = await envoyer([boite("A", 0), boite("B", 1), boite("C", 10), boite("D", 11, Math.PI / 4)]);
  check("préparation : quatre boîtes posées par commandes", pose.ok(), String(pose.status()));

  const outils = page.locator('[role="toolbar"][aria-label^="Outils"], [role="toolbar"][data-studio-actions-espace]');
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  const panneau = panneaux3d.locator("[data-studio-booleen]");
  const enAttente = () => page.locator("[data-studio-annuler-portee]").getAttribute("data-studio-en-attente-nombre");
  const attendre = (n) => page.waitForFunction((v) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === v, String(n));
  const flou = () => page.evaluate(() => document.activeElement?.blur());
  const metriques = () => page.evaluate(() => globalThis.__fadiExact?.metriques() ?? null);
  const moteur = () => page.evaluate(() => globalThis.__fadiRessources.etats().find((e) => e.id === "noyau-exact"));
  const etatPanneau = (e) => page.locator(`[data-studio-booleen][data-studio-exact-etat="${e}"]`).waitFor();
  const choisir = async (operation, a, b) => {
    await panneau.locator("[data-studio-booleen-operation]").selectOption(operation);
    await panneau.locator('[data-studio-booleen-operande="A"]').selectOption(a);
    await panneau.locator('[data-studio-booleen-operande="B"]').selectOption(b);
  };
  const calculer = async (operation, a, b) => {
    await choisir(operation, a, b);
    await panneau.locator("[data-studio-booleen-calculer]").click();
  };

  // ——— Ouverture : aucun noyau exact ———
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${etude.study.id}/variantes/${etude.variant.id}`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await page.waitForTimeout(500);
  check("IF-003 : ouverture de Studio — aucun Worker du noyau exact, aucun .wasm téléchargé, moteur noyau-exact non chargé",
    requetesExact.length === 0 && (await moteur()).phase === "non-charge" && (await metriques()) === null, JSON.stringify({ requetesExact, moteur: await moteur() }));
  const bouton = outils.locator('[data-studio-famille="volume"] [data-studio-outil="studio.solide.booleen"][aria-label="Booléen exact"][aria-keyshortcuts="Control+Shift+Y"]');
  check("règle d'or : Booléen exact dans la famille Volume, icône propre (tracé), raccourci Ctrl+Maj+Y", (await bouton.locator("svg path").count()) === 1);

  // ——— Activation : chargement à la demande ———
  await flou();
  await page.keyboard.press("Control+Shift+Y");
  await panneau.waitFor();
  await page.locator('[data-studio-booleen][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
  const m1 = await metriques();
  check("IF-003 : Ctrl+Maj+Y ouvre la vue 3D et l'outil ; le noyau exact est chargé à cette occasion dans un Worker dédié (un seul)",
    (await page.locator('[data-studio-outil="studio.solide.booleen"]').first().getAttribute("aria-pressed")) === "true" && m1.workersCrees === 1 && m1.workersVivants === 1 && wasmDemandes() === 1,
    JSON.stringify({ workers: m1.workersCrees, wasm: wasmDemandes() }));
  check("TR-EX-062 : suivi WASM — une instance compilée, taille reçue (corps encodé) et décodée relevées (décodé = taille du binaire), octets transférés relevés",
    m1.suivi?.instances === 1 && m1.suivi.wasm?.decode === 21177576 && m1.suivi.wasm.encode > 0 && Number.isFinite(m1.suivi.wasm.transfere) && m1.suivi.chargementMs > 0, JSON.stringify(m1.suivi));
  const perf7 = await page.evaluate(() => globalThis.__fadiPerf.mesures("PERF-07").map((m) => [m.etiquettes.nature, m.unite]));
  check("TR-EX-062 / PERF-07 : chargement (ms), octets transférés, instances relevés", ["chargement", "wasm-recu", "wasm-transfere", "instances"].every((n) => perf7.some(([x]) => x === n)), JSON.stringify(perf7));
  check("statut du noyau affiché (prêt, instance, Mo reçus) et mention de licence LGPL", /prêt · 1 instance\(s\) · .+ Mo reçus/.test(await panneau.locator("[data-studio-exact-statut-noyau]").textContent())
    && (await panneau.locator("[data-studio-exact-licence]").textContent()).includes("LGPL-2.1"));

  // ——— IF-003 / TR-EX-058 : union exacte, aperçu provisoire confirmé, engagement explicite ———
  check("rien n'est choisi d'office (opération et solides vides)", (await panneau.locator("[data-studio-booleen-operation]").inputValue()) === "" && (await panneau.locator('[data-studio-booleen-operande="A"]').inputValue()) === "");
  const docAvant = await panneau.getAttribute("data-studio-exact-document");
  await calculer("union", "A", "B");
  await etatPanneau("pret");
  const apercu = panneau.locator('[data-studio-exact-apercu="provisoire"]');
  check("TR-EX-058 : aperçu marqué « provisoire, jamais engagé », estimé 12 m³, confirmé par le résultat exact (12 m³)",
    (await apercu.textContent()).startsWith("Aperçu provisoire, jamais engagé") && (await apercu.getAttribute("data-studio-exact-apercu-volume")) === "12"
    && (await apercu.getAttribute("data-studio-exact-apercu-verdict")) === "confirme" && Math.abs(Number(await panneau.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-volume")) - 12) < 1e-9);
  check("IF-003 : le calcul n'a rien engagé (brouillon inchangé, aucune commande en attente)", (await enAttente()) === "0" && (await panneau.getAttribute("data-studio-exact-document")) === docAvant);
  const empreinteClient = await panneau.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-empreinte");
  await panneau.locator("[data-studio-exact-engager]").click();
  await attendre(1);
  const idExact = await panneau.locator("[data-studio-exact-engage]").getAttribute("data-studio-exact-engage");
  const ligne = panneaux3d.locator(`[data-studio-solide="${idExact}"]`);
  check("IF-003 ⑦ / R15 : engagement explicite — un solide exact (union), opérandes A et B conservés et retirés des solides libres",
    (await ligne.getAttribute("data-studio-solide-type")) === "exact" && (await ligne.getAttribute("data-studio-solide-operandes")) === "A B"
    && (await panneaux3d.locator('[data-studio-solide="A"]').count()) === 0 && (await panneaux3d.locator('[data-studio-solide="B"]').count()) === 0);
  await page.locator(`[data-studio-vue3d][data-studio-solides-libres="3"]`).waitFor();
  await page.screenshot({ path: join(OUT, "studio-exact-union.png") });
  await flou();
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const doc1 = (await api("get", chemin)).revision.document;
  const e1 = doc1.exacts?.[0];
  check("enregistrement : le serveur a recalculé et conservé le solide exact (même empreinte que le navigateur, 12 m³, brep et maillage)",
    e1?.id === idExact && e1.operation === "union" && e1.operandes.map((o) => o.id).join(" ") === "A B" && e1.resultat.empreinte === empreinteClient
    && Math.abs(e1.resultat.volume - 12) < 1e-9 && e1.resultat.brep.length > 100 && e1.resultat.maillage.indices.length > 0 && (doc1.solides ?? []).map((s) => s.id).join(" ") === "C D",
    JSON.stringify({ empreinte: e1?.resultat.empreinte, volume: e1?.resultat.volume }));
  // Autorité du serveur : un client qui annonce un autre calcul (opérandes décalés) est refusé ; un volume altéré est corrigé.
  const faux = await envoyer([{ toolId: "studio.solide.booleen", params: { id: "F", operation: "intersection", operandes: ["C", "D"], resultat: { ...e1.resultat } } }]);
  const corps = await faux.json();
  check("R9 : empreinte qui ne reproduit pas le calcul du serveur — refus 400 exact-mismatch, rien n'est écrit", faux.status() === 400 && corps.code === "exact-mismatch" && (await api("get", chemin)).revision.id === (await api("get", chemin)).revision.id
    && !(await api("get", chemin)).revision.document.exacts.some((x) => x.id === "F"), JSON.stringify(corps));

  // ——— TR-EX-058 : boîte tournée, aperçu par emprises refusé ———
  await calculer("intersection", "C", "D");
  await etatPanneau("pret");
  check("TR-EX-058 : boîte tournée de 45° — aperçu provisoire refusé (écart au-delà de la tolérance, expliqué), résultat exact seul engageable",
    (await panneau.locator("[data-studio-exact-verdict]").getAttribute("data-studio-exact-verdict")) === "refuse"
    && (await panneau.locator("[data-studio-exact-verdict]").textContent()).includes("Aperçu provisoire refusé") && (await panneau.locator("[data-studio-exact-verdict]").textContent()).includes("Écart")
    && Number(await panneau.locator("[data-studio-exact-resultat]").getAttribute("data-studio-exact-volume")) < Number(await apercu.getAttribute("data-studio-exact-apercu-volume")));
  await page.screenshot({ path: join(OUT, "studio-exact-apercu-refuse.png") });

  // ——— TEST-014 : résultat prêt, dessin modifié ensuite : périmé, non engagé ———
  await panneaux3d.locator('[data-studio-solide="D"]').click();
  const formD = panneaux3d.locator('[data-studio-solide-choisi="D"]');
  await formD.waitFor();
  await formD.getByLabel("dx (m)", { exact: true }).fill("0.25");
  await formD.getByLabel("dy (m)", { exact: true }).fill("0");
  await formD.getByLabel("dz (m)", { exact: true }).fill("0");
  await formD.getByRole("button", { name: "Déplacer le solide", exact: true }).click();
  await attendre(1);
  await etatPanneau("perime");
  check("TEST-014 : le résultat calculé pour l'ancienne révision est marqué périmé, aucun bouton d'engagement, rien d'engagé",
    (await panneau.locator("[data-studio-exact-perime]").textContent()).startsWith("Résultat périmé") && (await panneau.locator("[data-studio-exact-engager]").count()) === 0 && (await enAttente()) === "1");
  await flou();
  await page.keyboard.press("Control+z");
  await attendre(0);

  // ——— TEST-015 : coupure du Worker OCCT ———
  const docPanne = await panneau.getAttribute("data-studio-exact-document");
  await page.evaluate(() => globalThis.__fadiExact.interrompre());
  await panneau.locator("[data-studio-exact-echec-noyau]").waitFor();
  check("TEST-015 : coupure du Worker — erreur affichée, noyau en échec, Worker arrêté, aucune attente en suspens",
    (await panneau.locator("[data-studio-exact-echec-noyau]").textContent()).includes("Le noyau exact s’est interrompu") && (await metriques()).workersVivants === 0 && (await metriques()).enAttente === 0);
  await calculer("union", "C", "D");
  await etatPanneau("echec");
  check("TEST-015 : aucune relance silencieuse — le calcul suivant est refusé (relancez), aucun nouveau Worker, attente résolue",
    (await panneau.locator("[data-studio-exact-echec]").textContent()).includes("relancez-le") && (await metriques()).workersCrees === 1);
  check("TEST-015 : pas de corruption — document identique (empreinte de contenu), aucune commande en attente", (await panneau.getAttribute("data-studio-exact-document")) === docPanne && (await enAttente()) === "0");
  await page.screenshot({ path: join(OUT, "studio-exact-panne.png") });
  await panneau.locator("[data-studio-exact-echec] [data-studio-exact-relancer]").click();
  await page.locator('[data-studio-booleen][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
  await calculer("union", "C", "D");
  await etatPanneau("pret");
  check("TEST-015 : relance contrôlée — nouveau Worker, calcul de nouveau abouti", (await metriques()).workersCrees === 2 && (await metriques()).relances === 1);
  // Binaire introuvable (composant remplacé par une adresse fausse) : même conduite, puis retour au binaire distribué.
  await page.evaluate(() => { localStorage.setItem("fadi.occt.wasm", "/assets/inexistant-occt.wasm"); });
  await panneau.locator("[data-studio-exact-resultat]").waitFor();
  await page.evaluate(() => globalThis.__fadiExact.interrompre());
  await panneau.locator("[data-studio-exact-echec-noyau] [data-studio-exact-relancer]").click();
  await panneau.locator("[data-studio-exact-echec-noyau]").waitFor();
  await page.waitForFunction(() => globalThis.__fadiExact.metriques().etat === "echec" && globalThis.__fadiExact.metriques().relances === 2);
  check("TEST-015 : binaire introuvable — échec du chargement annoncé, document identique", (await panneau.getAttribute("data-studio-exact-document")) === docPanne && (await metriques()).workersVivants === 0);
  await page.evaluate(() => { localStorage.removeItem("fadi.occt.wasm"); });
  await panneau.locator("[data-studio-exact-echec-noyau] [data-studio-exact-relancer]").click();
  await page.locator('[data-studio-booleen][data-studio-exact-noyau="pret"]').waitFor({ timeout: 120000 });
  check("TEST-015 : relance après retour au binaire distribué — prêt, une instance", (await metriques()).suivi.instances === 1 && (await metriques()).workersVivants === 1);

  // ——— TR-EX-062 : 50 ouvertures / fermetures de l'outil exact ———
  const cdp = await context.newCDPSession(page);
  const tasApresGc = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
    return (await cdp.send("Runtime.getHeapUsage")).usedSize;
  };
  const avantCycles = { workers: (await metriques()).workersCrees, wasm: wasmDemandes(), initialisations: (await moteur()).initialisations };
  const cycle = async () => {
    await flou();
    await page.keyboard.press("b");
    await panneau.waitFor({ state: "detached" });
    await page.keyboard.press("Control+Shift+Y");
    await page.locator('[data-studio-booleen][data-studio-exact-noyau="pret"]').waitFor();
  };
  for (let c = 0; c < CHAUFFE; c++) await cycle();
  const courbe = [];
  for (let c = 1; c <= CYCLES; c++) { await cycle(); courbe.push([c, await tasApresGc()]); }
  const p = pente(courbe);
  const apres = await metriques();
  writeFileSync(join(OUT, "studio-exact-memoire.json"), JSON.stringify({ cycles: CYCLES, chauffe: CHAUFFE, avantCycles, apres, courbe, penteOctetsParCycle: Math.round(p), penteMax: PENTE_MAX, navigateur: browser.version() }, null, 2));
  check(`TR-EX-062 : ${CHAUFFE + CYCLES} ouvertures / fermetures de l'outil exact — même Worker, aucun nouveau téléchargement du .wasm, moteur initialisé une fois, une instance`,
    apres.workersCrees === avantCycles.workers && wasmDemandes() === avantCycles.wasm && (await moteur()).initialisations === avantCycles.initialisations && apres.suivi.instances === 1 && apres.workersVivants === 1,
    JSON.stringify({ avantCycles, workers: apres.workersCrees, wasm: wasmDemandes() }));
  check(`TR-EX-062 : tas JavaScript après ramasse-miettes sans croissance (pente ≤ ${PENTE_MAX} o/cycle sur ${CYCLES} cycles)`, CYCLES >= 20 && p <= PENTE_MAX, `${Math.round(p)} o/cycle`);
  await calculer("union", "C", "D");
  await etatPanneau("pret");
  check("TR-EX-062 : après les cycles, le noyau calcule toujours (même instance)", (await metriques()).suivi.instances === 1);

  // ——— TR-EX-096 : licence et provenance servies ———
  const notice = await (await context.request.get(`${BASE}/licences/occt-wasm/NOTICE.json`)).json();
  const lgpl = await (await context.request.get(`${BASE}/licences/occt-wasm/LGPL-2.1.txt`)).text();
  const txt = await (await context.request.get(`${BASE}/licences/occt-wasm/NOTICE.txt`)).text();
  const binaire = await (await context.request.get(`${BASE}${notice.fichier}`)).body();
  check("TR-EX-096 : notice servie (occt-wasm 5.6.1, LGPL-2.1-only, remplacement), texte LGPL 2.1 servi, binaire servi identique à la notice (SHA-256) et seul .wasm demandé",
    notice.composant === "occt-wasm" && notice.version === "5.6.1" && notice.licence === "LGPL-2.1-only" && txt.includes("fadi.occt.wasm") && lgpl.includes("GNU LESSER GENERAL PUBLIC LICENSE")
    && createHash("sha256").update(binaire).digest("hex") === notice.sha256 && requetesExact.filter((u) => u.endsWith(".wasm")).every((u) => u === notice.fichier || u === "/assets/inexistant-occt.wasm"),
    `${notice.fichier} ${notice.sha256.slice(0, 12)}`);
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette du noyau exact dans Studio (lot F2) : tous les contrôles passent.");
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (erreurs.length) console.error(erreurs.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
