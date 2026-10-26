#!/usr/bin/env node
/**
 * Recette Studio — lot G1 « parcours et association », par l'interface et l'API réelles (application construite servie
 * par l'API, base migrée jetable). Compte, projet et dessins synthétiques (mur 6 × 3 × 0,2 m, ouverture 1 × 2,1 m :
 * dimensions synthétiques du registre, test murRT001) ; aucune donnée de projet réelle.
 *
 *   1. TR-EX-002 [+] — un parcours unique d'une petite étude, du dessin au dossier de conception publié, à travers les
 *      quatre domaines : Dessin et modélisation (mur, ouverture, cote associative sur le mur, Planche 2D puis Planche 3D),
 *      BIM et coordination (propriété du mur), Visualisation (scène), Documentation (métré, feuille composée, dossier de
 *      conception, publication soumise, approuvée et diffusée — PDF et JSON relus à leurs empreintes).
 *   2. TR-AC-001 / J4 / PASS-05 — association : même objectId du mur et même hôte de l'ouverture en 2D et en 3D
 *      (TEST-003, A.4-03, A.4-04, A.4-09), ouverture élargie depuis la vue 3D (TEST-010 : net 3,180 → 3,096 m³), annuler /
 *      rétablir (TEST-011), réouverture, dossier publié qui garde la version examinée ; cote associative sur le mur qui
 *      suit sa modification depuis la 2D et la 3D ; négatif « perte de cote » : mur supprimé → la cote n'est pas perdue,
 *      elle passe « à résoudre » ; copie indépendante (TR-EX-013) : nouvelles identités, aucune propagation vers la
 *      source ; conflit sur un mur entre deux sessions (TEST-012) sans « dernier écrit gagne ».
 *   3. TR-EX-016 — métré, feuilles et publications affichent l'un des cinq états dérivés : « À jour pour la révision R »,
 *      « À recalculer » après une nouvelle révision, puis « À jour » après actualisation ; « Non applicable » (métré d'une
 *      variante vide, publication retirée).
 *
 * BASE_URL=http://localhost:3001 [MAILPIT_URL=… | API_LOG=…] OUT=atelier-captures/studio-g1 node apps/web/e2e/studio-g1.mjs
 */
import { chromium } from "playwright";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/studio-g1";
mkdirSync(OUT, { recursive: true });
const erreurs = [];
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail && !ok ? ` — ${String(detail).slice(0, 600)}` : ""}`);
  if (!ok) throw new Error(nom);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const court = (x) => JSON.stringify(x).slice(0, 500);
const proche = (a, b, e = 1e-9) => Math.abs(Number(a) - b) < e;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
let pageEchec = null;
try {
  const email = `studio-g1-${Date.now()}@example.com`, motDePasse = `studio-g1-${randomUUID()}`;
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  pageEchec = page;
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${BASE}/inscription`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', motDePasse);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);
  const brut = async (ctx, method, path, data) => {
    const r = await ctx.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, "content-type": "application/json" }, ...(data === undefined ? {} : { data }) });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status(), body };
  };
  const api = async (method, path, data) => {
    const r = await brut(context, method, path, data);
    if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${court(r.body)}`);
    return r.body;
  };
  const fichier = async (path) => { const r = await context.request.get(`${BASE}${path}`); return { status: r.status(), octets: Buffer.from(await r.body()) }; };

  const projet = await api("POST", "/projects", { code: `P.G1.${randomUUID().slice(0, 6)}`, name: "Studio — parcours G1 (recette)" });
  const racine = `/projects/${projet.id}/studio`;
  const etude = await api("POST", `${racine}/studies`, { name: "Petite étude G1" });
  const studyId = etude.study.id, variantId = etude.variant.id;
  const variante = `${racine}/studies/${studyId}/variants/${variantId}`;
  const pubs = `${racine}/studies/${studyId}/publications`;
  const urlVariante = `${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${variantId}`;
  const tete = async () => (await api("GET", variante)).revision;

  const outils = page.getByRole("toolbar", { name: "Outils de dessin" });
  const proprietes = page.getByRole("complementary", { name: "Propriétés du dessin" });
  const planche = page.getByRole("group", { name: "Planche de dessin 2D", exact: true });
  const panneaux3d = page.locator("[data-studio-vue3d], [data-studio-planche3d-panneaux], [data-studio-visualisation-panneaux]");
  const atteindre = async (barre, selecteur) => {
    const el = barre.locator(selecteur).first();
    await el.waitFor({ state: "attached" });
    for (let essai = 0; essai < 3 && !(await el.isVisible()); essai++) {
      const menu = await el.evaluate((n) => n.closest("[data-studio-menu-liste]")?.id ?? null);
      if (menu) { const b = barre.locator(`[aria-controls="${menu}"]`); if ((await b.getAttribute("aria-expanded")) !== "true") await b.click(); }
      await el.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    }
    return el;
  };
  const cliquerBouton = async (barre, nom) => (await atteindre(barre, `:is(button,a)[aria-label="${nom}"]`)).click();
  const sansFocus = () => page.evaluate(() => document.activeElement?.blur());
  /** Clic sur un point du repère du document (converti par la planche en point de l'écran). */
  const cliquerDoc = async (x, y) => {
    await planche.scrollIntoViewIfNeeded();
    const p = await planche.evaluate((svg, w) => { const t = new DOMPoint(w.x, w.y).matrixTransform(svg.getScreenCTM()); return { x: t.x, y: t.y }; }, { x, y });
    await page.mouse.click(p.x, p.y);
  };
  const enAttente = (n) => page.waitForFunction((x) => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === x, String(n));
  const enregistrer = async () => {
    await sansFocus();
    await page.keyboard.press("Control+s");
    await page.getByRole("status").filter({ hasText: /^Enregistré sur le serveur$/ }).waitFor();
  };
  const choisirArchi = async (id) => {
    const bouton = proprietes.locator(`[data-studio-architecture-choisir="${id}"]`);
    if ((await bouton.getAttribute("aria-pressed")) !== "true") await bouton.click();
    const form = proprietes.locator(`[data-studio-architecture-choisi="${id}"]`);
    await form.waitFor();
    return form;
  };
  const metreMur = async (form) => {
    const m = form.locator("[data-studio-architecture-metre]");
    return { brut: Number(await m.getAttribute("data-studio-volume-brut")), deduit: Number(await m.getAttribute("data-studio-volume-deduit")), net: Number(await m.getAttribute("data-studio-volume-net")) };
  };
  const domaines = new Set();
  const allerDomaine = async (id) => {
    await page.locator(`[data-studio-domaine-lien="${id}"]`).click();
    await page.waitForSelector(`[data-studio-domaine-affiche="${id}"]`);
    domaines.add(id);
  };

  // ——— 1. Domaine 01 « Dessin et modélisation », Planche 2D : mur, ouverture, cote associative sur le mur ———
  await page.goto(urlVariante);
  await outils.waitFor();
  domaines.add(await page.locator("[data-studio-domaine-affiche]").getAttribute("data-studio-domaine-affiche"));
  await sansFocus();
  await page.keyboard.press("w");
  const formMur = proprietes.locator("[data-studio-architecture-mur-formulaire]");
  await formMur.waitFor();
  await formMur.getByLabel("Axe (x y ; …)").fill("0 0; 6 0");
  for (const [libelle, v] of [["Épaisseur (m)", "0.2"], ["Hauteur (m)", "3"], ["Cote de base z (m)", "0"]]) await formMur.getByLabel(libelle, { exact: true }).fill(v);
  await formMur.locator('[data-studio-champ-architecture="justification"]').selectOption("center");
  await formMur.getByRole("button", { name: "Créer le mur", exact: true }).click();
  const murPlanche = page.locator('svg [data-studio-architecture][data-studio-type="wall"]');
  await murPlanche.waitFor({ state: "attached" });
  const idMur = await murPlanche.getAttribute("data-studio-architecture");
  await sansFocus();
  await page.keyboard.press("Shift+Z");
  await page.keyboard.press("h");
  const formOuv = proprietes.locator("[data-studio-architecture-ouverture-formulaire]");
  await formOuv.waitFor();
  for (const [libelle, v] of [["Largeur (m)", "1"], ["Hauteur (m)", "2.1"], ["Allège (m)", "0"]]) await formOuv.getByLabel(libelle, { exact: true }).fill(v);
  await cliquerDoc(3, 0);
  const ouvPlanche = page.locator('svg [data-studio-architecture][data-studio-type="opening"]');
  await ouvPlanche.waitFor({ state: "attached" });
  const idOuv = await ouvPlanche.getAttribute("data-studio-architecture");
  await sansFocus();
  await page.keyboard.press("Escape");
  const murChoisi = await choisirArchi(idMur);
  const m1 = await metreMur(murChoisi);
  check("A.4-01 / TR-EX-002 (dessin) : mur 6 × 3 × 0,2 m et ouverture 1 × 2,1 m dessinés sur la Planche 2D — brut 3,600, déduction 0,420, net 3,180 m³",
    proche(m1.brut, 3.6) && proche(m1.deduit, 0.42) && proche(m1.net, 3.18), court(m1));
  // Cote associative sur le mur : ses deux extrémités accrochées aux sommets du contour de l'emprise (face y = +0,1 m).
  await sansFocus();
  await page.keyboard.press("Shift+C");
  await cliquerDoc(0.02, 0.1);
  await cliquerDoc(5.98, 0.1);
  const cote = page.locator("svg [data-studio-cote]");
  await cote.waitFor({ state: "attached" });
  check("AC-001 : cote posée sur le mur à la souris — accrochée à ses sommets, valeur mesurée 6,000 m, résolue",
    (await cote.getAttribute("data-studio-cote-etat")) === "resolue" && (await cote.getAttribute("data-studio-cote-valeur")) === "6.000", `${await cote.getAttribute("data-studio-cote-valeur")} ${await page.locator(".studio-alert").allTextContents()}`);
  await sansFocus();
  await page.keyboard.press("Escape");
  await enregistrer();
  const r1 = await tete();
  const doc1 = r1.document;
  const coteServeur = (d) => (d.dimensions ?? [])[0];
  const c1 = coteServeur(doc1);
  check("AC-001 : enregistrée, la cote est liée au mur (objectId du mur aux deux extrémités), l'ouverture est hébergée par ce mur",
    c1?.links?.start?.objectId === idMur && c1.links.end?.objectId === idMur && c1.toResolve === false && proche(c1.start.y, 0.1) && proche(c1.end.y, 0.1)
      && doc1.architecture.find((x) => x.id === idOuv)?.hostId === idMur, court(c1));

  // ——— 2. Planche 3D : même mur, même ouverture ; élargie à 1,20 m ; annuler / rétablir ———
  await sansFocus();
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator("[data-studio-architecture-vue3d]").waitFor();
  const ids3d = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
  check("TEST-003 / A.4-03 : la Planche 3D porte les mêmes identifiants que la Planche 2D (mur, ouverture)", JSON.stringify(ids3d) === JSON.stringify([idMur, idOuv]), court(ids3d));
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idOuv}"]`).click();
  const ouvChoisie = proprietes.locator(`[data-studio-architecture-choisi="${idOuv}"]`);
  await ouvChoisie.waitFor();
  await ouvChoisie.getByLabel("Largeur (m)", { exact: true }).fill("1.2");
  await ouvChoisie.getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
  const m2 = await metreMur(proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`));
  check("TEST-010 : ouverture élargie à 1,20 m depuis la Planche 3D — déduction 0,504 m³, net 3,096 m³", proche(m2.deduit, 0.504) && proche(m2.net, 3.096), court(m2));
  await sansFocus();
  await page.keyboard.press("Control+z");
  await enAttente(0);
  const m3 = await metreMur(proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`));
  await page.keyboard.press("Control+y");
  await enAttente(1);
  const m4 = await metreMur(proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`));
  const ids3dApres = await panneaux3d.locator("[data-studio-architecture-3d-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-studio-architecture-3d-objet")));
  check("TEST-011 / AC-001 : annuler → net 3,180 m³, rétablir → 3,096 m³ ; mêmes identités (mur, ouverture) en 3D", proche(m3.net, 3.18) && proche(m4.net, 3.096) && JSON.stringify(ids3dApres) === JSON.stringify([idMur, idOuv]), court([m3, m4, ids3dApres]));
  await enregistrer();
  const r2 = await tete();
  check("TEST-010 : R2 en tête, ouverture à 1,20 m portée par le même mur ; R1 relue inchangée (ouverture 1 m)",
    r2.parentRevisionId === r1.id && r2.document.architecture.find((x) => x.id === idOuv)?.width === 1.2 && r2.document.architecture.find((x) => x.id === idOuv)?.hostId === idMur
      && (await api("GET", `${variante}/revisions/${r1.id}`)).revision.document.architecture.find((x) => x.id === idOuv)?.width === 1, court(r2.document.architecture));
  // Réouverture : nouvelle lecture de la variante, mêmes valeurs.
  await page.reload();
  await outils.waitFor();
  await page.locator(`svg [data-studio-architecture="${idOuv}"]`).waitFor({ state: "attached" });
  const m5 = await metreMur(await choisirArchi(idMur));
  check("AC-001 : réouverture — mêmes identités, net 3,096 m³, cote toujours liée au mur (6,000 m)",
    proche(m5.net, 3.096) && (await page.locator(`svg [data-studio-architecture="${idMur}"]`).count()) === 1 && (await page.locator("svg [data-studio-cote]").getAttribute("data-studio-cote-valeur")) === "6.000", court(m5));

  // ——— 3. Domaine 02 « BIM et coordination » : propriété déclarée sur le mur ———
  await allerDomaine("bim");
  await page.locator(`svg [data-studio-architecture="${idMur}"]`).first().focus();
  await page.keyboard.press("Enter");
  const blocProprietes = page.locator(`[data-studio-proprietes-bim="${idMur}"]`);
  await blocProprietes.waitFor();
  const champ = (n) => blocProprietes.locator(`[data-studio-champ-propriete="${n}"]`);
  await champ("nom").fill("Résistance au feu");
  await blocProprietes.locator('[data-studio-propriete-action="studio.propriete.definir"]').click();
  await blocProprietes.locator('[data-studio-propriete="Résistance au feu"]').waitFor();
  check("TR-EX-002 (BIM) : propriété déclarée sur le mur, « non évaluée » sans valeur saisie", /non évaluée/.test(await blocProprietes.locator('[data-studio-propriete="Résistance au feu"]').textContent()));
  await enregistrer();

  // ——— 4. Domaine 03 « Visualisation, rendu et immersion » : scène enregistrée ———
  await allerDomaine("visualisation");
  const panneauVue = page.locator("[data-studio-vue3d], [data-studio-visualisation-panneaux]");
  await page.locator("[data-studio-visualisation-panneaux] [data-studio-scenes]").waitFor();
  await panneauVue.locator("[data-studio-scene-nom]").fill("Vue de l'étude");
  await sansFocus();
  await page.keyboard.press("v");
  await panneauVue.locator("[data-studio-scene]").first().waitFor();
  await enregistrer();
  const r3 = await tete();
  check("TR-EX-002 (visualisation) : scène enregistrée ; la révision porte mur, ouverture, cote liée, propriété et scène",
    (r3.document.scenes ?? []).some((s) => s.type === "scene") && (r3.document.proprietes ?? []).some((p) => p.cibleId === idMur && p.nom === "Résistance au feu")
      && coteServeur(r3.document)?.links?.start?.objectId === idMur && r3.document.architecture.length === 2, court(r3.document.scenes));

  // ——— 5. Domaine 04 « Documentation, métrés et collaboration » : métré, feuille, dossier de conception ———
  await allerDomaine("documentation");
  const etatMetre = page.locator('[data-studio-etat-contenu="metre"]');
  await page.locator(`[data-studio-quantites] [data-studio-quantites-objet="${idMur}"]`).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-studio-etat-contenu="metre"]')?.getAttribute("data-etat") === "a-jour");
  check("TR-EX-016 : métré « À jour pour la révision R » (révision affichée, état dérivé cohérent)",
    (await etatMetre.textContent()) === `À jour pour la révision ${r3.id.slice(-8)}` && (await etatMetre.getAttribute("data-coherent")) === "oui", await etatMetre.textContent());
  const netMetre = await page.locator(`[data-studio-quantites-objet="${idMur}"] [data-grandeur="volume-net"]`).textContent();
  check("TR-EX-002 (métré) : volume net du mur 3,096 m³ dans le métré de Documentation", (netMetre ?? "").replace(/\s/g, "").includes("3,096"), netMetre);
  await sansFocus();
  await page.keyboard.press("Control+Shift+D");
  const boite = page.locator("[data-studio-dossier]");
  await boite.waitFor();
  const nouvelle = boite.locator("[data-studio-feuille-nouvelle]");
  await nouvelle.locator("[data-studio-feuille-titre]").fill("Plan du mur");
  await nouvelle.locator("[data-studio-feuille-creer]").click();
  const carteF = boite.locator('[data-studio-feuille][data-numero="F-01"]');
  await carteF.waitFor();
  const etatFeuille = carteF.locator('[data-studio-etat-contenu="feuille"]');
  check("TR-EX-016 : feuille composée « À jour pour la révision R » (épinglée sur la tête)", (await etatFeuille.getAttribute("data-etat")) === "a-jour" && (await etatFeuille.textContent()) === `À jour pour la révision ${r3.id.slice(-8)}`, await etatFeuille.textContent());
  const feuille = (await api("GET", `${racine}/studies/${studyId}/sheets`)).sheets[0];
  const editer = boite.locator('[data-studio-dossier-editer="nouveau"]');
  await editer.waitFor();
  await editer.locator("[data-studio-dossier-titre-saisie]").fill("Dossier de conception — petite étude");
  const ajouter = editer.locator(`[data-studio-dossier-ajouter="${feuille.id}"]`);
  if (await ajouter.count()) await ajouter.click();
  await editer.locator("[data-studio-dossier-enregistrer]").click();
  await boite.locator("[data-studio-dossier-metre]").waitFor();
  const dossier = (await api("GET", `${racine}/studies/${studyId}/dossiers`)).dossiers[0];
  check("TR-EX-002 (documentation) : dossier de conception créé — la feuille F-01 et le métré de la révision R3",
    !!dossier && JSON.stringify(dossier.sheetIds) === JSON.stringify([feuille.id]) && dossier.quantities?.revisionId === r3.id, court(dossier));
  await page.keyboard.press("Escape");

  // Publication du dossier de conception (panneau Publications de l'étude) : préparée, soumise, approuvée, diffusée.
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  const preparer = page.locator("[data-studio-publication-preparer]");
  await preparer.waitFor();
  await preparer.locator("#studio-publication-titre").fill("Dossier de conception G1");
  await preparer.locator("[data-studio-publication-dossier]").check();
  await preparer.locator("[data-studio-publication-dossier-choix]").selectOption(dossier.id);
  await preparer.getByRole("button", { name: "Préparer la publication" }).click();
  const carteP = page.locator('li[data-studio-publication][data-contenu="dossier-conception"]');
  await carteP.waitFor();
  const pubId = await carteP.getAttribute("data-studio-publication");
  const etatPub = carteP.locator('[data-studio-etat-contenu="publication"]');
  check("TR-EX-016 : publication préparée « À jour pour la révision R »", (await etatPub.getAttribute("data-etat")) === "a-jour" && (await etatPub.textContent()) === `À jour pour la révision ${r3.id.slice(-8)}`, await etatPub.textContent());
  const transition = async (action, attendu, commentaire = "") => {
    await carteP.locator(`[data-studio-publication-action="${action}"]`).click();
    const confirmerAuto = carteP.locator("[data-auto-controle-confirmer]");
    if (action === "approuver") await confirmerAuto.waitFor({ timeout: 5000 }).then(() => confirmerAuto.check(), () => {});
    if (commentaire) await carteP.locator("textarea").fill(commentaire);
    await carteP.locator(".studio-publication-confirmer button", { hasText: "Confirmer" }).click();
    await page.waitForFunction(([id, a]) => { const li = document.querySelector(`li[data-studio-publication="${id}"]`); return !!li && Object.entries(a).every(([k, v]) => li.getAttribute(`data-${k}`) === v); }, [pubId, attendu]);
  };
  await transition("soumettre", { travail: "en-revue" });
  await transition("approuver", { travail: "approuve" });
  await transition("diffuser", { diffusion: "diffuse" });
  const p1 = await api("GET", `${pubs}/${pubId}`);
  let fichiersOk = (p1.diffusion?.files ?? []).map((f) => f.format).join() === "pdf,json";
  for (const f of p1.diffusion?.files ?? []) { const r = await fichier(`${pubs}/${pubId}/files/${f.format}`); fichiersOk &&= r.status === 200 && sha(r.octets) === f.sha256; }
  const json = JSON.parse((await fichier(`${pubs}/${pubId}/files/json`)).octets.toString("utf8"));
  check("TR-EX-002 [+] : dossier de conception publié par l'interface (soumis, approuvé, diffusé) — PDF et JSON relus à leurs empreintes, révision R3",
    p1.diffusionStatus === "diffuse" && p1.contenu === "dossier-conception" && p1.revisionId === r3.id && fichiersOk && json.schema === "studio-dossier-conception/1", court({ s: p1.diffusionStatus, f: p1.diffusion?.files }));
  check("TR-EX-002 [+] : un parcours unique à travers les quatre domaines (Dessin et modélisation, BIM et coordination, Visualisation, Documentation), une même étude",
    JSON.stringify([...domaines].sort()) === JSON.stringify(["bim", "dessin", "documentation", "visualisation"]) && (await api("GET", `${racine}/studies`)).studies.length === 1, [...domaines].join());
  await page.screenshot({ path: join(OUT, "studio-g1-publication.png") });

  // ——— 6. Après la publication : même mur modifié depuis la 2D (axe) puis la 3D (épaisseur) ; la cote suit ———
  await page.goto(urlVariante);
  await outils.waitFor();
  await page.locator(`svg [data-studio-architecture="${idMur}"]`).waitFor({ state: "attached" });
  const edition2d = await choisirArchi(idMur);
  await edition2d.locator('[data-studio-champ-architecture="edition-axe"]').fill("0 0; 7 0");
  await edition2d.getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  check("TEST-003 / AC-001 : axe du mur repris à 7 m depuis la Planche 2D — la cote associative suit (7,000 m), même mur",
    (await page.locator("svg [data-studio-cote]").getAttribute("data-studio-cote-valeur")) === "7.000" && (await page.locator('svg [data-studio-architecture][data-studio-type="wall"]').count()) === 1);
  await sansFocus();
  await page.keyboard.press("Shift+D");
  await panneaux3d.locator(`[data-studio-architecture-3d-objet="${idMur}"]`).click();
  const edition3d = proprietes.locator(`[data-studio-architecture-choisi="${idMur}"]`);
  await edition3d.waitFor();
  await edition3d.getByLabel("Épaisseur (m)", { exact: true }).fill("0.25");
  await edition3d.getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(2);
  await sansFocus();
  await page.keyboard.press("Shift+D");
  await enregistrer();
  const r4 = await tete();
  const c4 = coteServeur(r4.document), mur4 = r4.document.architecture.find((x) => x.id === idMur), ouv4 = r4.document.architecture.find((x) => x.id === idOuv);
  check("TEST-003 / A.4-04 / AC-001 : 2D puis 3D sur le même objectId — axe 7 m, épaisseur 0,25 m, ouverture toujours hébergée ; la cote suit la face (y = 0,125 m), liée, 7 m",
    mur4?.thickness === 0.25 && JSON.stringify(mur4.axis) === JSON.stringify([{ x: 0, y: 0 }, { x: 7, y: 0 }]) && ouv4?.hostId === idMur && ouv4.width === 1.2
      && c4?.links?.start?.objectId === idMur && c4.links.end?.objectId === idMur && c4.toResolve === false && proche(c4.start.y, 0.125) && proche(c4.end.x - c4.start.x, 7), court([mur4, c4]));
  const p2 = await api("GET", `${pubs}/${pubId}`);
  const verif = await api("GET", `${pubs}/${pubId}/verification`);
  check("AC-001 : le dossier publié conserve la version examinée (R3, manifeste et fichiers inchangés, paquet reproductible)",
    p2.revisionId === r3.id && p2.manifestHash === p1.manifestHash && JSON.stringify(p2.diffusion.files) === JSON.stringify(p1.diffusion.files) && verif.identical === true && p2.freshness === "perimee", court({ r: p2.revisionId, f: p2.freshness, v: verif.identical }));

  // ——— 7. TR-EX-016 : contenus dérivés « à recalculer » après la nouvelle révision, puis actualisés ———
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  const etatPub2 = page.locator(`li[data-studio-publication="${pubId}"] [data-studio-etat-contenu="publication"]`);
  await etatPub2.waitFor();
  await page.waitForFunction((id) => document.querySelector(`li[data-studio-publication="${id}"] [data-studio-etat-contenu="publication"]`)?.getAttribute("data-etat") === "a-recalculer", pubId).catch(() => {});
  check("TR-EX-016 : publication de R3, variante passée à R4 — « À recalculer », image R3 (jamais « à jour »)", (await etatPub2.getAttribute("data-etat")) === "a-recalculer" && (await etatPub2.getAttribute("data-image")) === r3.id && (await etatPub2.textContent()) === "À recalculer", `${await etatPub2.getAttribute("data-etat")} ${await etatPub2.getAttribute("data-image")} r3=${r3.id} r4=${r4.id} ${court((await api("GET", pubs)).publications.map((p) => [p.revisionId, p.headRevisionId, p.freshness]))}`);
  await page.goto(`${urlVariante}?domaine=documentation`);
  await page.waitForFunction(() => document.querySelector('[data-studio-etat-contenu="metre"]')?.getAttribute("data-etat") === "a-jour");
  check("TR-EX-016 : métré recalculé, « À jour pour la révision R4 »", (await etatMetre.textContent()) === `À jour pour la révision ${r4.id.slice(-8)}`, await etatMetre.textContent());
  await sansFocus();
  await page.keyboard.press("Control+Shift+D");
  await boite.waitFor();
  await carteF.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-studio-feuille][data-numero="F-01"] [data-studio-etat-contenu="feuille"]')?.getAttribute("data-etat") === "a-recalculer").catch(() => {});
  check("TR-EX-016 : feuille épinglée sur R3, tête R4 — « À recalculer » à côté de « Révision plus récente disponible »",
    (await etatFeuille.getAttribute("data-etat")) === "a-recalculer" && (await etatFeuille.textContent()) === "À recalculer" && (await carteF.getAttribute("data-actualite")) === "perimee", await etatFeuille.textContent());
  await carteF.locator("[data-studio-feuille-actualiser]").click();
  await page.waitForFunction(() => document.querySelector('[data-studio-feuille][data-numero="F-01"] [data-studio-etat-contenu="feuille"]')?.getAttribute("data-etat") === "a-jour");
  check("TR-EX-016 : feuille actualisée sur la dernière révision — « À jour pour la révision R4 »", (await etatFeuille.textContent()) === `À jour pour la révision ${r4.id.slice(-8)}`, await etatFeuille.textContent());
  await page.keyboard.press("Escape");
  // Non applicable : métré d'une variante sans aucun objet ; publication retirée.
  const vide = await api("POST", `${racine}/studies/${studyId}/variants`, { name: "Variante vide" });
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}/variantes/${vide.variant.id}?domaine=documentation`);
  await page.waitForFunction(() => document.querySelector('[data-studio-etat-contenu="metre"]')?.getAttribute("data-etat") === "non-applicable");
  check("TR-EX-016 : métré d'une variante vide — « Non applicable : aucun objet à métrer »", (await etatMetre.textContent()) === "Non applicable : aucun objet à métrer", await etatMetre.textContent());
  await page.goto(`${BASE}/studio/projets/${projet.id}/etudes/${studyId}`);
  await etatPub2.waitFor();
  await transition("retirer", { diffusion: "retire" }, "Retrait de recette G1");
  check("TR-EX-016 : publication retirée — « Non applicable : publication retirée, son contenu n’est plus tenu à jour »",
    (await etatPub2.getAttribute("data-etat")) === "non-applicable" && (await etatPub2.textContent()) === "Non applicable : publication retirée, son contenu n’est plus tenu à jour", await etatPub2.textContent());

  // ——— 8. Copie indépendante (TR-EX-013) de la variante associée : nouvelles identités, aucune propagation ———
  await page.locator(`[data-studio-deriver="${variantId}"]`).click();
  const formD = page.locator(`[data-studio-deriver-formulaire="${variantId}"]`);
  await formD.locator("[data-studio-deriver-copie]").check();
  await formD.getByLabel("Nom de la variante dérivée").fill("Copie indépendante G1");
  await formD.getByRole("button", { name: "Créer la variante dérivée" }).click();
  await page.waitForURL(new RegExp(`/variantes/(?!${variantId})[^/?]+`));
  const copieId = /variantes\/([^/?]+)/.exec(page.url())[1];
  const copieChemin = `${racine}/studies/${studyId}/variants/${copieId}`;
  const copie = await api("GET", copieChemin);
  const murCopie = copie.revision.document.architecture.find((x) => x.type === "wall"), ouvCopie = copie.revision.document.architecture.find((x) => x.type === "opening");
  const coteCopie = coteServeur(copie.revision.document);
  check("TR-EX-013 / A.4-06 : copie indépendante — nouvelles identités du mur et de l'ouverture, hôte et cote associative reportés sur le nouveau mur, provenance « copie »",
    copie.derivedFrom?.mode === "copie" && murCopie.id !== idMur && ouvCopie.id !== idOuv && ouvCopie.hostId === murCopie.id && coteCopie.links.start.objectId === murCopie.id && coteCopie.links.end.objectId === murCopie.id
      && copie.derivedFrom.identites[murCopie.id] === idMur, court({ m: murCopie.id, o: ouvCopie, c: coteCopie.links }));
  await outils.waitFor();
  await page.locator(`svg [data-studio-architecture="${murCopie.id}"]`).waitFor({ state: "attached" });
  const editionCopie = await choisirArchi(murCopie.id);
  await editionCopie.locator('[data-studio-champ-architecture="edition-axe"]').fill("0 0; 8 0");
  await editionCopie.getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  await enregistrer();
  const copieApres = (await api("GET", copieChemin)).revision.document, sourceApres = await tete();
  check("TR-EX-013 / INV-003 : le mur de la copie repris à 8 m (sa cote suit : 8 m) ; la source reste à R4, mur à 7 m, cote à 7 m",
    proche(coteServeur(copieApres).end.x - coteServeur(copieApres).start.x, 8) && sourceApres.id === r4.id && JSON.stringify(sourceApres.document) === JSON.stringify(r4.document), court(coteServeur(copieApres)));

  // ——— 9. TEST-012 : conflit sur le même mur entre deux sessions, sans « dernier écrit gagne » ———
  const autreCtx = await browser.newContext({ viewport: { width: 1360, height: 900 }, storageState: await context.storageState() });
  const autre = await autreCtx.newPage();
  autre.setDefaultTimeout(20000);
  autre.on("pageerror", (e) => erreurs.push(`session B : ${e.message}`));
  autre.on("dialog", (d) => void d.accept());
  await autre.goto(urlVariante);
  const proprietesB = autre.getByRole("complementary", { name: "Propriétés du dessin" });
  await autre.getByRole("toolbar", { name: "Outils de dessin" }).waitFor();
  await autre.locator(`svg [data-studio-architecture="${idMur}"]`).waitFor({ state: "attached" });
  await page.goto(urlVariante);
  await outils.waitFor();
  await page.locator(`svg [data-studio-architecture="${idMur}"]`).waitFor({ state: "attached" });
  const editionA = await choisirArchi(idMur);
  await editionA.getByLabel("Hauteur (m)", { exact: true }).fill("3.3");
  await editionA.getByRole("button", { name: "Appliquer", exact: true }).click();
  await enAttente(1);
  await enregistrer();
  const r5 = await tete();
  const nbRevisionsA = (await api("GET", `${variante}/revisions`)).revisions.length;
  const choisirB = proprietesB.locator(`[data-studio-architecture-choisir="${idMur}"]`);
  if ((await choisirB.getAttribute("aria-pressed")) !== "true") await choisirB.click();
  const editionB = proprietesB.locator(`[data-studio-architecture-choisi="${idMur}"]`);
  await editionB.waitFor();
  await editionB.getByLabel("Épaisseur (m)", { exact: true }).fill("0.3");
  await editionB.getByRole("button", { name: "Appliquer", exact: true }).click();
  await autre.waitForFunction(() => document.querySelector("[data-studio-annuler-portee]")?.getAttribute("data-studio-en-attente-nombre") === "1");
  await autre.evaluate(() => document.activeElement?.blur());
  await autre.keyboard.press("Control+s");
  await autre.locator('[data-studio-hors-ligne="conflit"]').waitFor({ timeout: 30000 });
  const alerteB = (await autre.locator("[data-studio-erreur-planche]").textContent()) ?? "";
  const r5bis = await tete();
  const mur5 = r5bis.document.architecture.find((x) => x.id === idMur);
  check("TEST-012 : session B, restée sur R4, modifie l'épaisseur du même mur — conflit signalé dans l'interface, brouillon de B conservé",
    /Conflit de révision/.test(alerteB) && (await autre.locator("[data-studio-reporter]").count()) === 1, alerteB);
  check("TEST-012 : tête de A intacte (hauteur 3,3 m, épaisseur 0,25 m), aucune révision écrite pour B — pas de « dernier écrit gagne »",
    r5bis.id === r5.id && mur5.height === 3.3 && mur5.thickness === 0.25 && (await api("GET", `${variante}/revisions`)).revisions.length === nbRevisionsA, court(mur5));
  await autreCtx.close();

  // ——— 10. AC-001 [−] « perte de cote » : le mur supprimé, la cote n'est pas perdue, elle passe « à résoudre » ———
  await page.reload();
  await outils.waitFor();
  await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().waitFor({ state: "attached" });
  await sansFocus();
  await page.keyboard.press("Shift+Z");
  await page.locator(`svg [data-studio-architecture="${idMur}"] polygon`).first().click();
  await page.waitForFunction((id) => document.querySelector(`svg [data-studio-architecture="${id}"]`)?.getAttribute("aria-pressed") === "true", idMur);
  await sansFocus();
  await page.keyboard.press("Control+Delete");
  await enAttente(1);
  const coteOrpheline = page.locator("svg [data-studio-cote]");
  check("AC-001 [−] : mur supprimé avec ses ouvertures — la cote reste (aucune perte), « à résoudre », sans valeur",
    (await page.locator("svg [data-studio-architecture]").count()) === 0 && (await coteOrpheline.count()) === 1 && (await coteOrpheline.getAttribute("data-studio-cote-etat")) === "a-resoudre" && (await coteOrpheline.getAttribute("data-studio-cote-valeur")) === null);
  await page.keyboard.press("Control+z");
  await enAttente(0);
  check("AC-001 : annuler la suppression — mur, ouverture et cote liée retrouvés (7,000 m, résolue), rien n'est enregistré",
    (await page.locator(`svg [data-studio-architecture="${idMur}"]`).count()) === 1 && (await page.locator(`svg [data-studio-architecture="${idOuv}"]`).count()) === 1
      && (await coteOrpheline.getAttribute("data-studio-cote-etat")) === "resolue" && (await coteOrpheline.getAttribute("data-studio-cote-valeur")) === "7.000" && (await tete()).id === r5.id);

  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  console.log("Recette Studio G1 : réussie.");
} catch (e) {
  console.error(e);
  if (pageEchec) await pageEchec.screenshot({ path: join(OUT, "studio-g1-echec.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
