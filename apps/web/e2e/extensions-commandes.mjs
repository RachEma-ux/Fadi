/**
 * Recette du protocole des extensions, lot 3 (images validées le 26 novembre 2026) : une extension installée sur la
 * plateforme (paquet d'essai `donnees/essai-commandes.fadi-addon.json`) apporte ses commandes à la Planche —
 * famille à son nom et pastille « extension » dans la liste « Outils », icône, raccourci, barre ; la commande dessine en
 * un seul pas d'annulation et pose la sélection ; avis au-dessus de la barre d'état ; fenêtre de saisie (valeurs
 * validées, annulation) ; commande qui échoue ou ne répond plus : arrêtée, rien d'appliqué, avis rouge ; anglais.
 *
 * L'extension est installée en base (`addon_packages`) quand `DATABASE_URL` désigne une base locale jetable — le
 * serveur la relit et la sert ; sinon (préproduction), la réponse de `GET /sandbox/preferences/extensions` est fournie
 * par la recette, et c'est dit. L'import par l'administrateur est éprouvé par les tests de l'API.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] OUT=atelier-captures/extensions-commandes node apps/web/e2e/extensions-commandes.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions-commandes";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const paquet = JSON.parse(readFileSync(new URL("./donnees/essai-commandes.fadi-addon.json", import.meta.url), "utf8"));
const ID = paquet.fiche.id;

// ——— Installation de l'extension d'essai.
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
  await inscrireDansLaPage(page, `extcmd-${langue}-${Date.now()}@example.com`, "extensions-commandes-ci-123", BASE);
  await page.waitForURL(/\/(accueil|projets)$/);
  if (langue === "en") await page.evaluate(() => window.localStorage.setItem("fadi.langue", "en"));
  const recues = page.waitForResponse((r) => new URL(r.url()).pathname === "/sandbox/preferences/extensions");
  await page.goto(`${BASE}/sandbox`);
  await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
  await page.waitForFunction(() => !!window.fadiPlanche);
  const reponse = await recues;
  return { context, page, reponse };
}
const etat = (page) => page.evaluate(() => {
  const P = window.fadiPlanche;
  const m = P.modele();
  return { faces: Object.keys(m.racine.faces).length, aretes: Object.keys(m.racine.aretes).length, objets: Object.values(m.racine.occurrences).map((o) => o.nom ?? m.definitions[o.definition]?.nom ?? ""), definitions: Object.keys(m.definitions).length, pas: P.pas(), selection: P.selection() };
});
const avis = (page) => page.locator("[data-planche-avis-extension]").evaluateAll((l) => l.map((a) => ({ genre: a.dataset.genre, nom: a.querySelector("strong")?.textContent ?? "", texte: a.querySelector("[data-planche-avis-texte]")?.textContent ?? "" })));
const dernierAvis = async (page) => (await avis(page)).pop() ?? { genre: "", nom: "", texte: "" };
const attendreAvis = (page, n) => page.waitForFunction((k) => document.querySelectorAll("[data-planche-avis-extension]").length >= k, n, { timeout: 15000 });
const fermerAvis = async (page) => {
  while ((await page.locator("[data-planche-avis-fermer]").count()) > 0) await page.locator("[data-planche-avis-fermer]").first().click();
};
const ouvrirListe = async (page) => {
  await page.locator("[data-planche-recherche]").first().click();
  await page.locator("[data-planche-outils-liste]").waitFor();
};
const commande = (page, id) => page.locator(`[data-outils-commande="extension:${ID}:${id}"]`);

// ——— 1. Français : liste « Outils », exécution, avis, saisie, échecs.
{
  const { page, reponse } = await ouvrir("fr");
  const corps = await reponse.json().catch(() => null);
  check("le serveur rend l'extension installée au compte connecté", reponse.status() === 200 && corps?.extensions?.some((x) => x.fiche?.id === ID), `HTTP ${reponse.status()}`);

  await ouvrirListe(page);
  const famille = page.locator(`[data-outils-extension-installee="${ID}"]`);
  await famille.waitFor();
  const tete = famille.locator("[data-outils-famille]");
  check("liste « Outils » : une famille au nom de l'extension, repliée, avec la pastille « extension »", (await tete.getAttribute("aria-expanded")) === "false" && /Essai des commandes/.test(await tete.textContent()) && (await famille.locator("[data-outils-pastille-extension]").textContent()) === "extension");
  const groupes = await page.locator("[data-planche-outils-liste] [data-outils-groupe]").evaluateAll((l) => l.map((g) => g.dataset.outilsGroupe));
  check("la famille de l'extension vient après les groupes livrés", groupes.at(-1) === `installee:${ID}`, groupes.slice(-3).join(" · "));
  await tete.click();
  const lignes = await famille.locator("[data-outils-commande]").evaluateAll((l) => l.map((b) => ({ id: b.dataset.outilsCommande, nom: b.querySelector(".planche-outils-libelle")?.textContent, raccourci: b.querySelector("kbd")?.textContent, image: b.querySelector("img.planche-extension-icone")?.getAttribute("src") ?? "" })));
  check("cinq commandes, chacune avec son nom, son raccourci et sa propre icône (image du paquet)", lignes.length === 5 && lignes.every((l) => l.nom && l.raccourci && l.image.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")) && new Set(await famille.locator("img.planche-extension-icone").evaluateAll((l) => l.map((i) => i.getAttribute("src")))).size === 5, lignes.map((l) => `${l.nom} (${l.raccourci})`).join(" · "));
  check("l'icône est une image : rien du dessin SVG n'entre dans la page", (await famille.locator(".planche-outils-nom svg path[d^='M4 8l8-4']").count()) === 0);
  const etiquette = famille.locator(`[data-outils-etiquette="extension:${ID}"]`).first();
  check("chaque ligne porte l'étiquette de la barre de l'extension", (await famille.locator(`[data-outils-etiquette="extension:${ID}"]`).count()) === 5 && /Essai des commandes/.test(await etiquette.textContent()) && (await etiquette.getAttribute("aria-checked")) === "false");
  await famille.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "1-famille-dans-outils.png") });

  // Barre de l'extension.
  await etiquette.click();
  const barre = page.locator(`[data-barre-outils="extension:${ID}"]`);
  await barre.waitFor();
  check("l'étiquette affiche la barre de l'extension : cinq boutons, icônes du paquet", (await barre.locator("[data-barre-outils-entree]").count()) === 5 && (await barre.locator("img.planche-extension-icone").count()) === 5 && (await etiquette.getAttribute("aria-checked")) === "true");
  await page.locator("[data-outils-recherche]").fill("boite mesure");
  check("recherche : la commande de l'extension est trouvée par son nom", (await page.locator("[data-planche-outils-liste] [data-outils-commande]").count()) === 1 && (await commande(page, "boite-sur-mesure").count()) === 1);
  await page.locator("[data-outils-recherche]").fill("");

  // Commande qui dessine : une opération, un pas d'annulation, sélection posée, avis.
  const avant = await etat(page);
  await commande(page, "poser-boite").click();
  await attendreAvis(page, 1);
  const apres = await etat(page);
  check("« Poser une boîte » : la boîte est dessinée et groupée, en un seul pas d'annulation", apres.pas === avant.pas + 1 && apres.objets.length === avant.objets.length + 1 && apres.objets.includes("Boîte"), `pas ${avant.pas} → ${apres.pas}, objets ${apres.objets.join(", ")}`);
  check("la sélection demandée par l'extension est posée", apres.selection.length === 1);
  let a = await dernierAvis(page);
  check("avis de l'extension au-dessus de la barre d'état, à son nom", a.genre === "info" && a.nom === "Essai des commandes" && a.texte === "Boîte posée.", JSON.stringify(a));
  const cadre = await page.locator("[data-planche-cadre]").boundingBox();
  const boiteAvis = await page.locator("[data-planche-avis-extension]").first().boundingBox();
  const pied = await page.locator("[data-planche-etat]").boundingBox();
  check("l'avis tient dans le dessin, au-dessus de la barre d'état", boiteAvis.y >= cadre.y && boiteAvis.y + boiteAvis.height <= pied.y + 1 && boiteAvis.x >= cadre.x, `avis bas ${Math.round(boiteAvis.y + boiteAvis.height)}, barre d'état ${Math.round(pied.y)}`);
  await page.locator("[data-planche-etat]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "2-avis.png") });
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Control+z");
  const annule = await etat(page);
  check("Ctrl+Z défait toute la commande d'un coup", annule.pas === avant.pas && annule.objets.length === avant.objets.length && annule.faces === avant.faces);
  await page.keyboard.press("Control+y");
  await fermerAvis(page);
  check("l'avis se ferme par son bouton", (await avis(page)).length === 0);

  // Raccourci clavier de la commande.
  const avantRaccourci = await etat(page);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Alt+Shift+F4");
  await attendreAvis(page, 1);
  a = await dernierAvis(page);
  check("raccourci Alt+Maj+F4 : « Compter le dessin » s'exécute, sans rien modifier", /face\(s\).*arête\(s\).*1 objet\(s\)\.$/.test(a.texte) && (await etat(page)).pas === avantRaccourci.pas, a.texte);
  await fermerAvis(page);

  // Fenêtre de saisie.
  await barre.locator(`[data-barre-outils-entree="extension:${ID}:boite-sur-mesure"]`).click();
  const dialogue = page.locator("[data-planche-saisie-extension]");
  await dialogue.waitFor();
  check("fenêtre de saisie : titre de l'extension, mention « Demandé par l'extension »", (await dialogue.locator("h3").textContent()) === "Dimensions de la boîte" && (await dialogue.locator("[data-planche-saisie-origine]").textContent()) === "Demandé par l'extension « Essai des commandes »");
  const champs = await dialogue.locator("[data-saisie-champ]").evaluateAll((l) => l.map((c) => `${c.dataset.saisieChamp}:${c.tagName.toLowerCase()}${c.type === "checkbox" ? ":case" : ""}=${c.type === "checkbox" ? c.checked : c.value}`));
  check("six champs : texte, nombres (virgule décimale), liste, case", champs.join(" ") === "nom:input=Boîte largeur:input=2 profondeur:input=1 hauteur:input=0,5 forme:select=pleine grouper:input:case=true", champs.join(" "));
  check("le premier champ a le focus", await dialogue.locator('[data-saisie-champ="nom"]').evaluate((c) => c === document.activeElement));
  await page.screenshot({ path: join(OUT, "3-saisie.png") });
  // Le délai de 5 s de la commande ne court pas pendant la saisie.
  await page.waitForTimeout(6000);
  check("la fenêtre reste ouverte au-delà de 5 s : le temps de l'utilisateur ne compte pas", (await dialogue.count()) === 1 && (await avis(page)).length === 0);
  await dialogue.locator('[data-saisie-champ="largeur"]').fill("grand");
  await dialogue.locator("[data-planche-saisie-valider]").click();
  check("valeur illisible : refusée dans la fenêtre, l'extension ne reçoit rien", (await dialogue.locator("[data-planche-saisie-erreur]").textContent()) === "Largeur : un nombre est attendu." && (await dialogue.count()) === 1);
  await dialogue.locator('[data-saisie-champ="largeur"]').fill("500");
  await dialogue.locator("[data-planche-saisie-valider]").click();
  check("valeur hors bornes : refusée avec la borne déclarée", (await dialogue.locator("[data-planche-saisie-erreur]").textContent()) === "Largeur : 100 au plus.");
  await dialogue.locator('[data-saisie-champ="largeur"]').fill("2,5");
  await dialogue.locator('[data-saisie-champ="nom"]').fill("Socle");
  const avantSaisie = await etat(page);
  await dialogue.locator('[data-saisie-champ="hauteur"]').press("Enter");
  await attendreAvis(page, 1);
  const apresSaisie = await etat(page);
  a = await dernierAvis(page);
  check("saisie validée : la boîte est dessinée aux dimensions saisies, en un seul pas, au nom saisi", (await dialogue.count()) === 0 && apresSaisie.pas === avantSaisie.pas + 1 && apresSaisie.objets.includes("Socle") && a.texte === "Boîte dessinée : 2.5 × 1 × 0.5 m", `${a.texte} · ${apresSaisie.objets.join(", ")}`);
  await fermerAvis(page);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Alt+Shift+F3");
  await dialogue.waitFor();
  await page.keyboard.press("Escape");
  await attendreAvis(page, 1);
  a = await dernierAvis(page);
  check("Échap annule la saisie : l'extension reçoit « rien », rien n'est dessiné", (await dialogue.count()) === 0 && a.genre === "alerte" && a.texte === "Saisie annulée : rien n'a été dessiné." && (await etat(page)).pas === apresSaisie.pas, JSON.stringify(a));
  await fermerAvis(page);

  // Échec et délai : rien n'est appliqué, l'avis le dit.
  const avantEchec = await etat(page);
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Alt+Shift+F7");
  await attendreAvis(page, 1);
  a = await dernierAvis(page);
  check("commande qui échoue : rien n'est appliqué, avis rouge", a.genre === "arret" && a.texte === "« Échouer (essai) » a échoué : essai d'échec. Rien n'a été modifié." && (await etat(page)).pas === avantEchec.pas && (await etat(page)).aretes === avantEchec.aretes, a.texte);
  await fermerAvis(page);
  await page.keyboard.press("Alt+Shift+F6");
  await ouvrirListe(page);
  await page.locator(`[data-outils-extension-installee="${ID}"] [data-outils-famille]`).waitFor();
  const occupee = commande(page, "compter");
  check("pendant une commande, les autres commandes de l'extension sont grisées et disent pourquoi", (await occupee.getAttribute("aria-disabled")) === "true" && /déjà en cours/.test(await occupee.getAttribute("title")));
  await page.keyboard.press("Escape");
  await attendreAvis(page, 1);
  a = await dernierAvis(page);
  check("commande qui ne répond plus : arrêtée après 5 s, rien n'est appliqué", a.genre === "arret" && a.texte === "Extension arrêtée : elle n'a pas répondu en 5 secondes. Rien n'a été modifié." && (await etat(page)).pas === avantEchec.pas, a.texte);
  await page.locator("[data-planche-etat]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "4-avis-arret.png") });
  await fermerAvis(page);
  // L'extension redémarre à la commande suivante.
  await page.locator("[data-planche-vue]").focus();
  await page.keyboard.press("Alt+Shift+F4");
  await attendreAvis(page, 1);
  check("après l'arrêt, l'extension redémarre à la commande suivante", (await dernierAvis(page)).genre === "info");
  await page.context().close();
}

// ——— 2. Anglais : libellés de la fiche et textes de la Planche.
{
  const { page } = await ouvrir("en");
  const anglais = await page.evaluate(() => document.documentElement.lang);
  await ouvrirListe(page);
  const famille = page.locator(`[data-outils-extension-installee="${ID}"]`);
  await famille.waitFor();
  await famille.locator("[data-outils-famille]").click();
  const noms = await famille.locator(".planche-outils-libelle").allTextContents();
  check("anglais : nom de l'extension, pastille « add-on » et libellés des commandes", anglais === "en" && /Commands trial/.test(await famille.locator("[data-outils-famille]").textContent()) && (await famille.locator("[data-outils-pastille-extension]").textContent()) === "add-on" && noms[0] === "Place a box", `${anglais} · ${noms.join(" · ")}`);
  await commande(page, "boite-sur-mesure").click();
  const dialogue = page.locator("[data-planche-saisie-extension]");
  await dialogue.waitFor();
  check("anglais : la commande reçoit la langue ; mention et boutons traduits", (await dialogue.locator("h3").textContent()) === "Box dimensions" && (await dialogue.locator("[data-planche-saisie-origine]").textContent()) === "Requested by the add-on “Commands trial”" && (await dialogue.locator("[data-planche-saisie-annuler]").textContent()) === "Cancel" && (await dialogue.locator('[data-saisie-champ="hauteur"]').inputValue()) === "0.5");
  await dialogue.locator("[data-planche-saisie-annuler]").click();
  await attendreAvis(page, 1);
  check("anglais : avis de l'extension", (await dernierAvis(page)).texte === "Input cancelled: nothing was drawn.");
  await page.context().close();
}

if (sql) {
  await sql.query("DELETE FROM addon_packages WHERE addon_id = $1", [ID]);
  await sql.end();
}
await browser.close();
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nRecette des commandes d'extension : tout est conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
