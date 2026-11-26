/**
 * Recette du protocole des extensions, lot 7 : événements, minuteries, unités. Deux extensions d'essai sont installées
 * (`donnees/essai-commandes.fadi-addon.json`, qui dessine, et `donnees/essai-evenements.fadi-addon.json`, qui suit) :
 *
 *  - « projet.ouvert », « modele.change », « selection.change » et « projet.enregistre » arrivent à l'extension abonnée ;
 *  - sa réaction à un changement (un compteur dans les données du projet) se rattache au pas d'annulation de
 *    l'utilisateur : Ctrl+Z défait le geste et la réaction d'un coup ;
 *  - après une annulation, la modification tentée en réaction est refusée : Ctrl+Y rétablit toujours ;
 *  - une extension n'est pas prévenue de ses propres changements ;
 *  - une minuterie sonne une fois, après la commande, et fait son propre pas ;
 *  - unités, matières et balises lues ; anglais.
 *
 * Les extensions sont installées en base (`addon_packages`) quand `DATABASE_URL` désigne une base locale jetable ;
 * sinon (préproduction), la réponse de `GET /sandbox/preferences/extensions` est fournie par la recette, et c'est dit.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] OUT=atelier-captures/extensions-evenements node apps/web/e2e/extensions-evenements.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-evenements";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const lire = (nom) => JSON.parse(readFileSync(new URL(`./donnees/${nom}.fadi-addon.json`, import.meta.url), "utf8"));
const dessinatrice = lire("essai-commandes");
const suiveuse = lire("essai-evenements");
const paquets = [dessinatrice, suiveuse];
const A = dessinatrice.fiche.id;
const B = suiveuse.fiche.id;

const dbUrl = process.env.DATABASE_URL ?? "";
const enBase = dbUrl !== "" && ["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname);
let sql = null;
if (enBase) {
  const pg = (await import("pg")).default;
  sql = new pg.Client({ connectionString: dbUrl });
  await sql.connect();
  for (const p of paquets) await sql.query("INSERT INTO addon_packages (addon_id, version, package) VALUES ($1, $2, $3::jsonb) ON CONFLICT (addon_id) DO UPDATE SET version = EXCLUDED.version, package = EXCLUDED.package", [p.fiche.id, p.fiche.version, JSON.stringify(p)]);
  console.log("· extensions d'essai installées en base (addon_packages)");
} else console.log("· DATABASE_URL absent ou distant : la liste des extensions installées est fournie par la recette");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
async function ouvrir(langue) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...(langue === "en" ? { locale: "en-GB" } : { locale: "fr-CH" }) });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  if (!enBase) await page.route("**/sandbox/preferences/extensions", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ extensions: paquets }) }));
  await inscrireDansLaPage(page, `extevt-${langue}-${Date.now()}@example.com`, "extensions-evenements-ci-123", BASE);
  await page.waitForURL(/\/(accueil|projets)$/);
  if (langue === "en") await page.evaluate(() => window.localStorage.setItem("fadi.langue", "en"));
  const recues = page.waitForResponse((r) => new URL(r.url()).pathname === "/sandbox/preferences/extensions");
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  await recues;
  await page.locator("[data-planche-recherche]").first().click();
  await page.locator("[data-planche-outils-liste]").waitFor();
  return page;
}
const etat = (page) => page.evaluate((b) => {
  const P = window.fadiPlanche;
  const m = P.modele();
  const donnees = m.annotations?.reglages?.donneesExtensions?.[b] ?? {};
  return { aretes: Object.keys(m.racine.aretes).length, objets: Object.keys(m.racine.occurrences).length, pas: P.pas(), selection: P.selection().length, changements: donnees.changements ?? 0 };
}, B);
const attendreCompte = (page, n) => page.waitForFunction(([b, k]) => (window.fadiPlanche.modele().annotations?.reglages?.donneesExtensions?.[b]?.changements ?? 0) === k, [B, n], { timeout: 15000 });
const textesAvis = (page) => page.locator("[data-planche-avis-extension] [data-planche-avis-texte]").allTextContents();
const attendreAvis = (page, n) => page.waitForFunction((k) => document.querySelectorAll("[data-planche-avis-extension]").length >= k, n, { timeout: 15000 });
const fermerAvis = async (page) => {
  while ((await page.locator("[data-planche-avis-fermer]").count()) > 0) await page.locator("[data-planche-avis-fermer]").first().click();
};
/** Lance une commande depuis la liste « Outils » ; déplie la famille de l'extension si elle est repliée. */
const lancer = async (page, extension, id) => {
  const ligne = page.locator(`[data-outils-commande="extension:${extension}:${id}"]`);
  if ((await ligne.count()) === 0) {
    if ((await page.locator("[data-planche-outils-liste]").count()) === 0) await page.locator("[data-planche-recherche]").first().click();
    const tete = page.locator(`[data-outils-extension-installee="${extension}"] [data-outils-famille]`);
    await tete.waitFor();
    if ((await tete.getAttribute("aria-expanded")) !== "true") await tete.click();
  }
  await ligne.click();
};
/** Lance « État du suivi » et relit son avis : compteurs tenus par l'extension suiveuse. */
const suivi = async (page) => {
  await fermerAvis(page);
  await lancer(page, B, "etat");
  await attendreAvis(page, 1);
  const texte = (await textesAvis(page)).at(-1) ?? "";
  await fermerAvis(page);
  const champ = (nom) => texte.match(new RegExp(`${nom}=(\\S*)`))?.[1] ?? "";
  return { texte, changements: Number(champ("changements")), selection: Number(champ("selection")), ouvertures: Number(champ("ouvertures")), enregistrements: Number(champ("enregistrements")), origines: champ("origines").split(",").filter(Boolean) };
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ——— 1. Français.
{
  const page = await ouvrir("fr");
  let s = await suivi(page);
  check("« projet.ouvert » : l'extension abonnée est prévenue du dessin ouvert, une fois", s.ouvertures === 1, s.texte);

  // Une autre extension dessine : la suiveuse réagit dans le même pas d'annulation.
  const avant = await etat(page);
  await lancer(page, A, "poser-boite");
  await attendreAvis(page, 1);
  await attendreCompte(page, 1);
  let e = await etat(page);
  check("« modele.change » : la réaction (compteur du projet) se rattache au pas de la commande — un seul pas", e.pas === avant.pas + 1 && e.objets === avant.objets + 1 && e.changements === 1, `pas ${avant.pas} → ${e.pas}, compteur ${e.changements}`);
  s = await suivi(page);
  check("l'événement dit son origine (« extension ») ; « selection.change » suit la sélection posée", s.origines.at(-1) === "extension" && s.selection === 1 && s.changements === 1, s.texte);

  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+z");
  await pause(600);
  e = await etat(page);
  check("Ctrl+Z défait la commande et la réaction d'un coup", e.pas === avant.pas && e.objets === avant.objets && e.changements === 0, `pas ${e.pas}, compteur ${e.changements}`);
  check("après l'annulation, la modification tentée en réaction est refusée : rien n'est dessiné", e.aretes === avant.aretes, `${e.aretes} arête(s)`);
  await page.keyboard.press("Control+y");
  await pause(600);
  e = await etat(page);
  check("Ctrl+Y rétablit toujours la commande et sa réaction", e.pas === avant.pas + 1 && e.objets === avant.objets + 1 && e.changements === 1, `pas ${e.pas}, compteur ${e.changements}`);
  s = await suivi(page);
  check("annulation et rétablissement sont annoncés avec leur origine", s.origines.slice(-2).join(",") === "annulation,retablissement" && s.changements === 1, s.texte);

  // Geste de l'utilisateur : tout sélectionner, effacer.
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await attendreCompte(page, 2);
  e = await etat(page);
  check("geste de l'utilisateur (effacer) : la réaction reste dans son pas", e.pas === avant.pas + 2 && e.objets === 0 && e.changements === 2, `pas ${e.pas}, compteur ${e.changements}`);
  s = await suivi(page);
  check("origine « utilisateur » ; la sélection vidée est annoncée", s.origines.at(-1) === "utilisateur" && s.selection === 0, s.texte);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+z");
  await pause(600);
  e = await etat(page);
  check("Ctrl+Z rend l'objet effacé et l'ancien compteur", e.pas === avant.pas + 1 && e.objets === avant.objets + 1 && e.changements === 1);

  // Minuterie : sonne une fois, après la commande ; son tracé fait son propre pas ; l'extension n'est pas prévenue d'elle-même.
  await fermerAvis(page);
  const avantRappel = await etat(page);
  await lancer(page, B, "rappel");
  await attendreAvis(page, 1);
  check("« Armer un rappel » : la commande rend la main tout de suite", (await textesAvis(page)).at(-1) === "Rappel armé." && (await etat(page)).aretes === avantRappel.aretes);
  await attendreAvis(page, 2);
  e = await etat(page);
  check("la minuterie sonne après la commande : avis, ligne tracée, un pas à elle", (await textesAvis(page)).at(-1) === "Rappel : une ligne a été tracée." && e.aretes === avantRappel.aretes + 1 && e.pas === avantRappel.pas + 1, `arêtes ${avantRappel.aretes} → ${e.aretes}, pas ${avantRappel.pas} → ${e.pas}`);
  await page.locator("[data-planche-etat]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "1-rappel.png") });
  await pause(900);
  check("la minuterie ne sonne qu'une fois", (await textesAvis(page)).length === 2 && (await etat(page)).aretes === avantRappel.aretes + 1);
  s = await suivi(page);
  check("une extension n'est pas prévenue de ses propres changements", s.changements === 1 && s.origines.at(-1) === "annulation", s.texte);

  // Unités, matières, balises.
  await lancer(page, B, "mesurer");
  await attendreAvis(page, 1);
  check("unités de l'interface, matières et balises du dessin", (await textesAvis(page)).at(-1) === "1,50 m · 2,25 m² · 0 matière(s) · 0 balise(s)", (await textesAvis(page)).at(-1));

  // Enregistrement du dessin.
  await page.waitForFunction(() => document.querySelector("[data-planche-brouillon]")?.getAttribute("data-sauvegarde") === "enregistre", null, { timeout: 30000 });
  await pause(300);
  s = await suivi(page);
  check("« projet.enregistre » : l'extension est prévenue après l'enregistrement du dessin", s.enregistrements >= 1, s.texte);
  await page.context().close();
}

// ——— 2. Anglais.
{
  const page = await ouvrir("en");
  await lancer(page, B, "mesurer");
  await attendreAvis(page, 1);
  check("anglais : les unités suivent l'interface (point décimal)", ((await textesAvis(page)).at(-1) ?? "").startsWith("1.50 m · 2.25 m²"), (await textesAvis(page)).at(-1));
  await fermerAvis(page);
  await lancer(page, B, "rappel");
  await attendreAvis(page, 2);
  check("anglais : la commande et l'échéance reçoivent la langue", (await textesAvis(page)).join(" | ") === "Reminder set. | Reminder: a line was drawn.", (await textesAvis(page)).join(" | "));
  await page.context().close();
}

if (sql) {
  for (const p of paquets) await sql.query("DELETE FROM addon_packages WHERE addon_id = $1", [p.fiche.id]);
  await sql.end();
}
await browser.close();
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nRecette des événements d'extension : tout est conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
