/**
 * Recette « Plan vectoriel » de la Planche (cas 4 du catalogue des extensions, étape 5 : D7-F11-006, D7-S-001,
 * D7-F11-001 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-5-plan-vectoriel.png`) :
 * - Ctrl+F7 ouvre le panneau ; aperçu dessiné ; état « 1:50 » dans le pied ;
 * - une boîte coupée par un plan : vue de dessus pochée en aplat gris, trait coupé à 0,5 mm, export SVG à l'échelle ;
 * - matière peinte sur une face, Nouveau motif (Ctrl+F10) associé : le SVG hachure la coupe ;
 * - import .pat (fichier refusé avec son numéro de ligne, puis fichier valide) ; Supprimer (Ctrl+F12) ; Annuler ;
 * - chaque commande a son icône et son raccourci ; aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-plan-vectoriel node apps/web/e2e/planche-plan-vectoriel.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-plan-vectoriel";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `plan-${Date.now()}@example.com`, "planche-plan-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const ecran = async (p) => {
  const b = await page.locator("[data-planche-vue] canvas").first().boundingBox();
  const e = await page.evaluate((q) => window.fadiPlanche.versEcran(q), p);
  return { x: b.x + e.x, y: b.y + e.y };
};
const cliquer = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(60);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
const vue = page.locator("[data-planche-vue]");
const panneau = page.locator("[data-planche-plan]");
const commande = (id) => panneau.locator(`[data-planche-commande='${id}']`);
const svgApercu = async () => {
  const src = await panneau.locator("[data-planche-plan-apercu] img").getAttribute("src");
  return decodeURIComponent((src ?? "").replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
};
const attendreApercu = (contient) => page.waitForFunction((c) => {
  const img = document.querySelector("[data-planche-plan-apercu] img");
  return !!img && decodeURIComponent(img.getAttribute("src") ?? "").includes(c);
}, contient);

// Sol de 4 × 3 m, boîte de 2 m.
await vue.focus();
await page.keyboard.press("r");
const boite = await page.locator("[data-planche-vue] canvas").boundingBox();
await page.mouse.move(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55, { steps: 4 });
await page.mouse.click(boite.x + boite.width * 0.35, boite.y + boite.height * 0.55);
await page.mouse.move(boite.x + boite.width * 0.35 + 60, boite.y + boite.height * 0.55 + 30, { steps: 4 });
await saisir("4;3");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 1);
const sommets = Object.values((await modele()).racine.sommets).map((v) => v.position);
const xMin = Math.min(...sommets.map((p) => p.x));
const xMax = Math.max(...sommets.map((p) => p.x));
const yMin = Math.min(...sommets.map((p) => p.y));
const yMax = Math.max(...sommets.map((p) => p.y));
const centre = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };
await page.keyboard.press("p");
await cliquer({ ...centre, z: 0 });
await saisir("2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.faces).length === 6);
// Plan de coupe posé sur le dessus (z = 2), puis le dessus monté à 3 m : le plan coupe la boîte à mi-hauteur.
await page.keyboard.press("Shift+K");
await cliquer({ ...centre, z: 2 });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.plansDeCoupe ?? {}).length === 1);
await page.keyboard.press("Escape");
await page.keyboard.press("p");
await cliquer({ ...centre, z: 2 });
await saisir("1");
await page.keyboard.press("Space");
const zMax = Math.max(...Object.values((await modele()).racine.sommets).map((v) => v.position.z));
check("boîte 4 × 3 × 3 m coupée par un plan à 2 m", Math.abs(zMax - 3) < 1e-9 && Object.values((await modele()).annotations.plansDeCoupe)[0].actif === true, String(zMax));

// --- Ouverture par le raccourci -----------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+F7");
await panneau.waitFor();
check("Ctrl+F7 ouvre le panneau « Plan vectoriel »", (await page.evaluate(() => window.fadiPlanche.panneau())) === "plan-vectoriel");
await panneau.locator("[data-planche-plan-option='source']").selectOption("dessus");
await attendreApercu('width="100mm"');
let svg = await svgApercu();
// 4 m à 1:50 = 80 mm + 2 × 10 mm de marge ; 3 m = 60 mm + 20.
check("vue de dessus à 1:50 : 100 × 80 mm papier, poché en aplat gris, trait coupé 0,5 mm", svg.includes('width="100mm" height="80mm"') && svg.includes("rgb(217,217,217)") && /<g id="coupe"[^>]*stroke-width="0.5"/.test(svg), svg.slice(0, 160));
check("pied : « Plan vectoriel : 1:50 · … »", ((await page.locator("[data-planche-plan-etat]").textContent()) ?? "").includes("Plan vectoriel : 1:50"), (await page.locator("[data-planche-plan-etat]").textContent()) ?? "");
await panneau.locator("[data-planche-plan-option='echelle']").selectOption("100");
await attendreApercu('width="60mm"');
check("échelle 1:100 : le dessin est deux fois plus petit (60 mm)", (await svgApercu()).includes('width="60mm" height="50mm"'));
await panneau.locator("[data-planche-plan-option='echelle']").selectOption("50");

// --- Export SVG ---------------------------------------------------------------------------------------------------------
const [telechargement] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+F8")]);
const chemin = await telechargement.path();
const exporte = readFileSync(chemin, "utf8");
check("Ctrl+F8 exporte le SVG (nom à l'échelle, contenu identique à l'aperçu)", telechargement.suggestedFilename().endsWith("-1-50.svg") && exporte.startsWith("<svg") && exporte.includes('width="100mm"'), telechargement.suggestedFilename());

// --- Matière et motif ---------------------------------------------------------------------------------------------------
await page.locator("[data-planche-panneau='plan-vectoriel'] .canevas-fermer").evaluate((b) => b.click());
await page.locator("[data-planche-panneau-icone='materiaux']").click();
await page.locator("[data-planche-materiau-nom]").fill("Béton");
await page.locator("[data-planche-materiau-creer]").click();
const matiere = Object.keys((await modele()).annotations.materiaux)[0];
await page.locator(`[data-planche-materiau='${matiere}']`).click();
await page.locator("[data-planche-panneau='materiaux'] .canevas-fermer").evaluate((b) => b.click());
await cliquer({ x: xMax, y: centre.y, z: 1 });
const peinte = Object.values((await modele()).racine.faces).some((f) => f.materiauRecto === matiere || f.materiauVerso === matiere);
check("matière « Béton » peinte sur une paroi", peinte);
await vue.focus();
await page.keyboard.press("Escape");
await page.keyboard.press("Control+F9");
await panneau.waitFor();
check("Ctrl+F9 : panneau ouvert sur « Motifs de hachure »", (await page.evaluate(() => document.activeElement?.hasAttribute("data-planche-plan-motifs"))) === true);
check("sans motif : le panneau le dit ; Supprimer grisé avec son motif", (await panneau.locator("[data-planche-motifs-vide]").count()) === 1 && (await commande("supprimer-motif").isDisabled()) && ((await commande("supprimer-motif").getAttribute("title")) ?? "").includes("Choisissez d'abord un motif"));
const pas0 = await pas();
await vue.focus();
await page.keyboard.press("Control+F10");
await page.waitForFunction((n) => window.fadiPlanche.pas() === n + 1, pas0);
const motif = Object.keys((await modele()).annotations.motifs)[0];
check("Ctrl+F10 crée un motif en un pas", !!motif && (await panneau.locator(`[data-planche-motif='${motif}']`).count()) === 1);
await panneau.locator("[data-planche-motif-champ='pas']").fill("3");
await panneau.locator("[data-planche-motif-champ='pas']").press("Enter");
await page.waitForFunction((id) => window.fadiPlanche.modele().annotations.motifs[id].familles[0].dy === 3, motif);
await panneau.locator(`[data-planche-motif-matiere='${matiere}']`).check();
await page.waitForFunction(([m, id]) => window.fadiPlanche.modele().annotations.materiaux[m].motif === id, [matiere, motif]);
await attendreApercu(`<pattern id="${motif}-0"`);
svg = await svgApercu();
check("motif associé : la coupe est hachurée (pas 3 mm), plus d'aplat gris", svg.includes(`<pattern id="${motif}-0"`) && svg.includes('height="3"') && !svg.includes("rgb(217,217,217)"));
await panneau.screenshot({ path: `${OUT}/1-plan-vectoriel.png` });
await page.screenshot({ path: `${OUT}/2-planche.png` });

// --- Import .pat --------------------------------------------------------------------------------------------------------
const fichier = panneau.page().locator("[data-planche-motif-fichier]");
await fichier.setInputFiles({ name: "faux.pat", mimeType: "text/plain", buffer: Buffer.from("*A\n45, 0, x, 0, 3\n") });
await page.waitForSelector("[data-planche-plan-erreur]");
check(".pat illisible : refusé avec son numéro de ligne, rien d'importé", ((await panneau.locator("[data-planche-plan-erreur]").textContent()) ?? "").includes("ligne 2") && Object.keys((await modele()).annotations.motifs).length === 1);
await fichier.setInputFiles({ name: "bureau.pat", mimeType: "text/plain", buffer: Buffer.from("*TERRE, terre\n0,0,0,0,2\n*ISOLANT\n45,0,0,0,2.5,1,-0.5\n") });
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations.motifs).length === 3);
const importes = Object.values((await modele()).annotations.motifs).filter((x) => x.source.genre === "pat");
check(".pat valide : deux motifs importés, source « bureau.pat »", importes.length === 2 && importes.every((x) => x.source.fichier === "bureau.pat"), importes.map((x) => x.nom).join(", "));

// --- Supprimer, Annuler ---------------------------------------------------------------------------------------------------
await panneau.locator(`[data-planche-motif='${motif}']`).click();
await vue.focus();
await page.keyboard.press("Control+F12");
await page.waitForFunction((id) => !window.fadiPlanche.modele().annotations.motifs?.[id], motif);
check("Ctrl+F12 supprime le motif ; la matière revient à l'aplat", (await modele()).annotations.materiaux[matiere].motif === undefined);
await attendreApercu("rgb(217,217,217)");
await page.locator("[data-planche-annuler]").click();
await page.waitForFunction((id) => !!window.fadiPlanche.modele().annotations.motifs?.[id], motif);
check("Annuler rend le motif et son association", (await modele()).annotations.materiaux[matiere].motif === motif);

// --- Règle d'or ---------------------------------------------------------------------------------------------------------
const attendus = { "exporter-plan-svg": "Ctrl+F8", "rafraichir-plan": "Ctrl+F1", "nouveau-motif": "Ctrl+F10", "importer-motif": "Ctrl+F11", "supprimer-motif": "Ctrl+F12" };
let regle = true;
for (const [id, r] of Object.entries(attendus)) regle &&= ((await commande(id).getAttribute("title")) ?? "").includes(r) && (await commande(id).locator("svg").count()) === 1;
check("chaque commande du panneau : icône et raccourci", regle);
const pasAvant = await pas();
await vue.focus();
await page.keyboard.press("Control+F1");
await page.waitForTimeout(300);
check("Ctrl+F1 rafraîchit sans toucher au modèle", (await pas()) === pasAvant && (await panneau.locator("[data-planche-plan-apercu]").getAttribute("data-planche-plan-apercu")) === "dessin");

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette du plan vectoriel : tous les contrôles passent.");
