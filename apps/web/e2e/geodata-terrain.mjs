#!/usr/bin/env node
/**
 * Recette de l'interface du terrain haute résolution dans GeoData (plan v1.0, lot TER-05, Issue #381), dans un vrai
 * navigateur (WebGL logiciel), contre l'API construite qui sert l'application.
 *
 * Données : les services `/geodata/api/terrain/…` sont INTERCEPTÉS par le navigateur et répondent avec un jeu
 * SYNTHÉTIQUE étiqueté « test seulement » (aucune donnée réelle, aucun site réel). La chaîne serveur (import, traitement,
 * qualité, publication, point, profil, statistiques, tuiles, courbes) est vérifiée sur base réelle par les suites DB-3
 * `geodata-terrain.test.ts` et `geodata-terrain-services.test.ts` ; cette recette vérifie ce que l'interface en fait :
 * Alt+H / Alt+O / Alt+U et leurs icônes, choix MNT / MNS, étiquette toujours affichée, couches et opacité, légende
 * verrouillée puis adaptée (portée dite), équidistances jamais sous le seuil, altitude arrondie à la précision de la
 * source, profil (raccord, lacune, interpolation), point indisponible jamais chiffré, terrain désactivé, anglais.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/geodata-terrain node apps/web/e2e/geodata-terrain.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium, devices } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/geodata-terrain";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const MDP = "geodata-terrain-recette-123";
const suffixe = Date.now().toString(36);

// ——— Jeu synthétique « test seulement » (servi par interception) ———
const ETIQUETTE = "Données synthétiques — test seulement";
const COUV = [[[[6.99, 46.99], [7.01, 46.99], [7.01, 47.01], [6.99, 47.01], [6.99, 46.99]]]];
const source = (versionId, titre, pas) => ({
  versionId, cle: versionId, titre, produit: "MNT", niveau: "leve-local", etiquette: ETIQUETTE,
  pas: { metres: pas, declare: { valeur: pas, unite: "m" } },
  referenceVerticale: { statut: "declaree", code: "EPSG:5728", libelle: "Référence fictive de test", origine: "documentation", source: "fixture de test" },
  unite: "m", qualite: { etat: "conforme", rmsez: 0.08, p95: 0.15, n: 40 }, precisionDeclaree: { texte: "±0,1 m (fixture)", verticaleM: 0.1, source: "fixture" },
  date: "2026-01-15", publieeLe: "2026-11-01T09:00:00.000Z", attribution: "Fixture de test Fadi", licence: { nom: "Fixture de test", url: null },
});
const JEU_A = { ...source("ter-test-a", "Jeu synthétique A", 0.5), couverture: { type: "MultiPolygon", coordinates: COUV }, droits: { consultation: "autorise", calcul: "autorise", tuiles: "autorise", export: "autorise" }, plageAltitude: [480, 620], courbes: { equidistanceMinimale: 0.25, calculees: [0.25] } };
const JEU_B = { ...source("ter-test-b", "Jeu synthétique B", 2), couverture: { type: "MultiPolygon", coordinates: [[[[7.01, 46.99], [7.03, 46.99], [7.03, 47.01], [7.01, 47.01], [7.01, 46.99]]]] }, droits: JEU_A.droits, plageAltitude: [590, 700], courbes: { equidistanceMinimale: 1, calculees: [1] } };

/** PNG 1 × 1 opaque (tuile d'image valide). */
function png1x1() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloc = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const t = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([l, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ihdr), bloc("IDAT", deflateSync(Buffer.from([0, 165, 184, 90, 200]))), bloc("IEND", Buffer.alloc(0))]);
}
const PNG = png1x1();

// Fond mondial à la demande (TER-09) : version « mondiale » synthétique (couverture déclarée du monde entier, lue à la
// demande) et levé local synthétique près de 8,25° E / 47,05° N — test seulement, aucune donnée réelle.
const JEU_M = {
  ...source("ter-test-mondial", "Fond mondial synthétique", 30.9), niveau: "mondial", acces: "a-la-demande", doi: "10.0000/test.seulement",
  qualite: { etat: "non-evaluee", rmsez: null, p95: null, n: 0 }, precisionDeclaree: null,
  couverture: { type: "MultiPolygon", coordinates: [[[[-180, -65], [180, -65], [180, 85], [-180, 85], [-180, -65]]]] }, droits: JEU_A.droits, plageAltitude: [0, 4000],
  courbes: { equidistanceMinimale: 10, calculees: [10, 20, 25, 50, 100] }, fondMondial: { zoomMinimal: 8, zoomMinimalCourbes: 12, couverture: "declaree" },
};
const JEU_L = { ...source("ter-test-local", "Levé local synthétique", 0.25), couverture: { type: "MultiPolygon", coordinates: [[[[8.24, 47.04], [8.26, 47.04], [8.26, 47.06], [8.24, 47.06], [8.24, 47.04]]]] }, droits: JEU_A.droits, plageAltitude: [430, 470], courbes: { equidistanceMinimale: 0.5, calculees: [0.5] } };
let modeMondial = false;
let pointsChargement = 0;
let tuilesMondialEnPanne = false;

const appels = [];
let terrainActif = true;
/** Réponse du catalogue MNT retardée (réponse périmée après un changement de produit) ; statistiques indisponibles. */
let retardMNT = 0;
let statistiquesIndisponibles = false;
async function intercepter(ctx) {
  await ctx.route(/\/geodata\/api\/terrain\//, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    appels.push(`${req.method()} ${u.pathname}${u.search}`);
    const json = (corps, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) });
    if (!terrainActif) return json({ error: "not_found", message: "Le terrain haute résolution n'est pas activé sur ce serveur." }, 404);
    const p = u.pathname.replace(/^\/geodata\/api\/terrain/, "");
    if (p === "/jeux" && u.searchParams.get("produit") !== "MNS" && retardMNT) await new Promise((r) => setTimeout(r, retardMNT));
    if (p === "/jeux") return json({ jeux: u.searchParams.get("produit") === "MNS" ? [] : modeMondial ? [JEU_M, JEU_L] : [JEU_B, JEU_A] });
    if (modeMondial && p === "/point") {
      const lon = Number(u.searchParams.get("lon")), lat = Number(u.searchParams.get("lat"));
      // Première réponse « chargement » (lecture distante plus longue que le délai) : l'interface redemande, jamais une valeur.
      if (pointsChargement > 0) { pointsChargement--; return json({ disponible: false, lon, lat, altitude: null, etat: "chargement", motif: "Altitude indisponible (jamais estimée) — Fond mondial synthétique : Lecture de la source distante en cours : réessayer dans un instant." }); }
      return json({ disponible: true, lon, lat, altitude: 221.37, echantillonnage: "bilineaire", source: { ...source("ter-test-mondial", "Fond mondial synthétique", 30.9), niveau: "mondial", acces: "a-la-demande", doi: "10.0000/test.seulement", qualite: { etat: "non-evaluee", rmsez: null, p95: null, n: 0 }, precisionDeclaree: null } });
    }
    if (modeMondial && tuilesMondialEnPanne && p.startsWith("/tuiles/ter-test-mondial/")) return route.fulfill({ status: 503, contentType: "application/json", headers: { "Retry-After": "3", "X-Terrain-Etat": "indisponible" }, body: JSON.stringify({ error: "source_distante_indisponible", message: "Source distante en erreur (HTTP 500)." }) });
    if (p === "/point") {
      const lon = Number(u.searchParams.get("lon")), lat = Number(u.searchParams.get("lat"));
      if (lon < 6.99 || lon > 7.03 || lat < 46.99 || lat > 47.01) return json({ disponible: false, lon, lat, altitude: null, motif: "Aucune version publiée ne couvre ce point : altitude indisponible (jamais estimée)." });
      return json({ disponible: true, lon, lat, altitude: 512.3456, echantillonnage: "bilineaire", source: source("ter-test-a", "Jeu synthétique A", 0.5) });
    }
    if (p === "/profil") {
      const pts = [];
      for (let i = 0; i <= 40; i++) pts.push({ chainage: i * 25, lon: 7 + i * 0.0003, lat: 47, altitude: i >= 18 && i <= 22 ? null : 500 + i * 2, source: i >= 18 && i <= 22 ? null : i < 18 ? "ter-test-a" : "ter-test-b", interpolee: i > 30 });
      return json({ points: pts, transitions: [{ chainage: 450, de: "ter-test-a", vers: null }, { chainage: 575, de: null, vers: "ter-test-b" }], lacunes: [{ debut: 450, fin: 550 }], sources: [source("ter-test-a", "Jeu synthétique A", 0.5), source("ter-test-b", "Jeu synthétique B", 2)], referencesEcartees: [], chainage: "mètres, projection transverse de Mercator locale (WGS 84) centrée sur le premier sommet" });
    }
    // Légende adaptée à la vue (TER-09) : plage de la vue lue sur un aperçu ; en échec avec les statistiques indisponibles.
    if (p === "/plage") return json({ versionId: u.searchParams.get("versionId"), plage: statistiquesIndisponibles ? null : modeMondial ? [180.2, 320.7] : [500.5, 540.25], portee: "vue" });
    if (p === "/statistiques" && statistiquesIndisponibles) return json({ indisponible: true, motif: "Aucune version publiée ne recoupe la zone : statistiques indisponibles." });
    if (p === "/statistiques") return json({ statistiques: { cellulesZone: 100, cellulesValides: 90, min: 500.5, max: 540.25, moyenne: 520, ecartType: 10 }, surfaceZoneM2: 25, surfaceValideM2: 22.5, couvertureValide: 0.9, source: source("ter-test-a", "Jeu synthétique A", 0.5) });
    if (p.startsWith("/tuiles/")) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (p.startsWith("/courbes/")) return route.fulfill({ status: 200, contentType: "application/vnd.mapbox-vector-tile", body: Buffer.alloc(0) });
    return json({ error: "not_found", message: "inconnu" }, 404);
  });
}

const navigateur = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
await intercepter(ctx);
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `gd-terrain-${suffixe}@example.test`);
await page.fill('input[name="password"]', MDP);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(accueil|projets)/);
await page.goto(`${BASE}/geodata#v=7,47,14,0`);
await page.locator("[data-geodata-page]").waitFor();
await page.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await page.waitForTimeout(1500);

// ——— Règle d'or : icône propre et raccourci de chaque commande ———
const boutonTerrain = await page.locator("[data-gd-terrain-bouton]").evaluate((b) => ({ touche: b.getAttribute("aria-keyshortcuts"), icone: b.querySelector("path")?.getAttribute("d") }));
const iconesBarre = await page.locator("[data-gd-barre-outil] path, [data-gd-donnees] path").evaluateAll((ps) => ps.map((p) => p.getAttribute("d")));
const outilsBarre = await page.locator("[data-gd-barre-outil]").count();
check("règle d'or : bouton « Terrain » de la carte (à côté de « Données »), icône propre, raccourci Alt+H ; la barre d'outils garde ses 16 outils", boutonTerrain.touche === "Alt+H" && !iconesBarre.includes(boutonTerrain.icone) && outilsBarre === 16, `${outilsBarre} outils`);
const boiteTerrain = await page.locator("[data-gd-terrain-bouton]").boundingBox(), boiteDonnees = await page.locator("[data-gd-donnees]").boundingBox();
check("bouton « Terrain » : à droite de « Données », même ligne, sans chevauchement", boiteTerrain.x >= boiteDonnees.x + boiteDonnees.width && Math.abs(boiteTerrain.y - boiteDonnees.y) <= 2, JSON.stringify({ boiteDonnees, boiteTerrain }));

// ——— Alt+H : panneau Terrain ———
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Alt+h");
await page.locator("[data-gd-terrain]").waitFor();
await page.locator("[data-gd-terrain-jeu]").first().waitFor({ state: "attached" });
check("Alt+H ouvre le panneau Terrain ; bouton « Terrain » enfoncé", (await page.locator("[data-gd-volet-ouvert='terrain']").count()) === 1 && (await page.locator("[data-gd-terrain-bouton]").getAttribute("aria-pressed")) === "true");
const commandes = await page.locator("[data-gd-terrain-outil]").evaluateAll((bs) => bs.map((b) => ({ cle: b.dataset.gdTerrainOutil, touche: b.getAttribute("aria-keyshortcuts"), icone: b.querySelector("path")?.getAttribute("d") })));
check("règle d'or : Altitude au point (Alt+O) et Profil du terrain (Alt+U), commandes du panneau, chacune son icône (distincte des autres)", commandes.map((c) => `${c.cle}:${c.touche}`).join(",") === "altitude:Alt+O,profil:Alt+U" && new Set([...commandes.map((c) => c.icone), boutonTerrain.icone, ...iconesBarre]).size === new Set(iconesBarre).size + 3, JSON.stringify(commandes.map((c) => c.touche)));
// Panneau resserré (TER-09) : couches et outils en haut ; jeux et sources repliés par défaut sous « Sources et précision ».
check("panneau : résumé d'une ligne, couches en haut, « Sources et précision » repliée par défaut", (await page.locator("[data-gd-terrain-resume-jeu]").count()) === 1 && (await page.locator("[data-gd-terrain-couche='altitude']").isVisible()) && !(await page.locator("details[data-gd-terrain-details]").evaluate((d) => d.open)) && !(await page.locator("[data-gd-terrain-jeu='ter-test-a'] input").isVisible()));
await page.locator("[data-gd-terrain-details-ouvrir]").click();
const ordre = await page.locator("[data-gd-terrain-jeu]").evaluateAll((ls) => ls.map((l) => l.dataset.gdTerrainJeu));
check("jeux publiés : le plus fin d'abord, choisi par défaut", ordre.join(",") === "ter-test-a,ter-test-b" && (await page.locator("[data-gd-terrain-jeu='ter-test-a'] input").isChecked()), ordre.join(","));
const etiquettes = await page.locator("[data-gd-terrain-etiquette]").allTextContents();
check("étiquette « test seulement » toujours affichée avec chaque jeu et dans « Sources et précision »", etiquettes.length >= 3 && etiquettes.every((t) => t.includes("test seulement")), `${etiquettes.length}`);
check("Sources et précision : référence verticale, RMSEz / P95, pas, attribution", /Référence fictive de test \(EPSG:5728\)/.test(await page.locator("[data-gd-terrain-rubrique-sources]").textContent()) && /RMSEz 0,080 m · P95 0,150 m · 40 points/.test(await page.locator("[data-gd-terrain-rubrique-sources]").textContent()));
await page.waitForTimeout(1500);
check("couche Altitude : tuiles demandées pour la version choisie", appels.some((a) => /\/tuiles\/ter-test-a\/altitude\/\d+\/\d+\/\d+/.test(a)), appels.filter((a) => a.includes("tuiles")).slice(0, 2).join(" "));
await page.waitForFunction(() => /vue courante/.test(document.querySelector("[data-gd-terrain-portee]")?.textContent ?? ""));
check("légende adaptée à la vue par défaut : plage de la vue lue (501 → 540 m), portée « vue courante »", appels.some((a) => a.startsWith("GET /geodata/api/terrain/plage?versionId=ter-test-a")) && /501 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /540 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()));
await page.locator("[data-gd-terrain-mode-legende='verrouillee']").check();
await page.waitForTimeout(600);
check("légende verrouillée : plage complète de la version (480 → 620 m) et portée dite", /480 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /620 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /verrouillée/.test(await page.locator("[data-gd-terrain-portee]").textContent()));
await page.screenshot({ path: join(OUT, "01-terrain-panneau.png") });

// ——— Légende adaptée à la vue ———
await page.locator("[data-gd-terrain-adapter]").click();
await page.waitForFunction(() => /vue courante/.test(document.querySelector("[data-gd-terrain-portee]")?.textContent ?? ""));
await page.waitForTimeout(1200);
check("Adapter à la vue : plage de la vue demandée pour la version, légende 501 → 540 m, portée « vue courante »", appels.some((a) => a.startsWith("GET /geodata/api/terrain/plage?")) && /501 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /540 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()));
check("tuiles redemandées avec la portée explicite (min / max)", appels.some((a) => /\/tuiles\/ter-test-a\/altitude\/.*\?min=500\.50&max=540\.25$/.test(a)));
// Nouvelle adaptation en échec : la plage précédente ne survit pas, couleurs et tuiles reviennent à la version.
statistiquesIndisponibles = true;
const tuilesAvant = appels.length;
await page.locator("[data-gd-terrain-adapter]").click();
await page.locator("[data-gd-terrain-adaptation-erreur]").waitFor();
await page.waitForTimeout(1200);
check("adaptation en échec : légende revenue à la plage de la version (480 → 620 m), tuiles sans portée", /480 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /620 m/.test(await page.locator("[data-gd-terrain-legende='m']").textContent()) && /verrouillée/.test(await page.locator("[data-gd-terrain-portee]").textContent()) && !appels.slice(tuilesAvant).some((a) => /\/tuiles\/ter-test-a\/altitude\/.*\?min=500/.test(a)));
statistiquesIndisponibles = false;
await page.locator("[data-gd-terrain-mode-legende='verrouillee']").check();
check("retour à la légende verrouillée", /verrouillée/.test(await page.locator("[data-gd-terrain-portee]").textContent()));

// ——— Pente, ombrage, opacité ———
await page.locator("[data-gd-terrain-visible='pente']").check();
await page.locator("[data-gd-terrain-visible='ombrage']").check();
await page.locator("[data-gd-terrain-opacite='ombrage']").fill("0.3");
await page.waitForTimeout(1500);
check("Pente et Ombrage : tuiles demandées ; légende de pente fixe 0 → 45°", appels.some((a) => /\/tuiles\/ter-test-a\/pente\//.test(a)) && appels.some((a) => /\/tuiles\/ter-test-a\/ombrage\//.test(a)) && /45 °/.test(await page.locator("[data-gd-terrain-legende='°']").textContent()));

// ——— Courbes : jamais sous le seuil ———
const options = await page.locator("[data-gd-terrain-equidistance] option").evaluateAll((os) => os.map((o) => Number(o.value)));
check("équidistances proposées : jamais sous le seuil (0,25 m pour A)", options.length > 0 && options.every((e) => e >= 0.25) && options[0] === 0.25, options.join(","));
await page.locator("[data-gd-terrain-jeu='ter-test-b'] input").check();
const optionsB = await page.locator("[data-gd-terrain-equidistance] option").evaluateAll((os) => os.map((o) => Number(o.value)));
check("version B (seuil 1 m) : aucune équidistance sous 1 m ; seuil affiché", optionsB.every((e) => e >= 1) && optionsB[0] === 1 && /1 m/.test(await page.locator("[data-gd-terrain-equidistance-min]").textContent()), optionsB.join(","));
await page.locator("[data-gd-terrain-jeu='ter-test-a'] input").check();
await page.locator("[data-gd-terrain-courbes-visible]").check();
await page.locator("[data-gd-terrain-equidistance]").selectOption("1");
await page.waitForTimeout(1500);
check("courbes : tuiles vectorielles demandées à l'équidistance choisie", appels.some((a) => /\/courbes\/ter-test-a\/\d+\/\d+\/\d+\?equidistance=1$/.test(a)));

// ——— Alt+O : altitude au point ———
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Alt+o");
check("Alt+O : outil Altitude au point actif", (await page.locator("[data-gd-terrain-outil='altitude']").getAttribute("aria-pressed")) === "true");
const canevas = await page.locator(".maplibregl-canvas").boundingBox();
await page.mouse.click(canevas.x + canevas.width / 2, canevas.y + canevas.height / 2);
await page.locator("[data-gd-terrain-altitude]").waitFor();
check("altitude au point : arrondie à la précision mesurée (RMSEz 0,08 m → 0,1 m) : « 512,3 m »", (await page.locator("[data-gd-terrain-altitude]").textContent()).trim() === "512,3 m");
check("altitude au point : bulle à l'endroit touché avec la valeur (« 512,3 m »)", ((await page.locator("[data-gd-terrain-bulle]").textContent()) ?? "").trim() === "512,3 m");
check("altitude au point : source, référence verticale et étiquette jointes", (await page.locator("[data-gd-terrain-point] [data-gd-terrain-sources]").count()) === 1 && /test seulement/.test(await page.locator("[data-gd-terrain-point] [data-gd-terrain-etiquette]").textContent()));
await page.screenshot({ path: join(OUT, "02-altitude-point.png") });

// ——— Alt+U : profil ———
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Alt+u");
check("Alt+U : outil Profil du terrain actif", (await page.locator("[data-gd-terrain-outil='profil']").getAttribute("aria-pressed")) === "true");
await page.mouse.click(canevas.x + 400, canevas.y + 300);
await page.mouse.click(canevas.x + 700, canevas.y + 400);
await page.mouse.dblclick(canevas.x + 900, canevas.y + 420);
await page.locator("[data-gd-terrain-profil]").waitFor();
const corps = appels.find((a) => a.startsWith("POST /geodata/api/terrain/profil"));
check("profil : ligne envoyée au service", !!corps);
check("profil : lacune grisée (jamais comblée), raccords entre jeux, segment interpolé en pointillé", (await page.locator("[data-gd-profil-lacune]").count()) === 1 && (await page.locator("[data-gd-profil-transition]").count()) === 2 && (await page.locator("[data-gd-profil-segment='interpole']").count()) >= 1 && (await page.locator("[data-gd-profil-segment='natif']").count()) >= 2);
check("profil : lacunes listées et raccords nommés", /450 m – 550 m/.test(await page.locator("[data-gd-profil-lacunes]").textContent()) && /Jeu synthétique A/.test(await page.locator("[data-gd-profil-raccords]").textContent()));
await page.screenshot({ path: join(OUT, "03-profil.png") });

// ——— Point hors couverture : jamais chiffré ———
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Alt+o");
// Vue élargie (zoom 12 centré sur 7° E, 47° N) : un point à l'ouest du centre est hors de la couverture fictive
// (6,99–7,03° E) ; le panneau Données couvre le bord gauche de la carte.
await page.locator("[data-gd-barre-outil='zoom-moins']").click();
await page.locator("[data-gd-barre-outil='zoom-moins']").click();
await page.waitForTimeout(800);
await page.mouse.click(canevas.x + 420, canevas.y + 300);
await page.waitForTimeout(800);
const indispo = page.locator("[data-gd-terrain-point] [data-gd-terrain-indisponible]");
if (await indispo.count()) check("point hors couverture : « indisponible », aucune valeur", /indisponible/.test(await indispo.textContent()) && (await page.locator("[data-gd-terrain-altitude]").count()) === 0);
else check("point hors couverture : « indisponible », aucune valeur", false, appels.filter((a) => a.includes("/point")).join(" | "));

// ——— MNS : le MNT n'est jamais affiché à sa place ———
await page.locator("[data-gd-terrain-produit='MNS']").check();
await page.locator("[data-gd-terrain-aucun]").waitFor();
check("MNS sans jeu publié : rien d'affiché, résultats du MNT effacés", (await page.locator("[data-gd-terrain-jeu]").count()) === 0 && (await page.locator("[data-gd-terrain-point]").count()) === 0);
// Réponse périmée : un catalogue MNT lent qui arrive après le choix du MNS est ignoré.
retardMNT = 1500;
await page.locator("[data-gd-terrain-produit='MNT']").check();
await page.locator("[data-gd-terrain-produit='MNS']").check();
await page.waitForTimeout(2500);
check("réponse périmée : le catalogue MNT arrivé après le choix du MNS est ignoré", (await page.locator("[data-gd-terrain-produit='MNS']").isChecked()) && (await page.locator("[data-gd-terrain-jeu]").count()) === 0 && (await page.locator("[data-gd-terrain-aucun]").count()) === 1);
retardMNT = 0;
await page.locator("[data-gd-terrain-produit='MNT']").check();

// ——— Terrain désactivé côté serveur ———
terrainActif = false;
const p2 = await ctx.newPage();
await p2.goto(`${BASE}/geodata`);
await p2.locator("[data-geodata-page]").waitFor();
await p2.locator("[data-gd-terrain-bouton]").click();
await p2.locator("[data-gd-terrain-erreur]").waitFor();
check("terrain désactivé : message du serveur, aucune valeur", /pas activé/.test(await p2.locator("[data-gd-terrain-erreur]").textContent()));
await p2.close();
terrainActif = true;

// ——— Fond mondial à la demande (TER-09) : toute zone affichée, levé local prioritaire sur son emprise ———
modeMondial = true;
const pm = await ctx.newPage();
pm.on("pageerror", (e) => erreurs.push(e.message));
await pm.goto(`${BASE}/geodata#v=-7.106,33.53,13,0`);
await pm.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await pm.waitForTimeout(1000);
await pm.locator("[data-gd-terrain-bouton]").click();
await pm.locator("[data-gd-terrain-jeu='ter-test-mondial']").waitFor({ state: "attached" });
await pm.waitForTimeout(1500);
check("fond mondial : hors de tout levé (Benslimane, zoom 13), le fond mondial est choisi et ses tuiles demandées", (await pm.locator("[data-gd-terrain-jeu='ter-test-mondial'] input").isChecked()) && appels.some((a) => /\/tuiles\/ter-test-mondial\/altitude\/1[34]\//.test(a)), appels.filter((a) => a.includes("mondial")).slice(0, 2).join(" "));
check("fond mondial : « lu à la demande » dit avec le jeu", (await pm.locator("[data-gd-terrain-a-la-demande]").count()) === 1);
// Altitude au point : « chargement » d'abord, puis la valeur (nouvelle demande automatique), avec DOI et accès.
pointsChargement = 1;
await pm.evaluate(() => document.activeElement?.blur());
await pm.keyboard.press("Alt+o");
const cm = await pm.locator(".maplibregl-canvas").boundingBox();
const avantPoint = appels.filter((a) => a.includes("/terrain/point")).length;
await pm.mouse.click(cm.x + cm.width / 2, cm.y + cm.height / 2);
await pm.locator("[data-gd-terrain-altitude]").waitFor({ timeout: 15_000 });
check("altitude au point du fond mondial : « chargement » puis valeur, redemandée automatiquement", appels.filter((a) => a.includes("/terrain/point")).length - avantPoint === 2 && /221/.test(await pm.locator("[data-gd-terrain-altitude]").textContent()));
check("Sources et précision du fond mondial : DOI et accès « à la demande »", /10\.0000\/test\.seulement/.test(await pm.locator("[data-gd-terrain-point] [data-gd-terrain-sources]").textContent()) && /lu à la demande/.test(await pm.locator("[data-gd-terrain-point] [data-gd-terrain-sources]").textContent()));
await pm.screenshot({ path: join(OUT, "05-fond-mondial.png") });
// Zoom insuffisant : message, aucune tuile demandée sous le zoom minimal.
await pm.goto(`${BASE}/geodata#v=-7.106,33.53,6,0`);
await pm.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await pm.locator("[data-gd-terrain-bouton]").click();
await pm.locator("[data-gd-terrain-zoom-minimal]").waitFor();
await pm.waitForTimeout(1500);
check("fond mondial sous le zoom minimal (6 < 8) : message, aucune tuile demandée", /niveau de zoom 8/.test(await pm.locator("[data-gd-terrain-zoom-minimal]").textContent()) && !appels.some((a) => /\/tuiles\/ter-test-mondial\/[a-z]+\/[0-7]\//.test(a)));
// Levé local : la vue centrée sur son emprise le choisit (priorité TER-D16, plus fin) ; ailleurs, le fond mondial.
await pm.goto(`${BASE}/geodata#v=8.25,47.05,15,0`);
await pm.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await pm.locator("[data-gd-terrain-bouton]").click();
await pm.locator("[data-gd-terrain-jeu='ter-test-local']").waitFor({ state: "attached" });
await pm.waitForTimeout(1200);
check("levé local prioritaire sur son emprise : choisi quand la vue y est centrée", await pm.locator("[data-gd-terrain-jeu='ter-test-local'] input").isChecked());
// Source distante indisponible : tuiles refusées, nouveaux essais, puis « indisponible » dit (jamais une valeur).
tuilesMondialEnPanne = true;
await pm.goto(`${BASE}/geodata#v=2.35,48.85,12,0`);
await pm.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await pm.locator("[data-gd-terrain-bouton]").click();
await pm.locator("[data-gd-terrain-jeu='ter-test-mondial']").waitFor({ state: "attached" });
await pm.locator("[data-gd-terrain-tuiles-indisponibles]").waitFor({ timeout: 40_000 }).catch(() => undefined);
check("source distante indisponible (Paris) : nouveaux essais puis « indisponible » dit, aucune valeur estimée", (await pm.locator("[data-gd-terrain-tuiles-indisponibles]").count()) === 1 && appels.some((a) => /\/tuiles\/ter-test-mondial\/altitude\/1[23]\/.*essai=3/.test(a)), `${appels.filter((a) => a.includes("essai")).length} essais ; ${appels.slice(-4).join(" ")} ; choisi ${await pm.locator("[data-gd-terrain-jeu] input:checked").evaluate((i) => i.closest("[data-gd-terrain-jeu]").dataset.gdTerrainJeu).catch(() => "?")}`);
tuilesMondialEnPanne = false;
await pm.close();
// Téléphone (format Pixel 7, émulation — pas un appareil réel, porte G3 non passée) : le terrain remplit la vue en un geste,
// altitude au point en bulle à l'endroit touché.
const tel = await navigateur.newContext({ ...devices["Pixel 7"], storageState: await ctx.storageState() });
await intercepter(tel);
const pt = await tel.newPage();
pt.on("pageerror", (e) => erreurs.push(e.message));
await pt.goto(`${BASE}/geodata#v=-7.106,33.53,10,0`);
await pt.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await pt.locator("[data-gd-terrain-bouton]").click();
await pt.locator("[data-gd-terrain-resume-jeu]").waitFor();
await pt.waitForTimeout(1500);
await pt.screenshot({ path: join(OUT, "06-telephone-terrain.png") });
check("téléphone : un geste (bouton Terrain) affiche l'altitude du fond mondial et sa légende adaptée à la vue", appels.some((a) => /\/tuiles\/ter-test-mondial\/altitude\//.test(a)) && /vue courante/.test((await pt.locator("[data-gd-terrain-portee]").textContent()) ?? ""));
await pt.locator("[data-gd-terrain-outil='altitude']").tap();
// Panneau ouvert en bas de l'écran : on touche la carte juste au-dessus de lui.
const volet = await pt.locator("[data-gd-volet-ouvert='terrain']").boundingBox();
const ct = await pt.locator(".maplibregl-canvas").boundingBox();
await pt.touchscreen.tap(ct.x + ct.width * 0.4, volet.y - 30);
await pt.locator("[data-gd-terrain-bulle]").waitFor({ timeout: 15_000 }).catch(async () => { await pt.screenshot({ path: join(OUT, "07-debug.png") }); });
await pt.waitForTimeout(500);
await pt.screenshot({ path: join(OUT, "07-telephone-bulle.png") });
check("téléphone : altitude au point en bulle à l'endroit touché", /221/.test((await pt.locator("[data-gd-terrain-bulle]").textContent()) ?? ""));
await tel.close();
modeMondial = false;

// ——— Interface anglaise : aucun résidu français dans le panneau Terrain ———
const en = await (await navigateur.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await intercepter(en.context());
await en.goto(`${BASE}/inscription`);
await en.locator("[data-choix-langue]").selectOption("en");
await en.waitForFunction(() => document.documentElement.lang === "en");
await en.fill('input[name="email"]', `gd-terrain-en-${suffixe}@example.test`);
await en.fill('input[name="password"]', MDP);
await en.click('button[type="submit"]');
await en.waitForURL(/\/(accueil|projets)/);
await en.goto(`${BASE}/geodata#v=7,47,14,0`);
await en.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await en.locator("[data-gd-terrain-bouton]").click();
await en.locator("[data-gd-terrain-jeu]").first().waitFor({ state: "attached" });
for (const c of ["pente", "ombrage"]) await en.locator(`[data-gd-terrain-visible='${c}']`).check();
await en.locator("[data-gd-terrain-courbes-visible]").check();
await en.locator("[data-gd-terrain-outil='altitude']").click();
const c2 = await en.locator(".maplibregl-canvas").boundingBox();
await en.mouse.click(c2.x + c2.width / 2, c2.y + c2.height / 2);
await en.locator("[data-gd-terrain-altitude]").waitFor();
await en.locator("[data-gd-terrain-outil='profil']").click();
await en.mouse.click(c2.x + 400, c2.y + 300);
await en.mouse.dblclick(c2.x + 800, c2.y + 400);
await en.locator("[data-gd-terrain-profil]").waitFor();
await en.waitForTimeout(800);
const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|carte|couche|valeur)\b/i;
const textes = await en.evaluate(() => {
  const out = [];
  const exclu = (n) => { for (let e = n.parentElement; e; e = e.parentElement) { if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "OPTION"].includes(e.tagName)) return true; const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return true; } return false; };
  const racines = [document.querySelector("[data-gd-volet-ouvert='terrain']"), document.querySelector("[data-gd-barre-outils]"), document.querySelector("[data-gd-terrain-bouton]")];
  for (const r of racines) {
    if (!r) continue;
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.replace(/\s+/g, " ").trim(); if (t.length >= 3 && !exclu(n)) out.push(t); }
    for (const e of r.querySelectorAll("[aria-label], [title]")) for (const a of ["aria-label", "title"]) { const v = e.getAttribute(a); if (v && v.length >= 3 && !e.closest("[translate='no']")) out.push(v); }
  }
  return out;
});
const residus = [...new Set(textes.filter((t) => FR.test(t)))];
writeFileSync(join(OUT, "residus-anglais.txt"), residus.join("\n"));
check("interface anglaise : panneau Terrain, bouton Terrain et barre d'outils sans résidu français", residus.length === 0, residus.slice(0, 8).join(" | "));
check("interface anglaise : titres anglais (Terrain profile, Sources and accuracy)", /Terrain profile/.test(await en.locator("[data-gd-terrain-profil-resultat] h3").textContent()) && /Sources and accuracy/.test(await en.locator("[data-gd-terrain-rubrique-sources] h3").textContent()));
await en.screenshot({ path: join(OUT, "04-anglais.png") });
// Fond mondial en anglais (TER-09) : messages de zoom minimal et d'accès à la demande traduits.
modeMondial = true;
await en.goto(`${BASE}/geodata#v=-7.106,33.53,6,0`);
await en.locator(".maplibregl-canvas").waitFor({ timeout: 20_000 });
await en.locator("[data-gd-terrain-bouton]").click();
await en.locator("[data-gd-terrain-zoom-minimal]").waitFor();
await en.waitForTimeout(800);
const textesM = [await en.locator("[data-gd-terrain-zoom-minimal]").textContent(), await en.locator("[data-gd-terrain-a-la-demande]").textContent()];
check("interface anglaise : messages du fond mondial traduits", /Zoom in further/.test(textesM[0]) && /read on demand/.test(textesM[1]) && !textesM.some((t) => FR.test(t)), textesM.join(" | "));
modeMondial = false;

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await navigateur.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette du terrain (TER-05, TER-09) : tout est conforme.");
process.exit(echecs ? 1 : 0);
