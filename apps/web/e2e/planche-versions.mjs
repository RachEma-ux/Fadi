/**
 * Recette « Versions, jalons, brouillon et fiche du projet » de la Planche (cas 2 du catalogue, lot 7 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-7/lot7-1` à `lot7-4`, acceptées le 27 novembre 2026) :
 * - Ctrl+Maj+Espace affiche l'encadré des secondes touches ; Maj+F ouvre « Fiche du projet » : un champ saisi est écrit
 *   dans la Planche, les autres restent « non renseigné » ;
 * - Ctrl+Maj+Espace, V : « Versions et jalons » ; statut et indice saisis ; jalon « Dépôt permis » posé, figé avec son
 *   empreinte (statut et indice recopiés) ;
 * - Ctrl+Maj+Espace, Q : « Comparer » jalon → état courant : 1 ajouté, 1 supprimé, surlignés dans la vue 3D ;
 * - Ctrl+Maj+Espace, G, « Versions et jalons » ouvert : consultation du jalon choisi bandeau « Consultation seule », modèle du jalon affiché, aucun outil de modification, Ctrl+Z
 *   refusé ; Ctrl+Maj+Espace, G rend l'état courant ;
 * - Ctrl+Maj+Espace, Maj+V : brouillon d'essai (bandeau, changements comptés) ; Abandonner rend l'original intact ;
 *   Appliquer l'écrit en un pas d'historique annulable ; Garder en fait une variante ; Dériver une variante du jalon,
 *   origine affichée et ouvrable ;
 * - registre : l'export du fichier natif est noté, destinataire déclaré ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-versions node apps/web/e2e/planche-versions.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-versions";
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
await inscrireDansLaPage(page, `versions-${Date.now()}@example.com`, "planche-versions-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");
const panneau = (id) => racine.locator(`[data-planche-panneau='${id}']`);
const message = async () => (await page.locator("[data-planche-message], .planche-message").first().textContent().catch(() => "")) ?? "";
const occurrences = async () => Object.keys((await modele()).racine.occurrences).length;
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
/** Rectangle de 4 × 3 m à une position de la vue (fractions de la toile), puis tout est groupé (Ctrl+A, Ctrl+G). */
const rectangleGroupe = async (fx, fy) => {
  const faces = Object.keys((await modele()).racine.faces).length;
  await vue.focus();
  await page.keyboard.press("r");
  const b = await page.locator("[data-planche-vue] canvas").boundingBox();
  await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 4 });
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  await page.mouse.move(b.x + b.width * fx + 60, b.y + b.height * fy + 30, { steps: 4 });
  await saisir("4;3");
  await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.faces).length > n, faces);
  await page.keyboard.press("Space");
  await page.keyboard.press("Control+a");
  await page.waitForTimeout(120);
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
};
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.waitForTimeout(80);
  await page.keyboard.press(touche);
  await page.waitForTimeout(200);
};
const champ = async (loc, valeur) => {
  await loc.fill(valeur);
  await loc.press("Enter");
  await page.waitForTimeout(200);
};

// --- Raccourcis en deux temps et fiche du projet (maquette lot7-4) ---------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
await racine.locator("[data-planche-deux-temps]").waitFor({ timeout: 5000 });
const secondes = await racine.locator("[data-planche-deux-temps-commande]").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-deux-temps-commande")));
check("Ctrl+Maj+Espace : encadré des secondes touches (six commandes du lot 7)", ["versions", "poser-jalon", "consultation", "comparer", "brouillon", "fiche-projet"].every((id) => secondes.includes(id)), JSON.stringify(secondes));
await page.keyboard.press("Shift+F");
await panneau("fiche-projet").waitFor({ timeout: 5000 });
check("Ctrl+Maj+Espace, Maj+F : « Fiche du projet » s'ouvre", true);
await champ(racine.locator("[data-planche-fiche-champ='projet']"), "Immeuble A (essai)");
let m = await modele();
check("fiche : le champ saisi est écrit dans la Planche, rien n'est complété", m.annotations?.reglages?.ficheProjet?.projet === "Immeuble A (essai)" && Object.keys(m.annotations.reglages.ficheProjet).length === 1, JSON.stringify(m.annotations?.reglages?.ficheProjet));
check("fiche : un champ vide reste « non renseigné »", (await racine.locator("[data-planche-fiche-champ='adresse']").getAttribute("placeholder")) === "non renseigné");

// --- Jalon (maquette lot7-1) -------------------------------------------------------------------------------------------
await rectangleGroupe(0.35, 0.55);
check("un premier objet groupé", (await occurrences()) === 1, String(await occurrences()));
await deuxTemps("v");
await panneau("versions-jalons").waitFor({ timeout: 5000 });
check("Ctrl+Maj+Espace, V : « Versions et jalons » s'ouvre", true);
await champ(racine.locator("[data-planche-versions-statut]"), "Permis");
await champ(racine.locator("[data-planche-versions-indice]"), "B");
m = await modele();
check("statut et indice saisis, écrits dans la Planche", m.annotations?.reglages?.revision?.statut === "Permis" && m.annotations?.reglages?.revision?.indice === "B", JSON.stringify(m.annotations?.reglages?.revision));
await racine.locator("[data-planche-versions-nom]").fill("Dépôt permis");
await racine.locator("[data-planche-versions-poser]").click();
await racine.locator("[data-planche-versions-jalon]").first().waitFor({ timeout: 5000 });
const ligneJalon = (await racine.locator("[data-planche-versions-jalon]").first().textContent()) ?? "";
check("jalon « Dépôt permis » posé, figé : statut, indice et empreinte affichés", ligneJalon.includes("Dépôt permis") && ligneJalon.includes("Permis") && ligneJalon.includes("B") && /empreinte [0-9a-f]{4}…[0-9a-f]{4}/.test(ligneJalon), ligneJalon);
check("message : jalon posé, indice B, empreinte", /Jalon « Dépôt permis » posé : figé, indice B, empreinte/.test(await message()), await message());
await page.screenshot({ path: `${OUT}/lot7-1-jalons.png` });

// --- Comparer (maquette lot7-2) ----------------------------------------------------------------------------------------
await rectangleGroupe(0.15, 0.3);
check("état courant : le premier objet est rangé dans un nouveau groupe", (await occurrences()) === 1);
await deuxTemps("q");
await panneau("comparer").waitFor({ timeout: 5000 });
await page.waitForFunction(() => document.querySelector("[data-planche-comparer-compte='ajoutes']") !== null, null, { timeout: 5000 });
const compte = async (k) => (await racine.locator(`[data-planche-comparer-compte='${k}']`).textContent()) ?? "";
check("Ctrl+Maj+Espace, Q : jalon → état courant, 1 ajouté, 1 supprimé, 0 modifié", (await compte("ajoutes")) === "1" && (await compte("supprimes")) === "1" && (await compte("modifies")) === "0", `${await compte("ajoutes")} / ${await compte("supprimes")} / ${await compte("modifies")}`);
await page.waitForTimeout(200);
let diff = await page.evaluate(() => window.fadiPlanche.differences());
check("différences surlignées dans la vue 3D (ajoutés et supprimés)", diff && diff.ajoutes > 0 && diff.supprimes > 0, JSON.stringify(diff));
await page.screenshot({ path: `${OUT}/lot7-2-comparer.png` });
await racine.locator("[data-planche-comparer-surligner]").uncheck();
await page.waitForTimeout(200);
diff = await page.evaluate(() => window.fadiPlanche.differences());
check("surlignage retiré quand la case est décochée", diff && diff.ajoutes + diff.supprimes + diff.modifies === 0, JSON.stringify(diff));

// --- Consultation seule d'un jalon (maquette lot7-4) -------------------------------------------------------------------
const courant = JSON.stringify((await modele()).racine.occurrences);
const modeleCourant = JSON.stringify(await modele());
check("état courant : deux groupes (l'un dans l'autre)", Object.keys((await modele()).definitions).length === 2);
await deuxTemps("v");
await panneau("versions-jalons").waitFor();
await deuxTemps("g");
await racine.locator("[data-planche-consultation]").waitFor({ timeout: 5000 });
await page.waitForTimeout(500);
const bandeau = (await racine.locator("[data-planche-consultation]").textContent()) ?? "";
check("bandeau « Consultation seule · « Dépôt permis » (B) · mesure permise »", bandeau.includes("Consultation seule") && bandeau.includes("« Dépôt permis » (B)") && bandeau.includes("mesure permise"), bandeau);
m = await modele();
check("le modèle du jalon est affiché (aucun pas d'historique)", JSON.stringify(m) !== modeleCourant && (await page.evaluate(() => window.fadiPlanche.pas())) === 0 && (await page.evaluate(() => window.fadiPlanche.consultation())) !== "courante");
await vue.focus();
const facesAvant = Object.keys(m.racine.faces).length;
await page.keyboard.press("r");
const b = await page.locator("[data-planche-vue] canvas").boundingBox();
await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.8);
await page.mouse.move(b.x + b.width * 0.5 + 60, b.y + b.height * 0.8 + 30, { steps: 4 });
await saisir("2;2");
check("consultation : aucun tracé possible", Object.keys((await modele()).racine.faces).length === facesAvant);
await page.keyboard.press("Escape");
await page.keyboard.press("Control+z");
await page.waitForTimeout(150);
check("consultation : Ctrl+Z refusé", (await message()).includes("Consultation seule"), await message());
await page.screenshot({ path: `${OUT}/lot7-4-consultation.png` });
await deuxTemps("g");
check("Ctrl+Maj+Espace, G : consultation terminée, état courant rendu", (await racine.locator("[data-planche-consultation]").count()) === 0 && JSON.stringify(await modele()) === modeleCourant);

// --- Registre des émissions (n° 62) ------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Alt+F1");
await panneau("natif-image").waitFor({ timeout: 5000 });
const dl = page.waitForEvent("download");
await racine.locator("[data-planche-natif-exporter]").click();
await dl;
await deuxTemps("v");
await panneau("versions-jalons").waitFor();
await racine.locator("[data-planche-versions-emission]").first().waitFor({ timeout: 5000 });
const emission = (await racine.locator("[data-planche-versions-emission]").first().textContent()) ?? "";
check("registre : l'export du fichier natif est noté (état courant, indice B, émission)", emission.includes("état courant") && emission.includes("(B)") && emission.includes(".planche") && emission.includes("émission"), emission);
const dest = racine.locator("[data-planche-versions-destinataire]").first();
check("destinataire « non renseigné » tant qu'il n'est pas déclaré", (await dest.inputValue()) === "" && (await dest.getAttribute("placeholder")) === "non renseigné");
await dest.fill("Bureau d'ingénieurs (essai)");
await dest.blur();
await page.waitForTimeout(200);
check("destinataire déclaré", (await dest.inputValue()) === "Bureau d'ingénieurs (essai)");

// --- Brouillon (maquette lot7-3) ---------------------------------------------------------------------------------------
await deuxTemps("Shift+V");
await panneau("brouillon").waitFor({ timeout: 5000 });
await racine.locator("[data-planche-brouillon-essayer]").click();
await racine.locator("[data-planche-brouillon-bandeau]").waitFor({ timeout: 10000 });
check("brouillon ouvert : bandeau « l'original n'est pas modifié »", ((await racine.locator("[data-planche-brouillon-bandeau]").textContent()) ?? "").includes("l'original n'est pas modifié"));
await page.waitForTimeout(500);
await rectangleGroupe(0.25, 0.8);
await deuxTemps("Shift+V");
if ((await panneau("brouillon").count()) === 0) await deuxTemps("Shift+V");
await panneau("brouillon").waitFor();
await page.waitForTimeout(300);
check("changements du brouillon comptés", ((await racine.locator("[data-planche-brouillon-changements]").textContent()) ?? "").startsWith("1 ajoutés, 0 modifiés, 1 supprimés"), (await racine.locator("[data-planche-brouillon-changements]").textContent()) ?? "");
await page.screenshot({ path: `${OUT}/lot7-3-brouillon.png` });
await racine.locator("[data-planche-brouillon-abandonner]").click();
await page.waitForFunction(() => !document.querySelector("[data-planche-brouillon-bandeau]"), null, { timeout: 10000 });
await page.waitForTimeout(500);
check("Abandonner : l'original est tel qu'il était", JSON.stringify((await modele()).racine.occurrences) === courant);

// Appliquer : un seul pas d'historique, annulable.
if ((await panneau("brouillon").count()) === 0) await deuxTemps("Shift+V");
await racine.locator("[data-planche-brouillon-essayer]").click();
await racine.locator("[data-planche-brouillon-bandeau]").waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
await rectangleGroupe(0.25, 0.8);
const essai = JSON.stringify((await modele()).racine.occurrences);
if ((await panneau("brouillon").count()) === 0) await deuxTemps("Shift+V");
await racine.locator("[data-planche-brouillon-appliquer]").click();
await page.waitForFunction(() => !document.querySelector("[data-planche-brouillon-bandeau]"), null, { timeout: 10000 });
await page.waitForFunction((e) => JSON.stringify(window.fadiPlanche.modele().racine.occurrences) === e, essai, { timeout: 10000 }).catch(() => undefined);
check("Appliquer : l'original reçoit le brouillon", JSON.stringify((await modele()).racine.occurrences) === essai);
check("Appliquer : un seul pas d'historique", (await page.evaluate(() => window.fadiPlanche.pas())) === 1, String(await page.evaluate(() => window.fadiPlanche.pas())));
await vue.focus();
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
check("Ctrl+Z annule l'application du brouillon", JSON.stringify((await modele()).racine.occurrences) === courant);
await page.keyboard.press("Control+y");
await page.waitForTimeout(200);

// Garder comme variante.
if ((await panneau("brouillon").count()) === 0) await deuxTemps("Shift+V");
await racine.locator("[data-planche-brouillon-essayer]").click();
await racine.locator("[data-planche-brouillon-bandeau]").waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
if ((await panneau("brouillon").count()) === 0) await deuxTemps("Shift+V");
await racine.locator("[data-planche-brouillon-garder]").click();
await page.waitForFunction(() => !document.querySelector("[data-planche-brouillon-bandeau]"), null, { timeout: 10000 });
check("Garder : le brouillon devient une variante", /gardé comme variante/.test(await message()), await message());
await deuxTemps("v");
await panneau("versions-jalons").waitFor();
check("variante : son origine est affichée", ((await racine.locator("[data-planche-versions-origine]").textContent()) ?? "").includes("Variante de"));
await racine.locator("[data-planche-versions-ouvrir-origine]").click();
await page.waitForTimeout(1000);
check("Ouvrir l'origine : retour à la Planche d'origine, jalon présent", (await racine.locator("[data-planche-versions-jalon]").count()) === 1 || (await deuxTemps("v"), (await racine.locator("[data-planche-versions-jalon]").count()) === 1));
check("l'origine liste sa variante", (await racine.locator("[data-planche-versions-variante]").count()) === 1);

// Dériver une variante du jalon.
await racine.locator("[data-planche-versions-deriver]").click();
await page.waitForTimeout(1200);
if ((await panneau("versions-jalons").count()) === 0) await deuxTemps("v");
const origine = (await racine.locator("[data-planche-versions-origine]").textContent().catch(() => "")) ?? "";
check("Dériver : variante créée depuis le jalon, origine « jalon « Dépôt permis » »", origine.includes("jalon « Dépôt permis »"), origine);
check("la variante part du modèle du jalon (un objet)", (await occurrences()) === 1 && JSON.stringify((await modele()).racine.occurrences) !== courant);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs) {
  console.log(`${echecs} contrôle(s) en échec`);
  process.exit(1);
}
console.log("Recette versions : tout est vert");
