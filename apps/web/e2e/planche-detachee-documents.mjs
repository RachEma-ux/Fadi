/**
 * Recette « Planche détachée » et « barre du mode Documents » dans un vrai navigateur :
 * - Détacher emporte TOUTE la Planche (dessin, barre d'outils, colonne de panneaux, barre d'état, Mesures) dans la
 *   fenêtre séparée ; ses boutons y répondent (outil choisi, panneau ouvert) ; Rattacher la ramène dans la page.
 *   La fenêtre Document Picture-in-Picture est simulée par un cadre de même origine (le navigateur sans écran n'en
 *   ouvre pas) : même contrat — une `Window` séparée, avec son propre document.
 * - Le mode Documents ne garde dans la barre que Fichier, les modes, annuler / rétablir et l'état d'enregistrement ;
 *   le niveau actif se choisit dans la liste des documents ; les raccourcis d'outils n'y agissent pas.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-detachee-documents.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 900 } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));
page.on("dialog", (d) => void d.accept());
// Fenêtre séparée simulée : un cadre de même origine, posé par-dessus la page, rendu comme une `Window`.
await page.addInitScript(() => {
  // `documentPictureInPicture` natif est en lecture seule : remplacé par une propriété définie.
  Object.defineProperty(window, "documentPictureInPicture", { configurable: true, value: {
    requestWindow: async ({ width, height }) => {
      const f = document.createElement("iframe");
      f.setAttribute("data-fenetre-detachee", "");
      f.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:2px solid #333;z-index:99999;background:#fff`;
      document.body.appendChild(f);
      f.contentWindow.close = () => {
        f.contentWindow.dispatchEvent(new Event("pagehide"));
        f.remove();
      };
      return f.contentWindow;
    },
  } });
});

const api = async (methode, chemin, data) => {
  const r = await page.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `detache-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "detache-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · détachée" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });

// 1. Planche détachée : barre d'outils, panneaux et pied partent avec le dessin.
await page.locator("[data-mode-planche]").click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.locator("[data-planche-detacher]").click();
await page.waitForSelector("[data-fenetre-detachee]");
const fenetre = page.frameLocator("[data-fenetre-detachee]");
await fenetre.locator(".planche-outils").waitFor({ timeout: 10000 }).catch(() => {});
const compte = async (sel) => fenetre.locator(sel).count();
check(
  "détachée : la fenêtre porte le dessin, la barre d'outils, la colonne de panneaux, la barre d'état et Mesures",
  (await compte("[data-planche-vue] canvas")) === 1 && (await compte("[data-planche-outil]")) > 3 && (await compte("[data-planche-panneau-icone]")) >= 4 && (await compte("[data-planche-etat]")) === 1 && (await compte("[data-planche-mesures]")) === 1,
  `outils ${await compte("[data-planche-outil]")} · panneaux ${await compte("[data-planche-panneau-icone]")}`,
);
check("détachée : la page ne garde que la carte « Rattacher »", (await page.locator("[data-planche-detache-carte]").count()) === 1 && (await page.locator("[data-planche]").count()) === 0);
const visible = await fenetre.locator(".planche-outils").boundingBox();
check("détachée : la barre d'outils est affichée (styles de la page recopiés)", !!visible && visible.width > 20 && visible.height > 100, JSON.stringify(visible));
const outil = await fenetre.locator("[data-planche-outil]:not([disabled])").nth(1).getAttribute("data-planche-outil");
await fenetre.locator(`[data-planche-outil="${outil}"]`).first().click();
check(`détachée : un clic sur l'outil « ${outil} » le choisit`, (await fenetre.locator("[data-planche]").getAttribute("data-outil-actif")) === outil);
await fenetre.locator('[data-planche-panneau-icone="materiaux"]').click();
check("détachée : la colonne ouvre le panneau Matériaux", (await compte('[data-planche-panneau="materiaux"]')) === 1);
// Champ créé APRÈS le détachement (autre document) : la frappe y reste, sans déclencher de raccourci d'outil.
const champ = fenetre.locator('[data-planche-panneau="materiaux"] input[type="text"], [data-planche-panneau="materiaux"] input:not([type])').first();
await champ.click();
await champ.pressSequentially("gk12");
check("détachée : la frappe dans un champ du panneau reste dans le champ (aucun raccourci)", (await champ.inputValue()) === "gk12" && (await fenetre.locator("[data-planche]").getAttribute("data-outil-actif")) === outil, await champ.inputValue());
await page.screenshot({ path: `${OUT}/planche-detachee.png` });
await fenetre.locator('[data-planche-panneau="materiaux"] .canevas-fermer').click();
await fenetre.locator("[data-planche-detacher]").click();
await page.waitForSelector("[data-planche] .planche-outils", { timeout: 10000 }).catch(() => {});
check(
  "rattachée : la Planche revient dans la page avec son dessin et ses outils, même outil actif",
  (await page.locator("[data-fenetre-detachee]").count()) === 0 && (await page.locator("[data-planche-vue] canvas").count()) === 1 && (await page.locator("[data-planche-outil]").count()) > 3 && (await page.locator("[data-planche]").getAttribute("data-outil-actif")) === outil,
);
await page.locator('[data-planche-panneau-icone="instructeur"]').click();
check("rattachée : les boutons répondent toujours dans la page", (await page.locator('[data-planche-panneau-icone="instructeur"]').getAttribute("aria-pressed")) === "true");

// 2. Mode Documents : la barre ne garde que ce qui sert aux documents.
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector(".atelier-docs", { timeout: 30000 });
const affiche = (sel) => page.locator(sel).first().isVisible();
const masques = { niveau: ".barre-niveau", palette: ".barre-palette", affichage: ".barre-affichage", accrochages: ".barre-accrochages", cadrer: '.atelier-n-barre button:text-is("Cadrer")', canevas: "[data-disposition-canevas]", exporter: ".barre-exports", importer: ".barre-imports", harmonie: "#atelier-harmonie-button", echelle: ".etat-echelle" };
const restes = [];
for (const [nom, sel] of Object.entries(masques)) if ((await page.locator(sel).count()) && (await affiche(sel))) restes.push(nom);
check("Documents : niveau, recherche d'outil, affichage, accrochages, cadrer, canevas, échanges du modèle, Harmonie et échelle du plan absents", restes.length === 0, restes.join(", "));
check("Documents : Fichier, modes, annuler / rétablir et état d'enregistrement restent", (await affiche("[data-menu-principal]")) && (await affiche(".barre-mode")) && (await affiche('[aria-label="Annuler et rétablir"]')) && (await affiche(".barre-sync")));
await page.locator("[data-menu-principal] > summary").click();
check("Documents : le menu Fichier n'offre plus Exporter / Importer du modèle, garde Imprimer", (await page.locator('[data-menu="exporter"]').count()) === 0 && (await page.locator('[data-menu="importer"]').count()) === 0 && (await page.locator('[data-menu="imprimer"]').count()) === 1);
await page.locator("[data-menu-principal] > summary").click();
const options = await page.locator("[data-docs-niveau] option").evaluateAll((os) => os.map((o) => o.value));
await page.locator("[data-docs-niveau]").selectOption(options[1]);
check("Documents : le niveau actif se choisit dans la liste des documents", (await page.locator("[data-docs-niveau]").inputValue()) === options[1], `${options.length} niveaux`);
const outilAvant = await page.locator(".atelier-n").getAttribute("data-outil-actif");
await page.locator(".docs-tableau, .atelier-docs").first().click({ position: { x: 600, y: 400 } }).catch(() => {});
await page.keyboard.press("m");
await page.keyboard.press("Control+k");
check("Documents : raccourcis d'outils et palette sans effet", (await page.locator(".atelier-n").getAttribute("data-outil-actif")) === outilAvant && (await page.locator(".palette-fond").count()) === 0);
await page.screenshot({ path: `${OUT}/documents-barre.png` });
await page.locator('.barre-mode button:text-is("Plan")').click();
check("Plan : la barre complète revient, sur le niveau choisi dans Documents", (await affiche(".barre-niveau")) && (await affiche(".barre-palette")) && (await affiche(".barre-exports")) && (await page.locator(".barre-niveau select").inputValue()) === options[1]);

// 3. Téléphone (390 px) : barre de l'Atelier sur une rangée défilante, rien ne déborde de la page, tous les modes
//    atteignables ; Planche : colonne de panneaux en icônes, barre du haut défilante, outils tous atteignables.
const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
const p2 = await tel.newPage();
p2.on("pageerror", (e) => erreursPage.push(e.message));
await p2.goto(`${BASE}/projets/${pid}?module=atelier`);
await p2.waitForSelector(".atelier-n-barre", { timeout: 30000 });
await p2.waitForTimeout(1500);
const hauteurBarre = (await p2.locator(".atelier-n-barre").boundingBox()).height;
const deborde = () => p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("téléphone : la barre de l'Atelier tient sur une rangée (au lieu de quatre)", hauteurBarre < 70, `${Math.round(hauteurBarre)} px`);
check("téléphone : la page ne déborde pas en largeur", !(await deborde()));
const atteignables = [];
for (const m of ["Plan", "3D", "Documents", "Planche"]) {
  const b = p2.locator(`.barre-mode button:text-is("${m}")`);
  await b.scrollIntoViewIfNeeded();
  const r = await b.boundingBox();
  if (r && r.x >= 0 && r.x + r.width <= 391) atteignables.push(m);
}
check("téléphone : chaque mode s'atteint en faisant défiler la barre", atteignables.length === 4, atteignables.join(", "));
await p2.locator("[data-mode-planche]").tap();
await p2.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await p2.waitForTimeout(800);
check("téléphone, Planche : colonne de panneaux en icônes (les étiquettes ne recouvrent plus le dessin)", (await p2.locator("[data-planche]").getAttribute("class")).includes("colonne-repliee") && !(await p2.locator(".planche-colonne .canevas-etiquette").first().isVisible()));
check("téléphone, Planche : la page ne déborde pas en largeur", !(await deborde()));
const det = p2.locator("[data-planche-detacher]");
await det.scrollIntoViewIfNeeded();
const rd = await det.boundingBox();
check("téléphone, Planche : « Détacher » s'atteint en faisant défiler la barre du haut", !!rd && rd.x + rd.width <= 391);
const nbOutils = await p2.locator("[data-planche-outil]").count();
const dernier = p2.locator(".planche-outils [data-planche-outil]").last();
await dernier.scrollIntoViewIfNeeded();
check("téléphone, Planche : le dernier outil du rail s'atteint en faisant défiler", await dernier.isVisible(), `${nbOutils} outils`);
await p2.screenshot({ path: `${OUT}/telephone-planche.png` });
await tel.close();

check("aucune erreur de page", erreursPage.length === 0, erreursPage.join(" | "));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Tout est vert.");
process.exit(echecs ? 1 : 0);
