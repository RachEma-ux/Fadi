import { describe, expect, it } from "vitest";
import type { EtatModele } from "../contrats/etat.js";
import { REGLE_QUANTITES, type Quantite } from "../contrats/quantites.js";
import { cmd, deg, m, ok, P } from "../commandes/__tests__/aides.js";
import { calculerEmpreinte, jsonCanonique } from "../commandes/empreinte.js";
import { etatVide } from "../commandes/moteur.js";
import type { ObjetModele } from "../ontologie/classes.js";
import { VERSION_ONTOLOGIE } from "../ontologie/descripteurs.js";
import { estNonEvaluee } from "../ontologie/provenance.js";
import { calculerQuantites, calculerQuantitesEtendues, type QuantiteEtendue } from "./calculer.js";

/**
 * Petit projet fait à la main :
 * - rdc (0 m, 3 m), r1 (3 m, 3 m) ;
 * - W1 (0 ; 0)→(4 ; 0), e 0,20, h 3 ; porte PO1 0,90 × 2,10 au milieu → L 4, brute 12, baies 1,89,
 *   nette 10,11, volume 2,4 − 0,378 = 2,022 (DA-16-10) ;
 * - W2 (0 ; 0)→(0 ; 2), e 0,10, niveauHaut r1 (H = 3) ; fenêtre FE1 1,00 × 1,00, allège 1 → L 2, brute 6,
 *   nette 5, volume 0,6 − 0,1 = 0,5 ;
 * - dalle D1 10 × 8 avec trou 2 × 2, e 0,25 → aire 76, volume 19 (DA-16-10) ;
 * - poteau X1 0,30 × 0,30 × 3 → 0,27 ; solide SO1 triangle rectangle 1 × 1, h 2 → 1 ;
 * - pièce S1 3 × 3, déclarée 9,5 → 9, écart −0,5 ; escaliers E1 (complet) et E2 (référence de plan) ;
 * - r1 : mur W3 (0 ; 0)→(5 ; 0), e 0,2, h 2,5 → L 5.
 */
function projet(): EtatModele {
  const e = etatVide("q", VERSION_ONTOLOGIE);
  return ok(
    e,
    cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 }),
    cmd("niveau.creer", { id: "r1", nom: "Étage", elevation: m(3), hauteur: m(3), ordre: 1 }),
    cmd("calque.creer", { id: "C", nom: "Calque", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }),
    cmd("mur.tracer", { id: "W1", niveauId: "rdc", calqueId: "C", a: P(0, 0), b: P(4, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
    cmd("ouverture.poser", { id: "PO1", niveauId: "rdc", calqueId: "C", classe: "porte", murHoteId: "W1", position: { t: 0.5 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" }),
    cmd("mur.tracer", { id: "W2", niveauId: "rdc", calqueId: "C", a: P(0, 0), b: P(0, 2), epaisseur: m(0.1), niveauHaut: "r1", alignement: "axe", typeId: "non-type", exterieur: false }),
    cmd("ouverture.poser", { id: "FE1", niveauId: "rdc", calqueId: "C", classe: "fenetre", murHoteId: "W2", position: { t: 0.5 }, largeur: m(1), hauteur: m(1), allege: m(1), typeId: "non-type" }),
    cmd("dalle.creer", { id: "D1", niveauId: "rdc", calqueId: "C", contour: [P(0, 0), P(10, 0), P(10, 8), P(0, 8)], trous: [{ polygone: [P(4, 3), P(6, 3), P(6, 5), P(4, 5)] }], epaisseur: m(0.25), decalageBase: m(-0.25) }),
    cmd("poteau.creer", { id: "X1", niveauId: "rdc", calqueId: "C", point: P(2, 2), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: deg(0) }),
    cmd("solide.extruder", { id: "SO1", niveauId: "rdc", calqueId: "C", contour: [P(0, 0), P(1, 0), P(1, 1)], trous: [], ferme: true, hauteur: m(2), decalageBase: m(0), role: "solid" }),
    cmd("piece.creer", { id: "S1", niveauId: "rdc", calqueId: "C", polygones: [{ contour: [P(0, 0), P(3, 0), P(3, 3), P(0, 3)], trous: [] }], nom: "Séjour", code: "01", aireDeclaree: { value: 9.5, unit: "m²" } }),
    cmd("escalier.creer", { id: "E1", niveauId: "rdc", calqueId: "C", axe: { a: P(5, 1), b: P(8, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: 17, contremarches: 18, epaisseurPaillasse: m(0.2), decalageBase: m(0), niveauDepartId: "rdc", niveauArriveeId: "r1", referencePlanSeulement: false }),
    cmd("escalier.creer", { id: "E2", niveauId: "r1", calqueId: "C", axe: { a: P(5, 1), b: P(8, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: 17, contremarches: 18, epaisseurPaillasse: m(0.2), decalageBase: m(0), niveauDepartId: "rdc", niveauArriveeId: "r1", referencePlanSeulement: true }),
    cmd("mur.tracer", { id: "W3", niveauId: "r1", calqueId: "C", a: P(0, 0), b: P(5, 0), epaisseur: m(0.2), hauteur: m(2.5), alignement: "axe", typeId: "non-type", exterieur: false }),
  ).etat;
}

const etat = projet();
const tout = calculerQuantitesEtendues(etat);

function q(nature: string, objetId?: string, niveauId?: string, liste: readonly QuantiteEtendue[] | readonly Quantite[] = tout): QuantiteEtendue | Quantite {
  const r = liste.find((x) => x.nature === nature && x.objetId === objetId && x.niveauId === niveauId);
  if (!r) throw new Error(`quantité ${nature} ${objetId ?? "-"} ${niveauId ?? "projet"} absente`);
  return r;
}
const v = (nature: string, objetId?: string, niveauId?: string) => {
  const x = q(nature, objetId, niveauId).valeur;
  if (typeof x !== "number") throw new Error(`${nature} ${objetId ?? ""} non évaluée : ${x.motif}`);
  return x;
};

/** Remplace un objet de l'état (cas non constructibles par commande : données importées incomplètes). */
function avec(e: EtatModele, o: ObjetModele): EtatModele {
  const objets = { ...e.objets, [o.id]: o };
  return { ...e, objets, empreinte: calculerEmpreinte({ ...e, objets }) };
}

describe("quantites/1 : valeurs exactes sur un petit projet fait à la main", () => {
  it("murs : longueur, aires brute / baies / nette, volume net (baies déduites)", () => {
    expect(v("longueur-mur", "W1", "rdc")).toBe(4);
    expect(v("aire-mur-brute", "W1", "rdc")).toBe(12);
    expect(v("aire-baies-mur", "W1", "rdc")).toBeCloseTo(1.89, 12);
    expect(v("aire-mur", "W1", "rdc")).toBeCloseTo(10.11, 12);
    expect(v("volume-mur", "W1", "rdc")).toBeCloseTo(2.022, 12);
    expect(v("longueur-mur", "W2", "rdc")).toBe(2);
    expect(v("aire-mur", "W2", "rdc")).toBe(5);
    expect(v("volume-mur", "W2", "rdc")).toBeCloseTo(0.5, 12);
    expect(q("aire-mur-brute", "W2", "rdc").entrees).toEqual(["W2", "FE1", "rdc", "r1"]);
    expect(v("longueur-mur", undefined, "rdc")).toBe(6);
    expect(v("longueur-mur", undefined, "r1")).toBe(5);
    expect(v("longueur-mur")).toBe(11);
    expect(q("longueur-mur").entrees).toEqual(["W1", "W2", "W3"]);
  });

  it("baies, dalle, poteau, solide, pièce (calculée et déclarée côte à côte)", () => {
    expect(v("aire-baie", "PO1", "rdc")).toBeCloseTo(1.89, 12);
    expect(v("aire-baie", "FE1", "rdc")).toBe(1);
    expect(v("aire-dalle", "D1", "rdc")).toBe(76);
    expect(v("volume-dalle", "D1", "rdc")).toBe(19);
    expect(v("volume-poteau", "X1", "rdc")).toBeCloseTo(0.27, 12);
    expect(v("volume-solide", "SO1", "rdc")).toBe(1);
    expect(v("aire-piece", "S1", "rdc")).toBe(9);
    expect(v("aire-piece-declaree", "S1", "rdc")).toBe(9.5);
    expect(v("ecart-aire-piece", "S1", "rdc")).toBe(-0.5);
    expect(v("aire-pieces-niveau", undefined, "rdc")).toBe(9);
    expect(() => q("aire-pieces-niveau")).toThrow();
  });

  it("effectifs par niveau et projet ; escaliers par occurrence, références de plan comptées à part", () => {
    expect(v("effectif-portes", undefined, "rdc")).toBe(1);
    expect(v("effectif-fenetres", undefined, "rdc")).toBe(1);
    expect(() => q("effectif-ouvertures")).toThrow();
    expect(v("effectif-poteaux")).toBe(1);
    expect(v("effectif-escaliers", undefined, "rdc")).toBe(1);
    expect(v("effectif-escaliers", undefined, "r1")).toBe(1);
    expect(v("effectif-escaliers")).toBe(2);
    expect(v("effectif-escaliers-reference-plan")).toBe(1);
    expect(q("effectif-portes", undefined, "rdc").unite).toBe("unite");
  });

  it("chaque quantité porte règle, révision, empreinte de l'état", () => {
    for (const x of tout) {
      expect(x.regle).toBe(REGLE_QUANTITES);
      expect(x.revision).toBe(etat.revision);
      expect(x.empreinte).toBe(etat.empreinte);
    }
  });
});

describe("quantites/1 : reproductibilité, ordre, filtre", () => {
  it("même état → mêmes quantités, bit à bit, même ordre, quel que soit l'ordre d'insertion des objets", () => {
    expect(jsonCanonique(calculerQuantitesEtendues(etat))).toBe(jsonCanonique(tout));
    const inverse: EtatModele = { ...etat, objets: Object.fromEntries(Object.entries(etat.objets).reverse()) };
    expect(JSON.stringify(calculerQuantites(inverse))).toBe(JSON.stringify(calculerQuantites(etat)));
  });

  it("ordre : nature du contrat, niveau (ordre), agrégat avant objets, projet en dernier", () => {
    const murs = calculerQuantites(etat, { natures: ["longueur-mur"] });
    expect(murs.map((x) => `${x.niveauId ?? "projet"}/${x.objetId ?? "Σ"}`)).toEqual(["rdc/Σ", "rdc/W1", "rdc/W2", "r1/Σ", "r1/W3", "projet/Σ"]);
    expect(calculerQuantites(etat)[0]?.nature).toBe("aire-piece");
  });

  it("filtre par niveau ; le contrat ne rend que ses natures", () => {
    const r1 = calculerQuantitesEtendues(etat, { niveauId: "r1" });
    expect(r1.length).toBeGreaterThan(0);
    expect(r1.every((x) => x.niveauId === "r1")).toBe(true);
    const natures = new Set(calculerQuantites(etat).map((x) => x.nature));
    expect(natures.has("aire-mur")).toBe(true);
    expect([...natures].some((n) => n.startsWith("volume"))).toBe(false);
  });

  it("une commande sur le modèle → nouvelle révision, nouvelle empreinte, valeur mise à jour", () => {
    const e2 = ok(etat, cmd("mur.modifier", { modifications: { axe: { a: P(0, 0), b: P(5, 0) } } }, ["W1"])).etat;
    const q2 = calculerQuantites(e2, { natures: ["longueur-mur"] });
    expect(q2[0]?.revision).toBe(etat.revision + 1);
    expect(q2[0]?.empreinte).not.toBe(etat.empreinte);
    expect(q("longueur-mur", "W1", "rdc", q2).valeur).toBe(5);
  });
});

describe("quantites/1 : non évaluée, jamais 0 inventé", () => {
  it("mur sans hauteur ni niveau haut : non évalué ; agrégat partiel avec somme des évalués", () => {
    const w1 = etat.objets.W1;
    if (w1?.classe !== "mur") throw new Error("mur attendu");
    const { hauteur: _h, ...params } = w1.params;
    void _h;
    const e = avec(etat, { ...w1, params });
    const r = calculerQuantitesEtendues(e);
    expect(q("longueur-mur", "W1", "rdc", r).valeur).toBe(4);
    const aire = q("aire-mur", "W1", "rdc", r).valeur;
    expect(estNonEvaluee(aire)).toBe(true);
    const total = q("aire-mur", undefined, "rdc", r) as QuantiteEtendue;
    expect(estNonEvaluee(total.valeur)).toBe(true);
    expect(total.partiel).toEqual({ somme: 5, nonEvalues: ["W1"] });
    expect(estNonEvaluee(total.valeur) && total.valeur.motif).toMatch(/partiel : 1 objet\(s\) non évalué\(s\) sur 2 \(W1\)/);
  });

  it("pièce sans tracé courant, poteau de forme inconnue, contour auto-sécant : non évalués", () => {
    const s1 = etat.objets.S1;
    const x1 = etat.objets.X1;
    const so = etat.objets.SO1;
    if (s1?.classe !== "piece" || x1?.classe !== "poteau" || so?.classe !== "solide") throw new Error("objets attendus");
    let e = avec(etat, { ...s1, params: { ...s1.params, polygones: [] } });
    e = avec(e, { ...x1, params: { ...x1.params, formeId: "circulaire" } });
    e = avec(e, { ...so, params: { ...so.params, contour: [P(0, 0), P(4, 3), P(4, 0), P(0, 4)] } });
    const r = calculerQuantitesEtendues(e);
    for (const [nature, id] of [["aire-piece", "S1"], ["ecart-aire-piece", "S1"], ["volume-poteau", "X1"], ["volume-solide", "SO1"]] as const) {
      const x = q(nature, id, "rdc", r).valeur;
      expect(estNonEvaluee(x), `${nature} ${id}`).toBe(true);
    }
    expect(q("aire-piece-declaree", "S1", "rdc", r).valeur).toBe(9.5);
    expect(estNonEvaluee(q("aire-pieces-niveau", undefined, "rdc", r).valeur)).toBe(true);
  });

  it("épaisseur « à vérifier » (D-021) : forme étendue calculée et marquée, contrat « non évaluée » avec valeur indicative", () => {
    const d1 = etat.objets.D1;
    if (d1?.classe !== "dalle") throw new Error("dalle attendue");
    const e = avec(etat, { ...d1, annotations: { epaisseur: { provenance: "import", statut: "a-verifier", note: "représentation" } } });
    const ext = q("volume-dalle", "D1", "rdc", calculerQuantitesEtendues(e)) as QuantiteEtendue;
    expect(ext).toMatchObject({ valeur: 19, statut: "a-verifier" });
    expect(q("volume-dalle", undefined, "rdc", calculerQuantitesEtendues(e))).toMatchObject({ valeur: 19, statut: "a-verifier" });
    expect(q("aire-dalle", "D1", "rdc", calculerQuantitesEtendues(e))).toMatchObject({ valeur: 76, statut: "calculee" });
    // Natures du contrat : un mur dont l'épaisseur est « à vérifier » n'affecte pas l'aire ; la hauteur, si.
    const w1 = etat.objets.W1;
    if (w1?.classe !== "mur") throw new Error("mur attendu");
    const e2 = avec(etat, { ...w1, annotations: { hauteur: { provenance: "import", statut: "a-verifier" } } });
    const aire = q("aire-mur", "W1", "rdc", calculerQuantites(e2)).valeur;
    expect(estNonEvaluee(aire) && aire.motif).toMatch(/à vérifier.*valeur indicative 10\.1/);
  });
});
