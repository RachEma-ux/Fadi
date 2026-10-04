import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, distance, m, modeleVide, pt, type Commande, type ModeleAtelier, type Occurrence } from "@parcours/atelier-model";
import { actionImmediate, lotSuppression } from "./actions";
import { etatUi, type EtatUi } from "./etat-ui";
import { OUTILS, rechercherOutils } from "./outils";
import { accrocher, objetSousPointeur, segmentsDuNiveau } from "./plan2d/accrochage";
import { clic, objetsDansCadre, saisie, terminer } from "./plan2d/outils-2d";
import { cadrer, projecteur } from "./plan2d/projecteur";

let n = 0;
function appliquer(etat: ModeleAtelier, commandes: Commande[]): ModeleAtelier {
  n += 1;
  return appliquerLot(etat, { requestId: `t${n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "test", commands: commandes }).etat;
}

function socle(): ModeleAtelier {
  return appliquer(modeleVide(), [
    { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
    { type: "niveau.creer", params: { id: "r1", nom: "R+1", elevation: 3, hauteur: 3 } },
  ]);
}

const murs = (etat: ModeleAtelier, cotes: [number, number, number, number][]) => appliquer(etat, cotes.map(([ax, ay, bx, by]) => ({ type: "mur.tracer", params: { niveauId: "rdc", a: pt(ax, ay), b: pt(bx, by), epaisseur: m(0.2), hauteur: m(3) } })));
const carre = (etat: ModeleAtelier) => murs(etat, [[0, 0, 4, 0], [4, 0, 4, 4], [4, 4, 0, 4], [0, 4, 0, 0]]);

const ui = (patch: Partial<EtatUi> = {}): EtatUi => ({ ...etatUi.get(), niveauId: "rdc", pointsEnCours: [], selection: [], ...patch });
const opts = { rayon: 0.2, objetSous: null };

describe("accrochages du plan 2D", () => {
  const etat = carre(socle());
  const cache = segmentsDuNiveau(etat, "rdc");
  const acc = etatUi.get().accrochages;

  it("préfère l'extrémité au milieu et à la grille", () => {
    const a = accrocher(pt(4.05, 0.03), cache, acc, 0.2, null);
    expect(a.type).toBe("extremite");
    expect(a.point.x).toBeCloseTo(4);
    expect(a.point.y).toBeCloseTo(0);
  });

  it("trouve le milieu d'un mur, puis la grille loin des objets", () => {
    expect(accrocher(pt(2.02, 0.05), cache, acc, 0.2, null).type).toBe("milieu");
    const g = accrocher(pt(10.13, 10.31), cache, acc, 0.2, null);
    expect(g.type).toBe("grille");
    expect(g.point).toMatchObject({ x: 10, y: 10.5 });
  });

  it("contraint à 45° depuis le point précédent (orthogonal)", () => {
    const sansGrille = { ...acc, grille: false };
    const o = accrocher(pt(13, 10.05), cache, sansGrille, 0.2, pt(10, 10));
    expect(o.type).toBe("orthogonal");
    expect(o.point.y).toBeCloseTo(10);
  });

  it("désactiver un accrochage le retire", () => {
    const a = accrocher(pt(4.05, 0.03), cache, { ...acc, extremite: false, intersection: false, perpendiculaire: false, milieu: false, grille: false, orthogonal: false }, 0.2, null);
    expect(a.type).toBe("libre");
  });

  it("le clic sélectionne le mur sur toute son épaisseur", () => {
    expect(objetSousPointeur(pt(2, 0.09), cache, etat, "rdc", 0.05)?.objetId).toMatch(/^mur-/);
    expect(objetSousPointeur(pt(2, 2), cache, etat, "rdc", 0.05)).toBeNull();
  });
});

describe("outils de tracé", () => {
  it("trace des murs enchaînés : chaque clic après le premier émet un lot valide", () => {
    let etat = socle();
    const r1 = clic("mur", pt(0, 0), etat, ui(), opts);
    expect(r1.commandes).toHaveLength(0);
    const r2 = clic("mur", pt(5, 0), etat, ui({ pointsEnCours: r1.pointsEnCours }), opts);
    expect(r2.commandes[0]?.type).toBe("mur.tracer");
    expect(r2.label).toBe("Mur 5,00 m");
    etat = appliquer(etat, r2.commandes);
    const r3 = clic("mur", pt(5, 3), etat, ui({ pointsEnCours: r2.pointsEnCours }), opts);
    etat = appliquer(etat, r3.commandes);
    expect(Object.values(etat.objets).filter((o) => o.classe === "mur")).toHaveLength(2);
  });

  it("saisie de précision : une longueur dans la direction du pointeur, ou un déplacement dx;dy", () => {
    const etat = socle();
    const r = saisie("mur", "4,5", [pt(1, 1)], pt(1, 9), etat, ui({ pointsEnCours: [pt(1, 1)] }), opts);
    const p = r!.commandes[0]!.params as { a: { x: number; y: number }; b: { x: number; y: number } };
    expect(p.b.x).toBeCloseTo(1);
    expect(p.b.y).toBeCloseTo(5.5);
    const r2 = saisie("mur", "3;-1", [pt(1, 1)], null, etat, ui({ pointsEnCours: [pt(1, 1)] }), opts);
    expect((r2!.commandes[0]!.params as { b: { x: number; y: number } }).b).toMatchObject({ x: 4, y: 0 });
    expect(saisie("mur", "abc", [pt(1, 1)], null, etat, ui(), opts)).toBeNull();
  });

  it("pose une porte sur le mur cliqué, jamais hors du mur", () => {
    let etat = carre(socle());
    const r = clic("porte", pt(0.1, 0.05), etat, ui(), opts);
    expect(r.commandes[0]?.type).toBe("ouverture.poser");
    etat = appliquer(etat, r.commandes);
    const porte = Object.values(etat.objets).find((o) => o.classe === "porte") as Occurrence<"porte">;
    expect(porte.params.position).toBeCloseTo(0.9 / 2 / 4);
    expect(clic("porte", pt(2, 2), etat, ui(), opts).commandes).toHaveLength(0);
  });

  it("ferme une dalle en cliquant le premier point, ou avec Entrée", () => {
    const etat = socle();
    let u = ui();
    for (const p of [pt(0, 0), pt(4, 0), pt(4, 3)]) u = ui({ pointsEnCours: clic("dalle", p, etat, u, opts).pointsEnCours });
    const f = clic("dalle", pt(0.05, 0.05), etat, u, opts);
    expect(f.commandes[0]?.type).toBe("dalle.creer");
    expect(appliquer(etat, f.commandes)).toBeTruthy();
    expect(terminer("dalle", u.pointsEnCours, u, "rdc").commandes[0]?.type).toBe("dalle.creer");
    expect(terminer("dalle", u.pointsEnCours.slice(0, 2), u, "rdc").commandes).toHaveLength(0);
  });

  it("propose la pièce de la boucle de murs cliquée, avec son aire calculée", () => {
    let etat = carre(socle());
    const r = clic("piece", pt(2, 2), etat, ui(), opts);
    expect(r.commandes[0]?.type).toBe("piece.creer");
    expect(r.label).toBe("Pièce 16,00 m²");
    etat = appliquer(etat, r.commandes);
    const deja = clic("piece", pt(2, 2), etat, ui(), opts);
    expect(deja.commandes).toHaveLength(0);
    expect(deja.selectionner?.[0]).toMatch(/^piece-/);
    expect(clic("piece", pt(9, 9), etat, ui(), opts).commandes).toHaveLength(0);
  });

  it("l'escalier rejoint le niveau supérieur et franchit sa différence d'altitude", () => {
    const etat = socle();
    const r = clic("escalier", pt(3, 0), etat, ui({ pointsEnCours: [pt(0, 0)] }), opts);
    const p = r.commandes[0]!.params as { niveauArriveeId: string; hauteurAFranchir: { value: number } };
    expect(p.niveauArriveeId).toBe("r1");
    expect(p.hauteurAFranchir.value).toBe(3);
    expect(appliquer(etat, r.commandes)).toBeTruthy();
  });

  it("demande un niveau avant tout tracé", () => {
    expect(clic("mur", pt(0, 0), socle(), ui({ niveauId: null }), opts).aide).toMatch(/niveau/);
  });

  it("sélection par cadre : seuls les objets entièrement dedans", () => {
    const etat = carre(socle());
    expect(objetsDansCadre(etat, "rdc", pt(-1, -1), pt(5, 1))).toHaveLength(1);
    expect(objetsDansCadre(etat, "rdc", pt(-1, -1), pt(5, 5))).toHaveLength(4);
  });
});

describe("actions sur la sélection", () => {
  it("supprimer un mur emporte ses ouvertures, sans les supprimer deux fois", () => {
    let etat = carre(socle());
    etat = appliquer(etat, clic("porte", pt(2, 0), etat, ui(), opts).commandes);
    const mur = Object.values(etat.objets).find((o) => o.classe === "mur" && o.params.a.y === 0 && o.params.b.y === 0)!;
    const porte = Object.values(etat.objets).find((o) => o.classe === "porte")!;
    const r = lotSuppression(etat, [mur.id, porte.id]);
    expect(r.commandes).toHaveLength(1);
    expect(r.label).toMatch(/1 ouverture/);
    const apres = appliquer(etat, r.commandes);
    expect(apres.objets[porte.id]).toBeUndefined();
    expect(apres.objets[mur.id]).toBeUndefined();
  });

  it("une action sans sélection explique ce qui manque ; raccorder exige deux lignes", () => {
    const etat = carre(socle());
    expect(actionImmediate("supprimer", etat, ui())).toEqual({ message: expect.stringMatching(/Sélectionnez/) as unknown as string });
    const un = Object.keys(etat.objets).slice(0, 1);
    expect("message" in actionImmediate("raccorder", etat, ui({ selection: un }))).toBe(true);
  });

  it("répéter copie la sélection selon le pas de l'outil", () => {
    const etat = carre(socle());
    const id = Object.keys(etat.objets)[0]!;
    const r = actionImmediate("repeter", etat, ui({ selection: [id], parametresOutil: { repetitions: 2, pasX: 0, pasY: 5 } }));
    expect("commandes" in r).toBe(true);
    if ("commandes" in r) expect(Object.keys(appliquer(etat, r.commandes).objets)).toHaveLength(6);
  });
});

describe("extrusion d'esquisse (DA-04-01)", () => {
  it("un rectangle et un cercle d'esquisse deviennent des solides de la hauteur de l'outil ; une ligne est refusée", () => {
    let etat = socle();
    etat = appliquer(etat, [
      { type: "esquisse.rectangle", params: { niveauId: "rdc", points: [pt(0, 0), pt(2, 1)] } },
      { type: "esquisse.cercle", params: { niveauId: "rdc", centre: pt(5, 5), rayon: m(1) } },
      { type: "esquisse.ligne", params: { niveauId: "rdc", points: [pt(0, 3), pt(3, 3)] } },
    ]);
    const ids = Object.keys(etat.objets);
    const r = actionImmediate("extruder", etat, ui({ selection: ids, parametresOutil: { hauteurSolide: 1.1 } }));
    expect("commandes" in r && r.commandes).toHaveLength(2);
    if (!("commandes" in r)) return;
    const apres = appliquer(etat, r.commandes);
    const solides = Object.values(apres.objets).filter((o) => o.classe === "solide") as Occurrence<"solide">[];
    expect(solides).toHaveLength(2);
    expect(solides.every((s) => s.params.hauteur?.value === 1.1)).toBe(true);
    expect("message" in actionImmediate("extruder", etat, ui({ selection: [ids[2]!] }))).toBe(true);
  });
});

describe("palette et projection", () => {
  it("trouve les outils par synonymes d'autres logiciels, sans accents", () => {
    expect(rechercherOutils("wall")[0]?.id).toBe("mur");
    expect(rechercherOutils("cloison")[0]?.id).toBe("mur");
    expect(rechercherOutils("fenetre")[0]?.id).toBe("fenetre");
    expect(rechercherOutils("")).toHaveLength(OUTILS.length);
  });

  it("chaque raccourci clavier désigne un seul outil", () => {
    const r = OUTILS.map((o) => o.raccourci).filter((x): x is string => !!x);
    expect(new Set(r).size).toBe(r.length);
  });

  it("la projection écran ↔ local est réversible, y vers le haut", () => {
    const pr = projecteur({ cx: 2, cy: 3, echelle: 50 }, 800, 600);
    const s = pr.vers({ x: 4, y: 5 });
    expect(s.y).toBeLessThan(300);
    const p = pr.depuis(s.x, s.y);
    expect(distance(p, pt(4, 5))).toBeLessThan(1e-9);
    const v = cadrer([pt(0, 0), pt(10, 5)], 800, 600);
    expect(v.cx).toBe(5);
    expect(v.echelle).toBeCloseTo(72);
  });
});

describe("aide située (UX4, relue au lot 9)", () => {
  it("chaque outil dit son action en une phrase, donne un exemple court, nomme sa famille et sa fiche", () => {
    for (const o of OUTILS) {
      expect(o.aide.trim().length, o.id).toBeGreaterThan(15);
      expect(o.aide.length, o.id).toBeLessThan(260);
      expect(o.exemple.trim().length, o.id).toBeGreaterThan(8);
      expect(o.exemple, o.id).not.toBe(o.aide);
      expect(o.fiche ?? "", o.id).toMatch(/^(DA-\d\d-\d\d|lot \d.*)?$/);
    }
    // Les termes d'autres logiciels mènent aux outils (palette).
    expect(rechercherOutils("offset")[0]?.id).toBeDefined();
    expect(rechercherOutils("push")[0]?.id).toBeDefined();
  });
});
