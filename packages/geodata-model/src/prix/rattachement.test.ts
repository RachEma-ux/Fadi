import { describe, expect, it } from "vitest";
import { normaliserLibelleLocalite, precisionSuffisante, rattacherLocalite, type TerritoireCandidat } from "./rattachement.js";

// Candidats synthétiques (dans une vraie exécution, ils sont lus en base).
const candidats: TerritoireCandidat[] = [
  { code: "T-COM-1", nom: "Ville-Synthétique", niveau: "commune", rang: 3 },
  { code: "T-ARR-1", nom: "Aïn Nord-Synthétique", niveau: "arrondissement", rang: 4 },
  { code: "T-ARR-2", nom: "Ville Synthetique", niveau: "arrondissement", rang: 4 },
  { code: "T-COM-2", nom: "Homonyme", niveau: "commune", rang: 3 },
  { code: "T-COM-3", nom: "Homonyme", niveau: "commune", rang: 3 },
  { code: "T-COM-4", nom: "Bourg-Témoin", niveau: "commune", rang: 3, alias: ["Quartier Revu"] },
];

describe("rattachement territorial des localités (PRX06)", () => {
  it("normalisation : minuscules, sans accents, apostrophes et traits d'union neutralisés", () => {
    expect(normaliserLibelleLocalite("  Aïn-Sebaâ ")).toBe("ain sebaa");
    expect(normaliserLibelleLocalite("Dar  Bouazza")).toBe("dar bouazza");
    expect(normaliserLibelleLocalite("Sidi l’Bernoussi")).toBe("sidi l bernoussi");
  });

  it("précision commune : correspondance exacte à la commune, jamais à l'arrondissement homonyme", () => {
    const r = rattacherLocalite("ville synthetique", candidats, 3);
    expect(r).toMatchObject({ resultat: "exact", territoire: { code: "T-COM-1" }, methode: "nom" });
  });

  it("précision arrondissement : même libellé à deux niveaux → ambigu, à revoir", () => {
    const r = rattacherLocalite("Ville-Synthetique", candidats, 4);
    expect(r.resultat).toBe("ambigu");
    if (r.resultat === "ambigu") expect(r.candidats.map((c) => c.code)).toEqual(["T-COM-1", "T-ARR-2"]);
  });

  it("homonymes au même niveau → ambigu", () => {
    expect(rattacherLocalite("homonyme", candidats, 3).resultat).toBe("ambigu");
  });

  it("libellé connu seulement à un niveau plus fin que la précision → non rattaché (précision insuffisante)", () => {
    expect(rattacherLocalite("Ain Nord Synthetique", candidats, 3)).toEqual({ resultat: "non-rattache", motif: "precision-insuffisante" });
    expect(rattacherLocalite("Ain Nord Synthetique", candidats, 4)).toMatchObject({ resultat: "exact", territoire: { code: "T-ARR-1" } });
  });

  it("quartier commercial : non rattaché sauf correspondance revue (alias en base)", () => {
    expect(rattacherLocalite("Quartier Inconnu", candidats, 4)).toEqual({ resultat: "non-rattache", motif: "aucun-candidat" });
    expect(rattacherLocalite("quartier revu", candidats, 3)).toMatchObject({ resultat: "exact", territoire: { code: "T-COM-4" }, methode: "alias" });
    expect(rattacherLocalite("  ", candidats, 3)).toEqual({ resultat: "non-rattache", motif: "libelle-vide" });
  });

  it("aucun territoire embarqué : sans candidats, rien n'est rattaché", () => {
    expect(rattacherLocalite("Ville Synthetique", [], 4).resultat).toBe("non-rattache");
    expect(precisionSuffisante(3, 4)).toBe(false);
    expect(precisionSuffisante(4, 3)).toBe(true);
  });
});
