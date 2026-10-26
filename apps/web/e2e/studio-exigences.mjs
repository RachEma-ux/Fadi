#!/usr/bin/env node
/**
 * Recette Studio — propriétés BIM, exigences versionnées et écarts (lot E.1, E.1-01 à E.1-06), par l'interface et
 * l'API réelles (même origine, base migrée : tables `studio_requirement_*` dans init.sql). Comptes et projet
 * synthétiques créés par les vraies routes ; le mur et son ouverture sont posés par une enveloppe de commandes.
 *   1. une propriété est déclarée sur un mur (raccourci K ; G retire), enregistrée avec la révision et relue après rechargement ;
 *   2. une exigence (volume net des murs ≤ 1 m³, source déclarée) crée la version 1 du jeu ; aucun jeu n'existait ;
 *   3. le contrôle de la révision affichée est enregistré : exécuté, non conforme, écart affiché ;
 *   4. modifier l'exigence crée la version 2 (la version 1 reste lisible, inchangée) ; un nouveau contrôle conclut
 *      conforme, et l'ancien résultat reste lié à la version 1 et à la même révision ;
 *   5. une référence partenaire n'est utilisée qu'après acceptation (qui, quand) ; F amène le panneau.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-exigences.mjs
 */
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const erreurs = [];
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
}

/** Sélectionne le mur au clavier (Entrée sur son élément focalisable) : l'ouverture le recouvre au centre de la vue. */
async function choisirMur(page) {
  const mur = page.locator('svg [data-studio-architecture="mur-1"]').first();
  await mur.focus();
  await page.keyboard.press("Enter");
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', `studio-exigences-${Date.now()}@example.com`);
  await page.fill('input[name="password"]', "studio-exigences-ci-123");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const api = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };

  const projet = (await api("post", "/projects", { code: `P.EXI.${randomUUID().slice(0, 6)}`, name: "Studio — exigences (recette)" })).body;
  const racine = `/projects/${projet.id}/studio/studies`;
  const etude = (await api("post", racine, { name: "Étude exigences" })).body;
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variante = `${racine}/${studyId}/variants/${variantId}`;
  const pose = await api("post", `${variante}/commands`, {
    contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: etude.revision.id,
    commands: [
      { toolId: "studio.architecture.mur", params: { id: "mur-1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
      { toolId: "studio.architecture.ouverture", params: { id: "baie-1", type: "opening", hostId: "mur-1", position: 2, width: 1, height: 2, sill: 0, kind: "porte" } },
    ],
  });
  check("préparation : mur et ouverture posés par commandes", pose.status === 200, String(pose.status));

  // Aucun jeu d'exigences fourni : l'étude n'en a pas.
  const vide = await api("get", `${racine}/${studyId}/exigences`);
  check("aucune exigence fournie par défaut", vide.status === 200 && vide.body.courante === null && vide.body.versions.length === 0, JSON.stringify(vide.body));

  // Propriétés et exigences : domaine « BIM et coordination » (palette, plan du modèle et panneau du domaine).
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}?domaine=bim`);
  const outils = page.getByRole("toolbar", { name: "Outils — BIM et coordination" });
  await outils.waitFor();
  const panneau = page.locator("[data-studio-exigences]");
  await panneau.waitFor();

  // 1. Propriété déclarée sur le mur (K), enregistrée avec la révision.
  await choisirMur(page);
  const blocProprietes = page.locator('[data-studio-proprietes-bim="mur-1"]');
  await blocProprietes.waitFor();
  check("propriétés : le mur choisi n'en porte aucune", (await blocProprietes.locator("[data-studio-proprietes-vide]").count()) === 1);
  const champ = (n) => blocProprietes.locator(`[data-studio-champ-propriete="${n}"]`);
  await champ("nom").fill("Indice d’affaiblissement");
  await champ("type").selectOption("nombre");
  await champ("valeur").fill("45");
  await champ("unite").fill("dB");
  await champ("source").fill("Fiche produit saisie pour la recette");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("k");
  const ligneProp = blocProprietes.locator('[data-studio-propriete="Indice d’affaiblissement"]');
  await ligneProp.waitFor();
  check("propriétés : K déclare la propriété (valeur, unité, source)", /45 dB/.test(await ligneProp.textContent()) && /Fiche produit/.test(await ligneProp.textContent()), await ligneProp.textContent());
  await champ("nom").fill("Résistance au feu");
  await blocProprietes.locator('[data-studio-propriete-action="studio.propriete.definir"]').click();
  const nonEvaluee = blocProprietes.locator('[data-studio-propriete="Résistance au feu"]');
  await nonEvaluee.waitFor();
  check("propriétés : sans valeur saisie, la propriété est « non évaluée »", /non évaluée/.test(await nonEvaluee.textContent()));
  await page.keyboard.press("Control+s");
  await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  const tete = (await api("get", variante)).body;
  check("propriétés : enregistrées avec la révision (champ additif `proprietes`)", JSON.stringify(tete.revision.document.proprietes) === JSON.stringify([
    { cibleId: "mur-1", nom: "Indice d’affaiblissement", valeur: 45, unite: "dB", source: "Fiche produit saisie pour la recette" },
    { cibleId: "mur-1", nom: "Résistance au feu" },
  ]), JSON.stringify(tete.revision.document.proprietes));
  const revision = tete.revision.id;

  // 2. Première exigence : version 1.
  const form = panneau.locator("[data-studio-exigence-formulaire]");
  const ex = (n) => form.locator(`[data-studio-champ-exigence="${n}"]`);
  await ex("libelle").fill("Volume net des murs");
  await ex("type").selectOption("total");
  await ex("grandeur").selectOption("volume-net");
  await ex("comparaison").selectOption("<=");
  await ex("valeur").fill("1");
  await ex("source").fill("Programme de recette, saisi");
  check("exigence : l'unité est celle de la métrique (m³), aucune autre proposée", /m³/.test(await form.textContent()) && (await ex("unite").count()) === 0);
  await form.locator("[data-studio-exigence-valider]").click();
  await panneau.locator('[data-studio-exigences-version="1"]').waitFor();
  const v1 = (await api("get", `${racine}/${studyId}/exigences`)).body;
  check("exigence : version 1 enregistrée côté serveur, source déclarée", v1.courante?.version === 1 && v1.courante.exigences.length === 1 && v1.courante.exigences[0].source === "Programme de recette, saisi" && v1.courante.exigences[0].unite === "m3");
  const idExigence = v1.courante.exigences[0].id;

  // 3. Contrôle de la révision affichée : exécuté, non conforme, écart.
  await panneau.locator("[data-studio-controler]").click();
  const premier = panneau.locator('[data-studio-controles] li[data-studio-controle-version="1"]');
  await premier.waitFor();
  check("contrôle v1 : état d'exécution distinct de la conclusion (exécuté · non conforme)",
    (await premier.locator('[data-studio-execution="execute"]').count()) === 1 && (await premier.locator('[data-studio-conclusion="non-satisfaite"]').count()) === 1);
  const ecart = premier.locator(`[data-studio-ecart="${idExigence}"]`);
  check("contrôle v1 : écart affiché (mesure 3,2 m³ contre ≤ 1 m³)", (await ecart.getAttribute("data-statut")) === "non-satisfaite" && /3,2/.test(await ecart.textContent()), await ecart.textContent());
  check("contrôle v1 : lié à la révision affichée", (await premier.getAttribute("data-studio-controle-revision")) === revision);

  // 4. Modifier l'exigence : version 2 ; l'ancien résultat reste lié à la version 1.
  await panneau.locator(`[data-studio-exigence-modifier="${idExigence}"]`).click();
  await panneau.locator('[data-studio-exigence-formulaire="edition"]').waitFor();
  await ex("valeur").fill("10");
  await form.locator("[data-studio-exigence-valider]").click();
  await panneau.locator('[data-studio-exigences-version="2"]').waitFor();
  await panneau.locator("[data-studio-controler]").click();
  await panneau.locator('[data-studio-controles] li[data-studio-controle-version="2"]').waitFor();
  const lignes = panneau.locator("[data-studio-controles] > li");
  check("contrôles : deux résultats, le plus récent d'abord (v2 puis v1)", (await lignes.count()) === 2
    && (await lignes.nth(0).getAttribute("data-studio-controle-version")) === "2" && (await lignes.nth(1).getAttribute("data-studio-controle-version")) === "1");
  check("contrôle v2 : conforme", (await lignes.nth(0).locator('[data-studio-conclusion="satisfaite"]').count()) === 1);
  const ancien = (await api("get", `${racine}/${studyId}/exigences/versions/1`)).body;
  check("version 1 inchangée (ajout seul) : valeur exigée 1", ancien.version === 1 && ancien.exigences[0].valeur === 1 && ancien.exigences[0].id === idExigence);
  const controles = (await api("get", `${variante}/controles`)).body.controles;
  const c1 = controles.find((c) => c.version === 1), c2 = controles.find((c) => c.version === 2);
  check("ancien résultat lié à l'ancienne version et à la même révision, jamais réécrit",
    c1 && c2 && c1.revisionId === revision && c2.revisionId === revision && c1.conclusion === "non-satisfaite" && c1.resultat.ecarts[0].valeurExigee === 1 && c2.resultat.ecarts[0].valeurExigee === 10,
    JSON.stringify(controles.map((c) => [c.version, c.revisionId, c.conclusion])));

  // 5. Référence partenaire : non utilisée tant qu'elle n'est pas acceptée.
  await ex("libelle").fill("Nombre de murs (référence partenaire)");
  await ex("type").selectOption("nombre");
  await ex("nature").selectOption("mur-architectural");
  await ex("comparaison").selectOption(">=");
  await ex("valeur").fill("1");
  await ex("source").fill("Référentiel partenaire, article 2");
  await ex("reference").fill("Partenaire R-12");
  await form.locator("[data-studio-exigence-valider]").click();
  await panneau.locator('[data-studio-exigences-version="3"]').waitFor();
  check("référence partenaire : affichée « non acceptée »", (await panneau.locator('[data-studio-exigence-reference="non-acceptee"]').count()) === 1);
  await panneau.locator("[data-studio-controler]").click();
  await panneau.locator('[data-studio-controles] li[data-studio-controle-version="3"]').waitFor();
  const v3 = (await api("get", `${variante}/controles`)).body.controles.find((c) => c.version === 3);
  check("référence non acceptée : non utilisée par le contrôle", v3.resultat.ecarts.find((e) => e.statut === "non-utilisee") !== undefined && v3.resultat.compte["non-utilisee"] === 1);
  await panneau.locator("[data-studio-exigence-accepter]").click();
  await panneau.locator('[data-studio-exigences-version="4"]').waitFor();
  const v4 = (await api("get", `${racine}/${studyId}/exigences`)).body.courante;
  const acceptee = v4.exigences.find((e) => e.origine);
  check("acceptation explicite : qui et quand, posés par le serveur (version 4)", acceptee.origine.acceptation?.par && /^\d{4}-\d\d-\d\dT/.test(acceptee.origine.acceptation.le) && (await panneau.locator('[data-studio-exigence-reference="acceptee"]').count()) === 1);
  const forgee = await api("post", `${racine}/${studyId}/exigences`, { baseVersion: 4, exigences: [{ ...acceptee, valeur: 2 }], requestId: `recette-${randomUUID()}` });
  check("une acceptation saisie par le client est refusée", forgee.status === 400 && forgee.body.error === "acceptation_forgee", JSON.stringify(forgee.body));
  const perimee = await api("post", `${racine}/${studyId}/exigences`, { baseVersion: 1, exigences: [], requestId: `recette-${randomUUID()}` });
  check("une édition sur une version périmée est refusée (409)", perimee.status === 409 && perimee.body.error === "version_perimee");

  // Raccourci F : amène le panneau « Propriétés et exigences ».
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("f");
  check("F amène le panneau des exigences", await page.evaluate(() => document.activeElement?.hasAttribute("data-studio-exigences") ?? false));

  // Rechargement : la propriété est relue depuis la révision enregistrée.
  await page.reload();
  await outils.waitFor();
  await choisirMur(page);
  await page.locator('[data-studio-proprietes-bim="mur-1"] [data-studio-propriete="Indice d’affaiblissement"]').waitFor();
  check("propriété relue après rechargement", true);

  // 6. TEST-027 / EX-065 (lot PUB) : la surface dessinée change (mur allongé), l'exigence reste identique (même version,
  // même valeur) ; le nouveau contrôle calcule l'écart et l'affiche.
  const avantModif = (await api("get", `${racine}/${studyId}/exigences`)).body.courante;
  const teteModif = (await api("get", variante)).body;
  const murInitial = teteModif.revision.document.architecture.find((x) => x.id === "mur-1");
  const allonge = await api("post", `${variante}/commands`, {
    contractVersion: "studio-commands/1", requestId: `recette-${randomUUID()}`, baseRevisionId: teteModif.variant.headRevisionId,
    commands: [{ toolId: "studio.architecture.modifier", params: { ...murInitial, axis: [{ x: 0, y: 0 }, { x: 20, y: 0 }] } }],
  });
  check("TEST-027 : mur allongé par commande (nouvelle révision)", allonge.status === 200, String(allonge.status));
  await page.reload();
  await outils.waitFor();
  await panneau.waitFor();
  await panneau.locator("[data-studio-controler]").click();
  await panneau.locator(`[data-studio-controles] li[data-studio-controle-revision="${allonge.body.revision.id}"]`).first().waitFor();
  const apresModif = (await api("get", `${racine}/${studyId}/exigences`)).body.courante;
  check("TEST-027 : exigence identique après la modification du dessin (même version, mêmes valeurs)", apresModif.version === avantModif.version && JSON.stringify(apresModif.exigences) === JSON.stringify(avantModif.exigences));
  const recent = panneau.locator(`[data-studio-controles] li[data-studio-controle-revision="${allonge.body.revision.id}"]`).first();
  const ecartVolume = recent.locator(`[data-studio-ecart="${idExigence}"]`);
  check("TEST-027 : écart calculé et visible (mesure 11,6 m³ contre ≤ 10 m³, +1,6)", (await ecartVolume.getAttribute("data-statut")) === "non-satisfaite" && /11,6/.test(await ecartVolume.textContent()) && /\+1,6/.test(await ecartVolume.textContent()), await ecartVolume.textContent());
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  echecs += 1;
  console.log(`✗ exception : ${e instanceof Error ? e.stack : e}`);
} finally {
  await browser.close();
}
if (echecs) { console.log(`${echecs} échec(s)`); process.exit(1); }
console.log("Recette studio-exigences : tout est vert.");
