import { describe, expect, it } from "vitest";
import { boucles, distance } from "../geometrie.js";
import { modeleVide, ouverturesDuMur, type ModeleAtelier, type Occurrence } from "../modele.js";
import { pointCaracteristique, resoudreReference } from "../references.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, ErreurCommande, appliquerCommande, appliquerLot, detecterPieces, generateurIds, type Commande, type Enveloppe } from "./index.js";

const lot = (commands: Commande[], requestId = "req-1", baseRevision = 0): Enveloppe => ({ requestId, baseRevision, contract: CONTRAT_COMMANDES, label: "test", commands });

function socle(): ModeleAtelier {
  const r = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3.2 } },
    { type: "niveau.creer", params: { id: "r1", nom: "R+1", elevation: 3.2, hauteur: 3.2 } },
    { type: "calque.creer", params: { id: "Murs", nom: "Murs" } },
    { type: "calque.creer", params: { id: "Verrou", nom: "Verrouillé", verrouille: true } },
    { type: "type.definir", params: { id: "cloison", classe: "mur", nom: "Cloison" } },
  ], "socle"));
  return r.etat;
}

const murParams = (ax: number, ay: number, bx: number, by: number, extra: Record<string, unknown> = {}) => ({ niveauId: "rdc", a: pt(ax, ay), b: pt(bx, by), epaisseur: m(0.2), hauteur: m(3.2), calqueId: "Murs", ...extra });

describe("commandes : murs et ouvertures", () => {
  it("trace un mur avec des identifiants déterministes dérivés du requestId", () => {
    const etat = socle();
    const a = appliquerLot(etat, lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "abc"));
    const b = appliquerLot(etat, lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "abc"));
    expect(a.effets.crees).toEqual(["mur-abc-1"]);
    expect(JSON.stringify(a.etat)).toBe(JSON.stringify(b.etat));
    const mur = a.etat.objets["mur-abc-1"] as Occurrence<"mur">;
    expect(mur.params.alignement).toBe("axe");
    expect(mur.params.hauteur).toEqual({ value: 3.2, unit: "m" });
  });

  it("refuse une grandeur sans unité ou dans une autre unité (T03), et un mur de longueur nulle", () => {
    const etat = socle();
    expect(() => appliquerLot(etat, lot([{ type: "mur.tracer", params: { ...murParams(0, 0, 4, 0), epaisseur: 0.2 } }]))).toThrow(/unité incompatible/);
    expect(() => appliquerLot(etat, lot([{ type: "mur.tracer", params: { ...murParams(0, 0, 4, 0), epaisseur: { value: 20, unit: "cm" } } }]))).toThrow(ErreurCommande);
    expect(() => appliquerLot(etat, lot([{ type: "mur.tracer", params: murParams(1, 1, 1, 1) }]))).toThrow(/longueur nulle/);
  });

  it("pose une porte sur un mur, hérite du calque, refuse une emprise qui sort du mur", () => {
    const etat = appliquerLot(socle(), lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "w")).etat;
    const r = appliquerLot(etat, lot([{ type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-w-1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }], "d"));
    const porte = r.etat.objets["porte-d-1"] as Occurrence<"porte">;
    expect(porte.niveauId).toBe("rdc");
    expect(porte.calqueId).toBe("Murs");
    expect(pointCaracteristique(r.etat, porte.id, "centre")).toEqual(pt(2, 0));
    expect(() => appliquerLot(etat, lot([{ type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-w-1", position: 0.05, largeur: m(0.9), hauteur: m(2.1) } }]))).toThrow(/sort du mur/);
    expect(() => appliquerLot(etat, lot([{ type: "ouverture.poser", params: { classe: "porte", murHoteId: "inconnu", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }]))).toThrow(/introuvable/);
  });

  it("scinde un mur : deux nouveaux murs, ouvertures réaffectées, cotation rattachée « à réparer » avec propositions", () => {
    let etat = appliquerLot(socle(), lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "w")).etat;
    etat = appliquerLot(etat, lot([
      { type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-w-1", position: 0.25, largeur: m(0.8), hauteur: m(2.1) } },
      { type: "ouverture.poser", params: { classe: "fenetre", murHoteId: "mur-w-1", position: 0.75, largeur: m(1), hauteur: m(1.2), allege: m(0.9) } },
      { type: "cotation.creer", params: { niveauId: "rdc", a: pt(0, 1), b: pt(4, 1), decalage: m(1) } },
      { type: "cotation.rattacher", params: { id: "cotation-o-3", objetId: "mur-w-1", caracteristique: "arete-fin" } },
    ], "o")).etat;
    expect(resoudreReference(etat, etat.references["ref-o-4"]!)).toEqual(pt(4, 0));
    expect(() => appliquerLot(etat, lot([{ type: "mur.scinder", params: { id: "mur-w-1", t: 0.3 } }]))).toThrow(/emprise/);
    const r = appliquerLot(etat, lot([{ type: "mur.scinder", params: { id: "mur-w-1", t: 0.5 } }], "s"));
    expect(r.effets.crees).toEqual(["mur-s-1", "mur-s-2"]);
    expect(r.effets.supprimes).toEqual(["mur-w-1"]);
    const porte = r.etat.objets["porte-o-1"] as Occurrence<"porte">;
    const fenetre = r.etat.objets["fenetre-o-2"] as Occurrence<"fenetre">;
    expect(porte.params.murHoteId).toBe("mur-s-1");
    expect(porte.params.position).toBeCloseTo(0.5, 12);
    expect(fenetre.params.murHoteId).toBe("mur-s-2");
    expect(fenetre.params.position).toBeCloseTo(0.5, 12);
    expect(pointCaracteristique(r.etat, "porte-o-1", "centre")).toEqual(pt(1, 0));
    const ref = r.etat.references["ref-o-4"]!;
    expect(ref.etat).toBe("a-reparer");
    expect(ref.propositions.map((p) => p.objetId)).toEqual(["mur-s-1", "mur-s-2"]);
    expect(r.effets.referencesAReparer).toEqual(["ref-o-4"]);
    expect(Object.values(r.etat.problemes).some((p) => p.type === "reference-a-reparer")).toBe(true);
    // Réparation explicite
    const rep = appliquerLot(r.etat, lot([{ type: "reference.reparer", params: { referenceId: "ref-o-4", objetId: "mur-s-2", caracteristique: "arete-fin" } }], "rep"));
    expect(rep.etat.references["ref-o-4"]!.etat).toBe("ok");
    expect(resoudreReference(rep.etat, rep.etat.references["ref-o-4"]!)).toEqual(pt(4, 0));
    expect(Object.values(rep.etat.problemes).filter((p) => p.type === "reference-a-reparer")).toHaveLength(0);
  });

  it("refuse de supprimer un mur hébergeant des ouvertures sans l'option explicite, puis les supprime avec lui", () => {
    let etat = appliquerLot(socle(), lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "w")).etat;
    etat = appliquerLot(etat, lot([{ type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-w-1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } }], "d")).etat;
    expect(() => appliquerLot(etat, lot([{ type: "mur.supprimer", params: { id: "mur-w-1" } }]))).toThrow(/avecHeberges/);
    const r = appliquerLot(etat, lot([{ type: "mur.supprimer", params: { id: "mur-w-1", avecHeberges: true } }], "x"));
    expect(r.effets.supprimes.sort()).toEqual(["mur-w-1", "porte-d-1"]);
    expect(Object.keys(r.etat.objets)).toHaveLength(0);
  });

  it("refuse toute écriture sur un calque verrouillé", () => {
    const etat = socle();
    expect(() => appliquerLot(etat, lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0, { calqueId: "Verrou" }) }]))).toThrow(/verrouillé/);
  });
});

describe("commandes : transformations (D-012)", () => {
  function murAvecPorte(): ModeleAtelier {
    let etat = appliquerLot(socle(), lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "w")).etat;
    etat = appliquerLot(etat, lot([
      { type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-w-1", position: 0.25, largeur: m(0.8), hauteur: m(2.1), repere: "P1" } },
      { type: "cotation.creer", params: { niveauId: "rdc", a: pt(0, 1), b: pt(4, 1), decalage: m(1) } },
      { type: "cotation.rattacher", params: { id: "cotation-o-2", objetId: "mur-w-1", caracteristique: "face-gauche" } },
    ], "o")).etat;
    return etat;
  }

  it("déplace un mur : ses ouvertures suivent, une ouverture seule est refusée", () => {
    const etat = murAvecPorte();
    const r = appliquerLot(etat, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 2 }, cibles: ["mur-w-1"] }], "t"));
    expect(pointCaracteristique(r.etat, "porte-o-1", "centre")).toEqual(pt(2, 2));
    expect((r.etat.objets["porte-o-1"] as Occurrence<"porte">).params.position).toBe(0.25);
    expect(() => appliquerLot(etat, lot([{ type: "transformer.deplacer", params: { dx: 1, dy: 0 }, cibles: ["porte-o-1"] }]))).toThrow(/suit son mur/);
  });

  it("copie un mur avec des copies de ses ouvertures, sans repère ni statut", () => {
    const r = appliquerLot(murAvecPorte(), lot([{ type: "transformer.copier", params: { dx: 0, dy: 5 }, cibles: ["mur-w-1"] }], "c"));
    expect(r.effets.crees).toEqual(["mur-c-1", "porte-c-2"]);
    const copie = r.etat.objets["porte-c-2"] as Occurrence<"porte">;
    expect(copie.params.murHoteId).toBe("mur-c-1");
    expect(copie.params.repere).toBeNull();
    expect(ouverturesDuMur(r.etat, "mur-w-1")).toHaveLength(1);
    expect(pointCaracteristique(r.etat, "porte-c-2", "centre")).toEqual(pt(1, 5));
  });

  it("met « à réparer » une cotation sur une face après un miroir en place", () => {
    const r = appliquerLot(murAvecPorte(), lot([{ type: "transformer.miroir", params: { a: pt(2, -5), b: pt(2, 5) }, cibles: ["mur-w-1"] }], "mi"));
    const mur = r.etat.objets["mur-w-1"] as Occurrence<"mur">;
    expect(mur.params.a).toEqual(pt(4, 0));
    expect(mur.params.b).toEqual(pt(0, 0));
    expect(r.etat.references["ref-o-3"]!.etat).toBe("a-reparer");
    expect(r.etat.references["ref-o-3"]!.propositions[0]).toEqual({ objetId: "mur-w-1", caracteristique: "face-droite" });
  });

  it("refuse l'échelle sur un escalier et garde les dimensions typées des murs", () => {
    let etat = appliquerLot(socle(), lot([
      { type: "mur.tracer", params: murParams(0, 0, 4, 0) },
      { type: "escalier.creer", params: { niveauId: "rdc", a: pt(0, 1), b: pt(3, 1), largeur: m(1.2), hauteurAFranchir: m(3.2), niveauDepartId: "rdc", niveauArriveeId: "r1" } },
    ], "e")).etat;
    expect(() => appliquerLot(etat, lot([{ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: 2 }, cibles: ["escalier-e-2"] }]))).toThrow(/escalier/);
    etat = appliquerLot(etat, lot([{ type: "transformer.echelle", params: { centre: pt(0, 0), facteur: 2 }, cibles: ["mur-e-1"] }], "sc")).etat;
    const mur = etat.objets["mur-e-1"] as Occurrence<"mur">;
    expect(mur.params.b).toEqual(pt(8, 0));
    expect(mur.params.epaisseur.value).toBe(0.2);
  });

  it("étire un mur en conservant la distance des ouvertures à l'extrémité fixe, et signale celles qui sortent", () => {
    const etat = murAvecPorte(); // porte centrée à x = 1 (t = 0,25 sur 4 m)
    const r = appliquerLot(etat, lot([{ type: "transformer.etirer", params: { id: "mur-w-1", extremite: "b", point: pt(8, 0) } }], "et"));
    expect(pointCaracteristique(r.etat, "porte-o-1", "centre")).toEqual(pt(1, 0));
    expect(r.effets.problemes).toHaveLength(0);
    const r2 = appliquerLot(etat, lot([{ type: "transformer.etirer", params: { id: "mur-w-1", extremite: "b", point: pt(1.2, 0) } }], "et2"));
    expect(r2.effets.referencesAReparer).toEqual(["porte-o-1"]);
    expect(r2.etat.objets["porte-o-1"]).toBeDefined();
  });

  it("répète une trame de poteaux et décale une ligne d'esquisse", () => {
    const etat = appliquerLot(socle(), lot([
      { type: "poteau.creer", params: { niveauId: "rdc", point: pt(0, 0), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3) } },
      { type: "esquisse.ligne", params: { niveauId: "rdc", points: [pt(0, 0), pt(10, 0)] } },
    ], "p")).etat;
    const r = appliquerLot(etat, lot([{ type: "transformer.repeter", params: { nombre: 3, dx: 5, dy: 0 }, cibles: ["poteau-p-1"] }], "rp"));
    expect(r.effets.crees).toHaveLength(3);
    expect((r.etat.objets["poteau-rp-3"] as Occurrence<"poteau">).params.point).toEqual(pt(15, 0));
    const d = appliquerLot(etat, lot([{ type: "transformer.decaler", params: { distance: m(1), cote: "gauche" }, cibles: ["esquisse-p-2"] }], "dc"));
    const ligne = d.etat.objets["esquisse-dc-1"] as Occurrence<"esquisse">;
    expect(ligne.params.points[0]).toEqual(pt(0, 1));
  });

  it("raccorde et chanfreine deux lignes d'esquisse", () => {
    const etat = appliquerLot(socle(), lot([
      { type: "esquisse.ligne", params: { niveauId: "rdc", points: [pt(0, 0), pt(4, 0)] } },
      { type: "esquisse.ligne", params: { niveauId: "rdc", points: [pt(4, 0), pt(4, 4)] } },
    ], "l")).etat;
    const ch = appliquerLot(etat, lot([{ type: "transformer.chanfreiner", params: { id1: "esquisse-l-1", id2: "esquisse-l-2", distance: m(1) } }], "ch"));
    expect((ch.etat.objets["esquisse-l-1"] as Occurrence<"esquisse">).params.points[1]).toEqual(pt(3, 0));
    expect((ch.etat.objets["esquisse-ch-1"] as Occurrence<"esquisse">).params.points).toEqual([pt(3, 0), pt(4, 1)]);
    const ra = appliquerLot(etat, lot([{ type: "transformer.raccorder", params: { id1: "esquisse-l-1", id2: "esquisse-l-2", rayon: m(1) } }], "ra"));
    const arc = ra.etat.objets["esquisse-ra-1"] as Occurrence<"esquisse">;
    expect(arc.params.forme).toBe("arc");
    expect(arc.params.centre!.x).toBeCloseTo(3, 9);
    expect(arc.params.centre!.y).toBeCloseTo(1, 9);
  });
});

describe("lot atomique, inverse et détection de pièces", () => {
  it("laisse l'état intact si une commande du lot échoue, et l'inverse restaure l'état exact", () => {
    const etat = socle();
    expect(() => appliquerLot(etat, lot([
      { type: "mur.tracer", params: murParams(0, 0, 4, 0) },
      { type: "mur.tracer", params: murParams(0, 0, 0, 0) },
    ]))).toThrow(/commands\[1\]/);
    const r = appliquerLot(etat, lot([
      { type: "mur.tracer", params: murParams(0, 0, 4, 0) },
      { type: "ouverture.poser", params: { classe: "porte", murHoteId: "mur-k-1", position: 0.5, largeur: m(0.9), hauteur: m(2.1) } },
      { type: "niveau.modifier", params: { id: "rdc", nom: "Rez" } },
    ], "k"));
    expect(Object.keys(r.etat.objets)).toHaveLength(2);
    const retour = appliquerCommande(r.etat, r.inverse, { ids: generateurIds("undo") });
    expect(JSON.stringify(retour.etat)).toBe(JSON.stringify(etat));
    expect(retour.effets.supprimes.sort()).toEqual(["mur-k-1", "porte-k-2"]);
    // rétablir = réappliquer l'inverse de l'inverse
    const redo = appliquerLot(retour.etat, lot(r.inverse.type === "interne.restaurer" ? [{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }] : [], "k2"));
    expect(Object.keys(redo.etat.objets)).toHaveLength(1);
  });

  it("refuse une commande inconnue et un contrat non pris en charge", () => {
    expect(() => appliquerLot(socle(), lot([{ type: "mur.voler", params: {} }]))).toThrow(/inconnue/);
    expect(() => appliquerLot(socle(), { ...lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }]), contract: "atelier-commands/2" as never })).toThrow(/contrat/);
  });

  it("refuse de supprimer un niveau qui porte des objets, puis le supprime avec eux", () => {
    const etat = appliquerLot(socle(), lot([{ type: "mur.tracer", params: murParams(0, 0, 4, 0) }], "w")).etat;
    expect(() => appliquerLot(etat, lot([{ type: "niveau.supprimer", params: { id: "rdc" } }]))).toThrow(/avecObjets/);
    const r = appliquerLot(etat, lot([{ type: "niveau.supprimer", params: { id: "rdc", avecObjets: true } }], "n"));
    expect(r.etat.niveaux["rdc"]).toBeUndefined();
    expect(Object.keys(r.etat.objets)).toHaveLength(0);
  });

  it("détecte les boucles fermées des axes de murs comme propositions de pièces", () => {
    const etat = appliquerLot(socle(), lot([
      { type: "mur.tracer", params: murParams(0, 0, 6, 0) },
      { type: "mur.tracer", params: murParams(6, 0, 6, 4) },
      { type: "mur.tracer", params: murParams(6, 4, 0, 4) },
      { type: "mur.tracer", params: murParams(0, 4, 0, 0) },
      { type: "mur.tracer", params: murParams(3, 0, 3, 4) }, // refend : deux pièces
    ], "b")).etat;
    const propositions = detecterPieces(etat, "rdc");
    expect(propositions).toHaveLength(2);
    expect(propositions.map((p) => p.aire).sort()).toEqual([12, 12]);
    expect(propositions[0]!.murs.length).toBeGreaterThanOrEqual(3);
    // création explicite depuis une proposition, jamais imposée
    const r = appliquerLot(etat, lot([{ type: "piece.creer", params: { niveauId: "rdc", contour: propositions[0]!.contour, nom: "Bureau", code: "B1" } }], "pc"));
    expect(detecterPieces(r.etat, "rdc").filter((p) => p.pieceExistante).length).toBe(1);
    expect(boucles([{ id: "x", a: pt(0, 0), b: pt(1, 0) }])).toEqual([]);
  });

  it("définit la parcelle et dérive l'emprise locale par la transformation explicite", () => {
    const r = appliquerLot(socle(), lot([
      { type: "site.parcelle.definir", params: { crs: "EPSG:26191", origineLocale: { x: 100, y: 200, frame: "cadastral", crs: "EPSG:26191", unit: "m" }, sommets: [
        { id: "B1", cadastral: { x: 100, y: 200, frame: "cadastral", crs: "EPSG:26191", unit: "m" } },
        { id: "B2", cadastral: { x: 110, y: 200, frame: "cadastral", crs: "EPSG:26191", unit: "m" } },
        { id: "B3", cadastral: { x: 110, y: 210, frame: "cadastral", crs: "EPSG:26191", unit: "m" } },
      ] } },
      { type: "site.emprise.definir", params: { sommetsCadastraux: [{ x: 102, y: 202 }, { x: 108, y: 202 }, { x: 108, y: 208 }] } },
    ], "site"));
    expect(r.etat.site.parcelle!.sommets[1]!.local).toEqual(pt(10, 0));
    expect(r.etat.site.emprise!.sommets[0]).toEqual(pt(2, 2));
    expect(r.etat.site.emprise!.sommetsCadastraux[0]!.crs).toBe("EPSG:26191");
    expect(distance(r.etat.site.emprise!.sommets[0]!, r.etat.site.emprise!.sommets[1]!)).toBe(6);
  });
});
