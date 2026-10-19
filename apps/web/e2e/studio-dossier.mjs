#!/usr/bin/env node
/**
 * Recette Studio — production documentaire (lot E.3 : E.3-01 à E.3-04, E.3-06, E.3-07), par l'interface et l'API
 * réelles (même origine, base migrée : tables `studio_sheets` et `studio_dossiers` dans init.sql). Comptes, projet et
 * dessins synthétiques créés par les vraies routes ; aucune donnée de projet réelle.
 *
 *   A. TEST-001 — nouvelle étude, planche 2D seule : une ligne et une cote dessinées à la souris, enregistrées (Ctrl+S),
 *      session fermée, rouverte dans une nouvelle session (la ligne et la cote reviennent du serveur), puis publiée
 *      sans modèle 3D : « Dessin 2D indépendant » coché dans le panneau Publications, revue, approbation, diffusion —
 *      paquet SVG, DXF et feuille PDF, sans IFC, vérifié par empreintes, listé aux Documents.
 *   B. Feuilles composées (E.3-01 / E.3-02) ouvertes par Ctrl+Maj+D (barre Présentation) : deux feuilles, calques
 *      visibles puis calques choisis ; chacune porte révision, variante, vue source et empreintes ; la planche n'en est
 *      jamais modifiée (aucune révision créée) ; cartouche « non évalué » pour l'auteur absent ; réépinglage explicite.
 *   C. Dossier de conception (E.3-03 / E.3-04) : feuilles ordonnées (réordonnées dans l'interface), métré brut /
 *      déductions / net (mur 6 × 3 × 0,2 m, ouverture 1 × 2,1 m : 3,600 / 0,420 / 3,180 m³), fidélité, empreinte
 *      stable ; PDF de plusieurs pages et JSON ; refus et droits.
 *   D. Catalogue des Documents (E.3-06) : groupe « Studio — dossiers de conception » (API et interface).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-dossier.mjs
 */
import { chromium } from "playwright";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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
  const call = async (method, path, body, brut = false) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    if (brut) return { status: res.status, octets: Buffer.from(await res.arrayBuffer()), headers: res.headers };
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  return call;
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const HEX64 = /^[0-9a-f]{64}$/;
const n = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const court = (x) => JSON.stringify(x).slice(0, 300);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const email = `studio-dossier-${Date.now()}@example.com`;
  const motDePasse = "studio-dossier-ci-123";
  const session = async () => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("dialog", (d) => void d.accept());
    return { context, page };
  };
  let { context, page } = await session();
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null), headers: r.headers() };
  };
  const fichier = async (path) => {
    const r = await page.request.get(`${BASE}${path}`);
    return { status: r.status(), octets: Buffer.from(await r.body()), headers: r.headers() };
  };

  const lecteur = client(), etranger = client(), anonyme = client();
  const compteLecteur = { email: `studio-dossier-lecteur-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") };
  check("lecteur inscrit", (await lecteur("POST", "/auth/register", compteLecteur)).status === 201);
  check("compte étranger inscrit", (await etranger("POST", "/auth/register", { email: `studio-dossier-x-${randomUUID().replaceAll("-", "")}@example.test`, password: randomBytes(24).toString("hex") })).status === 201);
  const projet = (await api("post", "/projects", { code: `P.DOS.${randomUUID().slice(0, 6)}`, name: "Studio — production documentaire (recette)" })).body;
  check("lecteur invité", (await api("post", `/projects/${projet.id}/members`, { email: compteLecteur.email, role: "lecteur" })).status === 201);
  const racine = `/projects/${projet.id}/studio`;
  const etude = (await api("post", `${racine}/studies`, { name: "Étude TEST-001" })).body;
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variante = `${racine}/studies/${studyId}/variants/${variantId}`;
  const urlVariante = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const tete = async () => (await api("get", variante)).body.revision.id;

  // ——— A. TEST-001 : dessiner, coter, enregistrer, fermer, rouvrir, publier sans modèle 3D ———
  const outilsDe = (p) => p.getByRole("toolbar", { name: /^(Outils de dessin|Drawing tools)$/ });
  const atteindre = async (barre, selecteur) => {
    const el = barre.locator(selecteur).first();
    await el.waitFor({ state: "attached" });
    if (!(await el.isVisible())) {
      const menu = await el.evaluate((x) => x.closest("[data-studio-menu-liste]")?.id ?? null);
      if (menu) await barre.locator(`[aria-controls="${menu}"]`).click();
      await el.waitFor({ state: "visible" });
    }
    return el;
  };
  const ouvrirVariante = async (p) => {
    await p.goto(urlVariante);
    await outilsDe(p).waitFor();
    await p.locator('svg [role="button"][aria-label^="Rectangle "], [data-studio-elements]').first().waitFor({ state: "attached" }).catch(() => {});
  };
  await ouvrirVariante(page);
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  const cliquer = async (x, y) => {
    const p = await planche.evaluate((svg, w) => {
      const ecran = () => new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM());
      const s = ecran();
      if (s.y < 40 || s.y > window.innerHeight - 40) window.scrollBy(0, s.y - window.innerHeight / 2);
      const t = ecran();
      return { x: t.x, y: t.y };
    }, { x, y });
    await page.mouse.click(p.x, p.y);
  };
  await (await atteindre(outilsDe(page), ':is(button,a)[aria-label="Ligne"]')).click();
  await cliquer(2, 8);
  await cliquer(6, 8);
  const lignes = page.locator('svg [role="button"][aria-label^="Ligne "]');
  check("TEST-001 : deux clics tracent une ligne sur la planche 2D", (await lignes.count()) === 1);
  await page.keyboard.press("Shift+C");
  await cliquer(2.03, 8.02);
  await cliquer(5.97, 7.98);
  const cote = page.locator("svg [data-studio-cote]");
  await cote.waitFor({ state: "attached" });
  const valeurCote = await cote.getAttribute("data-studio-cote-valeur");
  check("TEST-001 : cote accrochée à la ligne, valeur mesurée", (await cote.getAttribute("data-studio-cote-etat")) === "resolue" && Number(valeurCote) > 3.5, String(valeurCote));
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const docA = (await api("get", variante)).body.revision.document;
  check("TEST-001 : enregistré — révision avec une ligne et une cote, sans extrusion ni solide (planche 2D seule)",
    docA.objects.length === 1 && docA.objects[0].type === "line" && !docA.objects[0].extrusion && (docA.dimensions ?? []).length === 1 && !(docA.solides ?? []).length && !(docA.architecture ?? []).length, court(docA));
  const revA = await tete();
  // Fermer : la session se termine ; rouvrir : nouvelle session, nouvelle connexion, même adresse.
  await context.close();
  ({ context, page } = await session());
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  await ouvrirVariante(page);
  await page.locator("svg [data-studio-cote]").waitFor({ state: "attached" });
  check("TEST-001 : rouverte dans une nouvelle session, la ligne et la cote reviennent du serveur",
    (await page.locator('svg [role="button"][aria-label^="Ligne "]').count()) === 1 && (await page.locator("svg [data-studio-cote]").getAttribute("data-studio-cote-valeur")) === valeurCote && (await tete()) === revA);

  // Publication sans modèle 3D : panneau « Publications » de l'étude, « Dessin 2D indépendant ».
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  const preparer = page.locator("[data-studio-publication-preparer]");
  await preparer.waitFor();
  await preparer.locator("#studio-publication-titre").fill("TEST-001 — dessin 2D");
  await preparer.locator("[data-studio-publication-dessin2d]").check();
  await preparer.getByRole("button", { name: "Préparer la publication" }).click();
  const carte = page.locator('li[data-studio-publication][data-contenu="dessin-2d"]');
  await carte.waitFor();
  check("TEST-001 (interface) : publication « Dessin 2D indépendant » préparée", (await carte.locator("[data-studio-publication-contenu]").count()) === 1);
  const pubId = await carte.getAttribute("data-studio-publication");
  const pubs = `${racine}/studies/${studyId}/publications`;
  const p0 = (await api("get", `${pubs}/${pubId}`)).body;
  check("E.3-07 : manifeste « dessin-2d » — révision rouverte, trois documents (SVG, DXF, feuille PDF), aucun IFC",
    p0.contenu === "dessin-2d" && p0.manifest?.contenu === "dessin-2d" && p0.revisionId === revA && JSON.stringify(p0.manifest.documents.map((d) => d.format)) === JSON.stringify(["dxf", "pdf", "svg"]), court(p0.manifest));
  check("E.3-07 : un dessin 2D indépendant refuse une variante coordonnée (400)",
    (await api("post", `${variante}/publications`, { contenu: "dessin-2d", coordinatedVariantIds: [variantId] })).status === 400);
  const s1 = await api("post", `${pubs}/${pubId}/soumettre`, {});
  const a1 = await api("post", `${pubs}/${pubId}/approuver`, { manifestHash: p0.manifestHash });
  const d1 = await api("post", `${pubs}/${pubId}/diffuser`, {});
  check("E.3-07 : revue, approbation liée au manifeste, diffusion", s1.status === 200 && a1.status === 200 && d1.status === 200 && d1.body.diffusionStatus === "diffuse", court([s1.status, a1.status, d1.status, d1.body]));
  const formats = (d1.body.diffusion?.files ?? []).map((f) => f.format);
  check("E.3-07 : paquet figé SVG, DXF et feuille PDF, sans IFC", JSON.stringify(formats) === JSON.stringify(["svg", "dxf", "pdf"]), formats.join());
  let empreintesOk = formats.length === 3;
  for (const f of d1.body.diffusion?.files ?? []) {
    const r = await fichier(`${pubs}/${pubId}/files/${f.format}`);
    empreintesOk &&= r.status === 200 && sha(r.octets) === f.sha256;
  }
  check("E.3-07 : fichiers téléchargés identiques à leurs empreintes ; IFC absent (404)", empreintesOk && (await fichier(`${pubs}/${pubId}/files/ifc`)).status === 404);
  const verif = (await api("get", `${pubs}/${pubId}/verification`)).body;
  check("E.3-07 : paquet reproductible (empreintes recalculées identiques)", verif?.identical === true && verif.files.length === 3, court(verif));
  const docsA = (await api("get", `/projects/${projet.id}/documents`)).body;
  check("E.3-07 / E.3-06 : le dessin 2D diffusé est au catalogue des Documents, marqué « dessin-2d »",
    (docsA.studioPackages ?? []).some((p) => p.publicationId === pubId && p.contenu === "dessin-2d" && p.files.length === 3), court(docsA.studioPackages));

  // ——— B. Feuilles composées ———
  const pose = await api("post", `${variante}/commands`, {
    contractVersion: "studio-commands/1", requestId: `dossier-${randomUUID()}`, baseRevisionId: revA, commands: [
      { toolId: "studio.calque.creer", params: { id: "brouillon", name: "Brouillon", visible: false, locked: false } },
      { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", layerId: "brouillon", origin: { x: 0, y: 12 }, width: 2, height: 1 } },
      { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 3 }, { x: 6, y: 3 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } },
    ],
  });
  check("préparation : calque masqué, rectangle, mur et ouverture déclarée posés par commandes", pose.status === 200, court(pose.body));
  const revB = pose.body.revision.id;
  const nbRevisions = async () => (await api("get", `${variante}/revisions`)).body.revisions.length;
  const revisionsAvant = await nbRevisions();

  await ouvrirVariante(page);
  check("règle d'or : « Feuilles et dossier » dans la barre (icône, raccourci Ctrl+Maj+D annoncé)",
    (await (await atteindre(outilsDe(page), 'button[data-studio-commande="dossier"]')).getAttribute("aria-keyshortcuts")) === "Control+Shift+D");
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+Shift+D");
  const boite = page.locator("[data-studio-dossier]");
  await boite.waitFor();
  check("Ctrl+Maj+D ouvre la boîte « Feuilles et dossier »", (await page.getByRole("dialog", { name: "Feuilles et dossier" }).count()) === 1);
  await boite.locator("[data-studio-feuilles-vide]").waitFor();

  const nouvelle = boite.locator("[data-studio-feuille-nouvelle]");
  check("numéro proposé : F-01", (await nouvelle.locator("[data-studio-feuille-numero]").inputValue()) === "F-01");
  await nouvelle.locator("[data-studio-feuille-titre]").fill("Plan d'ensemble");
  await nouvelle.locator("[data-studio-feuille-creer]").click();
  const carteF1 = boite.locator('[data-studio-feuille][data-numero="F-01"]');
  await carteF1.waitFor();
  await nouvelle.locator("[data-studio-feuille-titre]").fill("Calque brouillon");
  await nouvelle.locator("[data-studio-feuille-calques-choisis]").check();
  for (const c of await nouvelle.locator("[data-studio-feuille-calque]").all()) await c.setChecked((await c.getAttribute("data-studio-feuille-calque")) === "brouillon");
  await nouvelle.locator("[data-studio-feuille-creer]").click();
  const carteF2 = boite.locator('[data-studio-feuille][data-numero="F-02"]');
  await carteF2.waitFor();
  const feuilles = (await api("get", `${racine}/studies/${studyId}/sheets`)).body;
  const f1 = feuilles.sheets.find((f) => f.definition.numero === "F-01"), f2 = feuilles.sheets.find((f) => f.definition.numero === "F-02");
  check("E.3-01 : chaque feuille porte révision, variante, vue source et empreintes (affichées = serveur)",
    f1?.revisionId === revB && f1.variantId === variantId && HEX64.test(f1.provenance?.vue.empreinteDonnees ?? "") && HEX64.test(f1.provenance?.documentHash ?? "")
      && (await carteF1.getAttribute("data-empreinte-donnees")) === f1.provenance.vue.empreinteDonnees && (await carteF1.getAttribute("data-revision")) === revB
      && JSON.stringify(f1.provenance.vue.vueSource) === JSON.stringify({ type: "planche-2d", selection: "calques-visibles", calques: ["default"] })
      && JSON.stringify(f2?.provenance?.vue.vueSource) === JSON.stringify({ type: "planche-2d", selection: "calques-choisis", calques: ["brouillon"] }), court(feuilles));
  check("E.3-01 : vues de données différentes, empreintes différentes ; même document source", f1.provenance.vue.empreinteDonnees !== f2.provenance.vue.empreinteDonnees && f1.provenance.documentHash === f2.provenance.documentHash);
  check("E.3-02 : la planche n'est jamais modifiée par une feuille (aucune révision créée, tête inchangée)", (await nbRevisions()) === revisionsAvant && (await tete()) === revB);
  check("E.3-02 : cartouche sans donnée inventée — auteur absent « non évalué », projet et variante réels",
    f1.provenance.cartouche.author === "non évalué" && f1.provenance.cartouche.projectCode === projet.code && f1.provenance.cartouche.variant === etude.variant.name && f1.provenance.cartouche.revisionId === revB, court(f1.provenance.cartouche));
  const svg1 = await fichier(f1.files.svg);
  const texteSvg = svg1.octets.toString("utf8");
  check("E.3-02 : rendu SVG de la feuille — provenance imprimée, métadonnées, mur et ouverture tracés, en-têtes d'empreinte",
    svg1.status === 200 && texteSvg.includes('data-sheet-part="provenance"') && texteSvg.includes(`data-empreinte-donnees="${f1.provenance.vue.empreinteDonnees}"`) && texteSvg.includes(`data-revision="${revB}"`)
      && texteSvg.includes('data-id="m1"') && texteSvg.includes('data-id="o1"') && texteSvg.includes("non évalué") && !texteSvg.includes('data-id="r1"')
      && svg1.headers["x-studio-view-hash"] === f1.provenance.vue.empreinteDonnees && svg1.headers["x-content-sha256"] === sha(svg1.octets), court(svg1.headers));
  const pdf1 = await fichier(f1.files.pdf);
  check("E.3-02 : feuille PDF", pdf1.status === 200 && pdf1.octets.subarray(0, 8).toString("latin1") === "%PDF-1.4");

  // ——— C. Dossier de conception ———
  const editer = boite.locator('[data-studio-dossier-editer="nouveau"]');
  await editer.waitFor();
  await editer.locator("[data-studio-dossier-titre-saisie]").fill("Dossier de conception — pilote");
  await editer.locator(`[data-studio-dossier-monter="${f2.id}"]`).click();
  await editer.locator("[data-studio-dossier-enregistrer]").click();
  const ordre = boite.locator("[data-studio-dossier-assemble] [data-studio-dossier-ordre] li");
  await boite.locator("[data-studio-dossier-metre]").waitFor();
  const ordreAffiche = await ordre.evaluateAll((l) => l.map((x) => x.getAttribute("data-studio-dossier-feuille")));
  check("E.3-03 (interface) : dossier créé, feuilles dans l'ordre choisi (F-02 remontée)", JSON.stringify(ordreAffiche) === JSON.stringify([f2.id, f1.id]), ordreAffiche.join());
  const brut = n(await boite.locator("[data-studio-dossier-brut]").textContent()), deduit = n(await boite.locator("[data-studio-dossier-deduit]").textContent()), net = n(await boite.locator("[data-studio-dossier-net]").textContent());
  check("E.3-04 (interface) : brut 3,600 m³, déductions 0,420 m³ (une ouverture), net 3,180 m³, totaux partiels déclarés",
    brut.startsWith("3,600 m³ (partiel") && deduit.startsWith("0,420 m³") && deduit.includes("1 ouverture(s)") && net.startsWith("3,180 m³"), `${brut} | ${deduit} | ${net}`);
  const dossiers = (await api("get", `${racine}/studies/${studyId}/dossiers`)).body.dossiers;
  const dos = dossiers[0];
  const lu = (await api("get", `${racine}/studies/${studyId}/dossiers/${dos.id}`)).body;
  const m1 = lu.assembly?.metre?.bilan.lignes.find((l) => l.objetId === "m1");
  check("E.3-03 : dossier assemblé — feuilles ordonnées, sources identifiées, empreinte, fidélité jointe",
    JSON.stringify(lu.assembly.feuilles.map((f) => [f.ordre, f.id])) === JSON.stringify([[1, f2.id], [2, f1.id]]) && HEX64.test(lu.assembly.empreinte)
      && lu.assembly.sources.length === 1 && lu.assembly.sources[0].revisionId === revB && lu.assembly.fidelite?.length === 2 && lu.assembly.projet.code === projet.code, court(lu.assembly?.feuilles));
  check("E.3-04 : bilan séparé — brut 3,6, déduction de o1 0,42, net 3,18 ; objets hors architecture « non évalués » (jamais net = brut)",
    Math.abs(m1.brut - 3.6) < 1e-9 && m1.deductions.length === 1 && m1.deductions[0].sourceId === "o1" && Math.abs(m1.deduit - 0.42) < 1e-9 && Math.abs(m1.net - 3.18) < 1e-9
      && lu.assembly.metre.bilan.lignes.filter((l) => l.objetId !== "m1").every((l) => l.net === null && l.motifNet === "deductions-non-declarees") && lu.assembly.metre.bilan.controle.coherent === true, court(lu.assembly.metre.bilan));
  check("E.3-03 : ajustements manuels rapportés à part (journal vide : 0 en vigueur)", JSON.stringify(lu.assembly.metre.ajustements) === JSON.stringify({ enVigueur: 0, aRevoir: 0 }), court(lu.assembly.metre.ajustements));
  const json1 = await fichier(dos.files.json), json2 = await fichier(dos.files.json);
  const pdfD = await fichier(dos.files.pdf);
  const pages = Number(/\/Count (\d+)/.exec(pdfD.octets.toString("latin1"))?.[1] ?? 0);
  check("E.3-03 : JSON et PDF du dossier — empreinte en en-tête, octets stables, PDF de plusieurs pages (sommaire, feuilles, métré, fidélité)",
    json1.status === 200 && json1.headers["x-studio-dossier-hash"] === lu.assembly.empreinte && json1.octets.equals(json2.octets) && JSON.parse(json1.octets.toString("utf8")).empreinte === lu.assembly.empreinte
      && pdfD.status === 200 && pdfD.octets.subarray(0, 8).toString("latin1") === "%PDF-1.4" && pages >= 5, `${pages} pages`);

  // Réépinglage explicite : la variante avance, la feuille est périmée ; « Actualiser » la réépingle.
  const deplacement = await api("post", `${variante}/commands`, { contractVersion: "studio-commands/1", requestId: `dossier-${randomUUID()}`, baseRevisionId: revB, commands: [{ toolId: "studio.dessin.deplacer", params: { id: docA.objects[0].id, dx: 0, dy: 1 } }] });
  const revC = deplacement.body?.revision?.id;
  const perimees = (await api("get", `${racine}/studies/${studyId}/sheets`)).body.sheets;
  check("feuille épinglée : la variante avance, la feuille reste sur sa révision et se déclare périmée",
    deplacement.status === 200 && perimees.every((f) => f.revisionId === revB && f.freshness === "perimee" && f.headRevisionId === revC), court(perimees.map((f) => [f.revisionId, f.freshness])));
  await boite.locator("[data-studio-fermer-dialogue]").click().catch(() => {});
  await ouvrirVariante(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+Shift+D");
  await page.locator(`[data-studio-feuille="${f1.id}"][data-actualite="perimee"]`).waitFor();
  await page.locator(`[data-studio-feuille="${f1.id}"] [data-studio-feuille-actualiser]`).click();
  await page.locator(`[data-studio-feuille="${f1.id}"][data-actualite="a-jour"]`).waitFor();
  const apres = (await api("get", `${racine}/studies/${studyId}/sheets`)).body.sheets;
  const f1b = apres.find((f) => f.id === f1.id), f2b = apres.find((f) => f.id === f2.id);
  check("« Actualiser » réépingle F-01 sur la tête : données changées, empreinte changée ; F-02 inchangée",
    f1b.revisionId === revC && f1b.provenance.vue.empreinteDonnees !== f1.provenance.vue.empreinteDonnees && f2b.revisionId === revB && f2b.provenance.vue.empreinteDonnees === f2.provenance.vue.empreinteDonnees);
  const lu2 = (await api("get", `${racine}/studies/${studyId}/dossiers/${dos.id}`)).body;
  check("dossier : l'empreinte change avec une feuille réépinglée, et cite les deux révisions", lu2.assembly.empreinte !== lu.assembly.empreinte && lu2.assembly.sources.length === 2);

  // Refus et droits.
  const feuillesUrl = `${variante}/sheets`;
  const base = { number: "F-01", title: "Doublon", format: "A4", orientation: "portrait", scale: 100 };
  check("refus : numéro de feuille déjà utilisé (409)", (await api("post", feuillesUrl, base)).body?.error === "sheet_number_taken");
  check("refus : calque inconnu de la révision (400 sheet_view_invalid)", (await api("post", feuillesUrl, { ...base, number: "F-09", layers: ["inconnu"] })).body?.code === "sheet_view_invalid");
  check("refus : échelle non normalisée (400)", (await api("post", feuillesUrl, { ...base, number: "F-09", scale: 75 })).status === 400);
  check("refus : suppression d'une feuille citée par un dossier (409)", (await api("delete", `${racine}/studies/${studyId}/sheets/${f1.id}`)).body?.error === "sheet_in_dossier");
  check("refus : dossier avec une feuille inconnue (400)", (await api("post", `${racine}/studies/${studyId}/dossiers`, { title: "X", sheetIds: ["inconnue"] })).body?.code === "dossier_sheet_unknown");
  const lectureL = await lecteur("GET", `${racine}/studies/${studyId}/sheets`);
  check("droits : le lecteur lit (200, sans écriture) mais ne compose pas (403)",
    lectureL.status === 200 && lectureL.body.canWrite === false && (await lecteur("POST", feuillesUrl, { ...base, number: "F-10" })).status === 403
      && (await lecteur("GET", `${racine}/studies/${studyId}/dossiers/${dos.id}/files/pdf`, undefined, true)).status === 200);
  check("droits : compte étranger 404, anonyme 401", (await etranger("GET", `${racine}/studies/${studyId}/sheets`)).status === 404 && (await anonyme("GET", `${racine}/studies/${studyId}/sheets`)).status === 401);
  const rejeu = { ...base, number: "F-03", title: "Rejeu", requestId: `rejeu-${randomUUID()}` };
  const r1 = await api("post", feuillesUrl, rejeu), r2 = await api("post", feuillesUrl, rejeu);
  check("rejeu : même requestId, même feuille, sans doublon ; contenu différent refusé (409)",
    r1.status === 201 && r2.status === 201 && r2.body.replayed === true && r2.body.id === r1.body.id && (await api("post", feuillesUrl, { ...rejeu, title: "Autre" })).status === 409);
  check("suppression d'une feuille hors dossier", (await api("delete", `${racine}/studies/${studyId}/sheets/${r1.body.id}`)).status === 200);

  // ——— D. Catalogue des Documents ———
  const docs = (await api("get", `/projects/${projet.id}/documents`)).body;
  const entree = (docs.studioDossiers ?? []).find((d) => d.dossierId === dos.id);
  check("E.3-06 : dossier rattaché au catalogue des Documents (empreinte courante, sources, liens PDF et JSON)",
    entree?.hash === lu2.assembly.empreinte && entree.sheetCount === 2 && entree.sources.length === 2 && JSON.stringify(entree.files.map((f) => f.format)) === JSON.stringify(["pdf", "json"]), court(docs.studioDossiers));
  check("E.3-06 : catalogue lisible par le lecteur, refusé au compte étranger", ((await lecteur("GET", `/projects/${projet.id}/documents`)).body?.studioDossiers ?? []).some((d) => d.dossierId === dos.id) && (await etranger("GET", `/projects/${projet.id}/documents`)).status === 404);
  await page.goto(`${BASE}/projets/${projet.id}?module=documents`);
  const ligne = page.locator(`tr[data-studio-dossier-document="${dos.id}"]`);
  const vu = await ligne.waitFor({ timeout: 30000 }).then(() => true, () => false);
  check("E.3-06 (interface) : groupe « Studio — dossiers de conception », liens PDF et JSON ; dessin 2D diffusé marqué",
    vu && n(await page.locator("#documents-studio-dossiers").textContent()) === "Studio — dossiers de conception" && (await ligne.locator("[data-studio-dossier-file]").count()) === 2
      && (await page.locator(`tr[data-studio-package="${pubId}"][data-contenu="dessin-2d"] [data-studio-package-dessin2d]`).count()) === 1);

  // Archive du projet : feuilles et dossiers sont dans la section Studio, couverts par le manifeste signé.
  const archive = (await api("get", `/projects/${projet.id}/archive`)).body;
  const st = archive?.studio ?? archive?.projects?.[0]?.studio ?? null;
  check("archive : feuilles et dossier exportés dans la section Studio, comptés par le manifeste",
    st?.tables?.studio_sheets?.length === 2 && st.tables.studio_dossiers?.length === 1 && st.manifest?.tables?.studio_sheets?.count === 2 && st.manifest?.tables?.studio_dossiers?.count === 1
      && st.schemaVersion?.tables === "studio-v1/2026-10-19.3", court(st ? { version: st.schemaVersion, sheets: st.tables?.studio_sheets?.length } : Object.keys(archive ?? {})));

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette de la production documentaire Studio : tout est conforme.");
process.exit(echecs ? 1 : 0);
