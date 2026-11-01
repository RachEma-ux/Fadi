import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIMENSIONS_COMPARAISON, ETATS_DONNEE_PRIX, LIBELLE_ECART_REFERENCE, MOTIFS_COMPARAISON_PRIX, MOTIFS_COUCHE_PRIX, TYPES_BIEN } from "@parcours/geodata-model";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import type { LignePrixRecue } from "../client";
import {
  choixComparaison, filtrerLignesPrix, formaterDatePrix, formaterEcartPrix, formaterMontantPrix, formaterNombrePrix, formaterPeriodePrix, formaterTendancePrix, formaterUnitePrix,
  libelleCohorte, libelleDimension, libelleEtatPrix, libelleMotifPrix, libelleStatutSource, libelleTypeBien, LIBELLES_DIMENSION_COMPARAISON, LIBELLES_ETAT_PRIX, LIBELLES_TYPE_BIEN,
  libelleMotifComparaison, LIBELLES_MOTIF_COMPARAISON, LIBELLES_MOTIF_PRIX, lignesVillePrix, peutExporterPrix, quartiersParTransaction, statutSourceUtilisable, symboleEtatPrix, TEXTES_PRIX, tonEtatPrix, totalExclusions, trierLignesPrix, triSuivant,
} from "./prix-ops";

/** Lignes fabriquées pour les tests (libellés fictifs, aucune donnée réelle). */
const ligne = (x: Partial<LignePrixRecue> & Pick<LignePrixRecue, "libelleGeo">): LignePrixRecue => ({
  versionId: "v1", niveauGeo: "quartier-commercial", codeRattache: null, etatRattachement: "non-rattache", typeBien: "appartement", transaction: "vente",
  nombreAnnonces: 10, prixMedian: { valeur: 1000, approximatif: false, texte: "1 000" }, prixM2: { valeur: 10, texte: "10" }, unite: "MAD", uniteM2: "MAD/m2", tendance90j: null, ...x,
});

describe("Prix immobiliers — états (Concept §5 : états distincts, jamais 0)", () => {
  it("chaque état du modèle a un libellé et une icône distincts", () => {
    const libelles = ETATS_DONNEE_PRIX.map((e) => libelleEtatPrix(e));
    expect(new Set(libelles).size).toBe(ETATS_DONNEE_PRIX.length);
    expect(new Set(ETATS_DONNEE_PRIX.map((e) => symboleEtatPrix(e))).size).toBe(ETATS_DONNEE_PRIX.length);
    expect(libelleEtatPrix("echantillon-insuffisant")).toBe("Échantillon insuffisant");
    expect(libelleEtatPrix("non-autorise")).toBe("Non autorisé");
    expect(libelleEtatPrix("perime")).toBe("Données périmées");
    expect(libelleEtatPrix("historique")).toBe("Édition historique");
    expect(libelleEtatPrix("validite-non-verifiee")).toBe("Validité non vérifiée");
    expect(libelleEtatPrix("inconnu-du-modele")).toBe("État non reconnu");
  });
  it("seul « disponible » est neutre ; lecture en cours à part", () => {
    expect(tonEtatPrix("disponible")).toBe("ok");
    expect(tonEtatPrix("chargement")).toBe("attente");
    for (const e of ETATS_DONNEE_PRIX.filter((x) => x !== "disponible")) expect(tonEtatPrix(e)).toBe("alerte");
  });
  it("statuts du registre : seules active et autorisée sont utilisables", () => {
    expect(statutSourceUtilisable("active")).toBe(true);
    expect(statutSourceUtilisable("autorisee")).toBe(true);
    for (const s of ["candidate", "qualifiee", "bloquee", "suspendue", "retiree"]) expect(statutSourceUtilisable(s)).toBe(false);
    expect(libelleStatutSource("bloquee")).toBe("Bloquée");
    expect(libelleStatutSource("x")).toBe("Statut non reconnu");
  });
  it("motif codé → libellé ; texte du registre → tel quel (donnée)", () => {
    expect(libelleMotifPrix("source-bloquee")).toEqual({ texte: "Source bloquée : aucune voie de réutilisation permise", code: true });
    expect(libelleMotifPrix("Texte libre du dossier")).toEqual({ texte: "Texte libre du dossier", code: false });
  });
  it("chaque dimension de comparaison et chaque type de bien du modèle a un libellé", () => {
    for (const d of DIMENSIONS_COMPARAISON) expect(LIBELLES_DIMENSION_COMPARAISON[d]).toBeTruthy();
    for (const t of TYPES_BIEN) expect(LIBELLES_TYPE_BIEN[t]).toBeTruthy();
    expect(libelleDimension("base-surface")).toBe("Base de surface différente");
    expect(libelleTypeBien("local-commercial")).toBe("Locaux commerciaux");
  });
});

describe("Prix immobiliers — mise en forme", () => {
  it("montant abrégé par l'éditeur : ≈ et texte d'origine conservé", () => {
    expect(formaterMontantPrix({ valeur: 3300000, approximatif: true, texte: "3,3M DH" })).toEqual({ absent: false, texte: "≈ 3\u202f300\u202f000", approximatif: true, original: "3,3M DH" });
    expect(formaterMontantPrix({ valeur: 8500, approximatif: false, texte: "8 500 DH/mois" }).texte).toBe("8\u202f500");
  });
  it("montant absent : « non publié », jamais 0", () => {
    for (const m of [null, undefined, { valeur: null }, { valeur: Number.NaN }]) {
      const a = formaterMontantPrix(m as never);
      expect(a.absent).toBe(true);
      expect(a.texte).toBe("non publié");
      expect(a.texte).not.toMatch(/\b0\b/);
    }
    expect(formaterNombrePrix(null)).toBe("non publié");
    expect(formaterNombrePrix(0)).toBe("0");
    expect(formaterNombrePrix(16802)).toBe("16\u202f802");
  });
  it("tendance : signe typographique ; null → « non publiée » ; 0 publié reste 0", () => {
    expect(formaterTendancePrix(-9.8)).toBe("−9,8 %");
    expect(formaterTendancePrix(1.25)).toBe("+1,3 %");
    expect(formaterTendancePrix(0)).toBe("0,0 %");
    expect(formaterTendancePrix(null)).toBe("non publiée");
    expect(formaterEcartPrix(12.345)).toBe("+12,35 %");
  });
  it("unités : m² en exposant, période en français", () => {
    expect(formaterUnitePrix("MAD/m2")).toBe("MAD/m²");
    expect(formaterUnitePrix("MAD/m2/mois")).toBe("MAD/m²/mois");
    expect(formaterUnitePrix("MAD/month")).toBe("MAD/mois");
    expect(formaterUnitePrix("")).toBe("unité non publiée");
  });
  it("période et dates en heure suisse, format suisse", () => {
    expect(formaterPeriodePrix({ debut: "2026-02-28", fin: "2026-10-30" })).toBe("28.02.2026 → 30.10.2026");
    expect(formaterPeriodePrix("Texte publié")).toBe("Texte publié");
    expect(formaterPeriodePrix(null)).toBeNull();
    expect(formaterDatePrix("2026-10-30T23:30:00Z")).toBe("31.10.2026");
    expect(formaterDatePrix(null)).toBeNull();
  });
});

describe("Prix immobiliers — tableaux", () => {
  const lignes = [
    ligne({ libelleGeo: "Écluse", nombreAnnonces: 5, prixMedian: { valeur: 300 }, tendance90j: 2 }),
    ligne({ libelleGeo: "Alpha", nombreAnnonces: 50, prixMedian: null, tendance90j: -1 }),
    ligne({ libelleGeo: "Delta", nombreAnnonces: 20, prixMedian: { valeur: 100 }, tendance90j: null }),
    ligne({ libelleGeo: "Bravo", transaction: "location", nombreAnnonces: 7 }),
  ];
  it("tri : nombres, texte (accents ignorés), valeurs absentes toujours en fin", () => {
    expect(trierLignesPrix(lignes, "nombreAnnonces", "desc").map((l) => l.libelleGeo)).toEqual(["Alpha", "Delta", "Bravo", "Écluse"]);
    expect(trierLignesPrix(lignes, "libelleGeo", "asc").map((l) => l.libelleGeo)).toEqual(["Alpha", "Bravo", "Delta", "Écluse"]);
    expect(trierLignesPrix(lignes, "prixMedian", "asc").map((l) => l.libelleGeo)).toEqual(["Delta", "Écluse", "Bravo", "Alpha"]);
    expect(trierLignesPrix(lignes, "prixMedian", "desc").map((l) => l.libelleGeo)).toEqual(["Bravo", "Écluse", "Delta", "Alpha"]);
    expect(trierLignesPrix(lignes, "tendance90j", "desc").at(-1)!.libelleGeo).toBe("Bravo");
  });
  it("tri suivant : même colonne → inverse ; nouvelle colonne → texte croissant, nombre décroissant", () => {
    expect(triSuivant({ cle: "prixM2", ordre: "desc" }, "prixM2")).toEqual({ cle: "prixM2", ordre: "asc" });
    expect(triSuivant({ cle: "prixM2", ordre: "desc" }, "libelleGeo")).toEqual({ cle: "libelleGeo", ordre: "asc" });
    expect(triSuivant({ cle: "libelleGeo", ordre: "asc" }, "nombreAnnonces")).toEqual({ cle: "nombreAnnonces", ordre: "desc" });
  });
  it("filtre : casse et accents ignorés, vide = tout", () => {
    expect(filtrerLignesPrix(lignes, "ecl").map((l) => l.libelleGeo)).toEqual(["Écluse"]);
    expect(filtrerLignesPrix(lignes, "  DEL ").map((l) => l.libelleGeo)).toEqual(["Delta"]);
    expect(filtrerLignesPrix(lignes, "")).toHaveLength(4);
  });
  it("quartiers séparés par transaction ; lignes de ville dans l'ordre des types", () => {
    const q = quartiersParTransaction(lignes);
    expect([q.vente.length, q.location.length]).toEqual([3, 1]);
    const ville = [
      ligne({ libelleGeo: "V", niveauGeo: "ville", typeBien: "villa" }),
      ligne({ libelleGeo: "V", niveauGeo: "ville", typeBien: "appartement" }),
      ligne({ libelleGeo: "V", niveauGeo: "ville", typeBien: "bureau", transaction: "location" }),
      ...lignes,
    ];
    expect(lignesVillePrix(ville, "vente").map((l) => l.typeBien)).toEqual(["appartement", "villa"]);
    expect(lignesVillePrix(ville, "location").map((l) => l.typeBien)).toEqual(["bureau"]);
    expect(choixComparaison(ville)).toEqual([{ type: "appartement", transaction: "vente" }, { type: "villa", transaction: "vente" }, { type: "bureau", transaction: "location" }]);
  });
  it("cohortes et exclusions", () => {
    expect(libelleCohorte("a")).toBe("a");
    expect(libelleCohorte({ typeBien: "appartement", transaction: "vente", vide: null })).toBe("appartement · vente");
    expect(totalExclusions({ "prix-nul": 2, "surface-absente": 3 })).toBe(5);
    expect(totalExclusions(4)).toBe(4);
    expect(totalExclusions(null)).toBeNull();
  });
});

describe("Prix immobiliers — motifs codés rendus par l'API (liste fermée du modèle)", () => {
  it("chaque motif de couche ou de produit que l'API peut rendre a son libellé ; aucun libellé orphelin", () => {
    for (const m of MOTIFS_COUCHE_PRIX) expect(libelleMotifPrix(m), m).toMatchObject({ code: true });
    expect(Object.keys(LIBELLES_MOTIF_PRIX).sort()).toEqual([...MOTIFS_COUCHE_PRIX].sort());
    expect(libelleMotifPrix("aucune-source").texte).toBe("Aucune source enregistrée en base pour ce produit");
    expect(libelleMotifPrix("aucune-publication").texte).toBe("Aucun instantané publié");
    // Ancien code jamais rendu par l'API : plus de libellé (un texte non codé reste une donnée du registre).
    expect(libelleMotifPrix("aucun-instantane")).toEqual({ texte: "aucun-instantane", code: false });
  });
  it("chaque motif de comparaison a son libellé ; motif absent signalé", () => {
    expect(Object.keys(LIBELLES_MOTIF_COMPARAISON).sort()).toEqual([...MOTIFS_COMPARAISON_PRIX].sort());
    expect(libelleMotifComparaison("aucune-reference-officielle")).toBe("Aucune référence officielle disponible pour ce territoire et cette cohorte");
    expect(libelleMotifComparaison(undefined)).toBe("Motif non précisé par le serveur");
  });
});

describe("Prix immobiliers — lien d'export (capacité « prix-exporter » du serveur)", () => {
  it("seule la capacité prix-exporter rendue par GET /prix/couches ouvre l'export ; la capacité générique « exporter » ne suffit pas", () => {
    expect(peutExporterPrix(["prix-consulter", "prix-exporter"])).toBe(true);
    expect(peutExporterPrix(["exporter", "prix-consulter"])).toBe(false);
    expect(peutExporterPrix([])).toBe(false);
    expect(peutExporterPrix(null)).toBe(false);
  });
  it("la fiche ne lit plus la capacité de l'espace pour les prix", () => {
    const ici = dirname(fileURLToPath(import.meta.url));
    const section = readFileSync(join(ici, "PrixImmobiliers.tsx"), "utf8");
    expect(section).toMatch(/peutExporterPrix\(capacites\)/);
    expect(section).toMatch(/api\.prixCouches\(\)/);
    expect(readFileSync(join(ici, "FicheTerritoriale.tsx"), "utf8")).not.toMatch(/peutExporter/);
    expect(readFileSync(join(ici, "..", "PageGeoData.tsx"), "utf8")).not.toMatch(/peutExporter/);
  });
});

describe("Prix immobiliers — prix au m² abrégé", () => {
  it("≈ aussi pour le prix au m² quand l'éditeur l'abrège", () => {
    expect(formaterMontantPrix({ valeur: 18_500, approximatif: true, texte: "18,5K DH" })).toMatchObject({ approximatif: true, texte: expect.stringMatching(/^≈ /) });
    expect(formaterMontantPrix({ valeur: 18_548, approximatif: false, texte: "18 548 DH" }).approximatif).toBe(false);
  });
});

describe("Prix immobiliers — interface anglaise (D-163)", () => {
  const t = new Traducteur(dico as Record<string, string>);
  const traduit = (fr: string) => fr === "MAD" || /^Q\d$/.test(fr) || t.traduire(fr) !== fr || (dico as Record<string, string>)[fr] !== undefined;
  it("chaque libellé des codes a sa traduction", () => {
    for (const fr of [...TEXTES_PRIX, LIBELLE_ECART_REFERENCE, ...Object.values(LIBELLES_ETAT_PRIX)]) expect(traduit(fr), fr).toBe(true);
  });
  it("chaque texte des composants a sa traduction", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "PrixImmobiliers.tsx"), "utf8");
    // Textes JSX (entre balises) et attributs lisibles écrits en dur.
    const textes = [...src.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)].map((m) => m[1]!).filter((x) => !/\n|=>|\bconst\b|&&|\|\|/.test(x)).map((x) => x.trim()).filter(Boolean);
    const attributs = [...src.matchAll(/(?:aria-label|title)="([^"]+)"/g)].map((m) => m[1]!);
    const manquants = [...textes, ...attributs].filter((x) => x.length > 1 && !traduit(x));
    expect(manquants).toEqual([]);
    expect(textes.length).toBeGreaterThan(40);
  });
  it("gabarits avec valeurs", () => {
    expect(t.traduire("Sources non utilisables (4)")).toBe("Unusable sources (4)");
    expect(t.traduire("Quartiers commerciaux Éditeur X (sans limites publiées, non rattachés à une unité administrative)")).toBe("Éditeur X commercial neighbourhoods (no published boundaries, not matched to an administrative unit)");
    expect(t.traduire("Appartements — Vente")).toBe("Apartments — Sale");
    expect(t.traduire("Montant abrégé par l'éditeur : 3,3M DH")).toBe("Amount abbreviated by the publisher: 3.3M DH");
  });
});
