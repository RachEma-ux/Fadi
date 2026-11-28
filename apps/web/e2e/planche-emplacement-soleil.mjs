/**
 * Recette « Emplacement, altitudes et soleil » de la Planche (cas 2 du catalogue, lot 5 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-5/lot5-1` à `lot5-3`, validées le 28 novembre 2026) :
 * - Emplacement : plus de champ « Altitude » ; le ±0,00 NGF unique se clique puis se tape en place (Entrée enregistre,
 *   Échap abandonne) et devient la référence des Niveaux et le H du point de base (n° 5) ;
 * - système horizontal choisi dans la liste fermée lue par l'API (EPSG:2154, EPSG:26191), vertical « non déclaré »,
 *   rappelés dans Info modèle (n° 92) ;
 * - Info entité : altitudes basse et haute, relatives et NGF, et encombrement (n° 45) ; altitude du point visé (n° 18) ;
 * - Déplacer et Pousser-tirer : Tab fait défiler ce qu'attend Mesures ; altitude ±0,00 et altitude NGF tapées (n° 55, 70) ;
 * - Ombres : date du calendrier, heure légale avec le fuseau de l'Emplacement, heure solaire vraie et équation du temps
 *   (n° 77, 105) ;
 * - « Course solaire depuis un point » (Ctrl+Maj+Espace, Maj+T « Site », S) : diagramme et masques formés par la Planche (n° 110) ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-emplacement-soleil node apps/web/e2e/planche-emplacement-soleil.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-emplacement-soleil";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
// Fuseau du navigateur fixé : la liste des fuseaux et l'heure légale ne dépendent pas de la machine de recette.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", timezoneId: "Europe/Zurich" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 300));
});
await inscrireDansLaPage(page, `emplacement-soleil-${Date.now()}@example.com`, "planche-emplacement-soleil-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");
const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const choisir = (ids) => page.evaluate((x) => window.fadiPlanche.choisir(x), ids);
const outil = () => page.evaluate(() => window.fadiPlanche.outil());
const toile = async () => page.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q) => {
  const b = await toile();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const survoler = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  return e;
};
const cliquer = async (q) => {
  const e = await survoler(q);
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(40);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
};
const fermerPanneau = async () => {
  if (await racine.locator("section.planche-panneau .canevas-fermer").count()) await racine.locator("section.planche-panneau .canevas-fermer").first().click();
  await page.waitForTimeout(150);
};
const icone = async (id) => {
  await racine.locator(`[data-planche-panneau-icone="${id}"]`).click();
  await page.waitForTimeout(200);
};
/** Altitudes (z) extrêmes des sommets de la racine. */
const zRacine = async () => {
  const c = (await modele()).racine;
  const z = Object.values(c.sommets).map((s) => s.position.z);
  return { min: Math.round(Math.min(...z) * 1000) / 1000, max: Math.round(Math.max(...z) * 1000) / 1000 };
};
const faceA = async (z) => {
  const c = (await modele()).racine;
  return Object.values(c.faces).find((f) => f.exterieur.every((s) => Math.abs(c.sommets[s].position.z - z) < 1e-6))?.id ?? null;
};

// Boîte 4 × 3 × 3 en géométrie libre (rectangle au sol, Pousser/Tirer).
await vue.focus();
await page.keyboard.press("r");
await cliquer({ x: 0, y: 0, z: 0 });
await survoler({ x: 2, y: 1.5, z: 0 });
await saisir("4;3");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 0 });
await saisir("3");
await page.keyboard.press("Escape");
check("boîte 4 × 3 × 3 dessinée", JSON.stringify(await zRacine()) === JSON.stringify({ min: 0, max: 3 }), JSON.stringify(await zRacine()));

// 1. Extension « Emplacement » activée, position saisie, ±0,00 tapé en place.
await racine.locator("[data-planche-menu-ouvrir]").click();
await racine.locator('[data-planche-menu-item="extensions"]').click();
await page.locator('[data-planche-extension-interrupteur="emplacement"]').click();
await page.waitForTimeout(600);
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await icone("emplacement");
const lieu = racine.locator("[data-planche-lieu]");
check("Emplacement : plus de champ « Altitude »", (await lieu.locator('[data-planche-lieu-champ="altitude"]').count()) === 0 && (await lieu.locator("[data-planche-lieu-champ]").count()) === 4);
for (const [champ, valeur] of [["lieu", "Parcelle exemple"], ["latitude", "46,2"], ["longitude", "6,15"], ["nord", "0"]]) await lieu.locator(`[data-planche-lieu-champ="${champ}"]`).fill(valeur);
await lieu.locator("[data-planche-lieu-enregistrer]").click();
await page.waitForTimeout(400);
const zero = racine.locator("[data-planche-zero]");
check("±0,00 : non déclaré au départ", (await zero.getAttribute("data-planche-zero")) === "non-declare");
await zero.locator("[data-planche-zero-valeur]").click();
await zero.locator("[data-planche-zero-saisie]").fill("abc");
await zero.locator("[data-planche-zero-saisie]").press("Enter");
check("±0,00 : une saisie illisible est refusée, la saisie reste ouverte", (await zero.locator("[data-planche-zero-erreur]").count()) === 1 && (await zero.locator("[data-planche-zero-saisie]").count()) === 1);
await zero.locator("[data-planche-zero-saisie]").press("Escape");
check("±0,00 : Échap abandonne", (await zero.locator("[data-planche-zero-saisie]").count()) === 0 && (await zero.getAttribute("data-planche-zero")) === "non-declare");
await zero.locator("[data-planche-zero-valeur]").click();
await zero.locator("[data-planche-zero-saisie]").fill("432,50");
await zero.locator("[data-planche-zero-saisie]").press("Enter");
await page.waitForTimeout(300);
check("±0,00 : 432,50 m enregistré en place", (await zero.getAttribute("data-planche-zero")) === "432.5" && (await zero.locator("[data-planche-zero-valeur]").innerText()).includes("432,50"));
check("±0,00 : le H du point de base le reprend", (await racine.locator("[data-planche-point-de-base-h]").getAttribute("data-planche-point-de-base-h")) === "432.5");

// 2. Système horizontal : liste fermée lue par l'API ; il s'enregistre avec le point de base.
const systemes = racine.locator("[data-planche-systemes]");
await page.waitForFunction(() => document.querySelector("[data-planche-systemes]")?.getAttribute("data-planche-systemes") !== "non-lu", null, { timeout: 10000 }).catch(() => undefined);
check("systèmes : deux systèmes horizontaux connus, lus par l'API", (await systemes.getAttribute("data-planche-systemes")) === "2");
check("systèmes : sans point de base, la liste est grisée", await systemes.locator("[data-planche-systeme-horizontal]").isDisabled());
for (const [champ, valeur] of [["e", "2500000"], ["n", "1117000"], ["systeme", "EPSG:26191"], ["rotation", "0"]]) await racine.locator(`[data-planche-point-de-base-champ="${champ}"]`).fill(valeur);
await racine.locator("[data-planche-point-de-base-enregistrer]").click();
await page.waitForTimeout(300);
const options = await systemes.locator("[data-planche-systeme-horizontal] option").allTextContents();
check("systèmes : Lambert-93 et Merchich, avec leur code EPSG", options.some((o) => o.includes("EPSG:2154")) && options.some((o) => o.includes("EPSG:26191")), options.join(" | "));
await systemes.locator("[data-planche-systeme-horizontal]").selectOption("EPSG:2154");
await page.waitForTimeout(300);
check("systèmes : le choix est écrit dans le point de base", (await modele()).annotations?.reglages?.pointDeBase?.systeme === "EPSG:2154");
check("systèmes : vertical « non déclaré » (aucun système vertical connu)", await systemes.locator("[data-planche-systeme-vertical]").isDisabled() && (await systemes.locator("[data-planche-systeme-vertical]").inputValue()) === "");
await lieu.screenshot({ path: `${OUT}/1-emplacement-zero-systemes.png` });
await icone("info-modele");
const rappel = racine.locator("[data-planche-rappel-systeme]");
check("Info modèle : rappel du système et du ±0,00", (await rappel.getAttribute("data-planche-rappel-systeme")) === "EPSG:2154" && (await rappel.innerText()).includes("432,50"));
await rappel.screenshot({ path: `${OUT}/2-info-modele-rappel.png` });
await fermerPanneau();

// 3. Info entité : altitudes basse et haute, relatives et NGF, et encombrement.
const dessus = await faceA(3);
await choisir([dessus]);
await icone("info-entite");
const ie = racine.locator("[data-planche-panneau='info-entite']");
check("Info entité : altitude de la face du dessus +3,00 · 435,50 NGF", (await ie.locator("[data-planche-altitude-basse]").innerText()).includes("+3,00") && (await ie.locator("[data-planche-altitude-haute]").innerText()).includes("435,50 NGF"), await ie.locator("[data-planche-altitude-haute]").innerText().catch(() => ""));
check("Info entité : encombrement 4,00 × 3,00 × 0,00 m", (await ie.locator("[data-planche-encombrement]").innerText()).includes("4,00 × 3,00 × 0,00"), await ie.locator("[data-planche-encombrement]").innerText().catch(() => ""));
await ie.screenshot({ path: `${OUT}/3-info-entite-altitudes.png` });
await fermerPanneau();

// 4. Pousser-tirer : Tab fait défiler Mesures ; la face du dessus portée à l'altitude ±0,00 tapée.
// Altitude du point visé : coin supérieur de la boîte survolé avec l'outil Ligne.
await vue.focus();
await page.keyboard.press("l");
await survoler({ x: 4, y: 3, z: 3 });
await page.waitForTimeout(150);
check("altitude du point visé affichée dans la vue (+3,00 · 435,50 NGF)", (await racine.locator("[data-planche-vise]").count()) === 1 && (await racine.locator("[data-planche-vise]").innerText()).includes("+3,00 · 435,50 NGF"), await racine.locator("[data-planche-vise]").innerText().catch(() => ""));
await vue.screenshot({ path: `${OUT}/4a-point-vise.png` });
await page.keyboard.press("Escape");
await page.keyboard.press("p");
await cliquer({ x: 2, y: 1.5, z: 3 });
const libelleMesures = () => racine.locator("label[for='planche-mesures']").innerText();
await page.keyboard.press("Tab");
check("Pousser-tirer : Tab → « Altitude ±0,00 »", (await libelleMesures()) === "Altitude ±0,00", await libelleMesures());
await page.keyboard.press("Tab");
check("Pousser-tirer : Tab → « Altitude NGF »", (await libelleMesures()) === "Altitude NGF", await libelleMesures());
await vue.screenshot({ path: `${OUT}/4-pousser-tirer-altitude-ngf.png` });
await saisir("436,10");
check("Pousser-tirer : face du dessus portée à 436,10 NGF (z = 3,60)", (await zRacine()).max === 3.6, JSON.stringify(await zRacine()));
await page.keyboard.press("Escape");

// 5. Déplacer : la boîte entière posée à l'altitude ±0,00 tapée (son point bas).
const c = (await modele()).racine;
await choisir([...Object.keys(c.faces), ...Object.keys(c.aretes)]);
await vue.focus();
await page.keyboard.press("m");
await page.keyboard.press("Tab");
check("Déplacer : Tab → « Altitude ±0,00 »", (await libelleMesures()) === "Altitude ±0,00", await libelleMesures());
await saisir("-1,20");
check("Déplacer : point bas de la boîte posé à −1,20", JSON.stringify(await zRacine()) === JSON.stringify({ min: -1.2, max: 2.4 }), JSON.stringify(await zRacine()));
await page.keyboard.press("Escape");
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
check("Déplacer : Annuler rend la position", (await zRacine()).min === 0);
await vue.focus();
await page.keyboard.press(" ");
await choisir([]);

// 6. Ombres : date du calendrier, heure légale avec le fuseau de l'Emplacement.
await icone("ombres");
const ombres = racine.locator("[data-planche-ombres]");
check("Ombres : sans fuseau, heure solaire (comme avant)", (await ombres.getAttribute("data-planche-ombres-heure")) === "solaire");
await ombres.locator('[data-planche-option="date"]').fill("2026-06-21");
await ombres.locator("[data-planche-ombres-fuseau]").selectOption("Europe/Zurich");
await page.waitForTimeout(300);
check("Ombres : fuseau Europe/Zurich enregistré avec l'Emplacement", (await modele()).annotations?.reglages?.emplacement?.fuseau === "Europe/Zurich");
check("Ombres : heure légale avec le fuseau et la longitude", (await ombres.getAttribute("data-planche-ombres-heure")) === "legale");
await ombres.locator('[data-planche-option="heure"]').fill("13.5");
await ombres.locator('[data-planche-option="heure"]').dispatchEvent("input");
await page.waitForTimeout(200);
// 21 juin, 13 h 30 légale (UTC+2) à 6,15° E : heure solaire vraie ≈ 11 h 53 (équation du temps ≈ −1 min 50 s).
const hs = Number(await ombres.locator("[data-planche-ombres-solaire]").getAttribute("data-planche-ombres-solaire"));
check("Ombres : heure solaire vraie ≈ 11 h 53 le 21 juin à 13 h 30 légale", Math.abs(hs - (11 + 53 / 60)) < 2 / 60, String(hs));
const opts = await page.evaluate(() => window.fadiPlanche.options());
check("Ombres : la vue reçoit date, longitude et décalage (+120 min)", opts.annee === 2026 && opts.jour === 172 && opts.longitude === 6.15 && opts.decalage === 120, JSON.stringify({ a: opts.annee, j: opts.jour, l: opts.longitude, d: opts.decalage }));
await ombres.screenshot({ path: `${OUT}/5-ombres-heure-legale.png` });

// 7. Course solaire depuis un point : commande en deux temps, clic, diagramme et masques.
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
await page.waitForTimeout(80);
await page.keyboard.press("Shift+T");
await page.waitForTimeout(80);
await page.keyboard.press("s");
await page.waitForTimeout(250);
check("Course solaire : Ctrl+Maj+Espace, Maj+T (famille Site) puis S choisit l'outil", (await outil()) === "pointage-course-solaire", await outil());
check("Course solaire : son bouton est dans le panneau Ombres", (await racine.locator('[data-planche-ombres-course] [data-planche-commande="course-solaire"]').count()) === 1);
// Point d'observation sur la façade est de la boîte (une fenêtre) : le mur cache tout l'ouest, donc le soleil d'après-midi.
// Le panneau Ombres couvrirait le point visé : il est refermé (l'outil reste actif).
await fermerPanneau();
await cliquer({ x: 4, y: 1.5, z: 1.5 });
await page.waitForTimeout(400);
const diagramme = racine.locator("[data-planche-course-solaire]");
check("Course solaire : diagramme affiché", (await diagramme.count()) === 1);
const texte = (await diagramme.innerText().catch(() => "")) ?? "";
check("Course solaire : 21 juin, 21 mars, 21 décembre", ["21 juin", "21 mars", "21 décembre"].every((d) => texte.includes(d)), texte.slice(0, 200));
check("Course solaire : point d'observation sur la façade est (x 4,00)", (await diagramme.locator("[data-planche-course-point]").innerText()).includes("x 4,00"), await diagramme.locator("[data-planche-course-point]").innerText().catch(() => ""));
check("Course solaire : la façade masque le soleil d'après-midi, les trois jours", (await diagramme.locator("[data-planche-course-masquees='0']").count()) === 0 && /21 décembre : masqué de 1[23] h/.test(texte), texte.slice(0, 400));
check("Course solaire : l'outil rend la main à Sélection", (await outil()) === "selection", await outil());
await page.screenshot({ path: `${OUT}/6-course-solaire.png` });
await diagramme.locator("[data-planche-course-fermer]").click();
check("Course solaire : se ferme", (await diagramme.count()) === 0);

check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette Emplacement, altitudes et soleil : tout est vert.");
process.exit(echecs ? 1 : 0);
