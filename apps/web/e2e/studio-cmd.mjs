#!/usr/bin/env node
/**
 * Recette du lot CMD (Studio) sur l'API réelle et l'application construite, base PostgreSQL migrée, données synthétiques :
 * 1. EX-010 / IF-011 : effets d'une commande acceptée et journal des changements de révision (eventId, transaction,
 *    horodatage serveur, effets) ; aucun événement pour un lot refusé.
 * 2. EX-045 / EX-088 : essai à portée de révision (aucune révision écrite), confirmation reliée au job, essai périmé
 *    refusé ; résultat du job lu sous l'autorisation de l'étude, refusé sans métadonnée à un autre compte.
 * 3. IF-001 : contrat d'étude (site, sources, version) — pièce d'étape réelle, source indisponible sans création partielle.
 * 4. EX-091 / EX-019 : migration studio-document/1 → /2 simulée (job), accordée, appliquée, retirée ; révisions intactes.
 * 5. MIG-COEX-06 : bascule Atelier → Studio sur la vraie API — une seule chaîne d'écriture à la fois (commandes Atelier
 *    et Studio), consultation historique ouverte, retour arrière.
 * 6. EX-002 : commande hors périmètre refusée par un motif nommé.
 * 7. Navigateur (Double vue) : EX-051 / INV-006 / EX-016 — la vue 3D affiche sa révision source serveur, son état et
 *    les données périmées ; INV-002 — même révision serveur dans la barre de la planche 2D et la vue 3D ; EX-008 — trace
 *    horodatée intention → commande → mutation canonique → scène invalidée d'un seul geste.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-cmd.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
}
function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const brut = body instanceof Buffer;
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { ...(brut ? {} : { "content-type": "application/json" }), origin: BASE, ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : brut ? body : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
const identifiants = () => ({ email: `studio-cmd-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") });
const proprio = client(), autre = client();
check("comptes créés par l'API", (await proprio("POST", "/auth/register", identifiants())).status === 201 && (await autre("POST", "/auth/register", identifiants())).status === 201);
const projet = (await proprio("POST", "/projects", { code: `CMD_${randomUUID().slice(0, 6)}`, name: "Studio — recette CMD (synthétique)" })).body;
const P = `/projects/${projet.id}/studio`;
const etude = (await proprio("POST", `${P}/studies`, { name: "Étude CMD" })).body;
const V = `${P}/studies/${etude.study.id}/variants/${etude.variant.id}`;
const tete = async () => (await proprio("GET", V)).body.variant.headRevisionId;
const env = async (commands, base) => ({ contractVersion: "studio-commands/1", requestId: `cmd-${randomUUID()}`, baseRevisionId: base ?? await tete(), commands });
const rect = (id, x = 0) => ({ toolId: "studio.dessin.rectangle", params: { id, type: "rectangle", origin: { x, y: 0 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } } });

// ——— 1. Effets et journal ———
const ligneA = { toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } } };
const r1 = await proprio("POST", `${V}/commands`, await env([ligneA, { toolId: "studio.dessin.cote", params: { id: "c", type: "dimension", start: { x: 0, y: 0 }, end: { x: 2, y: 0 }, offset: 1, links: { start: { objectId: "a", anchor: "start" }, end: { objectId: "a", anchor: "end" } }, toResolve: false } }]));
check("EX-010 : la réponse d'une commande acceptée porte ses effets (créés, références, domaines invalidés, révision, origine)",
  r1.status === 200 && JSON.stringify(r1.body.effects?.crees) === JSON.stringify(["a", "c"]) && r1.body.effects?.references?.ajoutees?.length === 1 && r1.body.effects.references.ajoutees[0].de === "c" && r1.body.effects?.revisionSortie === r1.body.revision?.id && r1.body.effects?.domainesInvalides?.includes("maillage-3d"), JSON.stringify(r1.body).slice(0, 300));
const refuse = await proprio("POST", `${V}/commands`, await env([ligneA]));
const journal = (await proprio("GET", `${V}/journal`)).body;
const e1 = journal?.evenements?.[0];
check("IF-011 : un événement par révision engagée — eventId, transaction (applicative et PostgreSQL), auteur, étude, variante, base, issue, effets, horodatage serveur",
  refuse.status === 400 && journal?.evenements?.length === 1 && e1.eventId === r1.body.eventId && /^studio_tx_/.test(e1.transactionId) && /^\d+$/.test(e1.xactId ?? "") && e1.studyId === etude.study.id
  && e1.baseRevisionId === etude.revision.id && e1.revisionId === r1.body.revision.id && Math.abs(Date.parse(e1.createdAt) - Date.now()) < 120_000 && e1.jobId === null, JSON.stringify(journal).slice(0, 400));
const del = await proprio("POST", `${V}/commands`, await env([{ toolId: "studio.dessin.supprimer", params: { ids: ["a"] } }]));
check("EX-010 [−] : suppression de l'objet lié — relation retirée et cote « à résoudre » décrites, publications invalidées",
  del.status === 200 && del.body.effects?.references?.retirees?.some((r) => r.de === "c" && r.vers === "a") && del.body.effects?.contraintes?.[0]?.apres === true && del.body.effects?.domainesInvalides?.includes("publications"));

// ——— 2. Essais et jobs ———
const nbRevisions = async () => (await proprio("GET", `${V}/revisions`)).body.revisions.length;
const avantEssai = await nbRevisions();
const essai = await proprio("POST", `${V}/essais`, await env([rect("e", 10)]));
check("EX-045 [+] : essai à portée de révision — résultat (géométrie, effets, validité) sans révision écrite",
  essai.status === 201 && essai.body.status === "termine" && essai.body.result?.valideSur === await tete() && essai.body.result?.geometrie?.e?.type === "rectangle" && (await nbRevisions()) === avantEssai, JSON.stringify(essai.body).slice(0, 300));
const job = await proprio("GET", `${P}/jobs/${essai.body.id}`);
const jobAutre = await autre("GET", `${P}/jobs/${essai.body.id}`);
check("EX-088 : résultat de job serveur traçable lu sous l'autorisation de l'étude ; autre compte refusé sans métadonnée",
  job.status === 200 && job.body.kind === "essai-commandes" && job.body.sourceRevisionId === essai.body.sourceRevisionId && jobAutre.status >= 403 && !JSON.stringify(jobAutre.body).includes(essai.body.id));
const conf = await proprio("POST", `${V}/essais/${essai.body.id}/confirmer`);
const journal2 = (await proprio("GET", `${V}/journal`)).body.evenements;
check("EX-045 [+] / IF-011 : confirmation sur base valide — révision écrite, événement relié au job", conf.status === 200 && journal2.at(-1)?.jobId === essai.body.id && journal2.at(-1)?.revisionId === conf.body.revision?.id);
const essai2 = await proprio("POST", `${V}/essais`, await env([rect("f", 20)]));
await proprio("POST", `${V}/commands`, await env([rect("g", 30)]));
const perime = await proprio("POST", `${V}/essais/${essai2.body.id}/confirmer`);
check("EX-045 [−] : essai calculé sur R12 confirmé quand R13 est la tête — refusé (essai_perime), rien d'engagé", perime.status === 409 && perime.body.error === "essai_perime");

// ——— 3. Contrat d'étude ———
const piece = await proprio("POST", `/projects/${projet.id}/steps/2/files`, Buffer.from("releve synthetique"), { "x-file-name": "releve.txt", "content-type": "application/octet-stream" });
const contexte = (id) => ({ version: "studio-contexte-etude/1", site: { parcelles: [] }, sources: [{ type: "piece-etape", id }] });
const avecContexte = await proprio("POST", `${P}/studies`, { name: "Étude rattachée", contexte: contexte(piece.body?.file?.id) });
const sansSource = await proprio("POST", `${P}/studies`, { name: "Étude orpheline", contexte: contexte("piece-absente") });
const etudes = (await proprio("GET", `${P}/studies`)).body.studies.map((s) => s.name);
check("IF-001 : étude rattachée avec ses sources et sa version — contexte validé et identifiant stable ; source indisponible refusée sans création partielle",
  piece.status === 201 && avecContexte.status === 201 && avecContexte.body.contexte?.sources?.[0]?.etape === 2 && sansSource.status === 409 && sansSource.body.error === "source_indisponible" && !etudes.includes("Étude orpheline"), `${piece.status} ${avecContexte.status} ${JSON.stringify(sansSource.body)}`);

// ——— 4. Migration de schéma ———
const avantMigration = await nbRevisions();
const sim = await proprio("POST", `${P}/studies/${etude.study.id}/migrations`, { cible: "studio-document/2" });
const acc = await proprio("POST", `${P}/studies/${etude.study.id}/migrations/${sim.body.id}/accorder`);
const app = await proprio("POST", `${P}/studies/${etude.study.id}/migrations/${sim.body.id}/appliquer`);
const doc2 = await proprio("GET", `${P}/studies/${etude.study.id}/migrations/${sim.body.id}/documents/${await tete()}`);
const rb = await proprio("POST", `${P}/studies/${etude.study.id}/migrations/${sim.body.id}/retour-arriere`);
check("EX-091 : simulation (comparaison identifiants, propriétés, cotes, associations, historique, accès), accord du propriétaire, application des copies /2, retour arrière",
  sim.status === 201 && sim.body.verdict === "sans-perte" && sim.body.rapport?.comptes?.historique?.compares === await nbRevisions() && acc.body.statut === "accordee" && app.body.statut === "appliquee"
  && doc2.body?.document?.schemaVersion === "studio-document/2" && rb.body.statut === "retour-arriere" && rb.body.documentsMigres === 0 && app.body.documentsMigres === avantMigration && (await nbRevisions()) === avantMigration, JSON.stringify(sim.body).slice(0, 300));

// ——— 5. Bascule Atelier → Studio ———
const atelier = async (base, id) => proprio("POST", `/projects/${projet.id}/atelier/commands`, { requestId: `at-${randomUUID()}`, baseRevision: base, contract: "atelier-commands/1", label: "Niveau", commands: [{ type: "niveau.creer", params: { id, nom: id, elevation: 0 } }] });
const a0 = await atelier(0, "rdc");
check("MIG-COEX-06 : sans bascule, l'Atelier écrit (commande réelle)", a0.status === 200, JSON.stringify(a0.body).slice(0, 200));
const prep = await proprio("POST", `${P}/bascule/preparer`, { studyId: etude.study.id });
const sRefus = await proprio("POST", `${V}/commands`, await env([rect("h", 40)]));
const a1 = await atelier(1, "r1");
check("MIG-COEX-06 : bascule préparée — l'Atelier écrit, l'étude Studio refuse (chemin_ecriture) et reste lisible",
  prep.status === 200 && prep.body.autorite === "atelier" && sRefus.status === 409 && sRefus.body.error === "chemin_ecriture" && a1.status === 200 && (await proprio("GET", V)).status === 200);
const bas = await proprio("POST", `${P}/bascule/basculer`);
const a2 = await atelier(2, "r2");
const lectureAtelier = await proprio("GET", `/projects/${projet.id}/atelier/model`);
const sOk = await proprio("POST", `${V}/commands`, await env([rect("h", 40)]));
check("MIG-COEX-06 : basculé — l'Atelier refuse toute écriture (chemin_ecriture) mais reste consultable ; Studio écrit ; point de retour figé",
  bas.status === 200 && bas.body.pointRetour?.atelierModelRevision === 2 && a2.status === 409 && a2.body.erreur === "chemin_ecriture" && lectureAtelier.status === 200 && sOk.status === 200, `${a2.status} ${JSON.stringify(a2.body).slice(0, 200)}`);
const ret = await proprio("POST", `${P}/bascule/retour-arriere`);
const a3 = await atelier(2, "r2");
const sRefus2 = await proprio("POST", `${V}/commands`, await env([rect("i", 50)]));
const basAutre = await autre("POST", `${P}/bascule/basculer`);
check("MIG-COEX-06 : retour arrière — l'Atelier écrit de nouveau, Studio refuse ; un autre compte ne bascule pas",
  ret.body.autorite === "atelier" && a3.status === 200 && sRefus2.status === 409 && basAutre.status >= 403 && ret.body.historique?.length === 3);

// ——— 6. Périmètre ———
const hp = await proprio("POST", `${V}/commands`, await env([{ toolId: "studio.comptabilite.facture", params: {} }]));
check("EX-002 [−] : demande de comptabilité refusée par un motif nommé (hors_perimetre)", hp.status === 400 && hp.body.error === "hors_perimetre");

// ——— 7. Navigateur : projection 3D en état identifié, révision par planche, trace d'un geste ———
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', identifiants().email);
  await page.fill('input[name="password"]', "studio-cmd-ci-123456");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => { const r = await context.request[method](`${BASE}${path}`, data === undefined ? undefined : { data }); return r.json(); };
  const pj = await api("post", "/projects", { code: `CMDUI_${randomUUID().slice(0, 5)}`, name: "Studio — recette CMD navigateur" });
  const et = await api("post", `/projects/${pj.id}/studio/studies`, { name: "Étude 3D" });
  const chemin = `/projects/${pj.id}/studio/studies/${et.study.id}/variants/${et.variant.id}`;
  await page.goto(`${BASE}/studio/projets/${pj.id}/etudes/${et.study.id}/variantes/${et.variant.id}?domaine=dessin&planche=double`);
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const vue = page.locator("[data-studio-vue3d]");
  await vue.waitFor();
  await page.waitForFunction((r) => document.querySelector("[data-studio-vue3d]")?.getAttribute("data-studio-source-revision") === r, et.revision.id);
  check("EX-051 : la vue 3D affiche le sourceRevisionId serveur de son résultat (texte visible)", (await vue.locator("[data-studio-source-revision-texte]").textContent()) === et.revision.id.slice(-8));
  // Geste : rectangle saisi au panneau puis « Ajouter au dessin », puis enregistrement (Ctrl+S).
  const barre = page.locator('[role="toolbar"][aria-label="Outils de dessin"], [role="toolbar"][data-studio-actions-espace]');
  const bouton = barre.locator(':is(button,a)[aria-label="Rectangle"]').first();
  await bouton.waitFor({ state: "attached" });
  if (!(await bouton.isVisible())) { const menu = await bouton.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null); if (menu) await barre.locator(`[aria-controls="${menu}"]`).click(); }
  await bouton.click();
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  for (const [nom, v] of [["X", 1], ["Y", 1], ["Largeur", 2], ["Hauteur", 1]]) await proprietes.getByLabel(nom, { exact: true }).fill(String(v));
  await proprietes.getByRole("button", { name: "Ajouter au dessin", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-studio-vue3d-projection]")?.textContent?.includes("brouillon non enregistré"));
  check("EX-051 : modification non enregistrée — la révision source est nommée « brouillon non enregistré »", true);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const head = (await api("get", chemin)).variant.headRevisionId;
  await page.waitForFunction((r) => { const v = document.querySelector("[data-studio-vue3d]"); return v?.getAttribute("data-studio-source-revision") === r && v?.getAttribute("data-studio-etat-derive") === "a-jour"; }, head);
  const libelle = await vue.locator("[data-studio-etat-derive-libelle]").textContent();
  check("EX-016 / INV-006 : après l'enregistrement, la vue 3D est « À jour pour la révision » de la nouvelle tête, sans données périmées",
    head !== et.revision.id && libelle === `À jour pour la révision ${head.slice(-8)}` && (await vue.getAttribute("data-studio-domaines-perimes")) === "", libelle ?? "");
  const barreRevision = await page.locator("[data-studio-revision-affichee]").getAttribute("data-studio-revision-affichee");
  check("INV-002 : même révision serveur affichée par la planche 2D (barre d'état) et par la vue 3D", barreRevision === head && (await vue.getAttribute("data-studio-source-revision")) === head, `${barreRevision} / ${head}`);
  const trace = await page.evaluate(() => globalThis.__fadiTraceGeste?.entrees() ?? []);
  const iScene = trace.findLastIndex((e) => e.etape === "scene" && e.revision === head);
  const iMut = trace.findLastIndex((e, i) => i < iScene && e.etape === "mutation" && e.revision === head);
  const iCmd = trace.findLastIndex((e, i) => i < iMut && e.etape === "commande");
  const iInt = trace.findLastIndex((e, i) => i < iCmd && e.etape === "intention");
  check("EX-008 : un seul geste horodaté — intention → commande → mutation canonique → scène invalidée, dans cet ordre",
    iInt >= 0 && iCmd > iInt && iMut > iCmd && iScene > iMut && trace[iInt].t <= trace[iCmd].t && trace[iCmd].t <= trace[iMut].t && trace[iMut].t <= trace[iScene].t, JSON.stringify(trace).slice(0, 400));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally { await browser.close(); }

if (echecs) { console.log(`\n${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("\nRecette CMD : tous les contrôles passent.");
