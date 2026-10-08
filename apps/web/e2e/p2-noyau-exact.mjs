/**
 * Recette du lot P2-1 (noyau exact, D-177) dans un vrai navigateur : le noyau OCCT se charge à la demande dans un
 * Worker (jamais à l'ouverture) ; révolution d'une esquisse autour d'une ligne → aperçu (volume, empreinte) → création
 * revalidée par le serveur (même empreinte) ; soustraction exacte d'un mur (le mur reste paramétrique) ; export STEP ;
 * IFC avec Fadi_SolideExact ; import STEP ; 3D ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-noyau-exact.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`); if (!ok) echecs += 1; };
const mesurer = async (nom, fn) => { const t = performance.now(); const r = await fn(); console.log(`⏱ ${nom} : ${Math.round(performance.now() - t)} ms`); return r; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, acceptDownloads: true });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const requetesWasm = [];
page.on("request", (r) => { if (/\.wasm(\?|$)/.test(r.url())) requetesWasm.push(r.url()); });
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null), text: await r.text().catch(() => "") }; };

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `exact-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "exact-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P2-1 noyau exact" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const exacts = async () => Object.values((await modele()).modele.objets).filter((o) => o.classe === "solide-exact");
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
// Conversion modèle → écran déduite de la boîte du profil (x ∈ [1 ; 1,2], y ∈ [0 ; 1]) : les clics visent des points du
// modèle où un seul objet est présent (le mur d'essai traverse le profil, l'axe et le tube).
let versEcran = null;
const calibrer = async () => { const b = await page.locator(".plan2d [data-objet='profil-p21']").boundingBox(); const sx = b.width / 0.2, sy = b.height / 1; versEcran = (x, y) => ({ x: b.x + (x - 1) * sx, y: b.y + (1 - y) * sy }); };
// `page.mouse.click` ignore `modifiers` : les touches de modification sont tenues au clavier (Maj = ajouter à la sélection).
const cliquerModele = async (x, y, modifiers = []) => { const e = versEcran(x, y); for (const m of modifiers) await page.keyboard.down(m); await page.mouse.click(e.x, e.y); for (const m of modifiers) await page.keyboard.up(m); await page.waitForTimeout(80); };
const cadreModele = async (x0, y0, x1, y1) => { const a = versEcran(x0, y0), b = versEcran(x1, y1); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(120); };

await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
check("ouverture : aucun .wasm chargé (le noyau exact n'est jamais sur le chemin d'ouverture)", requetesWasm.length === 0, requetesWasm.join(" ; "));

// Niveau d'essai, rectangle (profil), ligne (axe) et mur par l'API de commandes (les gestes de tracé sont couverts par les recettes du lot 3a).
const rev0 = (await modele()).revision;
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const lot = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `exact-${Date.now()}`, baseRevision: rev0, contract: "atelier-commands/3", label: "Esquisses P2-1", commands: [
  { type: "niveau.creer", params: { id: "p21", nom: "P2-1", elevation: 40, hauteur: 3 } },
  { type: "esquisse.rectangle", params: { id: "profil-p21", niveauId: "p21", points: [pt(1, 0), pt(1.2, 1)] } },
  { type: "esquisse.ligne", params: { id: "axe-p21", niveauId: "p21", points: [pt(0, 0), pt(0, 1)] } },
  { type: "mur.tracer", params: { id: "mur-p21", niveauId: "p21", a: pt(-1, 0.5), b: pt(3, 0.5), epaisseur: { value: 0.2, unit: "m" }, hauteur: { value: 2, unit: "m" } } },
] });
check("esquisses et mur posés sur un niveau d'essai (contrat atelier-commands/3)", lot.status === 200, JSON.stringify(lot.body).slice(0, 200));
await page.reload();
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.locator('.nav-niveaux button:has-text("P2-1")').click();
await page.waitForSelector(".plan2d [data-objet='profil-p21']", { timeout: 15000 });

// Sélection du profil puis de l'axe (Ctrl ajoute), outil Solide exact depuis la palette.
await page.keyboard.press("Escape");
await calibrer();
await cadreModele(-0.3, 1.3, 1.4, -0.3); // cadre fenêtre : profil et axe entièrement dedans, le mur (4 m) non
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("solide exact");
await page.keyboard.press("Enter");
await page.waitForSelector("[data-outil-solide-exact]", { timeout: 15000 });
await mesurer("chargement du noyau exact à la demande (Worker)", async () => page.waitForFunction(() => document.querySelector("[data-noyau-exact]")?.dataset.noyauExact === "ok", null, { timeout: 90000 }));
check("noyau chargé dans un Worker après le choix de l'outil : un seul .wasm demandé, servi comme fichier séparé", requetesWasm.length === 1 && /occt-wasm/.test(requetesWasm[0] ?? ""), requetesWasm.join(" ; "));
await page.locator("#outil-operationExacte").selectOption("revolution");
await page.locator("#outil-angleRevolution").fill("360");
const etatOutil = async () => (await page.locator("[data-exact-pret], [data-exact-message]").first().textContent({ timeout: 10000 }).catch(() => "")) ?? "";
check("l'outil dit l'opération prête : révolution du profil, niveau P2-1", /Révolution 360°/.test(await etatOutil()), `${await etatOutil()} ; sélection : ${await page.evaluate(() => document.querySelectorAll(".plan2d .est-selectionne, .plan2d [data-selectionne]").length)}`);
await page.locator("[data-exact-apercu]").click();
await page.waitForSelector("[data-exact-resultat]", { timeout: 60000 });
const apercu = await page.locator("[data-exact-resultat]").textContent();
const volumeTube = Math.PI * (1.2 ** 2 - 1 ** 2) * 1;
check("aperçu : volume du tube π(1,2² − 1²) ≈ 1,382 m³, 4 faces, empreinte affichée", /1,38/.test(apercu) && /4 \/ 1/.test(apercu) && /[0-9a-f]{16}/.test(apercu), apercu);
const empreinteApercu = (apercu.match(/[0-9a-f]{16}/) ?? [""])[0];
await page.locator("[data-exact-creer]").click();
await enregistre().catch(async () => {
  // Diagnostic : état de la barre de synchronisation, aide affichée, et réponse du serveur à la même opération.
  const barre = await page.locator(".barre-sync").textContent();
  const aide = await page.locator(".atelier-n-aide, [data-aide], .barre-aide").first().textContent().catch(() => "");
  const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `diag-${Date.now()}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label: "diag", commands: [{ type: "solideExact.creer", params: { niveauId: "p21", nom: "diag", operation: { type: "revolution", sources: [], libelle: "diag", entrees: { type: "revolution", profil: [{ x: 1, y: 0 }, { x: 1.2, y: 0 }, { x: 1.2, y: 1 }, { x: 1, y: 1 }], axe: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }, angleDeg: 360, z0: 0 } } } }] });
  console.log("diagnostic création :", JSON.stringify({ barre, aide, serveur: r.status, corps: JSON.stringify(r.body).slice(0, 400) }));
});
let liste = await exacts();
check("création : le serveur a recalculé et retrouvé l'empreinte de l'aperçu ; solide exact dans le modèle", liste.length === 1 && liste[0].params.empreinteBrep === empreinteApercu && Math.abs(liste[0].params.volume - volumeTube) < 1e-6, JSON.stringify(liste.map((o) => [o.params.empreinteBrep, o.params.volume])));
const tube = liste[0];
await page.screenshot({ path: `${OUT}/p2-1-revolution.png` });

// Fiche du solide exact sélectionné : volume, STEP.
await page.keyboard.press("Escape");
await cliquerModele(0.6, 0.9);
await page.waitForSelector("[data-fiche-solide-exact]", { timeout: 10000 });
check("inspecteur : fiche du solide exact (volume, moteur, empreinte)", /1,38/.test(await page.locator("[data-exact-volume]").textContent()));
const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("[data-exact-step]").click()]);
const step = readFileSync(await dl.path(), "utf8");
check("STEP téléchargé : ISO-10303-21, nom du fichier depuis le serveur", step.startsWith("ISO-10303-21;") && /\.step$/.test(dl.suggestedFilename()), dl.suggestedFilename());

// Soustraction exacte : mur − tube (le mur reste paramétrique, un nouveau solide exact apparaît).
await page.keyboard.press("Escape");
await cliquerModele(2.5, 0.5);
await cliquerModele(0.6, 0.9, ["Shift"]);
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("booléen");
await page.keyboard.press("Enter");
await page.waitForSelector("[data-outil-solide-exact]", { timeout: 15000 });
await page.locator("#outil-operationExacte").selectOption("booleen");
await page.locator("#outil-booleenExact").selectOption("soustraction");
await page.locator("[data-exact-apercu]").click();
await page.waitForSelector("[data-exact-resultat]", { timeout: 60000 });
await page.locator("[data-exact-creer]").click();
await enregistre();
liste = await exacts();
const m = await modele();
const murVolume = 4 * 0.2 * 2;
const diff = liste.find((o) => o.params.operation.type === "booleen");
check("soustraction exacte mur − tube : nouveau solide exact plus petit que le mur, le mur reste un mur paramétrique", !!diff && diff.params.volume < murVolume && diff.params.volume > 0 && m.modele.objets["mur-p21"]?.classe === "mur", JSON.stringify(liste.map((o) => [o.params.operation.type, o.params.volume])));

// 3D : les solides exacts se dessinent (maillage dérivé), sans erreur.
await page.getByRole("button", { name: "3D", exact: true }).click();
await page.waitForSelector("canvas", { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/p2-1-3d.png` });
check("3D : vue rendue avec les solides exacts, aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.getByRole("button", { name: "Plan", exact: true }).click();
await page.waitForSelector(".plan2d", { timeout: 30000 });

// IFC : proxys tessellés avec Fadi_SolideExact.
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
check("IFC : Fadi_SolideExact et un IfcBuildingElementProxy 'solide-exact' par solide", ifc.status === 200 && ifc.text.includes("Fadi_SolideExact") && (ifc.text.match(/'solide-exact'/g) ?? []).length === liste.length);

// Import STEP (menu Importer) : un solide exact de plus, calculé par le serveur.
await page.locator('.nav-niveaux button:has-text("P2-1")').click();
await page.locator('[data-entree="step"]').setInputFiles({ name: "tube.step", mimeType: "application/step", buffer: Buffer.from(step) });
let importes = [];
for (let i = 0; i < 60; i++) { importes = (await exacts()).filter((o) => o.params.operation.type === "import-step"); if (importes.length) break; await page.waitForTimeout(500); }
check("import STEP : un solide exact « tube » importé, même volume que l'export", importes.length === 1 && Math.abs(importes[0].params.volume - volumeTube) < 1e-5 && importes[0].params.nom === "tube", JSON.stringify(importes.map((o) => [o.params.nom, o.params.volume])));

// Téléphone et axe-core.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-1-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));
writeFileSync(`${OUT}/p2-1-tube.step`, step);
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette P2-1 : tout est vert");
process.exit(echecs ? 1 : 0);
