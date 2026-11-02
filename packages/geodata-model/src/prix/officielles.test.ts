/** Lignes de valeurs officielles (jeux SYNTHÉTIQUES : aucune valeur réelle). */
import { describe, expect, it } from "vitest";
import { lireLigneOfficielle } from "./officielles.js";

const ligne = (p: Record<string, string> = {}): Record<string, string> => ({
  zone_code: "ZS-1", zone_libelle: "Zone synthétique", zone_description: "Zone décrite en texte (test)", categorie_originale: "Appartement",
  type_bien: "appartement", etat_bien: "", transaction: "vente", base_surface: "habitable", forme: "unique", valeur: "10 000",
  texte_original: "10 000 DH/m²", monnaie: "MAD", unite: "MAD/m2", date_debut: "2026-01-01", ...p,
});

describe("valeurs officielles : formes sans transformation", () => {
  it("valeur unique lue avec la règle des montants, texte d'origine conservé, territoire proposé gardé à part", () => {
    const r = lireLigneOfficielle(ligne({ territoire: "QZ-C1" }));
    expect(r).toMatchObject({ ok: true, valeur: { forme: "unique", valeur: 10_000, unite: "MAD/m2", texteOriginal: "10 000 DH/m²", zone: { code: "ZS-1", territoirePropose: "QZ-C1", geometrie: null } } });
  });
  it("fourchette, couple terrain + construction, conditionnelle", () => {
    expect(lireLigneOfficielle(ligne({ forme: "fourchette", valeur: "", valeur_min: "9.000", valeur_max: "11.000" }))).toMatchObject({ ok: true, valeur: { valeurMin: 9000, valeurMax: 11_000, valeur: null } });
    expect(lireLigneOfficielle(ligne({ forme: "terrain-construction", valeur: "", valeur_terrain: "3000", valeur_construction: "4500", type_bien: "villa" }))).toMatchObject({ ok: true, valeur: { valeurTerrain: 3000, valeurConstruction: 4500 } });
    expect(lireLigneOfficielle(ligne({ forme: "conditionnelle", condition: "R+4 au plus" }))).toMatchObject({ ok: true, valeur: { condition: "R+4 au plus", valeur: 10_000 } });
  });
  it("motifs : forme incomplète ou mêlée, fourchette inversée, condition absente, valeur illisible ou nulle", () => {
    const motifs = (p: Record<string, string>) => { const r = lireLigneOfficielle(ligne(p)); return r.ok ? [] : r.motifs; };
    expect(motifs({ forme: "fourchette", valeur: "", valeur_min: "11000", valeur_max: "9000" })).toEqual(["fourchette-inversee"]);
    expect(motifs({ forme: "fourchette" })).toEqual(["valeur-illisible", "valeurs-en-trop"]);
    expect(motifs({ forme: "conditionnelle" })).toEqual(["condition-absente"]);
    expect(motifs({ valeur: "1,250,000" })).toEqual(["valeur-illisible"]);
    expect(motifs({ valeur: "0" })).toEqual(["valeur-non-positive"]);
    expect(motifs({ forme: "autre" })).toEqual(["forme-inconnue"]);
  });
  it("zone : description ou géométrie WGS 84 déclarée ; aucune reprojection implicite", () => {
    const g = JSON.stringify({ type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] });
    expect(lireLigneOfficielle(ligne({ zone_description: "", geometrie: g, crs: "EPSG:4326" }))).toMatchObject({ ok: true, valeur: { zone: { crs: "EPSG:4326" } } });
    const r = lireLigneOfficielle(ligne({ zone_description: "", geometrie: g, crs: "EPSG:26191" }));
    expect(r.ok ? [] : r.motifs).toEqual(["crs-non-admis"]);
    const s = lireLigneOfficielle(ligne({ zone_description: "" }));
    expect(s.ok ? [] : s.motifs).toEqual(["zone-sans-description"]);
  });
  it("dates, monnaie et unité contrôlées ; l'unité suit la monnaie", () => {
    const r = lireLigneOfficielle(ligne({ date_debut: "2026-02-30", monnaie: "EUR" }));
    expect(r.ok ? [] : r.motifs).toEqual(["unite-inconnue", "date-invalide"]);
    const s = lireLigneOfficielle(ligne({ date_fin: "2025-12-31" }));
    expect(s.ok ? [] : s.motifs).toEqual(["dates-incoherentes"]);
  });
});
