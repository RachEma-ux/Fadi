/**
 * Recette du protocole des extensions, lot 4, panneau (image validée le 26 novembre 2026) : une extension d'essai
 * (`donnees/essai-panneau.fadi-addon.json`) offre un panneau « Relevé ».
 *
 *  - le panneau paraît dans la colonne de la Planche, avec sa propre icône ; ouvert, il porte son titre, la pastille
 *    « extension » et la note d'isolement ; il est exclusif des panneaux de la Planche ;
 *  - sa page est affichée à l'écart : cadre sans origine, aucun réseau, ni la Planche ni l'enregistrement local ;
 *  - la page appelle des actions nommées de l'extension (relevé, tracer) : un seul pas d'annulation, une erreur de
 *    l'extension revient à la page ; l'extension envoie des données à la page quand le dessin change ;
 *  - une commande de l'extension ouvre le panneau ; anglais.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] OUT=atelier-captures/extensions-panneau node apps/web/e2e/extensions-panneau.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-panneau";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const paquet = JSON.parse(readFileSync(new URL("./donnees/essai-panneau.fadi-addon.json", import.meta.url), "utf8"));
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...(langue === "en" ? { locale: "en-GB" } : { locale: "fr-CH" }) });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  if (!enBase) await page.route("**/sandbox/preferences/extensions", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ extensions: [paquet] }) }));
  await inscrireDansLaPage(page, `extpan-${langue}-${Date.now()}@example.com`, "extensions-panneau-ci-123", BASE);
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
const CLE = `extension:${ID}:releve`;
const icone = (page) => page.locator(`[data-planche-panneau-icone="${CLE}"]`);
const panneau = (page) => page.locator(`[data-planche-panneau="${CLE}"]`);
const cadre = (page) => page.frameLocator(`[data-planche-panneau="${CLE}"] [data-planche-panneau-cadre]`);
const releve = async (page) => ({ aretes: await cadre(page).locator("#aretes").textContent(), faces: await cadre(page).locator("#faces").textContent() });
const attendreReleve = (page, aretes) => cadre(page).locator("#aretes").filter({ hasText: new RegExp(`^${aretes}$`) }).waitFor();

// ——— 1. Français.
{
  const page = await ouvrir("fr");
  await page.keyboard.press("Escape");
  const avant = await etat(page);

  await icone(page).waitFor();
  check("le panneau de l'extension est dans la colonne, sous son titre, avec sa propre icône (une image)", (await icone(page).getAttribute("title")) === "Relevé" && (await icone(page).getAttribute("aria-pressed")) === "false" && /^data:image\/svg\+xml/.test((await icone(page).locator("img").getAttribute("src")) ?? ""));
  await icone(page).click();
  await panneau(page).waitFor();
  check("ouvert : titre, pastille « extension », note d'isolement", (await panneau(page).locator("h3 span").first().textContent()) === "Relevé" && (await panneau(page).locator("[data-planche-panneau-pastille]").textContent()) === "extension" && (await panneau(page).locator("[data-planche-panneau-note]").textContent()) === "Page fournie par l'extension, affichée à l'écart : elle ne voit ni la Planche, ni votre compte, ni le réseau." && (await icone(page).getAttribute("aria-pressed")) === "true");
  const balise = panneau(page).locator("[data-planche-panneau-cadre]");
  check("la page est dans un cadre sans origine : scripts seulement", (await balise.getAttribute("sandbox")) === "allow-scripts" && (await balise.getAttribute("src")) === null);

  await attendreReleve(page, avant.aretes);
  check("la page appelle l'action « etat » de l'extension et affiche sa réponse", (await cadre(page).locator("#titre-releve").textContent()) === "Dans ce dessin" && (await releve(page)).faces === "0", JSON.stringify(await releve(page)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "1-panneau-extension.png") });

  // Isolement, constaté depuis la page elle-même.
  const dedans = await (await balise.elementHandle()).contentFrame();
  const isole = await dedans.evaluate(async () => {
    const essai = (f) => {
      try {
        f();
        return "permis";
      } catch {
        return "refusé";
      }
    };
    const reseau = await fetch("/sandbox/preferences/extensions").then(() => "permis", () => "refusé");
    const image = document.getElementById("ailleurs");
    return { origine: window.origin, reseau, planche: essai(() => window.parent.document.title), local: essai(() => window.localStorage.length), temoins: essai(() => document.cookie), image: image.naturalWidth };
  });
  check("isolement : aucune origine, aucun réseau, ni la Planche, ni l'enregistrement local, ni les témoins du compte", isole.origine === "null" && isole.reseau === "refusé" && isole.planche === "refusé" && isole.local === "refusé" && isole.temoins === "refusé" && isole.image === 0, JSON.stringify(isole));

  // Action qui modifie le dessin.
  await cadre(page).locator("#longueur").fill("2,5");
  await cadre(page).locator("#tracer").click();
  await attendreReleve(page, avant.aretes + 1);
  let e = await etat(page);
  check("l'action « tracer » de la page modifie le dessin : une arête, un seul pas d'annulation", e.aretes === avant.aretes + 1 && e.pas === avant.pas + 1, `arêtes ${avant.aretes} → ${e.aretes}, pas ${avant.pas} → ${e.pas}`);

  await cadre(page).locator("#longueur").fill("zéro");
  await cadre(page).locator("#tracer").click();
  await cadre(page).locator("#erreur").waitFor();
  check("une erreur de l'extension revient à la page, rien n'est modifié", (await cadre(page).locator("#erreur").textContent()) === "Indiquez une longueur supérieure à zéro." && (await etat(page)).aretes === e.aretes);

  // L'extension envoie des données à la page quand le dessin change.
  await page.locator("[data-planche-vue] canvas").click({ position: { x: 300, y: 300 } });
  await page.keyboard.press("Control+z");
  await attendreReleve(page, avant.aretes);
  check("annulation par l'utilisateur : l'extension envoie le nouveau relevé à la page", (await etat(page)).aretes === avant.aretes && (await releve(page)).aretes === String(avant.aretes));

  // Exclusif des panneaux de la Planche.
  await page.locator('[data-planche-panneau-icone="materiaux"]').click();
  await page.locator('[data-planche-panneau="materiaux"]').waitFor();
  check("ouvrir un panneau de la Planche ferme celui de l'extension", (await panneau(page).count()) === 0 && (await icone(page).getAttribute("aria-pressed")) === "false");
  await lancer(page, "ouvrir-releve");
  await panneau(page).waitFor();
  await attendreReleve(page, avant.aretes);
  check("la commande de l'extension ouvre son panneau, qui remplace celui de la Planche", (await page.locator('[data-planche-panneau="materiaux"]').count()) === 0 && (await textesAvis(page)).length === 0);
  await panneau(page).locator(".canevas-fermer").click();
  check("le bouton de fermeture referme le panneau", (await panneau(page).count()) === 0);
  await page.context().close();
}

// ——— 2. Anglais.
{
  const page = await ouvrir("en");
  await page.keyboard.press("Escape");
  await icone(page).click();
  await panneau(page).waitFor();
  await cadre(page).locator("#tracer").waitFor();
  check("anglais : titre, pastille, note et page traduits", (await panneau(page).locator("h3 span").first().textContent()) === "Count" && (await panneau(page).locator("[data-planche-panneau-pastille]").textContent()) === "add-on" && /^Page provided by the add-on/.test(await panneau(page).locator("[data-planche-panneau-note]").textContent()) && (await cadre(page).locator("#tracer").textContent()) === "Draw from the origin" && (await cadre(page).locator("#titre-releve").textContent()) === "In this drawing");
  await page.context().close();
}

if (sql) {
  await sql.query("DELETE FROM addon_packages WHERE addon_id = $1", [ID]);
  await sql.end();
}
await browser.close();
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nRecette du panneau d'extension : tout est conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
