import { describe, expect, it } from "vitest";
import type { ChampInspecteur } from "../socle";
import { banc, cmd, etatDeTest, m, P } from "./__tests__/banc";
import { DESCRIPTEUR_ARCHITECTURE, identifiantType, lireClassification, lirePropriete } from "./inspecteur";
import { indicesEscalier } from "./outils/escalier";

const mur = (id: string, a: [number, number], b: [number, number], extra: Record<string, unknown> = {}) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(...a), b: P(...b), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false, ...extra });
const typeMur = (id: string, nom: string, dims: Record<string, unknown> = {}) =>
  cmd("type.definir", { definition: { id, classe: "mur", nom, dimensionsProposees: dims, proprietes: [], provenance: "saisie", statut: "declaree" } });

/** Contrôle, puis validation des commandes d'un champ par le contexte (même enchaînement que l'interface). */
async function appliquer(b: ReturnType<typeof banc>, id: string, cle: string, valeur: unknown) {
  const champ = champs(b, id).find((c) => c.cle === cle) as ChampInspecteur;
  expect(champ, cle).toBeDefined();
  expect(champ.controler(valeur)).toBeNull();
  const r = await b.ctx.valider(`Modifier ${cle}`, champ.commandes(valeur));
  expect(r.ok).toBe(true);
  return champ;
}
const champs = (b: ReturnType<typeof banc>, id: string) => DESCRIPTEUR_ARCHITECTURE.champs(b.etat().objets[id] as never, b.ctx);
const champ = (b: ReturnType<typeof banc>, id: string, cle: string) => champs(b, id).find((c) => c.cle === cle);

describe("descripteur d'inspecteur des classes d'architecture", () => {
  it("est enregistré pour mur, baies, dalle, escalier, pièce, espace, zone, niveau", () => {
    const b = banc();
    for (const c of ["mur", "porte", "fenetre", "ouverture", "dalle", "escalier", "piece", "espace", "zone", "niveau", "toiture", "poteau", "solide"]) expect(b.registres.inspecteur.pour(c), c).toBe(DESCRIPTEUR_ARCHITECTURE);
  });

  it("mur : changement de type par une liste, refus d'un type inconnu, longueur calculée en lecture seule", async () => {
    const b = banc(etatDeTest(typeMur("beton", "Béton 20"), mur("M1", [0, 0], [4, 0])));
    const t = champ(b, "M1", "typeId");
    expect(t).toMatchObject({ type: "choix", valeur: "non-type" });
    expect(t?.choix?.map((c) => c.valeur)).toEqual(["non-type", "beton"]);
    expect(t?.controler("brique")?.cause).toMatch(/absent du catalogue/);
    expect(champs(b, "M1").filter((c) => c.cle === "typeId")).toHaveLength(1);
    await appliquer(b, "M1", "typeId", "beton");
    expect(b.etat().objets.M1).toMatchObject({ params: { typeId: "beton" } });
    expect(b.valides[0]?.commandes[0]).toMatchObject({ type: "mur.modifier", cibles: ["M1"], params: { modifications: { typeId: "beton" } } });
    const L = champ(b, "M1", "longueur");
    expect(L).toMatchObject({ lectureSeule: true, valeur: { value: 4, unit: "m" } });
    expect(L?.commandes(5)).toEqual([]);
  });

  it("types : créer un type depuis l'objet (type.definir + affectation en un lot), renommer, dimension proposée", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [4, 0], { epaisseur: m(0.25) })));
    expect(champ(b, "M1", "type.nouveau")?.controler("  ")?.cause).toBe("nom vide");
    await appliquer(b, "M1", "type.nouveau", "Brique é 25");
    expect(b.valides[0]?.commandes.map((c) => c.type)).toEqual(["type.definir", "mur.modifier"]);
    const def = b.etat().catalogue.definitions["mur:brique-e-25"];
    expect(def).toMatchObject({ nom: "Brique é 25", dimensionsProposees: { epaisseur: m(0.25), hauteur: m(2.5) } });
    expect(b.etat().objets.M1).toMatchObject({ params: { typeId: "brique-e-25" } });
    expect(identifiantType(b.etat(), "mur", "Brique é 25")).toBe("brique-e-25-2");
    await appliquer(b, "M1", "type.nom", "Brique 25");
    expect(b.etat().catalogue.definitions["mur:brique-e-25"]?.nom).toBe("Brique 25");
    expect(champ(b, "M1", "type.epaisseur")?.controler(0)?.cause).toBe("valeur hors bornes");
    await appliquer(b, "M1", "type.epaisseur", 0.3);
    expect(b.etat().catalogue.definitions["mur:brique-e-25"]?.dimensionsProposees?.epaisseur).toEqual(m(0.3));
    // Le type ne réécrit jamais l'occurrence (DA-05-14).
    expect(b.etat().objets.M1).toMatchObject({ params: { epaisseur: m(0.25) } });
  });

  it("baie : distance au centre modifiable (ouverture.deplacer), bornée au mur", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [6, 0]), cmd("ouverture.poser", { id: "P1", niveauId: "rdc", calqueId: "C1", classe: "porte", murHoteId: "M1", position: { t: 0.5 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" })));
    expect(champ(b, "P1", "distance")).toMatchObject({ valeur: 3, lectureSeule: false });
    expect(champ(b, "P1", "distance")?.controler(7)?.cause).toMatch(/hors du mur/);
    await appliquer(b, "P1", "distance", 1.5);
    expect(b.etat().objets.P1).toMatchObject({ params: { position: { t: 0.25 } } });
    expect(champ(b, "P1", "typeId")?.type).toBe("choix");
  });

  it("propriétés BIM (propriete.definir) et classification (classification.affecter) ; préfixe d'import réservé", async () => {
    const b = banc(etatDeTest(mur("M1", [0, 0], [4, 0])));
    expect(lirePropriete("résistance")).toMatchObject({ cause: "forme « nom = valeur » attendue" });
    expect(lirePropriete("surface = 12")).toMatchObject({ cause: "grandeur sans unité" });
    expect(lirePropriete("charge = 2,5 kN/m²")).toEqual({ nom: "charge", valeur: 2.5, unite: "kN/m²" });
    await appliquer(b, "M1", "propriete:nouvelle", "résistance au feu = EI 60");
    expect(b.etat().objets.M1?.proprietes).toContainEqual(expect.objectContaining({ nom: "résistance au feu", valeur: "EI 60", provenance: "saisie" }));
    await appliquer(b, "M1", "propriete:résistance au feu", "EI 90");
    expect(b.etat().objets.M1?.proprietes.find((p) => p.nom === "résistance au feu")?.valeur).toBe("EI 90");
    await appliquer(b, "M1", "propriete:résistance au feu", null);
    expect(b.etat().objets.M1?.proprietes.some((p) => p.nom === "résistance au feu")).toBe(false);
    expect(lireClassification("Uniclass")).toMatchObject({ cause: "forme « système : code » attendue" });
    await appliquer(b, "M1", "classification", "Uniclass : EF_25_10 — Murs");
    expect(b.etat().objets.M1?.classifications).toContainEqual(expect.objectContaining({ systeme: "Uniclass", code: "EF_25_10", libelle: "Murs" }));
    expect(champ(b, "M1", "classification")?.valeur).toBe("Uniclass : EF_25_10 — Murs");
    expect(champ(b, "M1", "propriete:nouvelle")?.controler("import.x = 3 m")?.cause).toMatch(/réservé aux valeurs importées/);
  });

  it("pièce : surface calculée ; dalle : type en lecture seule (manque du contrat, D-038)", () => {
    const b = banc(
      etatDeTest(
        cmd("piece.creer", { id: "R1", niveauId: "rdc", calqueId: "C1", polygones: [{ contour: [P(0, 0), P(4, 0), P(4, 3), P(0, 3)], trous: [] }], nom: "Séjour" }),
        cmd("dalle.creer", { id: "D1", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(4, 0), P(4, 3), P(0, 3)], trous: [], epaisseur: m(0.2), decalageBase: m(-0.2) }),
      ),
    );
    expect(champ(b, "R1", "aire")).toMatchObject({ lectureSeule: true, valeur: { value: 12, unit: "m²" } });
    expect(champ(b, "R1", "nom")?.lectureSeule).toBe(false);
    expect(champs(b, "D1").filter((c) => c.cle === "typeId")).toEqual([expect.objectContaining({ lectureSeule: true })]);
  });

  it("escalier : niveaux reliés en listes, valeurs retenues et 2h + g calculés (indicatif, aucune borne inventée)", async () => {
    const b = banc(
      etatDeTest(
        cmd("niveau.creer", { id: "r1", nom: "Étage", elevation: m(3.2), hauteur: m(3), ordre: 1 }),
        cmd("escalier.creer", { id: "E1", niveauId: "rdc", calqueId: "C1", axe: { a: P(0, 0), b: P(5.4, 0) }, largeur: m(1.2), hauteurAFranchir: m(3.2), marches: 18, contremarches: 20, epaisseurPaillasse: m(0.18), decalageBase: m(0), niveauDepartId: "rdc", niveauArriveeId: "r1", referencePlanSeulement: false }),
      ),
    );
    const i = indicesEscalier(b.etat().objets.E1 as never, b.etat());
    expect(i.hauteur).toBeCloseTo(0.16, 12);
    expect(i.giron).toBeCloseTo(0.3, 12);
    expect(i.blondel).toBeCloseTo(0.62, 12);
    expect(champ(b, "E1", "niveauArriveeId")).toMatchObject({ type: "choix", valeur: "r1" });
    expect(champ(b, "E1", "blondel")).toMatchObject({ lectureSeule: true });
    expect(champ(b, "E1", "niveauDepartId")?.controler("xx")?.cause).toMatch(/inconnu/);
    await appliquer(b, "E1", "contremarches", 18);
    expect(indicesEscalier(b.etat().objets.E1 as never, b.etat()).hauteur).toBeCloseTo(3.2 / 18, 12);
  });
});
