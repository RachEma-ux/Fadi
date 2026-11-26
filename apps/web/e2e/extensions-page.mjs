/**
 * Recette de la page « Extensions » de la barre latérale (maquettes validées le 25 novembre 2026) :
 * icône entre Organisations et Paramètres, deux options « Installées » / « Disponibles », un geste par extension,
 * choix enregistré sur le compte, appliqué par la Planche, conservé au rechargement ; téléphone ; anglais « Add-ons ».
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/extensions node apps/web/e2e/extensions-page.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/extensions";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("pageerror", (e) => erreurs.push(e.message));

await inscrireDansLaPage(page, `extensions-${Date.now()}@example.com`, "extensions-page-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);

// Barre latérale : l'entrée existe, entre Organisations et Paramètres, avec une icône.
const lien = page.locator("[data-nav-extensions]");
await lien.waitFor();
const ordre = await page.locator(".app-nav-secondary a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
const i = ordre.indexOf("/extensions");
check("barre latérale : « Extensions » entre Organisations et Paramètres", i > 0 && ordre[i - 1] === "/organisations" && ordre[i + 1] === "/parametres", ordre.join(" "));
check("barre latérale : l'entrée porte une icône et son nom", (await lien.locator("svg").count()) === 1 && (await lien.getAttribute("aria-label")) === "Extensions");
await lien.click();
await page.waitForURL(`${BASE}/extensions`);
const racine = page.locator("[data-extensions-page]");
await racine.locator("[data-extensions-liste] [data-extension]").first().waitFor();
check("barre latérale : l'entrée est marquée active sur la page", (await lien.getAttribute("class"))?.includes("active") === true);

const ids = () => racine.locator("[data-extension]").evaluateAll((l) => l.map((x) => x.getAttribute("data-extension")));
const option = (o) => racine.locator(`[data-extensions-option="${o}"]`);
const compte = async (o) => Number(await option(o).locator(".extensions-compte").textContent());
check("deux options seulement : Installées et Disponibles", (await racine.locator("[data-extensions-option]").count()) === 2 && (await option("installees").getAttribute("aria-selected")) === "true");
const installeesDepart = await ids();
check("Installées, compte neuf : les extensions actives d'origine", JSON.stringify(installeesDepart) === JSON.stringify(["bois", "volumes"]), installeesDepart.join(", "));
check("Installées : un seul geste, « Désinstaller »", (await racine.locator("[data-extension-desinstaller]").count()) === installeesDepart.length && (await racine.locator("[data-extension-installer], input[type=checkbox], [role=switch]").count()) === 0);
check("carte : nom, description, version et contenu", /Bois et menuiserie/.test(await racine.locator('[data-extension="bois"]').innerText()) && /Version 1\.0\.0/.test(await racine.locator('[data-extension="bois"]').innerText()) && /6 outils · 5 commandes · 1 panneau/.test(await racine.locator('[data-extension="bois"]').innerText()));
await page.screenshot({ path: join(OUT, "extensions-1-installees.png") });

await option("disponibles").click();
const disponiblesDepart = await ids();
check("Disponibles : le reste du catalogue, avec « Installer »", disponiblesDepart.includes("controle") && !disponiblesDepart.includes("bois") && (await racine.locator("[data-extension-installer]").count()) === disponiblesDepart.length, disponiblesDepart.join(", "));
check("les compteurs des options suivent les listes", (await compte("installees")) === installeesDepart.length && (await compte("disponibles")) === disponiblesDepart.length);
await page.screenshot({ path: join(OUT, "extensions-2-disponibles.png") });

// Installer : l'extension quitte « Disponibles », rejoint « Installées », et le compte l'enregistre.
const [ecriture] = await Promise.all([
  page.waitForResponse((r) => r.url() === `${BASE}/sandbox/preferences` && r.request().method() === "PUT"),
  racine.locator('[data-extension="controle"] [data-extension-installer]').click(),
]);
check("Installer : enregistré sur le compte (200)", ecriture.status() === 200 && (await ecriture.json()).extensions.controle === true);
await racine.locator('[data-extension="controle"]').waitFor({ state: "detached" });
check("Installer : l'extension quitte « Disponibles »", !(await ids()).includes("controle") && (await compte("disponibles")) === disponiblesDepart.length - 1);
await option("installees").click();
check("Installer : elle est dans « Installées »", (await ids()).includes("controle") && (await compte("installees")) === installeesDepart.length + 1);
await page.screenshot({ path: join(OUT, "extensions-3-apres-installation.png") });

// La Planche applique le choix : le panneau de l'extension installée est offert, celui d'une extension non installée ne l'est pas.
await page.goto(`${BASE}/sandbox`);
await page.locator('[data-planche-panneau-icone="controle"]').waitFor();
check("Planche : l'extension installée apporte son panneau", (await page.locator('[data-planche-panneau-icone="controle"]').count()) === 1 && (await page.locator('[data-planche-panneau-icone="emplacement"]').count()) === 0);

// Désinstaller, puis rechargement : le choix est celui du compte.
await page.goto(`${BASE}/extensions`);
await racine.locator('[data-extension="bois"] [data-extension-desinstaller]').click();
await racine.locator('[data-extension="bois"]').waitFor({ state: "detached" });
await page.reload();
await racine.locator("[data-extensions-liste] [data-extension]").first().waitFor();
const apres = await ids();
check("Désinstaller : conservé au rechargement", !apres.includes("bois") && apres.includes("controle") && apres.includes("volumes"), apres.join(", "));
await option("disponibles").click();
check("Désinstaller : l'extension redevient disponible", (await ids()).includes("bois"));

// Hors connexion : les gestes sont désactivés et la page le dit.
await context.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event("offline")));
await racine.locator('[data-extension-installer][disabled]').first().waitFor();
check("hors connexion : installer est désactivé", (await racine.locator("[data-extension-installer]:not([disabled])").count()) === 0);
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));

// Téléphone : une colonne, rien ne déborde.
const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await context.storageState() });
const p2 = await tel.newPage();
p2.on("pageerror", (e) => erreurs.push(e.message));
await p2.goto(`${BASE}/extensions`);
await p2.locator("[data-extensions-liste] [data-extension]").first().waitFor();
const debord = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("téléphone : aucun défilement horizontal", debord <= 0, String(debord));
const largeurs = await p2.evaluate(() => { const c = document.querySelector("[data-extension]"); return [c.querySelector(".extensions-texte").getBoundingClientRect().width, c.getBoundingClientRect().width]; });
check("téléphone : le texte de la carte garde la largeur de la carte, le bouton passe dessous", largeurs[0] > largeurs[1] * 0.6, largeurs.map(Math.round).join(" / "));
await p2.screenshot({ path: join(OUT, "extensions-4-telephone.png") });
await tel.close();

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs === 0 ? "\nPage Extensions : recette réussie." : `\nPage Extensions : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
