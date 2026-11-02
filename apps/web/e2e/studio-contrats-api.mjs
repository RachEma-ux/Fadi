/**
 * Recette « contrats versionnés de l'API Studio » (réserve G1, ADR-STUDIO-PILOTE-01 P-11), sur base réelle :
 * chaque route appelée rend l'en-tête `X-Studio-Contrat` de son contrat (`apps/api/src/lib/studio-contrats-routes.ts`),
 * succès comme refus ; une version demandée incompatible est refusée (400 `contrat_incompatible`) sans écriture ; la
 * version exacte demandée est servie ; sans en-tête, le corps est celui du client web (inchangé).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/studio-contrats-api.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const ENTETE = "x-studio-contrat";
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-contrats-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-contrats-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data, entetes) => {
    const r = await page.request[method](`${BASE}${path}`, { ...(data === undefined ? {} : { data }), ...(entetes ? { headers: entetes } : {}) });
    return { status: r.status(), contrat: r.headers()[ENTETE] ?? null, body: await r.json().catch(() => null) };
  };

  const projet = (await api("post", "/projects", { code: `P.CTR.${randomUUID().slice(0, 6)}`, name: "Studio — contrats d'API (recette)" })).body;
  const S = `/projects/${projet.id}/studio`;
  const creation = await api("post", `${S}/studies`, { name: "Étude contrats" });
  check("POST /studies : 201, contrat studio-api-etude-creer/1", creation.status === 201 && creation.contrat === "studio-api-etude-creer/1", `${creation.status} ${creation.contrat}`);
  const studyId = creation.body.study.id, variantId = creation.body.variant.id;
  const V = `${S}/studies/${studyId}/variants/${variantId}`;
  const commandes = await api("post", `${V}/commands`, {
    contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: creation.body.revision.id,
    commands: [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 3, y: 0 } } }],
  });
  check("POST …/commands : 200, contrat studio-api-commandes/1, nouvelle révision", commandes.status === 200 && commandes.contrat === "studio-api-commandes/1" && commandes.body?.revision?.id !== creation.body.revision.id, `${commandes.status} ${commandes.contrat}`);

  // Adresses composées par segments (aucune adresse littérale : la revue G1-03 garde pour preuve de chaque route le test
  // fonctionnel qui l'exerce, cette recette ne contrôle que l'en-tête du contrat).
  const sous = (...segments) => [S, ...segments].join("/");
  const lectures = [
    ["liste des études", sous("studies"), "studio-api-etudes-lister/1"],
    ["étude", sous("studies", studyId), "studio-api-etude-lire/1"],
    ["liste des variantes", sous("studies", studyId, "variants"), "studio-api-variantes-lister/1"],
    ["variante", sous("studies", studyId, "variants", variantId), "studio-api-variante-lire/1"],
    ["révisions", sous("studies", studyId, "variants", variantId, "revisions"), "studio-api-revisions-lister/1"],
    ["commentaires", sous("studies", studyId, "variants", variantId, "comments"), "studio-api-commentaires-lister/1"],
    ["observations", sous("studies", studyId, "variants", variantId, "observations"), "studio-api-observations-lister/1"],
    ["contrôles", sous("studies", studyId, "variants", variantId, "controles"), "studio-api-controles-lister/1"],
    ["modèles externes", sous("studies", studyId, "variants", variantId, "modeles-externes"), "studio-api-modeles-externes-lister/1"],
    ["ajustements du métré", sous("studies", studyId, "variants", variantId, "ajustements-quantites"), "studio-api-ajustements-lister/1"],
    ["exigences", sous("studies", studyId, "exigences"), "studio-api-exigences-lire/1"],
    ["dossiers de l'étude", sous("studies", studyId, "dossiers"), "studio-api-dossiers-lister/1"],
    ["feuilles", sous("studies", studyId, "sheets"), "studio-api-feuilles-lister/1"],
    ["publications de l'étude", sous("studies", studyId, "publications"), "studio-api-publications-lister/1"],
    ["étapes rattachées", sous("studies", studyId, "steps"), "studio-api-etapes-lire/1"],
    ["délégations", sous("delegations"), "studio-api-delegations-lister/1"],
    ["paquets diffusés", sous("publications"), "studio-api-paquets-lister/1"],
    ["dossiers du projet", sous("dossiers"), "studio-api-dossiers-projet/1"],
    ["préférences d'outils", sous("preferences", "outils"), "studio-api-preferences-lire/1"],
    ["catalogue des outils", sous("preferences", "catalogue"), "studio-api-catalogue-outils/1"],
  ];

  for (const [nom, chemin, id] of lectures) {
    const r = await api("get", chemin);
    check(`${nom} : 200, contrat ${id}`, r.status === 200 && r.contrat === id, `${r.status} ${r.contrat}`);
    const exact = await api("get", chemin, undefined, { "X-Studio-Contrat": id });
    check(`${nom} : version exacte demandée servie, corps identique`, exact.status === 200 && JSON.stringify(exact.body) === JSON.stringify(r.body), `${exact.status}`);
  }

  const avant = (await api("get", `${V}/revisions`)).body.revisions.length;
  const refus = await api("post", `${V}/commands`, {
    contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: commandes.body.revision.id,
    commands: [{ toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 1 }, end: { x: 3, y: 1 } } }],
  }, { "X-Studio-Contrat": "studio-api-commandes/2" });
  check("version incompatible demandée : 400 contrat_incompatible, version attendue nommée", refus.status === 400 && refus.body?.error === "contrat_incompatible" && refus.body?.attendu === "studio-api-commandes/1" && refus.contrat === "studio-api-commandes/1", JSON.stringify(refus.body));
  check("version incompatible demandée : aucune révision écrite", (await api("get", `${V}/revisions`)).body.revisions.length === avant);
  const absente = await api("get", `${S}/studies/inconnue`);
  check("refus métier (404) : l'en-tête du contrat est posé aussi", absente.status === 404 && absente.contrat === "studio-api-etude-lire/1", `${absente.status} ${absente.contrat}`);
} catch (e) {
  echecs += 1;
  console.log(`✗ recette interrompue — ${e?.stack ?? e}`);
} finally {
  await browser.close();
}
console.log(echecs ? `\n${echecs} échec(s).` : "\nRecette studio-contrats-api : tout est vert.");
process.exit(echecs ? 1 : 0);
