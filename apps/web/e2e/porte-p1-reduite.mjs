/**
 * Porte P1 réduite (P2-0, cahier P2 §5 ; D-176, D-181) : dans UN SEUL projet et UN SEUL écran de l'Atelier, les ontologies
 * existantes se combinent sans changement d'édition ni d'écran (T01) — un mur (bâtiment), une esquisse (dessin), une
 * Planche avec une face (géométrie libre), une feuille (documents), une version nommée (collaboration) ; même journal,
 * même révision ; téléphone 390 px ; axe-core. Résultat déclaré « porte partielle : mécanique absente » — la porte
 * P1 → P2 complète se joue sur P.118-M au lot P2-2 (`docs/atelier/projet-mixte-reference.md`).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/porte-p1-reduite.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`); if (!ok) echecs += 1; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null) }; };
const navigations = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `porte-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "porte-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "Porte P1 réduite" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const journal = async () => (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.map((e) => e.label);
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const revision = async () => (await modele()).revision;

await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0; // la porte commence ici : seules les navigations à partir de l'Atelier comptent
const r0 = await revision();
const compter = async (classe) => Object.values((await modele()).modele.objets).filter((o) => o.classe === classe).length;
const murs0 = await compter("mur"), esq0 = await compter("esquisse");

// 1. Bâtiment : un niveau d'essai et un mur au clavier (M, clic, 4, Entrée).
await page.locator(".nav-ajout").click();
await page.locator(".navigateur .nav-formulaire input").first().fill("Porte P1");
await page.locator(".navigateur .nav-formulaire input").nth(1).fill("30");
await page.locator('.navigateur .nav-formulaire button[type="submit"]').click();
await page.waitForFunction(() => [...document.querySelectorAll(".nav-niveaux li")].some((e) => e.textContent.includes("Porte P1")), null, { timeout: 30000 });
await page.locator('.nav-niveaux button:has-text("Porte P1")').click();
await page.waitForTimeout(200);
const box = await page.locator(".plan2d").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await page.keyboard.press("Escape");
await page.keyboard.press("m");
await page.mouse.click(cx - 120, cy);
await page.keyboard.type("4");
await page.keyboard.press("Enter");
await enregistre();
check("bâtiment : un mur tracé au clavier (M, clic, 4, Entrée) et enregistré", (await compter("mur")) === murs0 + 1, `${await compter("mur")} murs`);

// 2. Dessin : une ligne d'esquisse depuis la palette (Ctrl K, « ligne », Entrée, deux clics).
await page.keyboard.press("Escape");
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("ligne");
await page.keyboard.press("Enter");
await page.mouse.click(cx + 60, cy + 80);
await page.mouse.click(cx + 180, cy + 80);
await page.keyboard.press("Escape");
await enregistre();
check("dessin : une ligne d'esquisse tracée depuis la palette (Ctrl K → « ligne »)", (await compter("esquisse")) === esq0 + 1, `${await compter("esquisse")} esquisses`);

// 3. Géométrie libre : mode Planche (même écran), un rectangle, Planche nommée.
await page.locator("[data-mode-planche]").click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.fadiPlanche);
const vue = page.locator("[data-planche-vue]");
await vue.focus();
const ecran = async (q) => { const b = await vue.locator("canvas").boundingBox(); const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q); return { x: b.x + e.x, y: b.y + e.y }; };
await page.keyboard.press("r");
const e0 = await ecran({ x: 0, y: 0, z: 0 });
await page.mouse.move(e0.x, e0.y, { steps: 3 }); await page.mouse.click(e0.x, e0.y);
await page.keyboard.type("4;3"); await page.keyboard.press("Enter"); await page.waitForTimeout(100);
if (!(await page.locator(".planche-menu-liste").count())) await page.locator("[data-planche-menu-ouvrir]").click();
await page.locator("[data-planche-nouvelle]").click();
await page.locator("[data-planche-volet-nom]").fill("Porte P1");
await page.locator("[data-planche-volet-valider]").click();
await page.waitForFunction(() => document.querySelector("[data-planche-menu-ouvrir]")?.getAttribute("data-planche-nom") === "Porte P1", null, { timeout: 10000 });
await enregistre();
const planches = Object.values((await modele()).modele.definitions).filter((d) => d.classe === "planche");
check("géométrie libre : Planche « Porte P1 » créée dans le même projet avec une face", planches.length === 1 && Object.keys(planches[0].params.modele.racine.faces).length === 1, JSON.stringify(planches.map((p) => p.params.nom)));
await page.screenshot({ path: `${OUT}/p2-porte-planche.png` });

// 4. Documents : une feuille A1 (mode Documents, même écran).
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector(".atelier-docs", { timeout: 30000 });
await page.locator(".docs-nouvelle > summary").click();
await page.locator('[data-nouvelle="feuille"]').click();
await page.waitForSelector('[data-detail="feuille"]', { timeout: 30000 });
await enregistre();
const feuilles = Object.values((await modele()).modele.definitions).filter((d) => d.classe === "feuille").length;
check("documents : une feuille créée (définition du modèle, même journal)", feuilles >= 1, `${feuilles} feuille(s)`);

// 5. Collaboration : version nommée depuis le panneau de droite.
await page.getByRole("button", { name: "Plan", exact: true }).click();
await page.waitForSelector(".plan2d", { timeout: 30000 });
await page.locator("#ver-nom").fill("Porte P1 réduite");
await page.locator('.ver-form:has(#ver-nom) button[type="submit"]').click();
await page.waitForSelector(".versions > .ver-info, .versions > .ver-erreur", { timeout: 60000 });
const texteVersion = (await page.locator(".versions > .ver-info, .versions > .ver-erreur").first().textContent()) ?? "";
check("collaboration : version nommée enregistrée à la révision courante", /Version « Porte P1 réduite » enregistrée/.test(texteVersion), texteVersion);

// 6. Un seul écran, un seul journal.
const r1 = await revision();
const j = await journal();
check("un seul écran : aucune navigation hors de la page de l'Atelier du projet pendant la porte", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : mur, esquisse, Planche et feuille sont des révisions successives du même projet", r1 >= r0 + 4 && /mur/i.test(j.join("|")) && /Planche/.test(j.join("|")) && /feuille/i.test(j.join("|")), `r${r0} → r${r1} ; ${j.slice(-6).join(" / ")}`);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));

// 7. Téléphone et axe-core.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal, modes Plan / 3D / Documents / Planche accessibles", (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) && (await page.locator("[data-mode-planche]").count()) === 1);
await page.screenshot({ path: `${OUT}/p2-porte-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

console.log("Porte P1 réduite : partielle par construction — mécanique absente (ontologie `mechanical` au lot P2-2, projet P.118-M).");
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Porte P1 réduite : tout est vert");
process.exit(echecs ? 1 : 0);
