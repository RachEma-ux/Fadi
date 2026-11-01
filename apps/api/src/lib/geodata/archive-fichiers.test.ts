import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inventaireFichiers, ligneBilanArchive, ROLES_FICHIER } from "./archive-fichiers.js";

const DOSSIER = fileURLToPath(new URL("../../../../../docs/geodata/sources/", import.meta.url));

describe("archive en base des fichiers de données livrés (D-GD-29)", () => {
  const inventaire = inventaireFichiers(DOSSIER);
  const par = new Map(inventaire.map((f) => [f.chemin, f]));

  it("chaque fichier livré est inventorié, avec un rôle connu, sa taille et un type de média", () => {
    // Parcours indépendant de l'inventaire (récursif, fichiers cachés écartés) : tout fichier livré doit y être.
    const parcourir = (d: string, prefixe: string): string[] => readdirSync(d, { withFileTypes: true }).filter((e) => !e.name.startsWith(".")).flatMap((e) => (e.isDirectory() ? parcourir(`${d}${e.name}/`, `${prefixe}${e.name}/`) : [`${prefixe}${e.name}`]));
    const fichiers = parcourir(DOSSIER, "");
    // Sources provisoires (D-GD-54) : hors inventaire par défaut (ni archivées en base sans GEODATA_SOURCES_PROVISOIRES).
    expect(inventaire.map((f) => f.chemin).sort()).toEqual(fichiers.filter((f) => !f.startsWith("provisoires/")).sort());
    for (const f of inventaire) {
      expect(ROLES_FICHIER).toContain(f.role);
      expect(f.taille).toBeGreaterThan(0);
      expect(f.typeMedia).not.toBe("application/octet-stream");
    }
  });

  it("une fiche est rattachée à sa clé ; les données qu'elle cite (fichier, indicateurs, annexes) à la même source", () => {
    for (const nom of readdirSync(DOSSIER).filter((f) => f.endsWith(".json"))) {
      const fiche = JSON.parse(readFileSync(`${DOSSIER}${nom}`, "utf8")) as { cle: string; version?: { fichier?: string } };
      expect(par.get(nom)).toMatchObject({ role: "fiche", sourceCle: fiche.cle });
      if (fiche.version?.fichier) expect(par.get(fiche.version.fichier)).toMatchObject({ role: "donnees", sourceCle: fiche.cle });
    }
    expect(par.get("donnees/hcp-rgph2024-douars.tsv")).toMatchObject({ role: "donnees", sourceCle: "hcp-rgph2024-population-communes" });
    expect(par.get("donnees/hcp-rgph2024-population-communes.csv")).toMatchObject({ role: "donnees", typeMedia: "text/csv" });
    // Fichiers d'origine fournis tels quels (D-GD-29, D-GD-43) : archivés avec la source qui les cite.
    expect(par.get("donnees/hcp-rgph2024-douars-origine.xlsx")).toMatchObject({ role: "donnees", sourceCle: "hcp-rgph2024-population-communes" });
    expect(par.get("donnees/mtnra-services-publics-2022-origine.xlsx")).toMatchObject({ role: "donnees", typeMedia: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  });

  it("correspondances, extraits sans fiche importable et retraits déclarés sont archivés aussi", () => {
    expect(par.get("correspondances/hcp-rgph2024-communes-manuel.csv")).toMatchObject({ role: "correspondance", sourceCle: null });
    expect(par.get("donnees/osm-extraits.json")).toMatchObject({ role: "extrait" });
    expect(par.get("donnees/osm-mar-communes.geojson")).toMatchObject({ role: "extrait", typeMedia: "application/geo+json" });
    expect(par.get("donnees/retraits-sources.json")).toMatchObject({ role: "declaration" });
    // Découpage administratif (D-GD-42) : fichier source du HCP tel quel, table des niveaux, entités, déclaration.
    expect(par.get("decoupage/originaux/hcp-rgph2024-population-legale.xlsx")).toMatchObject({ role: "decoupage", typeMedia: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(par.get("decoupage/ma-niveaux.csv")).toMatchObject({ role: "decoupage", typeMedia: "text/csv" });
    expect(par.get("decoupage/hcp-rgph2024-entites.csv")).toMatchObject({ role: "decoupage" });
    // Fiches de référence des contours (D-GD-30) : archivées, jamais importées comme couches.
    expect(par.get("references/geoboundaries-mar-adm1.json")).toMatchObject({ role: "reference", sourceCle: "geoboundaries-mar-adm1" });
    // Registre des sources de prix immobiliers : archivé tel quel, jamais pris pour une fiche (lot P2).
    expect(par.get("prix/prix-sources.json")).toMatchObject({ role: "prix", sourceCle: null, typeMedia: "application/json" });
    // Annexe des agrégats publiés FeenWay : citée par sa fiche, archivée avec elle.
    expect(par.get("donnees/feenway-barometre-casablanca-2026-10-30.csv")).toMatchObject({ role: "donnees", sourceCle: "feenway-barometre-casablanca" });
  });

  it("bilan lisible par l'import automatique", () => {
    expect(ligneBilanArchive({ ajoutes: 3, modifies: 1, inchanges: 2, retires: 0, octets: 10 })).toBe("Archive des fichiers : 3 ajouté(s), 1 modifié(s), 2 inchangé(s), 0 retiré(s).");
  });

  it("sources provisoires (D-GD-54) : inventoriées seulement si admises, fiche et données rattachées à leur source", () => {
    expect(inventaire.some((f) => f.chemin.startsWith("provisoires/"))).toBe(false);
    const avec = new Map(inventaireFichiers(DOSSIER, { provisoires: true }).map((f) => [f.chemin, f]));
    expect(avec.get("provisoires/feenway-prix-quartiers.json")).toMatchObject({ role: "fiche", sourceCle: "feenway-prix-quartiers" });
    expect(avec.get("provisoires/donnees/feenway-prix-quartiers.geojson")).toMatchObject({ role: "donnees", sourceCle: "feenway-prix-quartiers" });
    expect(avec.get("provisoires/donnees/feenway-prix-quartiers-origine.json")).toMatchObject({ role: "donnees", sourceCle: "feenway-prix-quartiers" });
  });
});
