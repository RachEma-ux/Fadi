#!/usr/bin/env node
/**
 * Extraction du moteur de l'Atelier natif (« Design Atelier V14-3 intégré
 * nativement ») depuis `Parcours_V8_19_Escalier_B_Mezzanine.html`, tel quel :
 *
 *   node apps/web/scripts/extract-native-atelier.mjs <chemin-du-html>
 *
 * Produit :
 *   apps/web/src/modules/atelier/native/root.html   — le sous-arbre #nativeDesignerRoot (markup, 3 dialogues, canvas, SVG)
 *   apps/web/src/modules/atelier/native/native.css  — les 5 blocs <style> du moteur et de son intégration (scopés #nativeDesignerRoot / #atelier-toolbar / classes propres)
 *   apps/web/public/atelier-native/v14-viewer.js    — script anonyme #1 : proj4 + viewer (3D, plan/coupe/façade, vues, exports, solaire)
 *   apps/web/public/atelier-native/v14-tools.js     — script anonyme #2 : géométrie partagée + outils de dessin (fd*)
 *   apps/web/public/atelier-native/v8-toolbar.js    — barre d'outils V8 (code hôte, IIFE autonome ; une seule dépendance au numéro d'étape, remplacée par window.AtelierHost)
 *
 * Le script anonyme #0 (pont de stockage + données P.118 embarquées) n'est
 * PAS repris : Fadi fournit son propre `window.ParcoursSession.storage`
 * (adaptateur vers l'API) avant de charger le moteur — c'est la couture
 * prévue par le moteur lui-même (`const STORE = window.ParcoursSession?.storage || localStorage`).
 *
 * Les fichiers JS sont servis en scripts classiques (mode non strict,
 * portée globale), exactement comme dans le prototype — ils ne sont ni
 * transpilés ni réécrits. Le README du dossier porte le SHA-256 de la source.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error("usage: extract-native-atelier.mjs <Parcours_V8_19_Escalier_B_Mezzanine.html>");
  process.exit(2);
}
const html = readFileSync(htmlPath, "utf8");
const sha256 = createHash("sha256").update(html).digest("hex");
const EXPECTED_SHA = "e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9";
if (sha256 !== EXPECTED_SHA) {
  console.error(`Empreinte inattendue : ${sha256} (attendue ${EXPECTED_SHA})`);
  process.exit(1);
}

// --- scripts (par position : les blocs anonymes n'ont pas d'id) ------------
const scripts = [];
const re = /<script([^>]*)>/g;
let m;
while ((m = re.exec(html))) {
  const start = m.index + m[0].length;
  const end = html.indexOf("</script>", start);
  scripts.push({ attrs: m[1], body: html.slice(start, end) });
}
const anon = scripts.filter((s) => !/\bid=/.test(s.attrs));
const viewer = anon[1].body;
const tools = anon[2].body;
if (!viewer.includes("window.V14Bridge=") || !tools.startsWith("/* Shared model geometry")) throw new Error("blocs du moteur non reconnus");

// --- barre d'outils V8 (dans l'app hôte, bloc anonyme #3) -------------------
const host = anon[3].body;
const tbStart = host.indexOf("(function(){\n const $q=(q)=>document.querySelector(q);");
const tbEnd = host.indexOf("})();", host.indexOf("window.initAtelierToolbar=initToolbar;")) + 5;
if (tbStart < 0 || tbEnd < 5) throw new Error("barre d'outils V8 introuvable");
let toolbar = host.slice(tbStart, tbEnd);
// Seule dépendance au reste de l'app hôte : le numéro d'étape courant (le bouton
// « Harmonie » de l'onglet Analyser n'existe qu'à l'étape 10).
const before = toolbar;
toolbar = toolbar.replace("Number(cur)===10", "Number(window.AtelierHost?.stage)===10");
if (toolbar === before) throw new Error("dépendance `cur` non trouvée dans la barre d'outils");
if (/\bcur\b/.test(toolbar)) throw new Error("la barre d'outils dépend encore de `cur`");
// L'init automatique au DOMContentLoaded n'a pas de sens une fois montée par Fadi.
toolbar = toolbar.replace(" document.addEventListener('DOMContentLoaded',()=>setTimeout(initToolbar,0));\n", "\n");

// --- markup : #nativeDesignerRoot ------------------------------------------
function elementAt(src, startIdx) {
  const tagRe = /<\/?([a-zA-Z][\w-]*)(?:"[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g;
  tagRe.lastIndex = startIdx;
  const voids = new Set(["br", "img", "input", "meta", "link", "hr", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);
  let depth = 0;
  let t;
  while ((t = tagRe.exec(src))) {
    const name = t[1].toLowerCase();
    if (voids.has(name)) continue;
    if (t[0].startsWith("</")) {
      depth--;
      if (depth === 0) return src.slice(startIdx, t.index + t[0].length);
    } else if (t[2] !== "/") depth++;
  }
  throw new Error("élément non fermé");
}
const rootIdx = html.indexOf('<div id="nativeDesignerRoot"');
const root = elementAt(html, rootIdx);

// --- CSS : les blocs scopés du moteur ----------------------------------------
const styles = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
// `seed888-css` est le bloc d'intégration de l'app hôte V4.9–V4.10 : il
// masque l'en-tête et la barre héritée du moteur quand il est monté dans une
// étape, place les commandes de caméra flottantes, la rotation et la grille
// de dessin. Sans lui, le moteur affiche son accueil autonome.
const wanted = styles.filter(
  (s) =>
    /native-designer-scoped-css|atelier-collapsible-tools-css|atelier-level-menu-v87-css|seed888-css/.test(s[1]) ||
    s[2].trimStart().startsWith("/* The original two-column tool palette"),
);
if (wanted.length !== 5) throw new Error(`5 blocs CSS attendus, ${wanted.length} trouvés`);
const css = wanted.map((s) => `/* ${(s[1].match(/id="([^"]+)"/) || [, "palette d'outils (bloc sans id)"])[1]} */\n${s[2].trim()}`).join("\n\n");

// --- écriture ----------------------------------------------------------------
const nativeDir = join(web, "src/modules/atelier/native");
const publicDir = join(web, "public/atelier-native");
mkdirSync(nativeDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
writeFileSync(join(nativeDir, "root.html"), root + "\n");
writeFileSync(join(nativeDir, "native.css"), css + "\n");
writeFileSync(join(publicDir, "v14-viewer.js"), viewer);
writeFileSync(join(publicDir, "v14-tools.js"), tools);
writeFileSync(join(publicDir, "v8-toolbar.js"), toolbar + "\n");
writeFileSync(
  join(publicDir, "README.md"),
  `# Moteur de l'Atelier natif — extrait tel quel du prototype

Source : \`Parcours_V8_19_Escalier_B_Mezzanine.html\`, SHA-256 \`${sha256}\`
(voir docs/migration/reference.md). Généré par \`apps/web/scripts/extract-native-atelier.mjs\` —
ne pas modifier à la main : relancer le script.

| Fichier | Origine | Octets |
|---|---|---:|
| v14-viewer.js | script anonyme #1 (proj4 + viewer V14 : 3D, plan/coupe/façade, vues, exports, solaire) | ${viewer.length} |
| v14-tools.js | script anonyme #2 (géométrie partagée + outils de dessin natifs) | ${tools.length} |
| v8-toolbar.js | barre d'outils V8.2–8.8 de l'app hôte (IIFE), \`cur\` remplacé par \`window.AtelierHost.stage\` | ${toolbar.length} |

Chargés comme scripts classiques (portée globale, mode non strict), dans cet
ordre, après que \`window.ParcoursSession.storage\` (adaptateur Fadi) et le
markup \`#nativeDesignerRoot\` sont en place. Interfaces exposées par le moteur :
\`window.V14Bridge\`, \`window.AtelierTools\`, \`window.initAtelierToolbar\`,
événement \`parcours-native-change\` ({projectId, domain}).
`,
);
console.log(`root.html ${root.length} o · native.css ${css.length} o · viewer ${viewer.length} o · tools ${tools.length} o · toolbar ${toolbar.length} o`);
