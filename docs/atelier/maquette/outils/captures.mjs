#!/usr/bin/env node
/**
 * Captures de la maquette de l'Atelier (L0.3).
 *
 * Ouvre chaque écran de docs/atelier/maquette/ directement depuis le disque (file://, sans serveur), à la
 * largeur prévue — ordinateur 1536 px, téléphone 390 px, sommaire aux deux — et écrit une image PNG pleine
 * page par écran dans docs/atelier/maquette/captures/.
 *
 * Contrôles (le script sort en erreur si l'un échoue, après avoir produit toutes les captures possibles) :
 *   - aucune requête hors du dossier de la maquette (pas de CDN, pas de réseau) ;
 *   - aucune erreur JavaScript ni message d'erreur dans la console ;
 *   - pas de défilement horizontal de la page à la largeur de l'écran ;
 *   - l'état demandé par l'adresse est bien appliqué (attributs data-* du body, palette ou feuille ouverte).
 *
 * Usage, depuis la racine du dépôt (Chromium de Playwright installé : `npx playwright install chromium`) :
 *   node docs/atelier/maquette/outils/captures.mjs
 * Chromium ne tourne pas sur tous les postes (ex. Android sous PRoot) : le workflow
 * .github/workflows/atelier-maquette.yml l'exécute et publie l'artefact « captures-maquette ».
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));
const maquette = path.resolve(ici, "..");
const racine = path.resolve(maquette, "../../..");
const sortie = path.join(maquette, "captures");

/** Playwright est une dépendance de apps/web (scénario e2e) : résolu depuis la racine, sinon depuis apps/web. */
async function chargerPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const exiger = createRequire(path.join(racine, "apps/web/package.json"));
    return exiger("playwright");
  }
}

const ORDINATEUR = { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 };
const TELEPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** nom du fichier, page, requête, appareil, attentes sur l'état appliqué */
const ECRANS = [
  ["index-1536", "index.html", "", ORDINATEUR, {}],
  ["index-390", "index.html", "", TELEPHONE, {}],
  ["O1-essentiel", "ordinateur.html", "", ORDINATEUR, { niveau: "essentiel", etape: "repos", mode: "2d" }],
  ["O2-complet", "ordinateur.html", "?niveau=complet&panneau=ouvert", ORDINATEUR, { niveau: "complet", panneau: true }],
  ["O3-geste-apercu", "ordinateur.html", "?etape=apercu", ORDINATEUR, { etape: "apercu" }],
  ["O4-controle-refuse", "ordinateur.html", "?niveau=complet&etape=controle", ORDINATEUR, { niveau: "complet", etape: "controle" }],
  ["O5-palette", "ordinateur.html", "?palette=push", ORDINATEUR, { palette: true }],
  ["O6-vue-3d", "ordinateur.html", "?mode=3d&niveau=complet", ORDINATEUR, { mode: "3d", niveau: "complet" }],
  ["O7-contextuel", "ordinateur.html", "?niveau=contextuel", ORDINATEUR, { niveau: "contextuel" }],
  ["T1-plan", "telephone.html", "", TELEPHONE, { niveau: "essentiel", mode: "2d" }],
  ["T2-projet", "telephone.html", "?feuille=projet", TELEPHONE, { feuille: "projet" }],
  ["T3-outils", "telephone.html", "?feuille=outils", TELEPHONE, { feuille: "outils" }],
  ["T4-inspecteur", "telephone.html", "?feuille=inspecteur", TELEPHONE, { feuille: "inspecteur", niveau: "essentiel" }],
  ["T5-inspecteur-complet", "telephone.html", "?feuille=inspecteur&niveau=complet", TELEPHONE, { feuille: "inspecteur", niveau: "complet" }],
  ["T6-problemes", "telephone.html", "?feuille=problemes&niveau=complet", TELEPHONE, { feuille: "problemes", niveau: "complet" }],
  ["T7-palette", "telephone.html", "?palette=offset", TELEPHONE, { palette: true }],
  ["T8-geste-apercu", "telephone.html", "?etape=apercu", TELEPHONE, { etape: "apercu" }],
  ["T9-vue-3d", "telephone.html", "?mode=3d", TELEPHONE, { mode: "3d" }],
];

const { chromium } = await chargerPlaywright();
await mkdir(sortie, { recursive: true });
const navigateur = await chromium.launch();
const echecs = [];
const prefixe = pathToFileURL(maquette).href;

for (const [nom, page, requete, appareil, attendu] of ECRANS) {
  const contexte = await navigateur.newContext({ ...appareil, locale: "fr-FR", reducedMotion: "reduce" });
  const onglet = await contexte.newPage();
  const problemes = [];
  onglet.on("pageerror", (e) => problemes.push(`erreur JavaScript : ${e.message}`));
  onglet.on("console", (m) => { if (m.type() === "error") problemes.push(`console : ${m.text()}`); });
  onglet.on("request", (r) => { if (!r.url().startsWith(prefixe)) problemes.push(`requête externe : ${r.url()}`); });

  const url = pathToFileURL(path.join(maquette, page)).href + requete;
  await onglet.goto(url, { waitUntil: "load" });

  const etat = await onglet.evaluate(() => ({
    niveau: document.body.dataset.niveau,
    etape: document.body.dataset.etape,
    mode: document.body.dataset.mode,
    panneau: document.querySelector(".panneau")?.getAttribute("data-ouvert") === "true",
    palette: document.querySelector(".palette")?.getAttribute("data-ouvert") === "true",
    feuille: document.querySelector('.feuille[data-ouvert="true"]')?.id.replace("feuille-", "") ?? null,
    debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  for (const [cle, valeur] of Object.entries(attendu)) {
    if (etat[cle] !== valeur) problemes.push(`état ${cle} = ${JSON.stringify(etat[cle])}, attendu ${JSON.stringify(valeur)}`);
  }
  if (etat.debord > 0) problemes.push(`défilement horizontal de ${etat.debord} px`);

  // La palette et les feuilles sont en position fixe / absolue : la capture pleine page les garde visibles.
  const fichier = path.join(sortie, `${nom}.png`);
  await onglet.screenshot({ path: fichier, fullPage: !attendu.palette });
  console.log(`${problemes.length ? "✗" : "✓"} ${nom} (${appareil.viewport.width} px) → ${path.relative(racine, fichier)}`);
  for (const p of problemes) console.log(`    ${p}`);
  if (problemes.length) echecs.push(nom);
  await contexte.close();
}

await navigateur.close();
if (echecs.length) {
  console.error(`Contrôles en échec : ${echecs.join(", ")}`);
  process.exit(1);
}
console.log(`${ECRANS.length} captures produites, contrôles verts.`);
