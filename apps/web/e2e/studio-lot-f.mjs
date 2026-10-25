#!/usr/bin/env node
/**
 * Recette du lot F de Studio (décision P-12) sur l'API réelle et l'application construite (même origine, base migrée) :
 * - TEST-032 / F.2-03 : « Illustration depuis la vue » (bouton du panneau et Ctrl+Maj+F4) — rendu du modèle capturé,
 *   illustration locale (sans IA) produite et archivée, image PNG portant sa provenance « fadi:illustration » et son
 *   statut « non vérifiée » ; aucune révision écrite, tête inchangée ; service externe annoncé indisponible (non
 *   configuré) ;
 * - F.3-03 : aucun appel HTTP pendant des mouvements du pointeur sur la vue 3D et sur la Planche 2D ;
 * - TEST-033 / F.3-02 / TR-INV-010 : jeton d'agent créé dans « Agents (MCP) » (Ctrl+Maj+F9), appels MCP réels par
 *   HTTP (initialize, tools/list, studio_proposer_commandes) puis par le relais stdio ; rien n'est écrit avant la
 *   confirmation de la personne dans Studio ; la révision confirmée porte la source « agent-mcp ».
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-lot-f.mjs
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const RELAIS = fileURLToPath(new URL("../../api/scripts/studio-mcp-stdio.mjs", import.meta.url));
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
function textesPng(octets) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (sig.some((o, i) => octets[i] !== o)) return null;
  const out = {};
  for (let i = 8; i + 12 <= octets.length;) {
    const n = octets.readUInt32BE(i), type = octets.toString("latin1", i + 4, i + 8), d = octets.subarray(i + 8, i + 8 + n);
    if (type === "iTXt") { const z = d.indexOf(0), cle = d.toString("latin1", 0, z); let j = z + 3; j = d.indexOf(0, j) + 1; j = d.indexOf(0, j) + 1; out[cle] = d.toString("utf8", j); }
    if (type === "IEND") break;
    i += 12 + n;
  }
  return out;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-lot-f-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-lot-f-ci-12345");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    return r;
  };
  const json = async (method, path, data) => (await api(method, path, data)).json();

  const projet = await json("post", "/projects", { code: "P.STU.F", name: "Studio — lot F" });
  const etude = await json("post", `/projects/${projet.id}/studio/studies`, { name: "Étude lot F" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variantePath = `/projects/${projet.id}/studio/studies/${studyId}/variants/${variantId}`;
  const modele = (await json("post", `${variantePath}/commands`, { contractVersion: "studio-commands/1", requestId: `f-${Date.now()}`, baseRevisionId: etude.revision.id, commands: [
    { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } } },
    { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 7, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
  ] })).revision;
  const revisions = async () => (await json("get", `${variantePath}/revisions`)).revisions;
  const avant = await revisions();
  check("préparation : modèle enregistré (ligne extrudée, boîte)", avant.length === 2 && modele.document.solides?.length === 1);

  // Requêtes HTTP observées (F.3-03).
  const requetes = [];
  page.on("request", (r) => requetes.push(`${r.method()} ${new URL(r.url()).pathname}`));
  const adresse = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  await page.goto(`${adresse}?domaine=visualisation`);
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").waitFor();
  await page.locator("[data-studio-visualisation-panneaux] [data-studio-scenes]").waitFor();
  await page.waitForTimeout(800);
  const outils = page.getByRole("toolbar", { name: "Outils — Visualisation, rendu et immersion" });
  check("règle d'or : « Illustration depuis la vue » dans la barre Visualisation, icône dessinée, raccourci Ctrl+Maj+F4", (await outils.locator('[data-studio-commande="illustration"][aria-keyshortcuts="Control+Shift+F4"] svg path').count()) === 1);

  // F.3-03 : mouvements du pointeur sur la vue 3D — aucun appel HTTP.
  const canevas = await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").boundingBox();
  let n0 = requetes.length;
  for (let i = 0; i < 80; i++) await page.mouse.move(canevas.x + 20 + (i * 7) % (canevas.width - 40), canevas.y + 20 + (i * 5) % (canevas.height - 40));
  await page.waitForTimeout(400);
  check("F.3-03 : 80 mouvements du pointeur sur la vue 3D, aucun appel HTTP", requetes.length === n0, requetes.slice(n0).join(", "));

  // TEST-032 : déclencheur du panneau → boîte → illustration locale.
  const panneau = page.locator("[data-studio-visualisation-panneaux]");
  check("F.2-03 : « Illustration contrainte depuis la vue » disponible, avec son déclencheur", (await panneau.locator('[data-studio-rendu="illustration-ia"][data-studio-disponible="oui"] [data-studio-illustrer]').count()) === 1);
  await panneau.locator("[data-studio-illustrer]").click();
  const boite = page.locator("[data-studio-illustration]");
  await boite.waitFor();
  await boite.locator('[data-studio-fournisseur="externe"]').waitFor();
  check("boîte : source = rendu du modèle de la révision affichée", (await boite.locator("[data-studio-illustration-source]").textContent()).includes(modele.id.slice(-8)));
  check("boîte : fournisseur local « sans IA » disponible ; service externe non configuré annoncé indisponible", (await boite.locator('[data-studio-fournisseur="local-derive"][data-studio-disponible="oui"]').count()) === 1 && (await boite.locator('[data-studio-fournisseur="externe"][data-studio-disponible="non"] input[disabled]').count()) === 1);
  await boite.locator("[data-studio-illustration-style]").selectOption("lavis");
  await boite.locator("[data-studio-illustration-generer]").click();
  const resultat = boite.locator("[data-studio-illustration-resultat]");
  await resultat.waitFor();
  check("illustration produite : « non vérifiée », modèle source inchangé", (await resultat.locator('[data-studio-illustration-verification="non-verifiee"]').count()) === 1 && (await resultat.locator('[data-studio-illustration-modele="inchange"]').count()) === 1);
  const apres = await revisions();
  check("TEST-032 : aucune révision écrite par l'illustration (tête inchangée)", apres.length === avant.length && apres[0].id === modele.id);
  const liste = (await json("get", `${variantePath}/illustrations`)).illustrations;
  check("illustration archivée avec ses paramètres et sa provenance", liste.length === 1 && liste[0].parametres.style === "lavis" && liste[0].provenance.source.rendu.revisionId === modele.id && liste[0].provenance.fournisseur.nature === "local-deterministe" && liste[0].provenance.sourcesEnvoyees.length === 0);
  const image = await api("get", liste[0].image);
  const textes = textesPng(Buffer.from(await image.body()));
  check("image : vrai PNG, provenance « fadi:illustration » et en-tête « non vérifiée »", !!textes && JSON.parse(textes["fadi:illustration"]).verification.statut === "non-verifiee" && image.headers()["x-studio-verification"] === "non-verifiee");
  check("liste de la boîte : l'illustration archivée apparaît", (await boite.locator("[data-studio-illustration-archivee]").count()) === 1);
  await page.keyboard.press("Escape");
  await boite.waitFor({ state: "detached" });
  // Raccourci Ctrl+Maj+F4 : même boîte, rendu recapturé.
  await page.locator("[data-studio-vue3d] canvas[data-studio-vue3d-canvas]").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+Shift+F4");
  await boite.waitFor();
  check("raccourci Ctrl+Maj+F4 : la boîte d'illustration s'ouvre sur un nouveau rendu capturé", (await boite.locator("[data-studio-illustration-source]").count()) === 1);
  await page.keyboard.press("Escape");
  await boite.waitFor({ state: "detached" });

  // F.3-03 : mouvements du pointeur sur la Planche 2D — aucun appel HTTP.
  await page.goto(`${adresse}?domaine=dessin`);
  const planche = page.locator("svg[data-studio-planche], [data-studio-planche] svg").first();
  await planche.waitFor();
  await page.waitForTimeout(800);
  const cadre = await planche.boundingBox();
  n0 = requetes.length;
  for (let i = 0; i < 80; i++) await page.mouse.move(cadre.x + 10 + (i * 11) % (cadre.width - 20), cadre.y + 10 + (i * 3) % (cadre.height - 20));
  await page.waitForTimeout(400);
  check("F.3-03 : 80 mouvements du pointeur sur la Planche 2D, aucun appel HTTP", requetes.length === n0, requetes.slice(n0).join(", "));

  // TEST-033 : jeton d'agent créé dans « Agents (MCP) » (Ctrl+Maj+F9).
  await page.keyboard.press("Control+Shift+F9");
  const agents = page.locator("[data-studio-agents]");
  await agents.waitFor();
  await agents.locator("[data-studio-jeton-nom]").fill("Agent de recette");
  await agents.locator("[data-studio-jeton-creer]").click();
  const jeton = (await agents.locator("[data-studio-jeton-valeur]").textContent()).trim();
  check("jeton d'agent créé et montré une fois", jeton.startsWith("fadi_mcp_"));
  const mcp = async (method, params, id = Math.floor(Math.random() * 1e6)) => {
    const r = await fetch(`${BASE}/mcp/studio`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${jeton}` }, body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) });
    return { status: r.status, corps: await r.json().catch(() => null) };
  };
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "recette", version: "1" } });
  check("MCP (HTTP) : initialize", init.status === 200 && init.corps.result.serverInfo.name === "fadi-studio");
  const liste2 = await mcp("tools/list");
  check("MCP : tools/list expose la proposition (seule écriture) et les lectures", liste2.corps.result.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name).join() === "studio_proposer_commandes");
  const prop = await mcp("tools/call", { name: "studio_proposer_commandes", arguments: { studyId, variantId, requestId: "agent-recette-1", baseRevisionId: modele.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: "agent-l", type: "line", start: { x: 0, y: 2 }, end: { x: 4, y: 2 } } }] } });
  check("MCP : proposition en attente de confirmation, rien n'est écrit", prop.corps.result.structuredContent.etat === "confirmation-requise" && (await revisions()).length === avant.length);
  const sansJeton = await fetch(`${BASE}/mcp/studio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
  check("MCP : sans jeton d'agent, 401", sansJeton.status === 401);

  // Relais stdio (transport standard) vers la même route.
  const sortie = await new Promise((ok) => {
    const p = spawn(process.execPath, [RELAIS], { env: { ...process.env, FADI_MCP_URL: `${BASE}/mcp/studio`, FADI_MCP_JETON: jeton } });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("close", () => ok(out));
    p.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  });
  const lignes = sortie.trim().split("\n").map((l) => JSON.parse(l));
  check("MCP (stdio) : initialize et tools/list relayés, aucune réponse à la notification", lignes.map((l) => l.id).join() === "1,2" && lignes[1].result.tools.length === 5);

  // Confirmation par la personne dans Studio.
  await page.keyboard.press("Escape");
  await agents.waitFor({ state: "detached" });
  await page.keyboard.press("Control+Shift+F9");
  await agents.waitFor();
  const ligne = agents.locator('[data-studio-proposition-statut="en-attente"]');
  await ligne.waitFor();
  await ligne.locator("[data-studio-proposition-confirmer]").click();
  await agents.locator('[data-studio-proposition-statut="confirmee"]').waitFor();
  const finales = await revisions();
  check("TEST-033 : la confirmation écrit une révision, par le point d'entrée commun", finales.length === avant.length + 1);
  check("TR-INV-010 : la révision confirmée porte la source « agent-mcp » ; l'enregistrement humain garde « authenticated-session »", finales[0].source === "agent-mcp" && finales[1].source === "authenticated-session");
  const rejeu = await mcp("tools/call", { name: "studio_proposer_commandes", arguments: { studyId, variantId, requestId: "agent-recette-1", baseRevisionId: modele.id, commands: [{ toolId: "studio.dessin.ligne", params: { id: "agent-l", type: "line", start: { x: 0, y: 2 }, end: { x: 4, y: 2 } } }] } });
  check("TEST-033 : idempotence — la même proposition rejouée rend son état confirmé, sans nouvelle écriture", rejeu.corps.result.structuredContent.rejouee === true && (await revisions()).length === finales.length);
  const journal = (await json("get", `/projects/${projet.id}/studio/agents/journal`)).evenements;
  check("TR-INV-010 : journal agent / humain", journal.some((e) => e.acteur === "agent" && e.action === "proposition.creer") && journal.some((e) => e.acteur === "humain" && e.action === "proposition.confirmer"));
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("Recette du lot F : tous les contrôles passent.");
