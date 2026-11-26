/**
 * Recette du protocole des extensions, lot 7, fichiers (images validées le 26 novembre 2026) : une extension d'essai
 * (`donnees/essai-fichiers.fadi-addon.json`) demande à ouvrir puis à enregistrer un fichier.
 *
 *  - « Ouvrir un fichier » : fenêtre de la Planche à la demande de l'extension (types acceptés, taille), bouton
 *    « Choisir un fichier… » ; l'extension ne reçoit que le fichier choisi ; un fichier d'un autre type est refusé dans
 *    la fenêtre ; annuler rend « aucun fichier » ;
 *  - « Enregistrer un fichier » : nom, taille et aperçu des premières lignes avant d'accepter ; le fichier part dans les
 *    téléchargements ; annuler n'enregistre rien ;
 *  - le délai de la commande ne court pas pendant que la fenêtre est ouverte ; anglais.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] OUT=atelier-captures/extensions-fichiers node apps/web/e2e/extensions-fichiers.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-fichiers";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const paquet = JSON.parse(readFileSync(new URL("./donnees/essai-fichiers.fadi-addon.json", import.meta.url), "utf8"));
const ID = paquet.fiche.id;

const dbUrl = process.env.DATABASE_URL ?? "";
const enBase = dbUrl !== "" && ["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname);
let sql = null;
if (enBase) {
  const pg = (await import("pg")).default;
  sql = new pg.Client({ connectionString: dbUrl });
  await sql.connect();
  await sql.query("INSERT INTO addon_packages (addon_id, version, package) VALUES ($1, $2, $3::jsonb) ON CONFLICT (addon_id) DO UPDATE SET version = EXCLUDED.version, package = EXCLUDED.package", [ID, paquet.fiche.version, JSON.stringify(paquet)]);
  console.log("· extension d'essai installée en base (addon_packages)");
} else console.log("· DATABASE_URL absent ou distant : la liste des extensions installées est fournie par la recette");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
async function ouvrir(langue) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true, ...(langue === "en" ? { locale: "en-GB" } : { locale: "fr-CH" }) });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  if (!enBase) await page.route("**/sandbox/preferences/extensions", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ extensions: [paquet] }) }));
  await inscrireDansLaPage(page, `extfic-${langue}-${Date.now()}@example.com`, "extensions-fichiers-ci-123", BASE);
  await page.waitForURL(/\/(accueil|projets)$/);
  if (langue === "en") await page.evaluate(() => window.localStorage.setItem("fadi.langue", "en"));
  const recues = page.waitForResponse((r) => new URL(r.url()).pathname === "/sandbox/preferences/extensions");
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await recues;
  await page.locator("[data-planche-recherche]").first().click();
  const tete = page.locator(`[data-outils-extension-installee="${ID}"] [data-outils-famille]`);
  await tete.waitFor();
  await tete.click();
  return page;
}
const etat = (page) => page.evaluate(() => ({ aretes: Object.keys(window.fadiPlanche.modele().racine.aretes).length, pas: window.fadiPlanche.pas() }));
const textesAvis = (page) => page.locator("[data-planche-avis-extension] [data-planche-avis-texte]").allTextContents();
const attendreAvis = (page, n) => page.waitForFunction((k) => document.querySelectorAll("[data-planche-avis-extension]").length >= k, n, { timeout: 15000 });
const fermerAvis = async (page) => {
  while ((await page.locator("[data-planche-avis-fermer]").count()) > 0) await page.locator("[data-planche-avis-fermer]").first().click();
};
// La liste des outils se referme après une commande : la famille est rouverte au besoin.
const lancer = async (page, id) => {
  const ligne = page.locator(`[data-outils-commande="extension:${ID}:${id}"]`);
  if ((await ligne.count()) === 0) {
    if ((await page.locator("[data-planche-outils-liste]").count()) === 0) await page.locator("[data-planche-recherche]").first().click();
    const tete = page.locator(`[data-outils-extension-installee="${ID}"] [data-outils-famille]`);
    await tete.waitFor();
    if ((await tete.getAttribute("aria-expanded")) !== "true") await tete.click();
  }
  await ligne.click();
};
const fichier = (nom, texte) => ({ name: nom, mimeType: "text/plain", buffer: Buffer.from(texte, "utf8") });
const lireTelechargement = async (t) => {
  const flux = await t.createReadStream();
  const morceaux = [];
  for await (const m of flux) morceaux.push(m);
  return Buffer.concat(morceaux).toString("utf8");
};

// ——— 1. Français.
{
  const page = await ouvrir("fr");
  const ouvrirFenetre = page.locator('[data-planche-fichier-extension="ouvrir"]');
  const avant = await etat(page);

  await lancer(page, "importer-points");
  await ouvrirFenetre.waitFor();
  check("« Ouvrir un fichier » : fenêtre de la Planche, à la demande de l'extension nommée", (await ouvrirFenetre.locator("h3").textContent()) === "Ouvrir un fichier" && (await ouvrirFenetre.locator("[data-planche-saisie-origine]").textContent()) === "Demandé par l'extension « Essai des fichiers »");
  check("types acceptés et taille dits avant le choix ; bouton « Choisir un fichier… »", (await ouvrirFenetre.locator("[data-planche-fichier-types]").textContent()) === ".csv, .txt" && /1 Mo au plus/.test(await ouvrirFenetre.textContent()) && (await ouvrirFenetre.locator("[data-planche-fichier-valider]").textContent()) === "Choisir un fichier…" && (await ouvrirFenetre.locator("[data-planche-fichier-champ]").getAttribute("accept")) === ".csv,.txt");
  await page.screenshot({ path: join(OUT, "1-ouvrir-un-fichier.png") });
  // Le délai de la commande (5 s) ne court pas pendant que l'utilisateur choisit.
  await page.waitForTimeout(5600);
  check("le délai de la commande ne court pas pendant le choix", (await ouvrirFenetre.count()) === 1 && (await textesAvis(page)).length === 0);
  await ouvrirFenetre.locator("[data-planche-fichier-champ]").setInputFiles(fichier("notes.md", "# notes"));
  await ouvrirFenetre.locator("[data-planche-saisie-erreur]").waitFor();
  check("un fichier d'un autre type est refusé dans la fenêtre, qui reste ouverte", /type accepté \(\.csv, \.txt\)/.test(await ouvrirFenetre.locator("[data-planche-saisie-erreur]").textContent()) && (await etat(page)).aretes === avant.aretes);
  await ouvrirFenetre.locator("[data-planche-fichier-champ]").setInputFiles(fichier("trace.csv", "0;0;0\n2;0;0\n2,5;1,5;0\nligne illisible\n0;1,5;0\n"));
  await attendreAvis(page, 1);
  let e = await etat(page);
  check("l'extension reçoit le fichier choisi : quatre points importés, trois arêtes, un seul pas", (await textesAvis(page)).at(-1) === "4 points repris de trace.csv" && e.aretes === avant.aretes + 3 && e.pas === avant.pas + 1 && (await ouvrirFenetre.count()) === 0, `${(await textesAvis(page)).at(-1)} · arêtes ${avant.aretes} → ${e.aretes}`);
  await fermerAvis(page);

  await lancer(page, "importer-points");
  await ouvrirFenetre.waitFor();
  await ouvrirFenetre.locator("[data-planche-saisie-annuler]").click();
  await attendreAvis(page, 1);
  check("annuler : l'extension apprend qu'aucun fichier n'a été choisi", (await textesAvis(page)).at(-1) === "Aucun fichier choisi." && (await etat(page)).aretes === e.aretes);
  await fermerAvis(page);

  // Enregistrer.
  const enregistrer = page.locator('[data-planche-fichier-extension="enregistrer"]');
  await lancer(page, "exporter-releve");
  await enregistrer.waitFor();
  check("« Enregistrer un fichier » : nom, taille et aperçu des premières lignes avant d'accepter", (await enregistrer.locator("h3").textContent()) === "Enregistrer un fichier" && (await enregistrer.locator("[data-planche-fichier-nom]").textContent()) === "releve-du-dessin.csv" && /^\d+ octets, texte$/.test(await enregistrer.locator("[data-planche-fichier-taille]").textContent()) && (await enregistrer.locator("[data-planche-fichier-apercu]").textContent()) === "Nature;Nombre\nFaces;0\nArêtes;3\nObjets;0", await enregistrer.locator("[data-planche-fichier-apercu]").textContent());
  await page.screenshot({ path: join(OUT, "2-enregistrer-un-fichier.png") });
  const [telechargement] = await Promise.all([page.waitForEvent("download"), enregistrer.locator("[data-planche-fichier-valider]").click()]);
  await attendreAvis(page, 1);
  check("accepter : le fichier part dans les téléchargements, sous le nom demandé, avec le contenu montré", telechargement.suggestedFilename() === "releve-du-dessin.csv" && (await lireTelechargement(telechargement)) === "Nature;Nombre\nFaces;0\nArêtes;3\nObjets;0\n" && (await textesAvis(page)).at(-1) === "Fichier enregistré.");
  await fermerAvis(page);

  await lancer(page, "exporter-releve");
  await enregistrer.waitFor();
  let telecharge = false;
  page.once("download", () => (telecharge = true));
  await page.keyboard.press("Escape");
  await attendreAvis(page, 1);
  await page.waitForTimeout(400);
  check("Échap : rien n'est enregistré, l'extension en est prévenue", !telecharge && (await textesAvis(page)).at(-1) === "Enregistrement annulé." && (await enregistrer.count()) === 0);
  await page.context().close();
}

// ——— 2. Anglais.
{
  const page = await ouvrir("en");
  await lancer(page, "importer-points");
  const fenetre = page.locator('[data-planche-fichier-extension="ouvrir"]');
  await fenetre.waitFor();
  check("anglais : fenêtre traduite", (await fenetre.locator("h3").textContent()) === "Open a file" && (await fenetre.locator("[data-planche-fichier-valider]").textContent()) === "Choose a file…" && /1 MB at most/.test(await fenetre.textContent()) && (await fenetre.locator("[data-planche-saisie-origine]").textContent()) === "Requested by the add-on “Files trial”");
  await fenetre.locator("[data-planche-saisie-annuler]").click();
  await attendreAvis(page, 1);
  check("anglais : avis de l'extension", (await textesAvis(page)).at(-1) === "No file chosen.");
  await page.context().close();
}

if (sql) {
  await sql.query("DELETE FROM addon_packages WHERE addon_id = $1", [ID]);
  await sql.end();
}
await browser.close();
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nRecette des fichiers d'extension : tout est conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
