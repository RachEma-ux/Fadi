import { describe, expect, it } from "vitest";
import { choisirDeclinaison, tableauVentilation, declinaisonParDefaut, declinaisonProche, grouperIndicateurs, indicateursPrincipaux } from "./dimensions.js";
import { MOTIFS_ABSENCE } from "./valeurs.js";

const ind = (id: string, famille: string | null, modalite: string | null, milieu: "ensemble" | "urbain" | "rural" | null, sexe: "ensemble" | "masculin" | "feminin" | null, theme: string | null = "Démographie") =>
  ({ id, titre: `${famille ?? id}${modalite ? ` — ${modalite}` : ""}`, theme, famille, modalite, milieu, sexe });

describe("dimensions d'indicateur (D-GD-17, lot A2)", () => {
  const liste = [
    ind("a", "Âge quinquennal (%)", "0-4 ans", "ensemble", "ensemble"),
    ind("b", "Âge quinquennal (%)", "5-9 ans", "ensemble", "ensemble"),
    ind("c", "Âge quinquennal (%)", "0-4 ans", "urbain", "masculin"),
    ind("d", "Taux de chômage (%)", null, "rural", "feminin", "Activité économique"),
    ind("e", null, null, null, null, null),
  ];
  it("familles par thème : modalités, milieux et sexes présents ; sans famille → thème « Autres indicateurs »", () => {
    const g = grouperIndicateurs(liste);
    expect(g.map((f) => [f.theme, f.famille, f.indicateurs.length])).toEqual([["Démographie", "Âge quinquennal (%)", 3], ["Activité économique", "Taux de chômage (%)", 1], ["Autres indicateurs", "e", 1]]);
    expect(g[0]!.modalites).toEqual(["0-4 ans", "5-9 ans"]);
    expect(g[0]!.milieux).toEqual(["ensemble", "urbain"]);
    expect(g[0]!.sexes).toEqual(["ensemble", "masculin"]);
  });
  it("déclinaison : trouvée seulement si elle existe (jamais une autre à la place)", () => {
    const f = grouperIndicateurs(liste)[0]!;
    expect(choisirDeclinaison(f, "0-4 ans", "urbain", "masculin")?.id).toBe("c");
    expect(choisirDeclinaison(f, "5-9 ans", "urbain", "masculin")).toBeNull();
  });
  it("déclinaison proche : garde la dimension changée, les autres s'adaptent ; par défaut : ensemble, première modalité", () => {
    const f = grouperIndicateurs(liste)[0]!;
    expect(declinaisonProche(f, "0-4 ans", "urbain", "ensemble", "milieu")?.id).toBe("c");
    expect(declinaisonProche(f, "5-9 ans", "urbain", "masculin", "modalite")?.id).toBe("b");
    expect(declinaisonProche(f, "0-4 ans", "rural", "ensemble", "milieu")).toBeNull();
    expect(declinaisonParDefaut(f).id).toBe("a");
  });
  it("indicateurs principaux : tous sous le seuil, sinon sans modalité et ensemble seulement", () => {
    expect(indicateursPrincipaux(liste, 10)).toHaveLength(5);
    expect(indicateursPrincipaux(liste, 2).map((i) => i.id)).toEqual(["e"]);
  });
  it("tableau de ventilation : modalités en lignes, milieu × sexe présents en colonnes, cellule absente = null", () => {
    const t = tableauVentilation(grouperIndicateurs(liste)[0]!);
    expect(t.colonnes).toEqual([{ milieu: "ensemble", sexe: "ensemble" }, { milieu: "urbain", sexe: "masculin" }]);
    expect(t.lignes.map((l) => [l.modalite, l.cellules.map((c) => c?.id ?? null)])).toEqual([["0-4 ans", ["a", "c"]], ["5-9 ans", ["b", null]]]);
  });
  it("motif « sans objet » distinct des autres absences", () => {
    expect(MOTIFS_ABSENCE["sans-objet"]).toContain("Sans objet");
  });
});
