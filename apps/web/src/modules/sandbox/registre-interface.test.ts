/**
 * Lot 2 — l'interface du Sandbox lit le registre unique (`REGISTRE_SANDBOX`) sans en garder de copie : pictogrammes,
 * raccourcis, familles et emplacements des outils, des commandes et des panneaux viennent du registre ; aucun fichier
 * de l'interface n'écrit un pictogramme ou un raccourci d'entrée en dur.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BARRE_GAUCHE_SANDBOX, OUTILS, REGISTRE_SANDBOX, entreeCommande, entreeOutil, entreesSandbox } from "@parcours/sandbox-planche-model";
import { COMMANDE_DETACHER_LIEN, COMMANDES_CONTEXTE, COMMANDES_DEBIT, COMMANDES_NAVIGATEUR, COMMANDES_OBJETS, COMMANDES_PIECE, COMMANDES_VUE } from "./planche/commandes-objets";
import { outilsBarre, pictoOutil, raccourciOutil, sectionsGrille } from "./planche/outils-planche";
import { REGISTRE_COMMANDES } from "./planche/registre-commandes";

const RACINE = dirname(fileURLToPath(import.meta.url));
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}
const sources = fichiers(RACINE).filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f));

describe("Sandbox — l'interface lit le registre unique (lot 2)", () => {
  it("outils : pictogramme, raccourci et emplacement de la barre et de la grille sont ceux du registre", () => {
    for (const o of OUTILS) {
      const e = entreeOutil(o.id);
      expect(pictoOutil(o.id), o.id).toBe(e.pictogramme);
      expect(raccourciOutil(o), o.id).toBe(e.raccourci);
    }
    expect(outilsBarre().map((o) => o.id)).toEqual([...BARRE_GAUCHE_SANDBOX]);
    const grille = sectionsGrille(OUTILS, () => true).flatMap((s) => s.outils.map((o) => o.id));
    for (const id of grille) expect(["grille", "menu-contextuel"], id).toContain(entreeOutil(id).emplacement);
    expect(new Set([...outilsBarre().map((o) => o.id), ...grille])).toEqual(new Set(OUTILS.map((o) => o.id)));
  });

  it("commandes : chaque liste de famille et le registre des commandes portent le pictogramme et le raccourci du registre", () => {
    const listes = [...COMMANDES_OBJETS, ...COMMANDES_CONTEXTE, COMMANDE_DETACHER_LIEN, ...COMMANDES_NAVIGATEUR, ...COMMANDES_VUE, ...COMMANDES_DEBIT, ...COMMANDES_PIECE];
    expect(listes.map((c) => c.id).sort()).toEqual(entreesSandbox("commande").map((e) => e.id).sort());
    for (const c of listes) {
      expect(c.picto, c.id).toBe(entreeCommande(c.id).pictogramme);
      expect(c.raccourci, c.id).toBe(entreeCommande(c.id).raccourci);
    }
    expect(REGISTRE_COMMANDES.map((e) => [e.id, e.famille, e.picto, e.raccourci])).toEqual(entreesSandbox("commande").map((e) => [e.id, e.famille, e.pictogramme, e.raccourci]));
  });

  it("aucun pictogramme ni raccourci d'entrée écrit en dur dans l'interface", () => {
    // Annuler / Rétablir (barre d'actions) ne sont pas des entrées du catalogue : icônes de l'interface, seule exception.
    const HORS_REGISTRE = /id: "(annuler|retablir)", picto: "(annuler|retablir)",/;
    for (const f of sources) {
      for (const ligne of readFileSync(f, "utf8").split("\n")) {
        if (HORS_REGISTRE.test(ligne)) continue;
        expect(ligne, f).not.toMatch(/\b(picto|raccourci):\s*["'`]/);
      }
    }
    // Plus de table de pictogrammes, de raccourcis Fadi ni d'ordre de barre recopiée dans l'interface.
    const tout = sources.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(tout).not.toMatch(/const PICTOS\b|const ORDRE_BARRE\b/);
    expect(tout).not.toMatch(/RACCOURCIS_FADI[^_\n]*=\s*\{/);
  });

  it("colonne de droite et « Objets et vue » : pictogrammes des panneaux lus au registre", () => {
    const planche = readFileSync(join(RACINE, "planche/Planche.tsx"), "utf8");
    for (const e of entreesSandbox("panneau").filter((x) => x.emplacement === "colonne")) {
      expect(planche, e.id).toContain(`data-planche-panneau-icone="${e.id}">\n          <Pictogramme className="canevas-picto" picto={pictoPanneau("${e.id}")} />`);
    }
    expect(planche).toMatch(/LISTE_PANNEAUX_OBJETS[^=]*= entreesSandbox\("panneau"\)\s*\.filter\(\(e\) => e\.emplacement === "objets-et-vue"\)/);
    expect(REGISTRE_SANDBOX.length).toBeGreaterThanOrEqual(86);
  });
});
