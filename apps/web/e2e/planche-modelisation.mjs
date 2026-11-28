/**
 * Recette « Outils de modélisation et composants d'agence » de la Planche (cas 2 du catalogue, lot 8 ; maquettes
 * `analyses/catalogue-extensions/cas-2/lot-8/lot8-1` à `lot8-4`, acceptées le 27 novembre 2026) :
 * - Ctrl+Maj+Espace affiche les seize commandes du lot 8 (secondes touches 1 à 0 et Maj + chiffre), aucune hors maquette ;
 * - « Info entité · Extrusion » (Ctrl+Maj+Espace, 1) : hauteur lue (2,80 m) puis portée à 3,10 m ; couches nommées en une
 *   saisie ; préréglage « Mur » (l'outil Mur reprend l'épaisseur des couches) ;
 * - « Composants dynamiques » (4) : fichier d'agence importé par la liste « Composant » (archivé en base), fenêtre placée
 *   d'un clic sur le mur, ouverture découpée ; régénérée à trois vantaux, le trou suit ;
 * - « Soustraire et garder » (7) : B − A gardé comme « Démolition 1 » ; sélection entre altitudes ; miroir lisible par
 *   deux points de l'axe ; Caler par deux points ; boîte 3D bornée par les altitudes, ou de hauteur tapée ;
 * - « Vue orthographique » (Maj+1) : image rendue par une caméra orthographique ; échelle graphique ; axonométrie
 *   éclatée sans toucher au modèle ; aire projetée union / somme ;
 * - aucune erreur JavaScript. Captures dans OUT.
 *
 *   BASE_URL=http://localhost:3001 OUT=atelier-captures/planche-modelisation node apps/web/e2e/planche-modelisation.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { inscrireDansLaPage } from "./lib-inscription.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const OUT = process.env.OUT ?? "atelier-captures/planche-modelisation";
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "fr-CH" });
const page = await context.newPage();
page.setDefaultTimeout(30000);
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 300));
});
await inscrireDansLaPage(page, `modelisation-${Date.now()}@example.com`, "planche-modelisation-ci-123", BASE);
await page.waitForURL(/\/(accueil|projets)$/);
await page.goto(`${BASE}/sandbox`);
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 60000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.waitForTimeout(800);

const racine = page.locator("[data-sandbox-planche]");
const vue = page.locator("[data-planche-vue]");
const panneau = (id) => racine.locator(`[data-planche-panneau='${id}']`);
const note = () => racine.locator("[data-planche-l8-note]").first().textContent().catch(() => "");
const modele = () => page.evaluate(() => window.fadiPlanche.modele());
const pas = () => page.evaluate(() => window.fadiPlanche.pas());
const choisir = (ids) => page.evaluate((x) => window.fadiPlanche.choisir(x), ids);
const toile = async () => page.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q) => {
  const b = await toile();
  const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return { x: b.x + e.x, y: b.y + e.y };
};
const survoler = async (q) => {
  const e = await ecran(q);
  await page.mouse.move(e.x, e.y, { steps: 4 });
  return e;
};
const cliquer = async (q) => {
  const e = await survoler(q);
  await page.mouse.click(e.x, e.y);
  await page.waitForTimeout(40);
};
const saisir = async (t) => {
  await page.keyboard.type(t);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(80);
};
const deuxTemps = async (touche) => {
  await vue.focus();
  await page.keyboard.press("Control+Shift+Space");
  await page.waitForTimeout(80);
  await page.keyboard.press(touche);
  await page.waitForTimeout(250);
};
const champ = async (attribut, valeur, entree = false) => {
  const l = racine.locator(`[${attribut}]`);
  await l.fill(valeur);
  if (entree) await l.press("Enter");
  await page.waitForTimeout(150);
};
const vider = async () => {
  await vue.focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  for (let i = 0; i < 80 && (await pas()) > 0; i++) await page.locator("[data-planche-annuler]").click();
  await choisir([]);
  // Le panneau ouvert couvrirait les points visés : il est refermé.
  if (await racine.locator("section.planche-panneau .canevas-fermer").count()) await racine.locator("section.planche-panneau .canevas-fermer").first().click();
  await page.waitForTimeout(150);
};
/** Volumes (m³) des occurrences de la racine, triés. */
const volumes = () =>
  page.evaluate(() => {
    const m = window.fadiPlanche.modele();
    const vol = (occ) => {
      const d = m.definitions[occ.definition].contenu;
      let v = 0;
      for (const f of Object.values(d.faces)) {
        for (const boucle of [f.exterieur, ...f.trous]) {
          const q = boucle.map((s) => d.sommets[s].position);
          for (let i = 1; i + 1 < q.length; i++) {
            const a = q[0], b = q[i], c = q[i + 1];
            v += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
          }
        }
      }
      return Math.round(Math.abs(v) * 1000) / 1000;
    };
    return Object.values(m.racine.occurrences).map(vol).sort((x, y) => x - y);
  });
/** Faces de la racine dont tous les sommets vérifient `filtre` (évalué dans la page). */
const facesOu = (filtre) =>
  page.evaluate((src) => {
    const f = new Function("p", `return ${src}`);
    const c = window.fadiPlanche.modele().racine;
    return Object.values(c.faces)
      .filter((x) => x.exterieur.every((s) => f(c.sommets[s].position)))
      .map((x) => x.id);
  }, filtre);
const trous = async () => Object.values((await modele()).racine.faces).reduce((n, f) => n + f.trous.length, 0);
/** Boîte en géométrie libre : rectangle 4 × 3 au sol puis Pousser/Tirer de `hauteur`. */
const boiteLibre = async (hauteur) => {
  await vue.focus();
  await page.keyboard.press("r");
  await cliquer({ x: 0, y: 0, z: 0 });
  await survoler({ x: 2, y: 1.5, z: 0 });
  await saisir("4;3");
  await page.keyboard.press("p");
  await cliquer({ x: 2, y: 1.5, z: 0 });
  await saisir(hauteur);
  await page.keyboard.press("Escape");
  await vue.focus();
  await page.keyboard.press(" ");
};
/** Groupe solide 2 × 2 × 1,5 (rectangle, Pousser/Tirer, triple-clic, Ctrl + G). */
const boiteSolide = async (coin, interieur) => {
  await vue.focus();
  await page.keyboard.press("r");
  await cliquer(coin);
  await survoler(interieur);
  await saisir("2;2");
  await page.keyboard.press("p");
  await cliquer(interieur);
  await saisir("1,5");
  await vue.focus();
  await page.keyboard.press(" ");
  const e = await survoler({ ...interieur, z: 1.5 });
  await page.mouse.click(e.x, e.y, { clickCount: 3 });
  await page.waitForTimeout(80);
  await page.keyboard.press("Control+g");
  await page.waitForTimeout(120);
  await page.keyboard.press("Escape");
};

// --- Secondes touches ---------------------------------------------------------------------------------------------------
await vue.focus();
await page.keyboard.press("Control+Shift+Space");
await racine.locator("[data-planche-deux-temps]").waitFor({ timeout: 5000 });
const secondes = await racine.locator("[data-planche-deux-temps-commande]").evaluateAll((l) => l.map((x) => x.getAttribute("data-planche-deux-temps-commande")));
const L8 = ["extrusion-hauteur", "creer-couches", "prolonger-arete", "composants-agence", "ajuster-baie", "remplacer-occurrences", "soustraire-garder", "caler-deux-points", "selection-altitudes", "selection-boite", "miroir-lisible", "ecreter-enveloppe", "vue-ortho", "eclater-axonometrie", "echelle-graphique", "aire-projetee"];
check("Ctrl+Maj+Espace : les seize commandes du lot 8 dans l'encadré", L8.every((id) => secondes.includes(id)), L8.filter((id) => !secondes.includes(id)).join(", "));
check("aucune commande hors maquette : ni « Mur depuis le tracé », ni « Importer »", !secondes.includes("murs-en-couches") && !secondes.includes("importer-composant"));
await page.keyboard.press("Escape");

// --- Extrusion et couches (maquette lot8-1) ---------------------------------------------------------------------------
await boiteLibre("2,8");
const dessus = await facesOu("Math.abs(p.z - 2.8) < 1e-6");
check("boîte libre 4 × 3 × 2,80 dessinée", dessus.length === 1, JSON.stringify(dessus));
await choisir(dessus);
await deuxTemps("Digit1");
await panneau("extrusion").waitFor({ timeout: 5000 });
const titreExtrusion = (await panneau("extrusion").locator("h3").textContent()) ?? "";
check("Ctrl+Maj+Espace, 1 : « Info entité · Extrusion », raccourci au titre", titreExtrusion.includes("Info entité · Extrusion") && titreExtrusion.includes("Ctrl+Maj+Espace, 1"), titreExtrusion);
const indication = await racine.locator("[data-planche-l8-hauteur]").getAttribute("placeholder");
check("hauteur de l'extrusion lue : 2,8 m", indication === "2,8 m", String(indication));
const pas0 = await pas();
await champ("data-planche-l8-hauteur", "3,1", true);
let m = await modele();
const zmax = Math.max(...Object.values(m.racine.sommets).map((s) => s.position.z));
check("hauteur portée à 3,10 m en un pas, la face d'origine reste", Math.abs(zmax - 3.1) < 1e-9 && (await pas()) === pas0 + 1 && Object.keys(m.racine.faces).length === 6, `z ${zmax}, pas ${await pas()}`);
await page.screenshot({ path: `${OUT}/lot8-1-extrusion.png` });
await choisir(await facesOu("Math.abs(p.z - 3.1) < 1e-6"));
await champ("data-planche-l8-epaisseurs", "enduit 0,015 ; maçonnerie 0,175 ; isolant 0,10");
await deuxTemps("Digit2");
m = await modele();
check("Ctrl+Maj+Espace, 2 : trois couches saisies en une liste, trois groupes", Object.keys(m.racine.occurrences).length === 3, `${Object.keys(m.racine.occurrences).length} ; ${await note()}`);
check("note : épaisseur totale 0,29 m", /0,29 m/.test(await note()), await note());
const nomsCouches = Object.values(m.racine.occurrences).map((o) => m.definitions[o.definition].nom).sort();
check("les couches portent les noms saisis (enduit, maçonnerie, isolant)", JSON.stringify(nomsCouches) === JSON.stringify(["enduit · 0,015 m", "isolant · 0,1 m", "maçonnerie · 0,175 m"]), JSON.stringify(nomsCouches));
check("« Mur depuis un tracé » : aucun bouton ni champ ajouté au panneau", (await racine.locator("[data-planche-l8='murs-en-couches'], [data-planche-l8-reference], [data-planche-l8-hauteur-mur]").count()) === 0);
await page.keyboard.press("Control+z");
await page.waitForTimeout(150);
// Préréglage « Mur » : l'outil Mur du cas 4 reprend l'épaisseur totale des couches saisies.
await vue.focus();
await page.keyboard.press("Control+Shift+KeyM");
await racine.locator("[data-planche-mur-champ='epaisseur']").waitFor({ timeout: 5000 }).catch(() => {});
const epMur = await racine.locator("[data-planche-mur-champ='epaisseur']").inputValue().catch(() => "");
check("préréglage « Mur » : l'outil Mur prend l'épaisseur des couches (0,29 m)", epMur === "0,29", epMur);
await vue.focus();
await page.keyboard.press("Escape");
await page.keyboard.press(" ");
await page.waitForTimeout(100);

// --- Composants d'agence (maquette lot8-2) -----------------------------------------------------------------------------
const mur = await facesOu("Math.abs(p.y) < 1e-6");
check("face de mur (y = 0) trouvée", mur.length === 1, JSON.stringify(mur));
await choisir(mur);
await deuxTemps("Digit4");
await panneau("composants-agence").waitFor({ timeout: 5000 });
check("Ctrl+Maj+Espace, 4 : « Composants dynamiques » s'ouvre", true);
const fenetre = JSON.stringify({ format: "fadi-composant/1", source: "Agence, détail menuiserie (essai de recette)", nom: "Fenêtre bois", genre: "fenetre", main: "gauche", cadre: { largeur: 0.06, profondeur: 0.07 }, vantaux: 2 });
check("aucun bouton « Importer » ajouté : l'import passe par la liste « Composant »", (await racine.locator("[data-planche-l8='importer-composant']").count()) === 0);
const [selecteur] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), racine.locator("[data-planche-l8-composant]").selectOption("__importer")]);
await selecteur.setFiles({ name: "fenetre-bois.json", mimeType: "application/json", buffer: Buffer.from(fenetre, "utf8") });
await page.waitForFunction(() => /archivé en base/.test(document.querySelector("[data-planche-l8-note]")?.textContent ?? ""), null, { timeout: 10000 }).catch(() => {});
check("fichier d'agence importé et archivé en base", /archivé en base/.test(await note()), await note());
check("le composant est proposé dans la liste", ((await racine.locator("[data-planche-l8-composant]").textContent()) ?? "").includes("Fenêtre bois"));
await champ("data-planche-l8-valeur-largeur", "1,6");
await champ("data-planche-l8-valeur-hauteur", "1,2");
await champ("data-planche-l8-valeur-allege", "0,9");
await choisir(mur);
const pas1 = await pas();
await deuxTemps("Digit5");
check("Ctrl+Maj+Espace, 5 sur un mur plein : la baie se place d'un clic (outil de pointage)", (await page.evaluate(() => window.fadiPlanche.outil())) === "pointage-baie", await page.evaluate(() => window.fadiPlanche.outil()));
await racine.locator("section.planche-panneau .canevas-fermer").first().click();
await cliquer({ x: 2.5, y: 0, z: 1.5 });
await page.waitForTimeout(150);
m = await modele();
const occFenetre = Object.values(m.racine.occurrences).find((o) => m.definitions[o.definition]?.composantAgence);
check("clic sur le mur : fenêtre posée en un pas, ouverture découpée dans le mur", !!occFenetre && (await trous()) === 1 && (await pas()) === pas1 + 1, `${await trous()} trou(s) ; ${await note()}`);
const xsBaie = Object.values(m.racine.faces).flatMap((f) => f.trous.flat().map((s) => m.racine.sommets[s].position.x));
check("le point cliqué donne le milieu de la largeur (x 1,70 à 3,30)", xsBaie.length > 0 && Math.abs(Math.min(...xsBaie) - 1.7) < 1e-6 && Math.abs(Math.max(...xsBaie) - 3.3) < 1e-6, JSON.stringify([Math.min(...xsBaie), Math.max(...xsBaie)]));
await deuxTemps("Digit4");
await panneau("composants-agence").waitFor({ timeout: 5000 });
check("composant : fichier archivé cité, valeurs saisies gardées", !!occFenetre && !!m.definitions[occFenetre.definition].composantAgence.archive && m.definitions[occFenetre.definition].composantAgence.valeurs.largeur === 1.6, JSON.stringify(occFenetre && m.definitions[occFenetre.definition].composantAgence?.valeurs));
await page.screenshot({ path: `${OUT}/lot8-2-composants.png` });
if (occFenetre) {
  await choisir([occFenetre.id]);
  await page.waitForTimeout(200);
  check("la case « Découper l'ouverture » reste cochée", await racine.locator("[data-planche-l8-decouper]").isChecked());
  check("composant choisi : ses valeurs remplissent les champs", (await racine.locator("[data-planche-l8-valeur-largeur]").inputValue()) === "1,6", await racine.locator("[data-planche-l8-valeur-largeur]").inputValue());
  await champ("data-planche-l8-valeur-vantaux", "3", true);
  m = await modele();
  const regen = m.racine.occurrences[occFenetre.id];
  check("régénéré à trois vantaux : nouvelle définition, l'ouverture suit (un trou)", regen && regen.definition !== occFenetre.definition && m.definitions[regen.definition].composantAgence.valeurs.vantaux === 3 && (await trous()) === 1, `${await note()}`);
  await choisir([occFenetre.id]);
  await vue.focus();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);
  check("composant effacé : le trou est rebouché", (await trous()) === 0, String(await trous()));
}

// --- Soustraire et garder, sélection, miroir (maquette lot8-3) ---------------------------------------------------------
await vider();
await boiteSolide({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0.5, z: 0 });
await boiteSolide({ x: 3, y: 2, z: 0 }, { x: 2.5, y: 1, z: 0 });
m = await modele();
const [A, B] = Object.keys(m.racine.occurrences);
check("deux solides de 6 m³", JSON.stringify(await volumes()) === "[6,6]", JSON.stringify(await volumes()));
await choisir([A, B]);
await deuxTemps("Digit7");
await panneau("soustraire").waitFor({ timeout: 5000 });
check("Ctrl+Maj+Espace, 7 : « Soustraire et garder » s'ouvre d'abord, rien n'est modifié", JSON.stringify(await volumes()) === "[6,6]" && /volume à retirer/.test(await note()), await note());
await champ("data-planche-l8-nom", "Démolition 1");
await choisir([A, B]);
await deuxTemps("Digit7");
await page.waitForFunction(() => Object.keys(window.fadiPlanche.modele().racine.occurrences).length === 2 && window.fadiPlanche.booleens() === "ok", null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(300);
m = await modele();
const noms = Object.values(m.racine.occurrences).map((o) => m.definitions[o.definition].nom).sort();
check("soustraction : B − A (3 m³) et la partie retirée gardée (3 m³)", JSON.stringify(await volumes()) === "[3,3]", JSON.stringify(await volumes()));
check("la partie gardée est nommée « Démolition 1 »", noms.includes("Démolition 1"), JSON.stringify(noms));
await page.screenshot({ path: `${OUT}/lot8-3-soustraire.png` });
await choisir([]);
await champ("data-planche-l8-altitudes", "0 ; 1,5");
await deuxTemps("Digit9");
check("Ctrl+Maj+Espace, 9 : les deux objets entre 0 et 1,50 m sont sélectionnés", (await page.evaluate(() => window.fadiPlanche.selection().length)) === 2, await note());
await champ("data-planche-l8-altitudes", "2 ; 3");
await deuxTemps("Digit9");
check("entre 2 et 3 m : aucun objet", (await page.evaluate(() => window.fadiPlanche.selection().length)) === 0, await note());
const pas2 = await pas();
check("miroir : aucune liste « Axe du miroir » ajoutée", (await racine.locator("[data-planche-l8-axe]").count()) === 0);
const avantMiroir = await modele();
await choisir(Object.keys(avantMiroir.racine.occurrences));
await deuxTemps("Digit0");
check("Ctrl+Maj+Espace, 0 : l'axe du miroir se pointe dans la vue", (await page.evaluate(() => window.fadiPlanche.outil())) === "pointage-miroir", await page.evaluate(() => window.fadiPlanche.outil()));
await racine.locator("section.planche-panneau .canevas-fermer").first().click();
await cliquer({ x: 4, y: 0, z: 0 });
await cliquer({ x: 4, y: 2, z: 0 });
await page.waitForTimeout(150);
check("deux points de l'axe : miroir lisible en un pas", (await pas()) === pas2 + 1 && (await page.evaluate(() => window.fadiPlanche.outil())) === "selection", `${await pas()} ; ${await page.evaluate(() => window.fadiPlanche.outil())} ; ${await racine.locator(".planche-consigne").textContent().catch(() => "")}`);
await page.keyboard.press("Control+z");
await page.waitForTimeout(120);
await deuxTemps("Digit7");
await panneau("soustraire").waitFor({ timeout: 5000 });
await choisir(Object.keys((await modele()).racine.occurrences).slice(0, 1));
await deuxTemps("Digit8");
check("Ctrl+Maj+Espace, 8 : l'outil Caler par deux points est actif", (await page.evaluate(() => window.fadiPlanche.outil())) === "pointage-caler", await page.evaluate(() => window.fadiPlanche.outil()));
await vue.focus();
await page.keyboard.press("Escape");
// Les altitudes saisies bornent la hauteur de la boîte tracée à plat (0 à 1,50 m : les deux solides y tiennent).
await champ("data-planche-l8-altitudes", "0 ; 1,5");
await deuxTemps("Shift+Digit9");
check("Ctrl+Maj+Espace, Maj+9 : l'outil Boîte 3D est actif", (await page.evaluate(() => window.fadiPlanche.outil())) === "pointage-boite", await page.evaluate(() => window.fadiPlanche.outil()));
// Le panneau ouvert couvrirait le second coin : il est refermé (l'outil reste actif).
await racine.locator("section.planche-panneau .canevas-fermer").first().click();
await cliquer({ x: -1, y: -1, z: 0 });
await cliquer({ x: 3.5, y: 2.5, z: 0 });
check("boîte 3D tracée à plat, bornée par les altitudes saisies : les deux objets sont sélectionnés", (await page.evaluate(() => window.fadiPlanche.selection().length)) === 2, String(await page.evaluate(() => window.fadiPlanche.selection().length)));
// Sans altitudes saisies, la hauteur de la boîte se donne dans la vue : ici tapée au champ Mesures (1,5 m).
await deuxTemps("Digit7");
await panneau("soustraire").waitFor({ timeout: 5000 });
await champ("data-planche-l8-altitudes", "");
await deuxTemps("Shift+Digit9");
await racine.locator("section.planche-panneau .canevas-fermer").first().click();
await choisir([]);
await cliquer({ x: -1, y: -1, z: 0 });
await cliquer({ x: 3.5, y: 2.5, z: 0 });
check("boîte 3D sans altitudes : un troisième temps attend la hauteur", (await page.evaluate(() => window.fadiPlanche.outil())) === "pointage-boite");
await vue.focus();
await saisir("1,5");
check("hauteur tapée (1,5 m) : les deux objets sont sélectionnés", (await page.evaluate(() => window.fadiPlanche.selection().length)) === 2, String(await page.evaluate(() => window.fadiPlanche.selection().length)));

// --- Vue orthographique, échelle, éclatement, aire projetée (maquette lot8-4) -------------------------------------------
await deuxTemps("Shift+Digit1");
await panneau("vues-mesures").waitFor({ timeout: 5000 });
check("Ctrl+Maj+Espace, Maj+1 : image rendue par une caméra orthographique exacte", (await page.evaluate(() => window.fadiPlanche.projectionRendue())) === "OrthographicCamera", await page.evaluate(() => window.fadiPlanche.projectionRendue()));
await deuxTemps("Shift+Digit3");
const echelle = racine.locator("[data-planche-echelle-graphique]");
check("Ctrl+Maj+Espace, Maj+3 : échelle graphique affichée, longueur ronde et 1:n", (await echelle.isVisible()) && /^(1|2|5)(0*|\.0*[125])?/.test((await echelle.getAttribute("data-longueur")) ?? "") && /1:\d+/.test((await echelle.textContent()) ?? ""), `${await echelle.getAttribute("data-longueur")} ; ${await echelle.textContent()}`);
const avant = JSON.stringify(await modele());
await champ("data-planche-l8-ecart", "3");
await deuxTemps("Shift+Digit2");
// Sans niveau d'étage, tous les objets forment un seul groupe : rien n'est levé ; l'affichage passe en lecture seule.
check("Ctrl+Maj+Espace, Maj+2 : axonométrie éclatée (un groupe sans niveau), le modèle ne bouge pas", JSON.stringify(await modele()) === avant && /1 groupe\(s\), écart 3 m/.test(await note()), await note());
await choisir(Object.keys((await modele()).racine.occurrences));
await vue.focus();
await page.keyboard.press("Delete");
await page.waitForTimeout(200);
check("axonométrie éclatée : lecture seule, Suppr n'efface rien", JSON.stringify(await modele()) === avant);
await page.screenshot({ path: `${OUT}/lot8-4-vues.png` });
await deuxTemps("Shift+Digit2");
check("de nouveau : éclatement refermé, le modèle affiché est le modèle", JSON.stringify(await page.evaluate(() => window.fadiPlanche.modeleAffiche())) === avant, await note());
await choisir(Object.keys((await modele()).racine.occurrences));
await deuxTemps("Shift+Digit4");
await page.waitForTimeout(300);
const aire = ((await racine.locator("[data-planche-l8-aire]").textContent()) ?? "").replace(/\s+/g, " ");
check("Ctrl+Maj+Espace, Maj+4 : aire projetée, union et somme chiffrées", /m²/.test(aire) && !/non évaluée/.test(aire), aire);
await deuxTemps("Shift+Digit1");
check("Maj+1 de nouveau : retour à la perspective", (await page.evaluate(() => window.fadiPlanche.projectionRendue())) === "PerspectiveCamera", await page.evaluate(() => window.fadiPlanche.projectionRendue()));

check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
await browser.close();
console.log(echecs === 0 ? "\nRecette lot 8 : tout est vert." : `\nRecette lot 8 : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
