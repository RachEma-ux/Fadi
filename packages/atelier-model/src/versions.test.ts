import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { importerModeleNatif, type JeuNatif } from "./import/natif.js";
import { modeleVide, type ModeleAtelier } from "./modele.js";
import { m, pt } from "./unites.js";
import { analyserFusion, collisions, commandeRestaurerVers, comparerDessins, comparerModeles, etatARevision, type EntreeJournalLue } from "./versions.js";

const P118 = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
const lot = (commands: Commande[], requestId: string) => ({ requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: requestId, commands });

/** Rejoue des lots en tenant un journal (révision, commandes, inverse) comme le serveur. */
function historique(depart: ModeleAtelier, lots: Commande[][]) {
  let etat = depart;
  const etats = [depart];
  const journal: EntreeJournalLue[] = [];
  lots.forEach((commands, i) => {
    const r = appliquerLot(etat, lot(commands, `r${i + 1}`));
    journal.push({ resultRevision: i + 1, label: `r${i + 1}`, commands, inverse: r.inverse });
    etat = r.etat;
    etats.push(etat);
  });
  return { etat, etats, journal };
}

const NIVEAU: Commande = { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } };
const mur = (id: string, x: number, h = 3): Commande => ({ type: "mur.tracer", params: { id, niveauId: "rdc", a: pt(x, 0), b: pt(x + 4, 0), epaisseur: m(0.2), hauteur: m(h) } });

describe("révisions et versions (DA-21-04)", () => {
  it("état à une révision passée = état enregistré à cette révision ; future ou négative refusée ; import = frontière", () => {
    const h = historique(modeleVide(), [[NIVEAU, mur("m1", 0)], [mur("m2", 5)], [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }], [{ type: "objet.supprimer", params: { id: "m2" } }]]);
    for (let r = 0; r <= 4; r++) expect(etatARevision(h.etat, 4, h.journal, r)).toEqual(h.etats[r]);
    expect(() => etatARevision(h.etat, 4, h.journal, 5)).toThrow(/inexistante/);
    expect(() => etatARevision(h.etat, 4, h.journal, -1)).toThrow(/positive/);
    const avecImport = [{ ...h.journal[0]!, commands: [{ type: "interne.import-archive", params: {} }] }, ...h.journal.slice(1)];
    expect(etatARevision(h.etat, 4, avecImport, 1)).toEqual(h.etats[1]);
    expect(() => etatARevision(h.etat, 4, avecImport, 0)).toThrow(/antérieure à l'import/);
  });

  it("restaurer une version : une commande qui ramène exactement à l'état cible ; rien à faire si identique", () => {
    const h = historique(modeleVide(), [[NIVEAU, mur("m1", 0)], [mur("m2", 5), { type: "objet.modifier", params: { id: "m1", params: { hauteur: m(2.5) } } }]]);
    const cible = JSON.parse(JSON.stringify(h.etats[1])) as ModeleAtelier; // version relue de la base (JSON)
    const c = commandeRestaurerVers(h.etat, cible)!;
    const r = appliquerLot(h.etat, lot([c], "restaurer"));
    expect(comparerModeles(cible, r.etat).identiques).toBe(true);
    expect(r.effets.supprimes).toEqual(["m2"]);
    expect(r.effets.modifies).toEqual(["m1"]);
    expect(commandeRestaurerVers(r.etat, cible)).toBeNull();
  });

  it("comparer deux modèles : ajoutés, supprimés, modifiés avec leurs champs, niveaux", () => {
    const h = historique(modeleVide(), [[NIVEAU, mur("m1", 0), mur("m2", 5)], [{ type: "objet.modifier", params: { id: "m1", params: { epaisseur: m(0.3) } } }, { type: "objet.supprimer", params: { id: "m2" } }, mur("m3", 10), { type: "niveau.creer", params: { id: "r1", nom: "R+1", elevation: 3 } }]]);
    const d = comparerModeles(h.etats[1]!, h.etat);
    expect(d.ajoutes.map((o) => o.id)).toEqual(["m3"]);
    expect(d.supprimes.map((o) => o.id)).toEqual(["m2"]);
    expect(d.modifies).toEqual([{ id: "m1", classe: "mur", niveauId: "rdc", champs: ["epaisseur"] }]);
    expect(d.niveaux.ajoutes).toEqual(["r1"]);
    expect(d.identiques).toBe(false);
    expect(comparerModeles(P118, JSON.parse(JSON.stringify(P118))).identiques).toBe(true);
  });

  it("comparer deux dessins d'une même vue entre révisions : seules les primitives du mur changé diffèrent", () => {
    const h = historique(modeleVide(), [[NIVEAU, mur("m1", 0), mur("m2", 8)], [{ type: "objet.modifier", params: { id: "m2", params: { epaisseur: m(0.4) } } }]]);
    const v: ParamsVue = { type: "plan", titre: "P", echelle: 50, niveauId: "rdc", hauteurCoupe: null, ligneA: null, ligneB: null, profondeur: null, orientation: null, cadreMin: null, cadreMax: null, lignesCachees: false, phases: null };
    const d = comparerDessins(genererVue(h.etats[1]!, v), genererVue(h.etat, v));
    expect(d.retirees.length).toBeGreaterThan(0);
    expect(d.ajoutees.length).toBeGreaterThan(0);
    expect([...d.retirees, ...d.ajoutees].every((p) => p.objetId === "m2" || p.objetId === null || p.objetId === undefined)).toBe(true);
    expect(d.communes).toBeGreaterThan(0);
    expect(comparerDessins(genererVue(h.etat, v), genererVue(h.etat, v))).toMatchObject({ retirees: [], ajoutees: [] });
  });
});

describe("fusion d'une variante (rejeu validé)", () => {
  it("objets affectés (créés puis supprimés = rien) ; conflit = objet touché des deux côtés depuis la bifurcation", () => {
    const tronc = [{ label: "Hauteur m1", resultRevision: 5, crees: [], modifies: ["m1"], supprimes: [] }];
    const variante = [
      { label: "Mur m9", resultRevision: 2, crees: ["m9", "m10"], modifies: [], supprimes: [] },
      { label: "Épaisseurs", resultRevision: 3, crees: [], modifies: ["m1", "m2", "m9"], supprimes: [] },
      { label: "Retrait", resultRevision: 4, crees: [], modifies: [], supprimes: ["m10", "m3"] },
    ];
    const a = analyserFusion(tronc, variante);
    expect(a.affectes).toEqual({ crees: ["m9"], modifies: ["m1", "m2"], supprimes: ["m3"] });
    expect(a.conflits).toEqual([{ objetId: "m1", tronc: { label: "Hauteur m1", revision: 5 }, variante: { label: "Épaisseurs", revision: 3 } }]);
    expect(analyserFusion([], variante).conflits).toEqual([]);
  });
});

describe("collisions d'architecture", () => {
  it("ouverture hors mur, plus haute que le mur, ouvertures qui se chevauchent ; escalier traversé par la dalle d'arrivée", () => {
    let e = appliquerLot(modeleVide(), lot([
      NIVEAU,
      { type: "niveau.creer", params: { id: "r1", nom: "R+1", elevation: 3 } },
      mur("m1", 0, 2.5),
      { type: "ouverture.poser", params: { id: "p1", classe: "porte", murHoteId: "m1", position: 0.2, largeur: m(0.9), hauteur: m(2.1) } },
      { type: "ouverture.poser", params: { id: "f1", classe: "fenetre", murHoteId: "m1", position: 0.35, largeur: m(1.2), hauteur: m(1.6), allege: m(1) } },
      { type: "escalier.creer", params: { id: "e1", niveauId: "rdc", niveauDepartId: "rdc", niveauArriveeId: "r1", a: pt(10, 0), b: pt(10, 4), largeur: m(1), hauteurAFranchir: m(3) } },
      { type: "dalle.creer", params: { id: "d1", niveauId: "r1", contour: [pt(8, -1), pt(14, -1), pt(14, 6), pt(8, 6)], trous: [], epaisseur: m(0.2) } },
    ], "c")).etat;
    const types = (c: ReturnType<typeof collisions>) => c.map((x) => `${x.type}:${x.objets.join(",")}`);
    expect(types(collisions(e))).toEqual(["escalier-contre-dalle:e1,d1", "ouverture-trop-haute:f1,m1", "ouvertures-chevauchantes:p1,f1,m1"]);
    // Trémie au-dessus de la volée : plus de collision avec la dalle ; mur raccourci sous sa porte : signalée.
    e = appliquerLot(e, lot([
      { type: "objet.modifier", params: { id: "d1", params: { trous: [[pt(9.3, -0.2), pt(10.7, -0.2), pt(10.7, 4.2), pt(9.3, 4.2)]] } } },
      { type: "objet.supprimer", params: { id: "f1" } },
      { type: "objet.modifier", params: { id: "m1", params: { b: pt(1, 0) } } },
    ], "c2")).etat;
    expect(types(collisions(e))).toEqual(["ouverture-hors-mur:p1,m1"]);
    expect(collisions(P118)).toEqual([]);
  });
});
