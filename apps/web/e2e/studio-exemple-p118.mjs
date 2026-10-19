#!/usr/bin/env node
/**
 * Recette de l'étude exemple de Studio du projet P.118 (« Escalier B et mezzanine »), par l'API et l'interface réelles
 * (même origine, base migrée) :
 *   1. import de l'exemple P.118 (POST /examples/p118-exemple-complet/import) → le projet porte l'étude « Exemple
 *      Studio — P.118 » et ses 6 variantes, une par niveau, nommées d'après l'exemple, dans l'ordre des niveaux ;
 *      chaque variante est peuplée par le contrat de commandes (révisions « authenticated-session » après
 *      l'initialisation) ; la référence protégée reste protégée pour toute autre écriture (403 reference-protegee) ;
 *   2. page Studio du projet → étude → variante RDC : murs et ouvertures dessinés sur la Planche 2D, en nombre égal à
 *      ce que le convertisseur a produit (rapport renvoyé par POST …/studio/exemple) ; domaines et barre d'outils
 *      visibles ;
 *   3. « projet déjà importé sans étude » : une copie de travail du P.118 (POST /projects/:id/copies, provenance
 *      conservée, Studio non copié) n'a aucune étude → bouton « Charger l'exemple Studio P.118 » (propriétaire) →
 *      étude créée et ouverte ; un second appel est idempotent (200, même étude, rien écrit) ; un projet hors exemple
 *      reçoit 409 exemple_indisponible et ne voit pas le bouton ;
 *   4. archive : sauvegarder la copie (GET /projects/:id/archive), la supprimer, la restaurer (POST /projects/import) →
 *      l'étude exemple et ses 6 variantes sont restaurées (identifiants et documents identiques) ; l'installation la
 *      reconnaît complète (200).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-exemple-p118.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const NIVEAUX = ["Sous-sol technique", "RDC", "Mezzanine", "R+1 · Formation", "R+2 · Bureaux", "R+3 · Direction"];
const NOM_ETUDE = "Exemple Studio — P.118";
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.dismiss());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-exemple-p118-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-exemple-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? { timeout: 120000 } : { data, timeout: 120000 });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const studio = (pid) => `/projects/${pid}/studio`;
  const variantesDe = async (pid, sid) => (await api("get", `${studio(pid)}/studies/${sid}/variants`)).body?.variants ?? [];

  // 1. Import de l'exemple : l'étude exemple est installée avec le projet.
  const t0 = Date.now();
  const imp = await api("post", "/examples/p118-exemple-complet/import");
  check("import de l'exemple P.118 : 201, référence protégée", imp.status === 201 && imp.body?.exampleMode === "reference", `${imp.status} en ${Date.now() - t0} ms`);
  const pid = imp.body.id;
  const etudes = (await api("get", `${studio(pid)}/studies`)).body?.studies ?? [];
  check("import : une étude « Exemple Studio — P.118 »", etudes.length === 1 && etudes[0].name === NOM_ETUDE, JSON.stringify(etudes.map((s) => s.name)));
  const sid = etudes[0]?.id;
  const variantes = await variantesDe(pid, sid);
  check("import : 6 variantes, une par niveau, nommées d'après l'exemple, dans l'ordre des niveaux", JSON.stringify(variantes.map((v) => v.name)) === JSON.stringify(NIVEAUX), variantes.map((v) => v.name).join(" · "));
  const installe = await api("post", `${studio(pid)}/exemple`);
  check("installation déjà faite : 200, created false, même étude (rien écrit)", installe.status === 200 && installe.body?.created === false && installe.body?.etude?.study?.id === sid, String(installe.status));
  const rapport = installe.body?.rapport?.niveaux ?? [];
  check("rapport de conversion : 6 niveaux, poteaux / escaliers / métadonnées rooms déclarés absents", rapport.length === 6 && rapport.every((n) => ["columns", "stairs", "rooms"].every((f) => n.rapport.absents.some((a) => a.famille === f))));
  const rdc = variantes.find((v) => v.name === "RDC");
  const revisions = (await api("get", `${studio(pid)}/studies/${sid}/variants/${rdc.id}/revisions`)).body?.revisions ?? [];
  check("RDC peuplé par le contrat de commandes : initialisation puis lots de commandes (aucune insertion directe)", revisions.length >= 2 && revisions.at(-1).source === "variant-initialization" && revisions.slice(0, -1).every((r) => r.source === "authenticated-session"), revisions.map((r) => r.source).join(", "));
  const ctxRdc = (await api("get", `${studio(pid)}/studies/${sid}/variants/${rdc.id}`)).body;
  const doc = ctxRdc.revision.document;
  const cRdc = rapport.find((n) => n.nom === "RDC").comptes;
  const murs = doc.architecture.filter((x) => x.type === "wall").length, ouvertures = doc.architecture.filter((x) => x.type === "opening").length;
  check("RDC : document = convertisseur (murs, ouvertures, cotes, polylignes, textes)", murs === cRdc.murs && ouvertures === cRdc.portes + cRdc.fenetres && doc.dimensions.length === cRdc.cotes
    && doc.objects.length === cRdc.polylignes && doc.annotations.length === cRdc.textes + cRdc.nomsLocaux && murs > 0 && ouvertures > 0, JSON.stringify(cRdc));
  check("RDC : base des murs = altitude du niveau (0 m)", doc.architecture.filter((x) => x.type === "wall").every((w) => w.base === 0));
  const refus = await api("post", `${studio(pid)}/studies`, { name: "Écriture dans la référence" });
  check("référence protégée : toute autre écriture Studio reste refusée (403 reference-protegee)", refus.status === 403 && refus.body?.motif === "reference-protegee", String(refus.status));
  check("référence protégée : l'étude exemple est en lecture seule", ctxRdc.canWrite === false);

  // 2. Interface : page du projet → étude → variante RDC.
  await page.goto(`${BASE}/studio/projets/${pid}`);
  await page.locator(`[data-studio-etude-carte="${sid}"]`).waitFor();
  check("page Studio du projet : l'étude exemple est listée, aucun bouton de chargement", (await page.locator("[data-studio-charger-exemple]").count()) === 0);
  await page.locator(`[data-studio-etude-carte="${sid}"] a`).first().click();
  await page.waitForURL(new RegExp(`/etudes/${sid}`));
  await page.getByText("R+3 · Direction").first().waitFor();
  for (const nom of NIVEAUX) check(`page de l'étude : variante « ${nom} »`, (await page.getByText(nom, { exact: true }).count()) >= 1);
  await page.goto(`${BASE}/studio/projets/${pid}/etudes/${sid}/variantes/${rdc.id}`);
  await page.locator("[data-studio-domaines]").waitFor();
  await page.locator('[data-studio-architecture][data-studio-type="wall"]').first().waitFor({ state: "attached" });
  const murs2d = await page.locator('[aria-label="Planche de dessin 2D"] [data-studio-architecture][data-studio-type="wall"]').count();
  const ouv2d = await page.locator('[aria-label="Planche de dessin 2D"] [data-studio-architecture][data-studio-type="opening"]').count();
  check("variante RDC : murs dessinés sur la Planche 2D = convertisseur", murs2d === cRdc.murs, `${murs2d} / ${cRdc.murs}`);
  check("variante RDC : ouvertures dessinées = convertisseur", ouv2d === cRdc.portes + cRdc.fenetres, `${ouv2d} / ${cRdc.portes + cRdc.fenetres}`);
  const nav = page.getByRole("navigation", { name: "Domaines du Studio" });
  check("variante RDC : les quatre domaines sont visibles", (await nav.getByRole("link").count()) === 4 && await nav.isVisible());
  check("variante RDC : la barre d'outils de dessin est visible", await page.locator('[role="toolbar"][aria-label="Outils de dessin"]').first().isVisible());

  // 3. Projet déjà importé sans étude : une copie de travail (provenance conservée, Studio non copié).
  const copie = await api("post", `/projects/${pid}/copies`, {});
  const cid = copie.body?.id;
  const projetCopie = (await api("get", `/projects/${cid}`)).body;
  const etudesCopie = (await api("get", `${studio(cid)}/studies`)).body?.studies ?? [];
  check("copie de l'exemple : provenance P.118 conservée, aucune étude Studio", copie.status === 201 && projetCopie?.sourceExampleId === "p118-exemple-complet" && etudesCopie.length === 0, `${copie.status} ${etudesCopie.length}`);
  await page.goto(`${BASE}/studio/projets/${cid}`);
  const bouton = page.locator("[data-studio-charger-exemple]");
  await bouton.waitFor();
  check("page Studio d'un projet P.118 sans étude : bouton « Charger l'exemple Studio P.118 »", (await bouton.textContent())?.trim() === "Charger l’exemple Studio P.118");
  await bouton.click();
  await page.waitForURL(/\/etudes\/studio_study_/, { timeout: 120000 });
  const sidCopie = decodeURIComponent(page.url().split("/etudes/")[1].split(/[/?]/)[0]);
  await page.getByText("R+3 · Direction").first().waitFor();
  const variantesCopie = await variantesDe(cid, sidCopie);
  check("bouton : étude exemple créée et ouverte, 6 variantes", JSON.stringify(variantesCopie.map((v) => v.name)) === JSON.stringify(NIVEAUX), variantesCopie.map((v) => v.name).join(" · "));
  const ctxCopie = (await api("get", `${studio(cid)}/studies/${sidCopie}/variants/${variantesCopie[1].id}`)).body;
  check("copie de travail : l'étude exemple est modifiable (canWrite) et identique à celle de la référence", ctxCopie.canWrite === true && JSON.stringify({ ...ctxCopie.revision.document, id: "" }) === JSON.stringify({ ...doc, id: "" }));
  const deuxieme = await api("post", `${studio(cid)}/exemple`);
  const etudesApres = (await api("get", `${studio(cid)}/studies`)).body?.studies ?? [];
  check("second appel idempotent : 200, created false, même étude, aucune étude en plus", deuxieme.status === 200 && deuxieme.body?.created === false && deuxieme.body?.etude?.study?.id === sidCopie && etudesApres.length === 1, String(deuxieme.status));
  const autre = (await api("post", "/projects", { code: `P.EX.${randomUUID().slice(0, 6)}`, name: "Hors exemple (recette)" })).body;
  const horsExemple = await api("post", `${studio(autre.id)}/exemple`);
  check("projet hors exemple : 409 exemple_indisponible", horsExemple.status === 409 && horsExemple.body?.error === "exemple_indisponible", String(horsExemple.status));
  await page.goto(`${BASE}/studio/projets/${autre.id}`);
  await page.locator("[data-studio-aucune-etude]").waitFor();
  check("projet hors exemple : aucun bouton de chargement", (await page.locator("[data-studio-charger-exemple]").count()) === 0);

  // 4. Archive : sauvegarder, supprimer, restaurer la copie → l'étude exemple revient.
  const archive = (await api("get", `/projects/${cid}/archive`)).body;
  check("archive de la copie : section Studio présente", !!archive?.studio, archive ? Object.keys(archive).join(",") : "");
  const suppression = await page.request.delete(`${BASE}/projects/${cid}`);
  check("copie supprimée avant la restauration (identifiants Studio libres)", suppression.status() === 204, String(suppression.status()));
  const restauration = await api("post", "/projects/import", archive);
  const rid = restauration.body?.projects?.[0]?.id;
  check("restauration : 201, partie Studio restaurée", restauration.status === 201 && restauration.body.projects[0].studio?.restored === true, JSON.stringify(restauration.body?.projects?.[0]?.studio ?? restauration.body).slice(0, 300));
  const etudesRestaurees = (await api("get", `${studio(rid)}/studies`)).body?.studies ?? [];
  const variantesRestaurees = etudesRestaurees.length ? await variantesDe(rid, etudesRestaurees[0].id) : [];
  check("restauration : étude exemple et ses 6 variantes (mêmes identifiants)", etudesRestaurees.length === 1 && etudesRestaurees[0].id === sidCopie && JSON.stringify(variantesRestaurees.map((v) => v.id)) === JSON.stringify(variantesCopie.map((v) => v.id)));
  const ctxRestaure = (await api("get", `${studio(rid)}/studies/${sidCopie}/variants/${variantesCopie[1].id}`)).body;
  check("restauration : document RDC identique", JSON.stringify(ctxRestaure?.revision?.document) === JSON.stringify(ctxCopie.revision.document));
  const apresRestauration = await api("post", `${studio(rid)}/exemple`);
  check("restauration : l'installation reconnaît l'étude complète (200, created false)", apresRestauration.status === 200 && apresRestauration.body?.created === false && apresRestauration.body?.etude?.study?.id === sidCopie, String(apresRestauration.status));

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} finally {
  await browser.close();
}
if (echecs) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette de l'étude exemple Studio P.118 : tous les contrôles passent.");
