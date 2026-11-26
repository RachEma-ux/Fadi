/**
 * Recette du protocole des extensions, lot 6, outil interactif (image validée le 26 novembre 2026) : une extension
 * d'essai (`donnees/essai-outil.fadi-addon.json`) offre l'outil « Trait d'essai ».
 *
 *  - l'outil est dans la liste des outils, sous son extension, avec sa propre icône et son raccourci ; activé, la barre
 *    d'état porte son nom et la consigne rendue par l'extension, le curseur est celui qu'elle demande ;
 *  - chaque geste part vers l'extension avec l'accrochage calculé par la Planche ; l'aperçu, le texte de la barre
 *    d'état et la zone de saisie viennent de la description que l'outil rend — il ne dessine rien lui-même ;
 *  - deux clics tracent un trait (un seul pas d'annulation, au nom de l'outil) ; une longueur saisie le trace aussi ;
 *    Échap annule le tracé en cours ; le raccourci active l'outil ; un autre outil le désactive ; anglais.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] OUT=atelier-captures/extensions-outil node apps/web/e2e/extensions-outil.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-outil";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const paquet = JSON.parse(readFileSync(new URL("./donnees/essai-outil.fadi-addon.json", import.meta.url), "utf8"));
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
  await inscrireDansLaPage(page, `extout-${langue}-${Date.now()}@example.com`, "extensions-outil-ci-123", BASE);
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
const CLE = `extension:${ID}:trait`;
const vueDessin = (page) => page.locator("[data-planche-vue]");
const outilActif = (page) => vueDessin(page).getAttribute("data-planche-curseur");
const consigne = (page) => page.locator(".planche-consigne").first().textContent();
const attendreConsigne = (page, motif) => page.waitForFunction((m) => new RegExp(m).test(document.querySelector(".planche-consigne")?.textContent ?? ""), motif, { timeout: 15000 });
const mesures = async (page) => ({ libelle: await page.locator('label[for="planche-mesures"]').textContent(), valeur: await page.locator("[data-planche-mesures]").inputValue() });
const etiquettes = (page) => page.locator(".planche-etiquettes > *").allTextContents();
const longueurs = (page) => page.evaluate(() => {
  const r = window.fadiPlanche.modele().racine;
  return Object.values(r.aretes).map((a) => {
    const p = r.sommets[a.a].position, q = r.sommets[a.b].position;
    return Math.round(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) * 1000) / 1000;
  });
});
/** Point de la vue, en pixels de page, à une fraction de sa largeur et de sa hauteur. */
const point = async (page, fx, fy) => {
  const b = await page.locator("[data-planche-vue] canvas").boundingBox();
  return { x: b.x + b.width * fx, y: b.y + b.height * fy };
};
const viser = async (page, fx, fy) => {
  const p = await point(page, fx, fy);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  return p;
};
const cliquer = async (page, fx, fy) => {
  const p = await viser(page, fx, fy);
  await page.mouse.click(p.x, p.y);
};

// ——— 1. Français.
{
  const page = await ouvrir("fr");
  const ligne = page.locator(`[data-outils-commande="${CLE}"]`);
  await ligne.waitFor();
  check("l'outil est dans la liste des outils, sous son extension, avec sa propre icône et son raccourci", /Trait d'essai/.test(await ligne.textContent()) && /Ctrl\+Alt\+T/.test(await ligne.textContent()) && /^data:image\/svg\+xml/.test((await ligne.locator("img").first().getAttribute("src")) ?? ""), await ligne.textContent());
  const avant = await etat(page);
  await ligne.click();
  await attendreConsigne(page, "Cliquez le point de départ");
  check("activé : la barre d'état porte le nom de l'outil et la consigne rendue par l'extension", (await outilActif(page)) === CLE && (await page.locator("[data-planche-outil-extension]").textContent()) === "Trait d'essai" && (await consigne(page)) === "Trait d'essai — Cliquez le point de départ.", await consigne(page));
  check("le curseur est celui que l'outil demande", (await vueDessin(page).evaluate((el) => getComputedStyle(el).cursor)) === "crosshair");

  // Premier clic, puis déplacement : l'aperçu, la barre d'état et la zone de saisie viennent de la description.
  await cliquer(page, 0.4, 0.55);
  await attendreConsigne(page, "Cliquez le point d'arrivée");
  await viser(page, 0.6, 0.6);
  await page.waitForFunction(() => /\d m$/.test(document.querySelector("[data-planche-mesures]")?.value ?? "") && !/^0[.,]00 m$/.test(document.querySelector("[data-planche-mesures]").value), null, { timeout: 15000 });
  const m1 = await mesures(page);
  const e1 = await etiquettes(page);
  check("pendant le tracé : zone de saisie « Longueur » et étiquette de l'aperçu, rendues par l'outil et tenues à jour", m1.libelle === "Longueur" && /^\d+,\d\d m$/.test(m1.valeur) && e1.includes(m1.valeur) && (await vueDessin(page).evaluate((el) => getComputedStyle(el).cursor)) === "cell", `${m1.libelle} ${m1.valeur} · ${e1.join(" | ")}`);
  check("rien n'est créé tant que le second point n'est pas cliqué", (await etat(page)).aretes === avant.aretes && (await etat(page)).pas === avant.pas);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "1-outil-extension.png") });

  await cliquer(page, 0.6, 0.6);
  await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.aretes).length === n, avant.aretes + 1, { timeout: 15000 });
  await attendreConsigne(page, "Cliquez le point de départ");
  let e = await etat(page);
  check("second clic : un trait, un seul pas d'annulation ; l'aperçu disparaît, l'outil reste actif", e.aretes === avant.aretes + 1 && e.pas === avant.pas + 1 && (await etiquettes(page)).length === 0 && (await outilActif(page)) === CLE, `arêtes ${avant.aretes} → ${e.aretes}, pas ${avant.pas} → ${e.pas}`);

  // Accrochage : le départ du second trait se pose sur l'extrémité du premier (calculé par la Planche).
  await viser(page, 0.6, 0.6);
  await page.locator(".planche-infobulle, [data-planche-inference]").first().waitFor({ timeout: 5000 }).catch(() => {});
  await cliquer(page, 0.6, 0.6);
  await attendreConsigne(page, "Cliquez le point d'arrivée");
  await viser(page, 0.75, 0.45);
  await page.waitForFunction(() => /\d m$/.test(document.querySelector("[data-planche-mesures]")?.value ?? "") && !/^0[.,]00 m$/.test(document.querySelector("[data-planche-mesures]").value), null, { timeout: 15000 });
  // Longueur saisie.
  await page.locator("[data-planche-mesures]").fill("3");
  await page.keyboard.press("Enter");
  await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.aretes).length === n, avant.aretes + 2, { timeout: 15000 });
  const l = await longueurs(page);
  const sommets = await page.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.sommets).length);
  check("longueur saisie : un trait de 3 m exactement, parti de l'extrémité du premier (accrochage de la Planche)", l.includes(3) && sommets === 3, `longueurs ${l.join(", ")} · ${sommets} sommets`);

  // Échap : annulation du tracé en cours.
  await cliquer(page, 0.3, 0.4);
  await attendreConsigne(page, "Cliquez le point d'arrivée");
  await viser(page, 0.35, 0.5);
  await page.keyboard.press("Escape");
  await attendreConsigne(page, "Cliquez le point de départ");
  e = await etat(page);
  check("Échap : le tracé en cours est annulé, rien n'est créé, l'outil reste actif", e.aretes === avant.aretes + 2 && (await etiquettes(page)).length === 0 && (await outilActif(page)) === CLE);

  // Annuler défait un trait d'un coup.
  await page.keyboard.press("Control+z");
  await page.waitForFunction((n) => Object.keys(window.fadiPlanche.modele().racine.aretes).length === n, avant.aretes + 1, { timeout: 15000 });
  check("Ctrl+Z défait le dernier trait en un pas", (await etat(page)).aretes === avant.aretes + 1);

  // Un autre outil le désactive ; le raccourci le réactive.
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector("[data-planche-vue]")?.getAttribute("data-planche-curseur") === "selection", null, { timeout: 15000 });
  check("un outil de la Planche prend la main : le nom de l'outil d'extension quitte la barre d'état", (await page.locator("[data-planche-outil-extension]").count()) === 0);
  await page.keyboard.press("Control+Alt+t");
  await attendreConsigne(page, "Cliquez le point de départ");
  check("le raccourci de l'outil l'active", (await outilActif(page)) === CLE && (await textesAvis(page)).length === 0);
  await page.context().close();
}

// ——— 2. Anglais.
{
  const page = await ouvrir("en");
  await page.locator(`[data-outils-commande="${CLE}"]`).click();
  await attendreConsigne(page, "Click the start point");
  check("anglais : nom de l'outil et consigne traduits", (await consigne(page)) === "Trial line — Click the start point.", await consigne(page));
  await page.context().close();
}

if (sql) {
  await sql.query("DELETE FROM addon_packages WHERE addon_id = $1", [ID]);
  await sql.end();
}
await browser.close();
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nRecette de l'outil d'extension : tout est conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
