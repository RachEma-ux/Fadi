/**
 * Gardes de frontière vérifiées en CI (groupe E, point 2), sur les sources réelles du dépôt :
 *  - ARC-10 : aucune intégration par iframe de l'Atelier (complet ou non) et aucune carte mentale HTML de `Studio/`
 *    employée comme module applicatif (ni importée, ni servie par `public/`, ni chargée par une adresse) ;
 *  - EX-073 : les quantités, les exigences et leur contrôle se calculent sur les objets — aucun module de leur graphe
 *    d'imports n'atteint le rendu (scènes, PNG, vue 3D) ni une API de pixels (canvas, `getImageData`, `readPixels`).
 * Pur : lecture de fichiers seulement.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const WEB_SRC = join(RACINE, "apps/web/src");
const MODELE = join(RACINE, "packages/atelier-model/src");

function fichiers(dossier: string, filtre: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, filtre));
    else if (filtre(chemin)) out.push(chemin);
  }
  return out;
}
const source = (f: string) => !/\.test\.tsx?$/.test(f) && /\.(ts|tsx|js|mjs|html|css)$/.test(f);
/** Code sans commentaires (une mention dans un commentaire n'est pas un usage). */
const code = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/<!--[\s\S]*?-->/g, "");

/** Cartes mentales HTML de la référence (`Studio/*.html`). */
const CARTES = readdirSync(join(RACINE, "Studio")).filter((f) => f.endsWith(".html"));

/** Éléments `<iframe` du code de l'interface, avec leur fichier. */
export function iframes(fichiersSource: readonly string[], lire: (f: string) => string): { fichier: string; extrait: string }[] {
  const out: { fichier: string; extrait: string }[] = [];
  for (const f of fichiersSource) {
    const c = code(lire(f));
    for (const m of c.matchAll(/<iframe\b[\s\S]{0,400}?(?:\/>|>)/g)) out.push({ fichier: f, extrait: m[0] });
    for (const m of c.matchAll(/createElement\(\s*["'`]iframe["'`]\s*\)/g)) out.push({ fichier: f, extrait: m[0] });
  }
  return out;
}
/** L'iframe charge-t-elle l'Atelier (son adresse `src` vise une route ou un module de l'Atelier) ? */
export const viseAtelier = (extrait: string) => /\bsrc=\{?\s*[`"'][^`"']*atelier/i.test(extrait);
/** Références à une carte mentale HTML (nom de fichier) dans un code source. */
export function referencesCartes(texte: string, cartes: readonly string[]): string[] {
  const c = code(texte);
  return cartes.filter((n) => c.includes(n) || c.includes(encodeURIComponent(n)));
}

describe("ARC-10 — ni iframe de l'Atelier, ni carte mentale HTML comme module applicatif", () => {
  it("ARC-10 [−] gardes construites : une iframe de l'Atelier et une carte mentale importée sont détectées", () => {
    const faux = new Map([
      ["a.tsx", 'export const X = () => <iframe src="/projects/1/atelier?embed=1" title="Atelier" />;'],
      ["p.tsx", 'export const P = () => <iframe title="Parcelle — Atelier satellite" src={`/parcelle/index.html`} />;'],
      ["b.tsx", "// <iframe src=\"/atelier\"> en commentaire seulement\nexport const Y = 1;"],
      ["c.ts", 'import carte from "../../Studio/Fadi_Studio_Mind_Maps_Interactives.html?raw";'],
    ]);
    const trouves = iframes([...faux.keys()], (f) => faux.get(f)!);
    expect(trouves.map((t) => [t.fichier, viseAtelier(t.extrait)])).toEqual([["a.tsx", true], ["p.tsx", false]]);
    expect(referencesCartes(faux.get("c.ts")!, ["Fadi_Studio_Mind_Maps_Interactives.html"])).toEqual(["Fadi_Studio_Mind_Maps_Interactives.html"]);
    expect(referencesCartes(faux.get("b.tsx")!, ["Fadi_Studio_Mind_Maps_Interactives.html"])).toEqual([]);
  });

  it("ARC-10 [+] dépôt réel : aucune iframe ne vise l'Atelier ; Studio n'emploie aucune iframe ; seule l'iframe déclarée de l'outil Parcelle existe", () => {
    const src = fichiers(WEB_SRC, source);
    const trouves = iframes(src, (f) => readFileSync(f, "utf8"));
    expect(trouves.filter((t) => viseAtelier(t.extrait)).map((t) => relative(RACINE, t.fichier))).toEqual([]);
    expect(trouves.filter((t) => t.fichier.includes(`${join("modules", "studio")}`)).map((t) => relative(RACINE, t.fichier))).toEqual([]);
    expect([...new Set(trouves.map((t) => relative(RACINE, t.fichier)))]).toEqual(["apps/web/src/modules/projets-sources/ParcelleTool.tsx"]);
  });

  it("ARC-10 [+] dépôt réel : aucune carte mentale HTML de Studio/ n'est importée, chargée ni servie par l'application", () => {
    expect(CARTES.filter((n) => /mind_map/i.test(n)).length).toBeGreaterThan(0);
    const appli = [...fichiers(WEB_SRC, source), ...fichiers(join(RACINE, "apps/web/public"), () => true), join(RACINE, "apps/web/index.html"), join(RACINE, "apps/web/vite.config.ts")];
    const fautifs = appli.filter((f) => referencesCartes(readFileSync(f, "utf8"), CARTES).length > 0).map((f) => relative(RACINE, f));
    expect(fautifs).toEqual([]);
    for (const n of CARTES) expect(existsSync(join(RACINE, "apps/web/public", n)), n).toBe(false);
  });
});

// --- EX-073 ----------------------------------------------------------------------------------------------------------

/** Graphe des imports relatifs (fermeture transitive) depuis des modules d'entrée. */
function fermeture(entrees: readonly string[]): Set<string> {
  const vus = new Set<string>();
  const pile = [...entrees];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    const texte = code(readFileSync(f, "utf8"));
    for (const m of texte.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const base = resolve(dirname(f), m[1]!.replace(/\.js$/, ""));
      const cible = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((c) => existsSync(c));
      if (cible) pile.push(cible);
    }
  }
  return vus;
}
/** Rendu de l'interface (vue 3D, rendu des scènes, export PNG). Les scènes du modèle sont des données (caméras), pas des pixels. */
const RENDU = /apps[\\/]web[\\/].*[\\/](vue3d|scenes)[\\/]|[\\/]png\.ts$/;
const PIXELS = /getImageData|readPixels|toDataURL|OffscreenCanvas|HTMLCanvasElement|ImageData\b/;

describe("EX-073 — quantités et règles calculées sur les objets, jamais sur les pixels d'une illustration", () => {
  const entrees = [
    join(MODELE, "studio/quantites.ts"), join(MODELE, "studio/bilan-quantites.ts"), join(MODELE, "studio/quantites-ajustements.ts"),
    join(MODELE, "studio/architecture/quantites.ts"), ...fichiers(join(MODELE, "studio/exigences"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
    // Logique de l'interface (calcul, mise en forme, CSV), sans les composants React qui la composent avec d'autres panneaux.
    ...fichiers(join(WEB_SRC, "modules/studio/quantites"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
    ...fichiers(join(WEB_SRC, "modules/studio/exigences"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
  ];

  it("EX-073 [−] garde construite : un module de rendu ou une lecture de pixels dans le graphe serait détecté", () => {
    expect(RENDU.test("/x/apps/web/src/modules/studio/vue3d/scenes/png.ts")).toBe(true);
    expect(RENDU.test("/x/apps/web/src/modules/studio/vue3d/scene-rendu.ts")).toBe(true);
    expect(PIXELS.test("const d = ctx.getImageData(0, 0, w, h);")).toBe(true);
    expect(RENDU.test("/x/studio/quantites.ts") || PIXELS.test("surface(objet)")).toBe(false);
  });

  it("EX-073 [−] dépôt réel : le graphe des quantités, des exigences et de leurs panneaux n'atteint ni rendu, ni scène, ni lecture de pixels", () => {
    const graphe = [...fermeture(entrees)];
    expect(graphe.length).toBeGreaterThan(entrees.length);
    expect(graphe.filter((f) => RENDU.test(f)).map((f) => relative(RACINE, f))).toEqual([]);
    expect(graphe.filter((f) => PIXELS.test(code(readFileSync(f, "utf8")))).map((f) => relative(RACINE, f))).toEqual([]);
  });
});

// --- EX-099 ----------------------------------------------------------------------------------------------------------

describe("EX-099 — adaptativité conditionnée : la dégradation suit les mesures, les données publiables n'en dépendent pas", () => {
  it("EX-099 [+] trames mesurées au-delà du budget : la qualité d'affichage baisse (annoncée) ; revenues sous le seuil : elle remonte", async () => {
    const q = await import("./vue3d/qualite-rendu");
    const c = { ombres: true, antiCrenelage: true };
    let e = q.ETAT_QUALITE_INITIAL;
    for (let i = 0; i < q.FENETRE_TRAMES * 6; i++) e = q.observerTrame(e, q.BUDGET_TRAME_MS * 3, c);
    expect(q.qualiteReduite(e)).toBe(true);
    expect(q.reglageQualite(e, c)).not.toEqual(q.reglageQualite(q.ETAT_QUALITE_INITIAL, c));
    for (let i = 0; i < q.FENETRE_TRAMES * 12; i++) e = q.observerTrame(e, q.SEUIL_RETOUR_MS / 4, c);
    expect(q.qualiteReduite(e)).toBe(false);
  });

  it("EX-099 [−] dépôt réel : exports, feuilles, dossiers et paquets publiés ne lisent ni la qualité d'affichage, ni la vue 3D, ni les mesures de trame", () => {
    const entrees = [
      join(MODELE, "studio/export.ts"), join(MODELE, "studio/ifc.ts"), join(MODELE, "studio/feuille.ts"), join(MODELE, "studio/dossier-conception.ts"),
      ...fichiers(join(MODELE, "studio/exporteurs"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
      join(RACINE, "apps/api/src/lib/studio-publications.ts"), join(RACINE, "apps/api/src/lib/studio-dossiers.ts"),
      ...fichiers(join(WEB_SRC, "modules/studio/feuille"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
      ...fichiers(join(WEB_SRC, "modules/studio/dossier"), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)),
    ];
    const graphe = [...fermeture(entrees)];
    expect(graphe.length).toBeGreaterThan(entrees.length);
    const QUALITE = /qualite-rendu|[\\/]vue3d[\\/]|[\\/]chargement[\\/]perf\.ts$|mesures-studio/;
    expect(graphe.filter((f) => QUALITE.test(f)).map((f) => relative(RACINE, f))).toEqual([]);
    expect(graphe.filter((f) => /\b(observerTrame|reglageQualite|qualiteReduite|PALIERS_QUALITE)\b/.test(code(readFileSync(f, "utf8")))).map((f) => relative(RACINE, f))).toEqual([]);
  });
});
