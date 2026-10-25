/**
 * CAD-07 (ADR-STUDIO-PILOTE-01, P-12) : l'inventaire qualifié des fonctions industrielles de l'Atelier est COEX-01
 * (`docs/ai-team/reports/claude-m13-coex/COEX-01-QUALIFICATION.json`, adopté en P-09) — 22 composants, aucun retrait ni
 * remplacement automatique. Ce contrôle relit l'inventaire et vérifie, sur les sources réelles du dépôt, que chacun des
 * 22 composants reste présent (chemins nommés par sa ligne). Une suppression, un renommage silencieux ou une
 * qualification « Retirer » / « Remplacer » introduite sans lot autorisé fait échouer la CI (COEX-06, MIG-COEX-07).
 * Pur : lecture de fichiers seulement.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const INVENTAIRE = "docs/ai-team/reports/claude-m13-coex/COEX-01-QUALIFICATION.json";
const A = "apps/web/src/modules/atelier";

/** Chemins qui matérialisent chaque composant (repris des lignes de COEX-01 au `817bd36`). */
export const COMPOSANTS_COEX01: Readonly<Record<string, readonly string[]>> = Object.freeze({
  C01: [`${A}/bus/atelier-client.ts`, `${A}/bus/etat-projet.ts`],
  C02: [`${A}/nouveau/AtelierNouveau.tsx`],
  C03: [`${A}/nouveau/plan2d/Plan2D.tsx`, `${A}/nouveau/plan2d/rendu.tsx`, `${A}/nouveau/plan2d/accrochage.ts`],
  C04: [`${A}/nouveau/vue3d/scene3d.ts`],
  C05: [`${A}/nouveau/planche/`],
  C06: [`${A}/nouveau/exact/`],
  C07: [`${A}/nouveau/documents/`],
  C08: [`${A}/nouveau/panneaux/`],
  C09: [`${A}/nouveau/outils.ts`],
  C10: [`${A}/nouveau/etat-ui.ts`, `${A}/nouveau/navigation.ts`, `${A}/nouveau/raccourcis.ts`, `${A}/nouveau/actions.ts`, `${A}/nouveau/messages.ts`],
  C11: [`${A}/DesignReview.tsx`, `${A}/AtelierHarmonyPage.tsx`],
  C12: ["apps/web/src/lib/use-immersive.ts"],
  C13: ["packages/atelier-model/"],
  C14: ["packages/planche-model/"],
  C15: ["packages/geometry-exact/"],
  C16: ["packages/core-geometry/", "packages/domain-model/"],
  C17: ["apps/api/src/routes/atelier-commands.ts"],
  C18: ["apps/api/src/lib/atelier-modele.ts"],
  C19: ["apps/api/src/routes/atelier-versions.ts", "apps/api/src/lib/atelier-versions.ts"],
  C20: ["apps/api/src/routes/atelier-automatisation.ts"],
  C21: ["apps/web/src/lib/local-store.ts"],
  C22: ["apps/web/vite.config.ts", "apps/web/public/sw.js"],
});

interface Composant { id: string; composant: string; qualification_proposee: string[] }

/** Composants absents (chemin manquant, ou dossier attendu devenu fichier) : `[id, chemin]`. */
export function composantsAbsents(table: Readonly<Record<string, readonly string[]>>, existe: (chemin: string) => "fichier" | "dossier" | null): [string, string][] {
  const out: [string, string][] = [];
  for (const [id, chemins] of Object.entries(table)) {
    for (const c of chemins) {
      const nature = existe(c);
      if (nature === null || (c.endsWith("/") && nature !== "dossier")) out.push([id, c]);
    }
  }
  return out;
}
/** Qualifications interdites sans lot explicitement autorisé (COEX-06). */
export const qualificationsInterdites = (composants: readonly Composant[]) =>
  composants.filter((c) => c.qualification_proposee.some((q) => /retirer|remplacer/i.test(q))).map((c) => c.id);

const surDisque = (chemin: string) => {
  const p = join(RACINE, chemin);
  if (!existsSync(p)) return null;
  return statSync(p).isDirectory() ? "dossier" as const : "fichier" as const;
};

describe("CAD-07 — l'inventaire qualifié COEX-01 (22 composants) reste présent, sans retrait ni remplacement", () => {
  const inventaire = JSON.parse(readFileSync(join(RACINE, INVENTAIRE), "utf8")) as { composants: Composant[] };

  it("CAD-07 [+] COEX-01 compte exactement 22 composants C01 à C22, aucun qualifié « Retirer » ni « Remplacer »", () => {
    expect(inventaire.composants.map((c) => c.id)).toEqual(Array.from({ length: 22 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
    expect(Object.keys(COMPOSANTS_COEX01)).toEqual(inventaire.composants.map((c) => c.id));
    expect(qualificationsInterdites(inventaire.composants)).toEqual([]);
  });

  it("CAD-07 [+] chaque chemin contrôlé est bien celui que nomme la ligne de son composant", () => {
    for (const c of inventaire.composants) {
      for (const chemin of COMPOSANTS_COEX01[c.id]!) {
        const nom = chemin.replace(/\/$/, "").split("/").pop()!.replace(/\.tsx?$/, "");
        expect(c.composant.includes(nom), `${c.id} : « ${nom} » absent de « ${c.composant} »`).toBe(true);
      }
    }
  });

  it("CAD-07 [+] dépôt réel : les 22 composants de COEX-01 sont présents (aucune suppression automatique)", () => {
    expect(composantsAbsents(COMPOSANTS_COEX01, surDisque)).toEqual([]);
  });

  it("CAD-07 [−] garde construite : un composant supprimé ou une qualification « Retirer » est détecté", () => {
    const sansPlanche = (c: string) => (c.includes("nouveau/planche") ? null : surDisque(c));
    expect(composantsAbsents(COMPOSANTS_COEX01, sansPlanche)).toEqual([["C05", `${A}/nouveau/planche/`]]);
    const fichierAuLieuDuDossier = (c: string) => (c === "packages/geometry-exact/" ? "fichier" : surDisque(c));
    expect(composantsAbsents(COMPOSANTS_COEX01, fichierAuLieuDuDossier)).toEqual([["C15", "packages/geometry-exact/"]]);
    expect(qualificationsInterdites([{ id: "C09", composant: "Palette", qualification_proposee: ["Retirer"] }, { id: "C12", composant: "x", qualification_proposee: ["Isoler"] }])).toEqual(["C09"]);
  });
});
