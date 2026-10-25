/**
 * Lot 3 — pictogrammes Tabler et sur mesure : `donnees.ts` est à jour (seules les icônes utilisées, version de
 * `@tabler/icons` figée), les 12 dessins sur mesure suivent la grille de Tabler, l'avis de licence MIT est conservé, le
 * rendu est un SVG sans texte (variante pleine pour l'outil actif) et plus aucun caractère Unicode ne sert d'icône.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { REGISTRE_SANDBOX, clePictogramme, entreeOutil } from "@parcours/sandbox-planche-model";
import { clesUtilisees, construirePictogrammes, texteDonnees } from "./construction";
import { PICTOGRAMMES, VERSION_TABLER } from "./donnees";
import { ICONES_INTERFACE } from "./interface";
import { IconeSandbox, Pictogramme } from "./Pictogramme";

const ICI = dirname(fileURLToPath(import.meta.url));
const MODULE = join(ICI, "..");
const tabler = join(dirname(createRequire(import.meta.url).resolve("@tabler/icons/outline/x.svg")), "../..");
const lireJson = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const surMesure = Object.fromEntries(
  readdirSync(join(ICI, "sur-mesure"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => [f.slice(0, -4), readFileSync(join(ICI, "sur-mesure", f), "utf8")]),
);

describe("Sandbox — pictogrammes (lot 3)", () => {
  it("donnees.ts est à jour : régénéré depuis @tabler/icons et sur-mesure/, il est identique", () => {
    const version = lireJson(join(tabler, "package.json")).version as string;
    const attendu = texteDonnees(construirePictogrammes(lireJson(join(tabler, "tabler-nodes-outline.json")), lireJson(join(tabler, "tabler-nodes-filled.json")), surMesure), version);
    expect(readFileSync(join(ICI, "donnees.ts"), "utf8"), "relancer : npx tsx apps/web/scripts/generer-pictogrammes-sandbox.ts").toBe(attendu);
    expect(VERSION_TABLER).toBe(version);
  });

  it("seules les icônes utilisées sont embarquées : registre et interface, ni plus ni moins", () => {
    expect(Object.keys(PICTOGRAMMES).sort()).toEqual(clesUtilisees());
    for (const e of REGISTRE_SANDBOX) expect(PICTOGRAMMES[clePictogramme(e.pictogramme)], `${e.nature}:${e.id}`).toBeDefined();
    for (const nom of Object.values(ICONES_INTERFACE)) expect(PICTOGRAMMES[`tabler:${nom}`], nom).toBeDefined();
  });

  it("@tabler/icons : version figée dans le paquet web, avis de licence MIT conservé dans le dépôt", () => {
    const web = lireJson(join(MODULE, "../../../package.json")) as { dependencies: Record<string, string> };
    expect(web.dependencies["@tabler/icons"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(web.dependencies["@tabler/icons"]).toBe(VERSION_TABLER);
    const licence = readFileSync(join(ICI, "LICENCE-TABLER-ICONS.txt"), "utf8");
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toBe(readFileSync(join(tabler, "LICENSE"), "utf8"));
  });

  it("dessins sur mesure (douze validés le 20 octobre 2026, plus la barre « Axes et repères »), sur la grille de 24 px de Tabler au trait de 2 px, tous utilisés", () => {
    expect(Object.keys(surMesure).sort()).toEqual([
      "aligner", "allonger", "axes-affichage", "coupe-profil", "debit", "decalage", "eclater", "epaissir", "onglet", "plan-travail", "plan-verrou", "pousser", "profile", "rapporteur",
      "repere-actif", "repere-aligner", "repere-enregistrer", "repere-modele", "repere-pivoter", "repere-precedent", "reperes-liste", "suivez", "vue-normale",
    ]);
    for (const [nom, svg] of Object.entries(surMesure)) {
      expect(svg, nom).toContain('viewBox="0 0 24 24"');
      expect(svg, nom).toContain('stroke-width="2"');
      expect(svg, nom).toContain('stroke-linecap="round"');
      expect(svg, nom).not.toMatch(/<text\b|<image\b|<script\b|href=/);
      expect(PICTOGRAMMES[`fadi:${nom}`], nom).toBeDefined();
    }
  });

  it("rendu : un SVG décoratif, sans texte, teinté par famille ; variante pleine de Tabler pour l'outil actif", () => {
    const trait = renderToStaticMarkup(createElement(Pictogramme, { picto: entreeOutil("ligne").pictogramme }));
    expect(trait).toMatch(/^<svg class="sandbox-picto" viewBox="0 0 24 24"[^>]*aria-hidden="true"[^>]*data-picto="tabler:pencil" data-teinte="dessin"/);
    expect(trait.replace(/<[^>]+>/g, "")).toBe("");
    const plein = renderToStaticMarkup(createElement(Pictogramme, { picto: entreeOutil("ligne").pictogramme, actif: true }));
    expect(plein).toContain('fill="currentColor"');
    expect(plein).toContain("data-plein");
    // Sans variante pleine (dessin sur mesure), l'outil actif garde son trait.
    expect(renderToStaticMarkup(createElement(Pictogramme, { picto: entreeOutil("pousser-tirer").pictogramme, actif: true }))).not.toContain("data-plein");
    expect(renderToStaticMarkup(createElement(IconeSandbox, { nom: "fermer" }))).toContain('data-picto="tabler:x"');
  });

  it("plus aucun caractère Unicode ne sert d'icône dans l'interface du Sandbox", () => {
    const fichiers = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? fichiers(join(dir, n)) : [join(dir, n)]));
    const SYMBOLES = /[←-⇿⌀-⏿①-⓿■-➿⤀-⥿⨀-⯿\u{1F300}-\u{1FAFF}]/u;
    // Restes typographiques, pas des icônes : noms des touches fléchées, numéros de section, sens de tri, cote de diamètre ;
    // libellés hérités du menu de l'Atelier, absents de l'interface du Sandbox.
    const ADMIS: readonly RegExp[] = [/\["Fleche(Gauche|Haut|Droite|Bas)", "[←↑→↓]"/, /numero: "[①②③]"/, /" ▲" : " ▼"/, /`⌀ \$\{/, /"menu\.(fichier|harmonie)": "[☰◈] /];
    for (const f of fichiers(MODULE).filter((x) => /\.tsx?$/.test(x) && !/\.test\.ts$/.test(x) && !x.endsWith("donnees.ts"))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((ligne, i) => {
          const l = ligne.trim();
          if (l.startsWith("*") || l.startsWith("//") || l.startsWith("/*")) return;
          if (SYMBOLES.test(l) && !ADMIS.some((a) => a.test(l))) expect.fail(`${f}:${i + 1} : ${l}`);
        });
    }
  });
});
