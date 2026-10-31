/**
 * Prix immobiliers — logique de l'API sans base (lots P2 à P6) : annexe des agrégats publiés FeenWay (fichier réel livré,
 * lecture CSV à guillemets, validation, rattachement PRX06), registre des sources (fichier réel), lecture et
 * normalisation des fichiers d'observations, rattachement borné par la précision, capacités par rôle (PRX10).
 * Les observations ci-dessous sont SYNTHÉTIQUES (sources « synthetique-* ») : elles n'existent que dans ce test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { trierObservations } from "@parcours/geodata-model";
import { lirePrixPublies, rattacherAgregats } from "./agregats.js";
import { capacitesPrixDe } from "./droits.js";
import { cleIdempotence, ErreurPrix, lireFichierObservations, normaliserLigne, rattacher, VERSION_ANALYSEUR_PRIX } from "./pipeline.js";
import { ligneBilanRegistre, lireRegistrePrix } from "./registre.js";

const DOSSIER = fileURLToPath(new URL("../../../../../../docs/geodata/sources/", import.meta.url));
const fiche = JSON.parse(readFileSync(`${DOSSIER}feenway-barometre-casablanca.json`, "utf8"));
const csv = readFileSync(`${DOSSIER}${fiche.version.annexes.prixPublies.fichier}`, "utf8");
const geojson = JSON.parse(readFileSync(`${DOSSIER}${fiche.version.fichier}`, "utf8"));
const objets = geojson.features.map((f: { properties: Record<string, unknown> }) => ({ code: String(f.properties["code"]), villeSource: f.properties["ville_source"] as string }));

describe("agrégats publiés FeenWay (annexe prixPublies, fichier réel)", () => {
  const lecture = lirePrixPublies(csv, fiche.version.libelle);
  const lignes = rattacherAgregats(lecture.agregats, objets);

  it("64 lignes lues et retenues, aucune erreur ; CSV à guillemets (« 3,3M DH ») et BOM lus", () => {
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.lignesLues).toBe(64);
    expect(lecture.agregats).toHaveLength(64);
    expect(lignes[0]).toMatchObject({ ordre: 1, libelleGeo: "Racine", typeBien: "appartement", transaction: "vente", prixMedian: "3300000.00", prixMedianApproximatif: true, prixMedianTexte: "3,3M DH", prixM2: "18548.00", tendance90j: -4.8, unite: "MAD", uniteM2: "MAD/m2" });
  });

  it("PRX06 : les 14 lignes de la ville sont rattachées à la commune 6141010 (8 ventes, 6 locations) ; les 50 quartiers commerciaux restent non rattachés, sans code", () => {
    const ville = lignes.filter((l) => l.niveauGeo === "ville");
    expect(ville).toHaveLength(14);
    expect(ville.every((l) => l.etatRattachement === "exact" && l.codeRattache === "6141010")).toBe(true);
    expect(ville.filter((l) => l.transaction === "vente")).toHaveLength(8);
    expect(ville.filter((l) => l.transaction === "location")).toHaveLength(6);
    const quartiers = lignes.filter((l) => l.niveauGeo === "quartier-commercial");
    expect(quartiers).toHaveLength(50);
    expect(quartiers.every((l) => l.etatRattachement === "non-rattache" && l.codeRattache === null)).toBe(true);
  });

  it("valeur absente publiée « — » : null, jamais 0 ; loyers en MAD/mois ; tendance non publiée nulle", () => {
    const immeubles = lignes.find((l) => l.niveauGeo === "ville" && l.typeBien === "immeuble")!;
    expect(immeubles.prixM2).toBeNull();
    expect(immeubles.tendance90j).toBeNull();
    const loyer = lignes.find((l) => l.niveauGeo === "ville" && l.typeBien === "bureau" && l.transaction === "location")!;
    expect(loyer).toMatchObject({ unite: "MAD/mois", uniteM2: "MAD/m2/mois", prixMedian: "13500.00", prixMedianApproximatif: false });
  });

  it("deux objets du même nom de ville : rattachement ambigu, aucun code choisi", () => {
    const r = rattacherAgregats(lecture.agregats.slice(50, 51), [{ code: "A", villeSource: "Casablanca" }, { code: "B", villeSource: "casablanca" }]);
    expect(r[0]).toMatchObject({ etatRattachement: "ambigu", codeRattache: null });
  });
});

describe("registre des sources de prix (fichier réel)", () => {
  const registre = lireRegistrePrix(JSON.parse(readFileSync(`${DOSSIER}prix/prix-sources.json`, "utf8")));

  it("9 sources ; seul le baromètre FeenWay est actif ; aucune source d'observations ni édition officielle autorisée", () => {
    expect(registre.sources).toHaveLength(9);
    expect(registre.sources.filter((s) => s.statut === "active").map((s) => s.cle)).toEqual(["feenway-barometre"]);
    expect(registre.sources.find((s) => s.cle === "feenway-barometre")).toMatchObject({ produit: "agregat-publie", ficheGeodata: "feenway-barometre-casablanca", derivee: true });
    expect(registre.sources.filter((s) => s.produit === "observations" && ["active", "autorisee"].includes(s.statut))).toEqual([]);
    expect(registre.sources.filter((s) => s.produit === "valeurs-officielles" && ["active", "autorisee"].includes(s.statut))).toEqual([]);
    expect(registre.sources.filter((s) => s.statut !== "active").every((s) => !!s.motif)).toBe(true);
  });

  it("registre invalide refusé en entier : clé en double, couche inconnue, source bloquée sans motif", () => {
    const base = JSON.parse(readFileSync(`${DOSSIER}prix/prix-sources.json`, "utf8"));
    expect(() => lireRegistrePrix({ ...base, sources: [...base.sources, base.sources[0]] })).toThrow(/en double/);
    expect(() => lireRegistrePrix({ ...base, sources: [{ ...base.sources[0], couche: "autre" }] })).toThrow(/couche/);
    expect(() => lireRegistrePrix({ ...base, sources: [{ ...base.sources[1], motif: null }] })).toThrow(/motif/);
  });

  it("bilan lisible", () => {
    expect(ligneBilanRegistre({ etat: "inchange", sources: 9, ajoutees: 0, modifiees: 0, statutsChanges: 0, retirees: 0 })).toBe("Registre des sources de prix : inchangé (9 source(s)).");
  });
});

describe("fichiers d'observations (synthétiques)", () => {
  const CSV = [
    "annonce_id,observe_le,transaction,type_bien,etat_bien,prix,monnaie,periode,surface,base_surface,localite,precision,empreinte",
    'A1,2026-10-01,vente,appartement,neuf,"1 250 000",MAD,total,"82,5",habitable,Commune synthétique,commune,h1',
    "A2,2026-10-02,vente,appartement,inconnu,-5,MAD,total,80,habitable,Commune synthétique,commune,",
    "A3,2026-10-03,location,appartement,,7000,EUR,mois,60,habitable,Commune synthétique,commune,",
    "A4,2026-10-04,location,appartement,,7000,MAD,jour,60,parcelle,Commune synthétique,,",
  ].join("\n");

  it("CSV et JSON donnent les mêmes lignes ; colonnes obligatoires contrôlées", () => {
    const lignes = lireFichierObservations(CSV, "csv");
    expect(lignes).toHaveLength(4);
    expect(lireFichierObservations(JSON.stringify(lignes), "json")).toEqual(lignes);
    expect(() => lireFichierObservations("annonce_id,prix\nA,1", "csv")).toThrow(ErreurPrix);
    expect(() => lireFichierObservations("{", "json")).toThrow(/JSON/);
  });

  it("normalisation : montants décimaux exacts, état inconnu signalé (non précisé), validation : prix négatif et monnaie non admise en quarantaine", () => {
    const n = lireFichierObservations(CSV, "csv").map((l, i) => normaliserLigne(l, "synthetique-a", i + 1));
    expect(n[0]!.observation).toMatchObject({ prix: 1_250_000, surface: 82.5, etat: "neuf", empreinte: "h1" });
    expect(n[1]!.avertissements).toEqual(["etat-bien-inconnu"]);
    const tri = trierObservations(n.map((x) => x.observation));
    expect(tri.admises.map((o) => o.idAnnonce)).toEqual(["A1", "A4"]);
    expect(tri.quarantaine.map((q) => [q.observation.idAnnonce, q.motifs])).toEqual([["A2", ["prix-non-positif"]], ["A3", ["monnaie-non-supportee"]]]);
  });

  it("PRX06 : rattachement jamais plus fin que la précision déclarée ; précision absente → non rattachée", () => {
    const c = {
      candidats: [{ code: "C1", nom: "Commune synthétique", niveau: "commune", rang: 3 }, { code: "AR1", nom: "Arrondissement synthétique", niveau: "arrondissement", rang: 5 }],
      rangs: new Map([["commune", 3], ["arrondissement", 5]]),
      decoupage: null,
    };
    expect(rattacher("Commune synthétique", "commune", c)).toMatchObject({ resultat: "exact", territoire: { code: "C1" } });
    expect(rattacher("Arrondissement synthétique", "commune", c)).toEqual({ resultat: "non-rattache", motif: "precision-insuffisante" });
    expect(rattacher("Commune synthétique", null, c)).toEqual({ resultat: "non-rattache", motif: "precision-inconnue" });
  });

  it("clé d'idempotence : empreinte du fichier, version de l'analyseur et source", () => {
    expect(cleIdempotence("a".repeat(64), "synthetique-a")).toBe(`${"a".repeat(64)}.${VERSION_ANALYSEUR_PRIX}.synthetique-a`);
  });
});

describe("PRX10 — capacités des prix portées sur les rôles GeoData", () => {
  it("consultation seule : aucune lecture brute, aucun import, aucune publication, aucun export", () => {
    expect([...capacitesPrixDe([])]).toEqual(["prix-consulter"]);
  });
  it("gestionnaire : import et construction ; responsable : publication ; administrateur : statut des sources", () => {
    expect(capacitesPrixDe(["gestionnaire-donnees"]).has("prix-importer")).toBe(true);
    expect(capacitesPrixDe(["gestionnaire-donnees"]).has("prix-publier")).toBe(false);
    expect(capacitesPrixDe(["responsable-publication"]).has("prix-publier")).toBe(true);
    expect(capacitesPrixDe(["responsable-publication"]).has("prix-importer")).toBe(false);
    expect(capacitesPrixDe(["administrateur"]).has("prix-gerer-sources")).toBe(true);
    expect(capacitesPrixDe(["administrateur"]).has("prix-publier")).toBe(false);
  });
});
