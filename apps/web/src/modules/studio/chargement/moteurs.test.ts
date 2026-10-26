import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { fermetureMoteurs, MOTEURS, MOTEURS_PAR_BARRE, MOTEURS_PAR_OUTIL, moteursDeBarre, moteursDeOutil } from "./moteurs";
import { RAISONS_INCOMPATIBLE } from "../hors-ligne/contrats";
import { TEXTES_FILE_LOCALE } from "../hors-ligne/AvisFileLocale";
import { tousLesTextes } from "./textes";

const racine = new URL("../../../../", import.meta.url);

describe("Moteurs de Studio et moments de chargement (B.3-01 à B.3-05)", () => {
  it("chaque outil du registre a ses moteurs, lus par sa barre (registre consommé tel quel)", () => {
    for (const t of STUDIO_TOOLS) expect(moteursDeBarre(t.groupe), `${t.toolId} (${t.groupe})`).not.toBeNull();
    // Aucune barre déclarée en trop : la table suit le registre.
    expect(new Set(Object.keys(MOTEURS_PAR_BARRE))).toEqual(new Set(STUDIO_TOOLS.map((t) => t.groupe)));
  });

  it("trois temps : démarrage léger, planche, premier usage ; jamais un moteur par bouton", () => {
    expect(MOTEURS.find((m) => m.moment === "demarrage")?.id).toBe("coquille-studio");
    expect(MOTEURS.filter((m) => m.moment === "planche").map((m) => m.id)).toEqual(["planche-2d"]);
    expect(MOTEURS.filter((m) => m.moment === "premier-usage").map((m) => m.id).sort()).toEqual(["calcul", "noyau-exact", "rendu-3d"]);
    // Bien moins de moteurs que d'outils : les outils mutualisent leurs moteurs (EX-041).
    expect(MOTEURS.length).toBeLessThan(STUDIO_TOOLS.length / 4);
  });

  it("dépendances fermées, dans l'ordre de chargement, sans doublon ni cycle", () => {
    expect(fermetureMoteurs(["rendu-3d"])).toEqual(["coquille-studio", "planche-2d", "calcul", "rendu-3d"]);
    expect(moteursDeBarre("dessin")).toEqual(["coquille-studio", "planche-2d"]);
    expect(moteursDeBarre("inconnue")).toBeNull();
    for (const m of MOTEURS) expect(new Set(fermetureMoteurs([m.id])).size).toBe(fermetureMoteurs([m.id]).length);
  });

  it("le rendu 3D partage le groupe de Workers de calcul (aucun noyau propre, D.3-04) ; seul le booléen exact charge le noyau exact (lot F2)", () => {
    expect(MOTEURS.find((m) => m.id === "rendu-3d")?.dependances).toContain("calcul");
    expect(fermetureMoteurs(["rendu-3d"])).not.toContain("noyau-exact");
    expect(MOTEURS.filter((m) => m.nature === "worker").map((m) => m.id)).toEqual(["calcul", "noyau-exact"]);
    // Granularité du moteur (EX-041) : le noyau exact s'ajoute au seul outil qui le demande, pas à sa barre.
    expect(moteursDeOutil("studio.solide.booleen", "volume-libre")).toEqual(["coquille-studio", "planche-2d", "calcul", "rendu-3d", "noyau-exact"]);
    // X.1-05 : l'épaississement d'une surface libre charge le même noyau exact.
    expect(moteursDeOutil("studio.surface.epaissir", "volume-libre")).toEqual(["coquille-studio", "planche-2d", "calcul", "rendu-3d", "noyau-exact"]);
    for (const t of STUDIO_TOOLS.filter((x) => x.toolId !== "studio.solide.booleen" && x.toolId !== "studio.surface.epaissir")) expect(moteursDeOutil(t.toolId, t.groupe), t.toolId).not.toContain("noyau-exact");
    expect(Object.keys(MOTEURS_PAR_OUTIL)).toEqual(["studio.solide.booleen", "studio.surface.epaissir"]);
    expect(MOTEURS.find((m) => m.id === "noyau-exact")?.annexes).toBe("(^|/)occt-wasm[^/]*\\.wasm$");
  });

  it("chaque moteur désigne un module source existant (lu par vite.config.ts)", () => {
    for (const m of MOTEURS) expect(existsSync(new URL(m.source, racine)), m.source).toBe(true);
    // moteurs.ts ne dépend de rien : vite.config.ts le lit au build.
    expect(readFileSync(new URL("src/modules/studio/chargement/moteurs.ts", racine), "utf8")).not.toMatch(/^import /m);
  });

  it("textes d'interface traduits dans en.json", () => {
    const en = JSON.parse(readFileSync(new URL("src/lib/i18n/en.json", racine), "utf8")) as Record<string, string>;
    for (const t of [...tousLesTextes(), ...Object.values(RAISONS_INCOMPATIBLE), ...Object.values(TEXTES_FILE_LOCALE)]) expect(en[t], t).toBeTruthy();
  });
});
