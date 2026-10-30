import { describe, expect, it } from "vitest";
import { lireCsv } from "../decoupage.js";
import { comparerAuReferentiel } from "./comparaison.js";
import { ENTETES_FEENWAY, lireAgregatsFeenway, valeurMarcheDepuisAgregat } from "./agregats-publies.js";

// Baromètre SYNTHÉTIQUE au format de l'en-tête FeenWay (aucune valeur réelle) : villes et quartiers fictifs.
const ENTETE = ENTETES_FEENWAY.join(",");
const L = (champs: string) => `${champs}`;
const CSV = [
  ENTETE,
  L('Ville-Synthetique,neighborhood,Quartier-Synthetique-1,APPARTEMENT,SALE,120,"1,5M DH",1500000.0,True,12 345 DH,12345.0,MAD,MAD/m2,-2.5,editeur-synthetique,https://exemple.invalid/barometre,2026-01-01/2026-06-30,https://creativecommons.org/licenses/by/4.0/'),
  L("Ville-Synthetique,neighborhood,Quartier-Synthetique-1,APPARTEMENT,RENT,80,9 000 DH/mois,9000.0,False,95 DH,95.0,MAD/month,MAD/m2/month,,editeur-synthetique,https://exemple.invalid/barometre,2026-01-01/2026-06-30,https://creativecommons.org/licenses/by/4.0/"),
  L('Ville-Synthetique,city,Ville-Synthetique,Locaux commerciaux,SALE,15,"954,8K DH",954800.0,True,—,,MAD,MAD/m2,,editeur-synthetique,https://exemple.invalid/barometre,2026-01-01/2026-06-30,https://creativecommons.org/licenses/by/4.0/'),
].join("\n");

describe("agrégats publiés par un tiers (format FeenWay)", () => {
  it("lecture : valeurs telles que publiées, abréviation marquée approximative, effectifs = annonces", () => {
    const r = lireAgregatsFeenway(lireCsv(CSV), { edition: "edition-synthetique-2026-06-30" });
    expect(r.erreurs).toEqual([]);
    expect(r.agregats).toHaveLength(3);
    expect(r.agregats[0]).toMatchObject({
      niveauGeo: "quartier-commercial", libelleGeo: "Quartier-Synthetique-1", typeBien: "appartement", typeBienOriginal: "APPARTEMENT",
      transaction: "vente", nombreAnnonces: 120, unite: "MAD", uniteM2: "MAD/m2", tendance90j: -2.5,
      prixMedian: { valeur: 1500000, approximatif: true, texteOriginal: "1,5M DH" }, prixMedianM2: { valeur: 12345, approximatif: false },
      periode: { debut: "2026-01-01", fin: "2026-06-30" }, editeur: "editeur-synthetique", edition: "edition-synthetique-2026-06-30",
    });
    expect(r.agregats[1]).toMatchObject({ transaction: "location", unite: "MAD/mois", uniteM2: "MAD/m2/mois", tendance90j: null, prixMedian: { approximatif: false } });
    // Prix au m² non publié (« — ») : null, jamais 0.
    expect(r.agregats[2]).toMatchObject({ niveauGeo: "ville", typeBien: "local-commercial", prixMedianM2: null, prixMedian: { valeur: 954800, approximatif: true } });
  });

  it("toutes les correspondances de types FeenWay", () => {
    const types = ["APPARTEMENT", "Villas", "Locaux commerciaux", "Terrains", "Bureaux", "Maisons", "Studios", "Immeubles", "Fermes"];
    const lignes = types.map((t, i) => ({ ...lireCsv(CSV)[0]!, zone: `Z${i}`, property_type: t }));
    expect(lireAgregatsFeenway(lignes, { edition: "e" }).agregats.map((a) => a.typeBien))
      .toEqual(["appartement", "villa", "local-commercial", "terrain", "bureau", "maison", "studio", "immeuble", "ferme"]);
  });

  it("colonnes manquantes : aucune ligne retenue", () => {
    const sans = lireCsv(CSV).map(({ listing_count: _l, ...reste }) => reste);
    const r = lireAgregatsFeenway(sans, { edition: "e" });
    expect(r.agregats).toEqual([]);
    expect(r.erreurs).toEqual([{ ligne: 0, colonne: "listing_count", code: "colonne-manquante" }]);
  });

  it("unités incohérentes avec la transaction, comptes non entiers ou négatifs, montants négatifs, période illisible, doublons", () => {
    const [vente, loyer] = lireCsv(CSV) as [Record<string, string>, Record<string, string>];
    const r = lireAgregatsFeenway([
      { ...vente, price_unit: "MAD/month" },
      { ...loyer, zone: "Z2", area_price_unit: "MAD/m2" },
      { ...vente, zone: "Z3", listing_count: "12.5" },
      { ...vente, zone: "Z4", listing_count: "-3" },
      { ...vente, zone: "Z5", median_price_numeric: "-1500000.0" },
      { ...vente, zone: "Z6", data_period: "2026-06-30/2026-01-01" },
      { ...vente, zone: "Z7", transaction: "LEASE", geographic_level: "district", property_type: "Chateaux" },
      { ...vente, zone: "Z8", trend_90d_pct: "n/a", median_price_display: "2,5M DH", median_price_is_abbreviated: "peut-etre" },
      { ...vente, zone: "Z9", median_unit_price_display: "99 DH" },
      { ...vente, zone: "Z10" }, { ...vente, zone: "Z10" },
    ], { edition: "e" });
    expect(r.agregats.map((a) => a.libelleGeo)).toEqual(["Z8".replace("Z8", "Z10")].filter(() => false).concat(["Z10"]));
    expect(r.erreurs.map((e) => [e.ligne, e.code])).toEqual([
      [1, "unite-incoherente"],
      [2, "unite-incoherente"],
      [3, "compte-non-entier"],
      [4, "compte-negatif"],
      [5, "montant-negatif"],
      [6, "periode-illisible"],
      [7, "niveau-inconnu"], [7, "type-bien-inconnu"], [7, "transaction-inconnue"],
      [8, "abreviation-illisible"], [8, "tendance-illisible"],
      [9, "affichage-incoherent"],
      [11, "ligne-en-double"],
    ]);
  });

  it("comparaison : un agrégat publié sans base documentée n'est jamais comparé à une référence officielle", () => {
    const a = lireAgregatsFeenway(lireCsv(CSV), { edition: "e" }).agregats[0]!;
    const m = valeurMarcheDepuisAgregat(a, { territoire: "T-COM", autorisee: true });
    expect(m).toMatchObject({ nature: "agregat-publie", mediane: 12345, unite: "MAD/m2", baseSurface: "inconnue", baseDocumentee: false, dateDonnees: "2026-06-30" });
    const ref = {
      id: "R", edition: "E", zone: "T-COM", categorieOriginale: "x", typeBien: "appartement" as const, etat: null, transaction: "vente" as const,
      baseSurface: "habitable" as const, monnaie: "MAD", unite: "MAD/m2", valeur: { forme: "unique" as const, valeur: 10000, texteOriginal: "10 000" },
      dateDebut: "2026-01-01", dateFin: null, validite: "verifiee" as const, autorisee: true,
    };
    expect(comparerAuReferentiel(ref, m, { dateComparaison: "2026-07-01" })).toEqual({ comparable: false, dimensionsIncompatibles: ["base-surface", "base-non-documentee"] });
  });
});
