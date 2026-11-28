/**
 * Recette « Emplacements Projets » (27 novembre 2026) : dans GeoData, le bouton du bas de la mini-barre ouvre le volet,
 * un emplacement est saisi et enregistré (base), puis « Ouvrir dans Planche » le pose comme Emplacement de la Planche
 * du Sandbox ; la Planche le retrouve aussi dans sa liste « Emplacements geoData ». Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 API_LOG=api.log node apps/web/e2e/geodata-emplacements.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/geodata/captures";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`); if (!ok) echecs++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const page = await (await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 })).newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
await inscrireDansLaPage(page, `empl-${Date.now()}@example.com`, "emplacements-pass-123", BASE);
await page.waitForURL(/\/(projets|accueil)/);

await page.goto(`${BASE}/geodata`);
const bouton = page.locator("[data-gd-mini-emplacements]");
await bouton.waitFor();
check("bouton « Emplacements Projets » en bas de la mini-barre", await bouton.getAttribute("aria-label") === "Emplacements Projets"
  && await page.locator("[data-gd-barre-recherche] .gd-outil").last().getAttribute("data-gd-mini-emplacements") !== null);
await bouton.click();
await page.locator("[data-gd-emplacements]").waitFor();
check("le volet s'ouvre", await page.locator("[data-gd-volet-ouvert='emplacements']").count() === 1);
const champ = (c) => page.locator(`[data-gd-emplacement-champ='${c}']`);
await champ("lieu").fill("Parcelle Anfa");
await champ("latitude").fill("33,5731");
await champ("longitude").fill("-7,5898");
await champ("altitude").fill("45");
await champ("nord").fill("12");
await page.locator("[data-gd-emplacement-enregistrer]").click();
const ligne = page.locator("[data-gd-emplacement]").first();
await ligne.waitFor();
check("emplacement enregistré et listé", (await ligne.textContent())?.includes("Parcelle Anfa"));
await page.screenshot({ path: `${OUT}/emplacements-projets-geodata.png` });
const lien = await page.locator("[data-gd-emplacement-planche]").first().getAttribute("href");
check("lien « Ouvrir dans Planche »", /^\/sandbox\?emplacement-geodata=gdempl_/.test(lien ?? ""), lien ?? "");

await page.locator("[data-gd-emplacement-planche]").first().click();
await page.waitForURL(/\/sandbox/);
const panneau = page.locator("[data-planche-lieu]");
await panneau.waitFor({ timeout: 60000 });
await page.waitForFunction(() => document.querySelector("[data-planche-lieu]")?.getAttribute("data-planche-lieu") === "renseigne", null, { timeout: 30000 }).catch(() => undefined);
const valeur = async (c) => page.locator(`[data-planche-lieu-champ='${c}']`).inputValue();
check("Planche : l'emplacement geoData devient l'Emplacement", await panneau.getAttribute("data-planche-lieu") === "renseigne"
  && await valeur("lieu") === "Parcelle Anfa" && await valeur("latitude") === "33,5731" && await valeur("longitude") === "-7,5898" && await valeur("nord") === "12",
  `${await valeur("lieu")} ${await valeur("latitude")} ${await valeur("longitude")} ${await valeur("nord")}`);
// Cas 2, lot 5 (n° 5) : plus de champ « Altitude » ; l'altitude reçue déclare le ±0,00 unique (non déclaré jusque-là).
check("Planche : l'altitude geoData devient le ±0,00 du projet", await page.locator("[data-planche-zero]").getAttribute("data-planche-zero") === "45", await page.locator("[data-planche-zero]").getAttribute("data-planche-zero"));
check("adresse nettoyée du paramètre", !page.url().includes("emplacement-geodata"), page.url());
await page.locator("[data-planche-lieu-geodata-charger]").click();
await page.locator("[data-planche-lieu-geodata-choix]").waitFor();
check("Planche : liste « Emplacements geoData »", (await page.locator("[data-planche-lieu-geodata-choix] option").allTextContents()).includes("Parcelle Anfa"));
await page.locator("[data-planche-lieu]").screenshot({ path: `${OUT}/emplacements-projets-planche.png` });
check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette Emplacements Projets : tout est vert.");
process.exit(echecs ? 1 : 0);
