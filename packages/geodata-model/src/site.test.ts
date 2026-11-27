import { describe, expect, it } from "vitest";
import { assemblerLectureSite, couchesDeCategorie, libelleNonEvalue, type VersionLue } from "./site.js";
import { RANGEMENT_PAR_DEFAUT } from "./catalogue.js";

const version: VersionLue = {
  id: "v1", libelle: "RGPH 2024", empreinte: "a".repeat(64), periode: "2024", publieeLe: null, licence: "CC-BY", attribution: "HCP", urlSource: null, precision: null,
  droits: { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "inconnu", partage: "autorise", telechargement: "inconnu", export: "autorise" },
  privee: false, source: { id: "s1", titre: "Recensement", producteur: "HCP", couverture: "Maroc" },
};
const base = { entree: { nature: "point" as const, repere: "geographic" as const, crs: "EPSG:4326" as const, point: { lon: -7.6, lat: 33.5 } }, maintenant: new Date("2026-11-27T10:00:00Z"), unites: null, fiche: null, services: null, prix: null, terrain: null };

describe("lecture de site (P12, donnees-1 TA-D5)", () => {
  it("liste d'unités vide → « aucune unité », jamais une valeur", () => {
    const l = assemblerLectureSite({ ...base, unites: { ok: true, valeur: [] } });
    expect(l.unites).toMatchObject({ etat: "non-evaluee", motif: "aucune-unite" });
    expect(libelleNonEvalue("aucune-unite")).toBe("Aucune unité du découpage en base à cet endroit");
  });
  it("unités triées de la plus fine à la plus globale ; indicateurs avec la provenance de la fiche", () => {
    const l = assemblerLectureSite({ ...base,
      unites: { ok: true, valeur: [{ code: "1", nom: "Région", rang: 1, coucheId: "c1", versionId: "v1" }, { code: "11", nom: "Province", rang: 2, coucheId: "c2", versionId: "v1" }] },
      fiche: { ok: true, valeur: { indicateurs: [{ titre: "Population", unite: "hab.", periode: "2024", valeur: { valeur: null, motifAbsence: "secret-statistique" } }], version } } });
    expect(l.unites.etat === "evaluee" && l.unites.valeur.map((u) => u.code)).toEqual(["11", "1"]);
    expect(l.indicateurs).toMatchObject({ etat: "evaluee", provenance: [{ versionId: "v1", empreinte: "a".repeat(64) }] });
    // La valeur absente garde son motif de la base.
    expect(l.indicateurs.etat === "evaluee" && l.indicateurs.valeur[0]!.valeur).toEqual({ valeur: null, motifAbsence: "secret-statistique" });
  });
  it("services : aucune couche affichée, couche inaccessible (jamais 0), comptes calculés", () => {
    expect(assemblerLectureSite({ ...base, services: { ok: true, valeur: [] } }).services).toMatchObject({ motif: "aucune-couche-services" });
    expect(assemblerLectureSite({ ...base, services: { ok: true, valeur: [{ coucheId: "x", accessible: false }] } }).services).toMatchObject({ motif: "couche-inaccessible" });
    const l = assemblerLectureSite({ ...base, services: { ok: true, valeur: [{ coucheId: "p", accessible: true, titre: "Écoles", nombre: 0, plusProche: null, version }] } });
    expect(l.services).toMatchObject({ etat: "evaluee", nature: "calcule", valeur: [{ nombre: 0, couvertureDeclaree: "Maroc" }] });
  });
  it("prix et terrain : absence nommée, motif du serveur tel quel, erreur de lecture distincte", () => {
    expect(assemblerLectureSite({ ...base, prix: { ok: true, valeur: [] } }).prix).toMatchObject({ motif: "aucune-source-prix" });
    expect(assemblerLectureSite({ ...base, terrain: { ok: true, valeur: { disponible: false, motif: "Hors de la couverture des jeux publiés." } } }).terrain).toMatchObject({ motif: "terrain-indisponible", detail: "Hors de la couverture des jeux publiés." });
    expect(assemblerLectureSite({ ...base, terrain: { ok: false, erreur: "Délai dépassé" } }).terrain).toMatchObject({ motif: "lecture-impossible", detail: "Délai dépassé" });
    expect(assemblerLectureSite(base).parcelle).toMatchObject({ etat: "non-evaluee", motif: "source-a-qualifier" });
  });
  it("aucune rubrique ne vaut 0 sans donnée", () => {
    const l = assemblerLectureSite(base);
    for (const r of [l.unites, l.indicateurs, l.services, l.prix, l.terrain, l.parcelle]) expect(r.etat).toBe("non-evaluee");
  });
});

describe("couches de catégorie (P12, TA-D8)", () => {
  it("ne rend que les couches de points ou mixtes de la catégorie du rangement reçu", () => {
    const c = (id: string, typeGeometrie: string, theme: string) => ({ id, titre: id, typeGeometrie, version: { source: { theme } } });
    const couches = [c("a", "point", "test"), c("b", "polygone", "test"), c("c", "mixte", "test"), c("d", "point", "geologie")];
    expect(couchesDeCategorie(couches, RANGEMENT_PAR_DEFAUT, "test").map((x) => x.id)).toEqual(["a", "c"]);
  });
});
