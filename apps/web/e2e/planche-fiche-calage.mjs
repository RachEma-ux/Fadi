/**
 * Recette de la fiche de calage et de l'orthophoto (cas 4, lot C4, étape 2 : D10-F14-096, D10-F23a-038, D10-S-005 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-2-fiche-calage.png`) :
 * - Importer une fiche (Ctrl+Alt+Maj+F9) : fiche lue et comparée, rien n'est modifié ; Appliquer (Ctrl+Alt+Maj+F12)
 *   reprend le point de base et ajoute les niveaux absents en un pas, annulable ; Ignorer (Alt+F3) ;
 * - fiche dans un autre système : Appliquer refusé ; fiche illisible : ligne nommée ;
 * - Exporter la fiche (Ctrl+Alt+Maj+F8) : texte lisible, relu à l'identique ;
 * - Importer une orthophoto (Ctrl+Alt+Maj+F10) : image + .pgw ; sans .prj, le système est demandé (Poser, Alt+F2) ;
 *   autre système refusé ; .prj au bon code : posée d'emblée, verrouillée, original archivé ;
 * - Exporter le calage du fond (Ctrl+Alt+Maj+F11) : les six coefficients reçus ; aucune erreur JS.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-fiche-calage node apps/web/e2e/planche-fiche-calage.mjs
 */
import { mkdirSync, readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-fiche-calage";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

/** PNG uni de l × h (photo d'essai). */
function png(l, h) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const bloc = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const lignes = Buffer.alloc((l * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) lignes.set([120, 140 + (y % 50), 130], y * (l * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc("IHDR", ihdr), bloc("IDAT", deflateSync(lignes)), bloc("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH", acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
await inscrireDansLaPage(page, `fiche-${Date.now()}@example.com`, "planche-fiche-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const fonds = async () => Object.values((await modele()).annotations?.fonds ?? {});
const niveaux = async () => Object.values((await modele()).annotations?.niveaux ?? {});
const vue = page.locator("[data-planche-vue]");
const proche = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const erreur = () => page.locator("[data-planche-fonds-erreur]").textContent();
const fichier = (nom, texte) => ({ name: nom, mimeType: "text/plain", buffer: Buffer.from(texte, "utf8") });
const clavier = async (touches) => {
  await vue.focus();
  await page.keyboard.press(touches);
};
const choisir = async (touches, fichiers) => {
  const choix = page.waitForEvent("filechooser");
  await clavier(touches);
  await (await choix).setFiles(fichiers);
};

const FICHE = `# Fiche de calage — Fadi 1
auteur = B. Martin
date = 2026-11-25
systeme = EPSG:2154
systeme_vertical = NGF-IGN69
point_de_base_e = 652410.25
point_de_base_n = 6862118.4
nord_quadrillage_deg = 0
h_reference = 412.35
niveau = RDC ; 0 ; 2.7
niveau = R+1 ; 2.7 ; 2.7
`;

// --- Fiche reçue : lue, comparée, rien n'est modifié --------------------------------------------------------------------
let pas0 = await pas();
await choisir("Control+Alt+Shift+F9", fichier("fiche-calage-BET.txt", FICHE));
const recue = page.locator("[data-planche-fiche-recue='fiche-calage-BET.txt']");
await recue.waitFor();
check("Ctrl+Alt+Maj+F9 lit la fiche et la compare ; rien n'est modifié", (await pas()) === pas0 && (await recue.getAttribute("data-systeme")) === "absent-projet" && (await recue.locator("[data-planche-recue-niveau='RDC']").getAttribute("data-ecart-mm")) === "", await recue.textContent());
check("panneau Fonds calés ouvert, fiche du projet : point de base non déclaré", (await page.evaluate(() => window.fadiPlanche.panneau())) === "fonds" && ((await page.locator("[data-planche-fiche-ligne='point-de-base']").textContent()) ?? "").includes("non déclaré"));
await page.screenshot({ path: `${OUT}/fiche-recue.png` });
await clavier("Control+Alt+Shift+F12");
await page.waitForFunction(() => !!window.fadiPlanche.modele().annotations?.reglages?.pointDeBase);
let m = await modele();
check("Appliquer (Ctrl+Alt+Maj+F12) : point de base repris, deux niveaux ajoutés, un pas", (await pas()) === pas0 + 1 && m.annotations.reglages.pointDeBase.systeme === "EPSG:2154" && proche(m.annotations.reglages.pointDeBase.e, 652410.25) && (await niveaux()).map((x) => x.nom).sort().join() === "R+1,RDC" && (await recue.count()) === 0);
await clavier("Control+z");
await page.waitForFunction(() => !window.fadiPlanche.modele().annotations?.reglages?.pointDeBase);
check("Annuler retire point de base et niveaux", (await niveaux()).length === 0);
await clavier("Control+y");
await page.waitForFunction(() => !!window.fadiPlanche.modele().annotations?.reglages?.pointDeBase);

// Fiche du même système, R+1 à 2,712 et Combles : écarts affichés ; Ignorer (Alt+F3) ne change rien.
await choisir("Control+Alt+Shift+F9", fichier("fiche-2.txt", FICHE.replace("R+1 ; 2.7", "R+1 ; 2.712") + "niveau = Combles ; 5.4 ; 2\n"));
const recue2 = page.locator("[data-planche-fiche-recue='fiche-2.txt']");
await recue2.waitFor();
check("même système : identique ; R+1 +12 mm ; Combles absent du projet", (await recue2.getAttribute("data-systeme")) === "identique" && (await recue2.locator("[data-planche-recue-niveau='R+1']").getAttribute("data-ecart-mm")) === "12" && (await recue2.locator("[data-planche-recue-niveau='Combles']").getAttribute("data-ecart-mm")) === "", await recue2.textContent());
pas0 = await pas();
await clavier("Alt+F3");
await recue2.waitFor({ state: "detached" });
check("Ignorer (Alt+F3) : fiche écartée, rien n'est modifié", (await pas()) === pas0);

// Autre système : Appliquer refusé, rien n'est modifié.
await choisir("Control+Alt+Shift+F9", fichier("fiche-suisse.txt", FICHE.replace("EPSG:2154", "EPSG:2056")));
await page.locator("[data-planche-fiche-recue='fiche-suisse.txt'][data-systeme='different']").waitFor();
await page.locator("[data-planche-commande='appliquer-fiche']").click();
check("fiche dans un autre système : Appliquer refusé avec motif", (await pas()) === pas0 && ((await erreur()) ?? "").includes("autre système"), await erreur());
await page.locator("[data-planche-commande='ignorer-fiche']").click();

// Fiche illisible : la ligne est nommée.
await choisir("Control+Alt+Shift+F9", fichier("faux.txt", "# Fiche de calage — Fadi 1\ndate = 2026-11-27\nniveau = RDC ; zéro ; 2.7\n"));
await page.locator("[data-planche-fonds-erreur]").waitFor();
check("fiche illisible : ligne 3 nommée, rien n'est lu", ((await erreur()) ?? "").includes("ligne 3") && (await page.locator("[data-planche-fiche-recue]").count()) === 0, await erreur());

// --- Exporter la fiche ------------------------------------------------------------------------------------------------
await page.locator("[data-planche-fiche-auteur]").fill("R. Ouali");
const dl = page.waitForEvent("download");
await clavier("Control+Alt+Shift+F8");
const d = await dl;
const texte = readFileSync(await d.path(), "utf8");
check("Exporter la fiche (Ctrl+Alt+Maj+F8) : texte lisible avec auteur, système, point de base, niveaux", /^fiche-calage-.+\.txt$/.test(d.suggestedFilename()) && texte.startsWith("# Fiche de calage — Fadi 1") && texte.includes("auteur = R. Ouali") && texte.includes("systeme = EPSG:2154") && texte.includes("point_de_base_e = 652410.25") && texte.includes("niveau = R+1 ; 2.7 ; 2.7"), d.suggestedFilename());

// --- Orthophoto -------------------------------------------------------------------------------------------------------
const image = png(800, 600);
const PGW = "0.2\n0\n0\n-0.2\n652400.1\n6862130.1\n";
await choisir("Control+Alt+Shift+F10", [{ name: "ortho-2024.png", mimeType: "image/png", buffer: image }, fichier("ortho-2024.pgw", PGW)]);
const attente = page.locator("[data-planche-orthophoto-attente='ortho-2024.pgw']");
await attente.waitFor();
check("orthophoto sans .prj : le système est demandé, rien n'est posé", (await fonds()).length === 0);
await page.locator("[data-planche-orthophoto-systeme]").fill("EPSG:2056");
await clavier("Alt+F2");
check("système saisi différent du projet : refusé", ((await erreur()) ?? "").includes("EPSG:2056") && (await fonds()).length === 0, await erreur());
await page.locator("[data-planche-orthophoto-systeme]").fill("epsg:2154");
await clavier("Alt+F2");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.fonds ?? {}).length === 1);
let [f] = await fonds();
// Centre du pixel (10 ; 20) → E = 652400,1 + 0,2·10 ; N = 6862130,1 − 0,2·20 ; point de base sans rotation.
const u = 10.5, v = 20.5;
const x = f.pose.x + f.pose.echelle * (Math.cos(f.pose.rotation) * u + Math.sin(f.pose.rotation) * v);
const y = f.pose.y + f.pose.echelle * (Math.sin(f.pose.rotation) * u - Math.cos(f.pose.rotation) * v);
check("Poser (Alt+F2) : fond calé et verrouillé d'après le .pgw, 1 px = 20 cm", f.cale && f.verrouille && f.geo?.fichier === "ortho-2024.pgw" && f.geo.systeme === "EPSG:2154" && proche(f.pose.echelle, 0.2, 1e-9), JSON.stringify({ pose: f.pose, geo: f.geo }));
check("pixel (10 ; 20) au bon point projeté", proche(652410.25 + x, 652400.1 + 2, 1e-4) && proche(6862118.4 + y, 6862130.1 - 4, 1e-4), `${652410.25 + x} ; ${6862118.4 + y}`);
check("original de l'orthophoto archivé, dimensions relevées", !!f.original && f.original.largeurPx === 800 && f.original.hauteurPx === 600);
check("world file archivé tel quel avec l'image (D-GD-29)", f.geo?.archives?.length === 1 && f.geo.archives[0].role === "calage" && /^[0-9a-f]{64}$/.test(f.geo.archives[0].empreinte ?? ""), JSON.stringify(f.geo?.archives));
check("liste : « posé d'après ortho-2024.pgw »", (await page.locator("[data-planche-fond-geo='ortho-2024.pgw']").count()) === 1);
await page.screenshot({ path: `${OUT}/orthophoto.png` });

// .prj d'un autre système : refusé ; .prj au bon code : posé d'emblée.
const prj = (code) => `PROJCS["Essai",GEOGCS["X",DATUM["Y",SPHEROID["GRS 1980",6378137,298.257222101]]],UNIT["metre",1],AUTHORITY["EPSG","${code}"]]`;
await choisir("Control+Alt+Shift+F10", [{ name: "ortho-ch.png", mimeType: "image/png", buffer: image }, fichier("ortho-ch.pgw", PGW), fichier("ortho-ch.prj", prj("2056"))]);
await page.waitForFunction(() => (document.querySelector("[data-planche-fonds-erreur]")?.textContent ?? "").includes("2056"));
check(".prj dans un autre système : refusé, aucune conversion devinée", (await fonds()).length === 1);
await choisir("Control+Alt+Shift+F10", [{ name: "ortho-b.png", mimeType: "image/png", buffer: image }, fichier("ortho-b.pgw", PGW), fichier("ortho-b.prj", prj("2154"))]);
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().annotations?.fonds ?? {}).length === 2);
check(".prj au code du projet : posé d'emblée avec le code lu", (await fonds()).some((g) => g.geo?.systeme === "EPSG:2154"));
check("world file et .prj archivés tels quels", (await fonds()).some((g) => g.geo?.fichier === "ortho-b.pgw" && g.geo.archives?.length === 2 && g.geo.archives.some((p) => p.role === "prj")), JSON.stringify((await fonds()).map((g) => g.geo?.archives)));

// --- Exporter le calage du fond ----------------------------------------------------------------------------------------
const dl2 = page.waitForEvent("download");
await clavier("Control+Alt+Shift+F11");
const d2 = await dl2;
const k = readFileSync(await d2.path(), "utf8").trim().split("\n").map(Number);
const attendu = PGW.trim().split("\n").map(Number);
check("Exporter le calage du fond (Ctrl+Alt+Maj+F11) : .pgw aux six coefficients reçus", d2.suggestedFilename().endsWith(".pgw") && k.length === 6 && k.every((c, i) => proche(c, attendu[i], 1e-6)), `${d2.suggestedFilename()} ${k.join(" ")}`);

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
if (echecs > 0) {
  console.error(`Recette de la fiche de calage : ${echecs} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("Recette de la fiche de calage : tous les contrôles passent.");
