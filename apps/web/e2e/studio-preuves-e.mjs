#!/usr/bin/env node
/**
 * Recette des preuves du groupe E (point 2), sur l'API et l'application construites (même origine) et la base réelle :
 *  - CAD-04 : accéder à Studio (accueil, page du projet, création d'une étude par l'interface, espace de la variante,
 *    quatre domaines, rechargement) ne crée ni ne valide aucune étape : les 21 lignes `project_steps` du projet sont
 *    relues dans la base avant et après, à l'identique (numéro, statut, contenu), ainsi que la réponse de l'API ;
 *  - EX-082 : une publication diffusée n'est pas réécrite — une UPDATE directe de son paquet ou de son manifeste est
 *    refusée par PostgreSQL (déclencheur `studio_publications_package_frozen`) ; le retrait reste un nouvel évènement ;
 *  - EX-087 : un corps trop volumineux envoyé à une route Studio (commandes, 256 ko ; modèle externe, 6 Mo) est refusé
 *    (413) sans rien écrire ;
 *  - J2 / EX-089 : une seconde API (REOPEN_PORT, même base) confirme étude, variantes, commandes et publication diffusée ;
 *    arrêtée (SIGTERM) puis relancée, elle relit tout à l'identique, fichiers publiés compris, et le rejeu du dernier
 *    requestId ne crée aucune révision.
 *
 * BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… [REOPEN_PORT=3007] node apps/web/e2e/studio-preuves-e.mjs
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DB = process.env.DATABASE_URL;
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}
const court = (x) => JSON.stringify(x)?.slice(0, 300);
if (!DB) { console.log("✗ DATABASE_URL requis (lecture des étapes et essai d'écriture directe)"); process.exit(1); }

const base = new pg.Client({ connectionString: DB });
await base.connect();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `preuves-e-${randomUUID().slice(0, 8)}@example.com`);
  await page.fill('input[name="password"]', "studio-preuves-e-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data, headers) => {
    const r = await page.request.fetch(`${BASE}${path}`, { method, data, headers: { origin: BASE, ...(headers ?? {}) } });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  const projet = await api("POST", "/projects", { code: `PE_${randomUUID().slice(0, 6)}`, name: "Studio — preuves E (recette synthétique)" });
  check("projet créé", projet.status === 201, String(projet.status));
  const projectId = projet.body.id;

  // --- CAD-04 ---------------------------------------------------------------------------------------------------------
  const etapesBase = async () => (await base.query("SELECT step_number, status, content FROM project_steps WHERE project_id = $1 ORDER BY step_number", [projectId])).rows;
  const avant = await etapesBase();
  const avantApi = await api("GET", `/projects/${projectId}/steps`);
  check("CAD-04 : 21 étapes relues dans la base avant l'accès à Studio", avant.length === 21, String(avant.length));
  const ecrituresEtapes = [];
  page.on("request", (r) => { if (/\/steps(\/|$|\?)/.test(new URL(r.url()).pathname) && r.method() !== "GET") ecrituresEtapes.push(`${r.method()} ${r.url()}`); });
  await page.goto(`${BASE}/studio`);
  await page.locator('[data-studio="accueil"]').waitFor();
  await page.goto(`${BASE}/studio/projets/${projectId}`);
  await page.locator("[data-studio-aucune-etude]").waitFor();
  await page.locator(".studio-page-entete [data-studio-nouvelle-etude]").click();
  await page.getByLabel("Nom de l’étude", { exact: true }).fill("Étude d'accès");
  await page.locator("[data-studio-creer-etude] [data-studio-ouvrir-etude]").click();
  await page.waitForURL(new RegExp(`/studio/projets/${projectId}/etudes/[^/]+/variantes/[^/?]+$`));
  await page.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  const espace = page.url();
  for (const domaine of ["bim", "visualisation", "documentation", "dessin"]) {
    await page.goto(`${espace}?domaine=${domaine}`);
    await page.locator("[data-studio-domaines]").waitFor();
  }
  await page.reload();
  await page.locator("[data-studio-domaines]").waitFor();
  const apres = await etapesBase();
  const apresApi = await api("GET", `/projects/${projectId}/steps`);
  check("CAD-04 : après l'accès à Studio (accueil, projet, étude créée, quatre domaines, rechargement), les 21 étapes sont identiques dans la base (statut, contenu)",
    apres.length === 21 && JSON.stringify(apres) === JSON.stringify(avant), court({ avant: avant.map((e) => e.status), apres: apres.map((e) => e.status) }));
  check("CAD-04 : aucune étape validée ni démarrée par l'accès (statuts inchangés, lus par l'API)", avantApi.status === 200 && JSON.stringify(apresApi.body) === JSON.stringify(avantApi.body));
  check("CAD-04 : l'interface n'a envoyé aucune écriture d'étape", ecrituresEtapes.length === 0, ecrituresEtapes.join(" "));

  // --- EX-087 ---------------------------------------------------------------------------------------------------------
  const [, , , , , studyId, , variantId] = new URL(espace).pathname.split("/");
  const vp = `/projects/${projectId}/studio/studies/${studyId}/variants/${variantId}`;
  const variante = async () => (await api("GET", `/projects/${projectId}/studio/studies/${studyId}`)).body?.variants?.find((v) => v.id === variantId)?.headRevisionId ?? null;
  const teteAvant = await variante();
  const revisionsAvant = Number((await base.query("SELECT count(*) FROM studio_revisions WHERE variant_id = $1", [variantId])).rows[0].count);
  const enorme = { contractVersion: "studio-commands/1", requestId: `pe-${randomUUID()}`, baseRevisionId: teteAvant, commands: [{ toolId: "studio.dessin.ligne", params: { id: "x", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } }], remplissage: "a".repeat(300 * 1024) };
  const trop = await api("POST", `${vp}/commands`, enorme, { "content-type": "application/json" });
  check("EX-087 : commandes Studio, corps de 300 ko (> 256 ko) → 413, rien d'écrit", trop.status === 413 && Number((await base.query("SELECT count(*) FROM studio_revisions WHERE variant_id = $1", [variantId])).rows[0].count) === revisionsAvant && (await variante()) === teteAvant, `${trop.status} ${court(trop.body)}`);
  const tropModele = await api("POST", `${vp}/modeles-externes`, { nom: "x.ifc", texte: "a".repeat(6 * 1024 * 1024 + 1024) }, { "content-type": "application/json" });
  check("EX-087 : modèle externe Studio, corps de plus de 6 Mo → 413", tropModele.status === 413, String(tropModele.status));

  // --- EX-082 ---------------------------------------------------------------------------------------------------------
  const pubs = `/projects/${projectId}/studio/studies/${studyId}/publications`;
  const p = await api("POST", `${vp}/publications`, { title: "Dossier figé", contenu: "dessin-2d" });
  const s = await api("POST", `${pubs}/${p.body?.id}/soumettre`, {});
  const a = await api("POST", `${pubs}/${p.body?.id}/approuver`, { manifestHash: s.body?.manifestHash, revisionId: s.body?.revisionId, documentHash: s.body?.documentHash });
  const d = await api("POST", `${pubs}/${p.body?.id}/diffuser`, {});
  check("EX-082 : publication diffusée (paquet figé)", p.status === 201 && s.status === 200 && a.status === 200 && d.status === 200 && /^[0-9a-f]{64}$/.test(d.body?.diffusion?.packageHash ?? ""), court([p.status, s.status, a.status, d.status, d.body]));
  const ligne = async () => (await base.query("SELECT package, package_hash, manifest, manifest_hash, revision_id, approved_manifest_hash FROM studio_publications WHERE id = $1", [p.body.id])).rows[0];
  const figee = await ligne();
  const essais = [
    ["paquet", "UPDATE studio_publications SET package_hash = repeat('f', 64) WHERE id = $1"],
    ["contenu du paquet", "UPDATE studio_publications SET package = jsonb_set(package, '{files}', '[]'::jsonb) WHERE id = $1"],
    ["manifeste", "UPDATE studio_publications SET manifest = '{}'::jsonb, manifest_hash = repeat('e', 64) WHERE id = $1"],
    ["approbation", "UPDATE studio_publications SET approved_manifest_hash = repeat('d', 64) WHERE id = $1"],
  ];
  for (const [nom, sql] of essais) {
    let message = "";
    try { await base.query(sql, [p.body.id]); } catch (e) { message = e.message; }
    check(`EX-082 : UPDATE directe du ${nom} d'une publication diffusée refusée par la base (studio_publication_package_immutable)`, message.includes("studio_publication_package_immutable"), message || "acceptée");
  }
  check("EX-082 : ligne de la publication diffusée inchangée après les tentatives", JSON.stringify(await ligne()) === JSON.stringify(figee));
  const w = await api("POST", `${pubs}/${p.body.id}/retirer`, { comment: "Retrait d'essai (preuves E)" });
  const apresRetrait = await ligne();
  check("EX-082 : le retrait reste un nouvel évènement journalisé ; paquet et manifeste identiques", w.status === 200 && w.body?.diffusionStatus === "retire" && w.body?.events?.at(-1)?.action === "retirer"
    && JSON.stringify(apresRetrait) === JSON.stringify(figee), court(w.body));

  check("aucune erreur JavaScript non interceptée", erreurs.length === 0, erreurs.join(" | "));

  // --- J2 / EX-089 : sauvegarde confirmée, arrêt du service, réouverture ----------------------------------------------
  await reouverture();
} finally {
  await browser.close();
  await base.end();
}

/**
 * Une seconde API (port REOPEN_PORT, même base) reçoit une étude à deux variantes, des commandes, une publication diffusée ;
 * chaque confirmation reçue est notée. L'API est arrêtée (SIGTERM) puis relancée : tout ce qui a été confirmé est relu à
 * l'identique (têtes, documents, révisions, publication, paquet et ses fichiers, journal), et le rejeu du dernier
 * requestId ne crée aucune révision (la reprise n'invente pas d'opération).
 */
async function reouverture() {
  const { spawn } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const PORT = Number(process.env.REOPEN_PORT ?? 3007);
  const B = `http://localhost:${PORT}`;
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  let api = null;
  const demarrer = async () => {
    api = spawn(process.execPath, [path.join(RACINE, "apps/api/dist/server.js")], { cwd: RACINE, stdio: "ignore", env: { ...process.env, PORT: String(PORT), WEB_ORIGIN: B, APP_PUBLIC_URL: B, BASE_URL: B } });
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      if (await fetch(`${B}/health`).then((r) => r.ok, () => false)) return true;
    }
    return false;
  };
  const arreter = async () => {
    if (!api || api.exitCode !== null) return null;
    const fin = new Promise((r) => api.once("exit", (code, signal) => r({ code, signal })));
    process.kill(api.pid, "SIGTERM");
    return fin;
  };
  let cookie = "";
  const appel = async (method, chemin, corps, brut = false) => {
    const r = await fetch(`${B}${chemin}`, { method, headers: { "content-type": "application/json", origin: B, ...(cookie ? { cookie } : {}) }, body: corps === undefined ? undefined : JSON.stringify(corps) });
    const set = r.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    if (brut) return { status: r.status, octets: Buffer.from(await r.arrayBuffer()) };
    const t = await r.text();
    let body = null;
    try { body = t ? JSON.parse(t) : null; } catch { body = t; }
    return { status: r.status, body };
  };
  try {
    check("J2 : API de réouverture démarrée sur la même base", await demarrer());
    const compte = { email: `reouverture-${randomUUID().slice(0, 8)}@example.test`, password: `reouverture-${randomUUID()}` };
    check("J2 : compte inscrit", (await appel("POST", "/auth/register", compte)).status === 201);
    const pr = await appel("POST", "/projects", { code: `RO_${randomUUID().slice(0, 6)}`, name: "Studio — réouverture (recette synthétique)" });
    const racine = `/projects/${pr.body?.id}/studio`;
    const etude = await appel("POST", `${racine}/studies`, { name: "Étude durable" });
    const studyId = etude.body?.study?.id, v1 = etude.body?.variant?.id;
    const v2r = await appel("POST", `${racine}/studies/${studyId}/variants`, { name: "Variante B" });
    const v2 = v2r.body?.variant?.id;
    const tetes = { [v1]: etude.body?.revision?.id, [v2]: v2r.body?.revision?.id };
    let dernier = null;
    const commander = async (v, id, x) => {
      const enveloppe = { contractVersion: "studio-commands/1", requestId: `ro-${randomUUID()}`, baseRevisionId: tetes[v], commands: [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x, y: 2 } } }] };
      const r = await appel("POST", `${racine}/studies/${studyId}/variants/${v}/commands`, enveloppe);
      if (r.status === 200) { tetes[v] = r.body.revision.id; dernier = { v, enveloppe, revision: r.body.revision.id }; }
      return r.status;
    };
    check("J2 : étude, deux variantes et trois commandes confirmées (200)", etude.status === 201 && v2r.status === 201 && (await commander(v1, "a", 3)) === 200 && (await commander(v1, "b", 5)) === 200 && (await commander(v2, "c", 7)) === 200);
    const pubs = `${racine}/studies/${studyId}/publications`;
    const p = await appel("POST", `${racine}/studies/${studyId}/variants/${v1}/publications`, { title: "Dossier durable", contenu: "dessin-2d" });
    const s = await appel("POST", `${pubs}/${p.body?.id}/soumettre`, {});
    await appel("POST", `${pubs}/${p.body?.id}/approuver`, { manifestHash: s.body?.manifestHash, revisionId: s.body?.revisionId, documentHash: s.body?.documentHash });
    const d = await appel("POST", `${pubs}/${p.body?.id}/diffuser`, {});
    check("EX-089 : publication diffusée confirmée (paquet figé)", d.status === 200 && d.body?.diffusionStatus === "diffuse", court(d.body));
    const lire = async () => {
      const variantes = {};
      for (const v of [v1, v2]) {
        const r = await appel("GET", `${racine}/studies/${studyId}/variants/${v}`);
        const revs = await appel("GET", `${racine}/studies/${studyId}/variants/${v}/revisions`);
        variantes[v] = { tete: r.body?.variant?.headRevisionId, document: sha(JSON.stringify(r.body?.revision?.document ?? null)), revisions: (revs.body?.revisions ?? []).map((x) => x.id) };
      }
      const pub = (await appel("GET", `${pubs}/${p.body?.id}`)).body;
      const fichiers = [];
      for (const f of pub?.diffusion?.files ?? []) {
        const r = await appel("GET", `${pubs}/${p.body?.id}/files/${f.format}`, undefined, true);
        fichiers.push([f.format, f.sha256, r.status === 200 ? sha(r.octets) : `HTTP ${r.status}`]);
      }
      return { variantes, publication: { statut: pub?.diffusionStatus, paquet: pub?.diffusion?.packageHash, manifeste: pub?.manifestHash, journal: (pub?.events ?? []).map((e) => [e.action, e.createdAt]) }, fichiers };
    };
    const avant = await lire();
    check("J2 : état confirmé relu avant l'arrêt (têtes = confirmations, fichiers du paquet conformes)", avant.variantes[v1].tete === tetes[v1] && avant.variantes[v2].tete === tetes[v2] && avant.variantes[v1].revisions.length === 3 && avant.variantes[v1].revisions.includes(tetes[v1]) && avant.publication.journal.length >= 4 && avant.fichiers.length > 0 && avant.fichiers.every(([, attendu, lu]) => attendu === lu), court(avant));
    const fin = await arreter();
    check("J2 : service arrêté (SIGTERM)", fin !== null, court(fin));
    check("J2 : service relancé sur la même base", await demarrer());
    cookie = "";
    check("J2 : reconnexion après redémarrage", (await appel("POST", "/auth/login", compte)).status === 200);
    const apres = await lire();
    check("J2 : réouverture — mêmes têtes, mêmes documents (empreintes) et mêmes révisions pour les deux variantes", JSON.stringify(apres.variantes) === JSON.stringify(avant.variantes), court({ avant: avant.variantes, apres: apres.variantes }));
    check("EX-089 : réouverture — publication diffusée relue à l'identique (statut, paquet, manifeste, journal) et ses fichiers aux mêmes empreintes",
      JSON.stringify(apres.publication) === JSON.stringify(avant.publication) && JSON.stringify(apres.fichiers) === JSON.stringify(avant.fichiers), court({ avant: avant.publication, apres: apres.publication }));
    const rejeu = await appel("POST", `${racine}/studies/${studyId}/variants/${dernier.v}/commands`, dernier.enveloppe);
    const revisions = (await appel("GET", `${racine}/studies/${studyId}/variants/${dernier.v}/revisions`)).body?.revisions ?? [];
    check("EX-089 : après la reprise, le rejeu du dernier requestId renvoie la révision confirmée, sans en créer (aucune opération inventée)",
      rejeu.status === 200 && rejeu.body?.revision?.id === dernier.revision && revisions.length === avant.variantes[dernier.v].revisions.length, court([rejeu.status, rejeu.body?.revision?.id, revisions.length]));
  } finally {
    await arreter();
  }
}
if (echecs) { console.log(`\n${echecs} contrôle(s) en échec`); process.exit(1); }
console.log("\nRecette des preuves du groupe E : tous les contrôles passent.");
