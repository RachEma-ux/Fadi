import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, distance, m, modeleVide, pt, type Commande, type ModeleAtelier, type Occurrence } from "@parcours/atelier-model";
import { actionImmediate, lotSuppression } from "./actions";
import { etatUi, type EtatUi } from "./etat-ui";
import { OUTILS, rechercherOutils } from "./outils";
import { accrocher, objetSousPointeur, segmentsDuNiveau } from "./plan2d/accrochage";
import { clic, objetsDansCadre, objetsDansLasso, saisie, terminer } from "./plan2d/outils-2d";
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

  it("sélection au lasso : contour libre, seuls les objets entièrement entourés", () => {
    const etat = carre(socle());
    // Un L qui entoure le mur du bas et celui de gauche, pas les deux autres.
    const l = [pt(-1, -1), pt(5, -1), pt(5, 1), pt(1, 1), pt(1, 5), pt(-1, 5)];
    expect(objetsDansLasso(etat, "rdc", l)).toHaveLength(2);
    expect(objetsDansLasso(etat, "rdc", [pt(-1, -1), pt(5, -1), pt(5, 5), pt(-1, 5)])).toHaveLength(4);
    expect(objetsDansLasso(etat, "rdc", [pt(0, 0), pt(1, 1)])).toEqual([]);
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

describe("réseau sur trajectoire et aligner (D-058)", () => {
  const etat = appliquer(socle(), [
    { type: "esquisse.polyligne", params: { id: "allee", niveauId: "rdc", points: [pt(0, 0), pt(10, 0), pt(10, 10)] } },
    { type: "esquisse.ligne", params: { id: "banc", niveauId: "rdc", points: [pt(0, -1), pt(1, -1)] } },
  ]);

  it("réseau : nombre exigé, trajectoire cliquée puis point de base ; la trajectoire est retrouvée au premier point", () => {
    expect(clic("reseau-trajet", pt(5, 0), etat, ui({ selection: ["banc"] }), { ...opts, objetSous: "allee" }).commandes).toHaveLength(0);
    const u = ui({ selection: ["banc"], parametresOutil: { ...etatUi.get().parametresOutil, copiesTrajet: 4 } });
    const r1 = clic("reseau-trajet", pt(5, 0.05), etat, u, { ...opts, objetSous: "allee" });
    expect(r1.pointsEnCours).toHaveLength(1);
    const r2 = clic("reseau-trajet", pt(0.5, -1), etat, { ...u, pointsEnCours: r1.pointsEnCours }, { ...opts, alt: true });
    expect(r2.commandes[0]).toMatchObject({ type: "transformer.repeter", params: { trajetId: "allee", nombre: 4, orienter: true }, cibles: ["banc"] });
    expect(clic("reseau-trajet", pt(5, 0), etat, u, { ...opts, objetSous: "banc" }).aide).toMatch(/trajectoire/);
  });

  it("aligner : quatre clics, une commande", () => {
    let u = ui({ selection: ["banc"] });
    for (const p of [pt(0, -1), pt(5, 5), pt(1, -1)]) u = { ...u, pointsEnCours: clic("aligner", p, etat, u, opts).pointsEnCours };
    const r = clic("aligner", pt(5, 9), etat, u, opts);
    expect(r.commandes[0]).toMatchObject({ type: "transformer.aligner", params: { source1: pt(0, -1), dest1: pt(5, 5), source2: pt(1, -1), dest2: pt(5, 9), copie: false } });
    const apres = appliquer(etat, r.commandes);
    const q = (apres.objets["banc"] as Occurrence<"esquisse">).params.points;
    expect(q[0]!.x).toBeCloseTo(5);
    expect(q[1]!.y).toBeCloseTo(6);
  });
});

describe("copier avec codes suivants (D-060)", () => {
  it("Alt au second clic : codes « suivant »", () => {
    const etat = socle();
    const u = ui({ selection: ["x"], pointsEnCours: [pt(0, 0)] });
    expect(clic("copier", pt(1, 0), etat, u, { ...opts, alt: true }).commandes[0]).toMatchObject({ type: "transformer.copier", params: { dx: 1, dy: 0, codes: "suivant" } });
    expect(clic("copier", pt(1, 0), etat, u, opts).commandes[0]!.params).not.toHaveProperty("codes");
  });
});

describe("accrochage « proche » (D-061)", () => {
  const etat = carre(socle());
  const cache = segmentsDuNiveau(etat, "rdc");
  const acc = { ...etatUi.get().accrochages, grille: false, orthogonal: false };

  it("désactivé par défaut ; activé : point le plus proche sur la face d'un mur (épaisseur 0,20 m)", () => {
    expect(accrocher(pt(1.7, 0.13), cache, acc, 0.05, null).type).toBe("libre");
    const a = accrocher(pt(1.7, 0.13), cache, { ...acc, proche: true }, 0.05, null);
    expect(a.type).toBe("proche");
    expect(a.point.x).toBeCloseTo(1.7);
    expect(a.point.y).toBeCloseTo(0.1);
  });

  it("une extrémité proche reste prioritaire", () => {
    expect(accrocher(pt(4.02, 0.02), cache, { ...acc, proche: true }, 0.2, null).type).toBe("extremite");
  });
});

describe("outil arc tangent (D-062)", () => {
  it("extrémité de ligne cliquée puis fin : arc tangent émis", () => {
    const etat = appliquer(socle(), [{ type: "esquisse.ligne", params: { id: "l", niveauId: "rdc", points: [pt(0, 0), pt(4, 0)] } }]);
    const r1 = clic("arc-tangent", pt(4.05, 0.02), etat, ui(), { ...opts, objetSous: "l" });
    expect(r1.pointsEnCours).toEqual([pt(4, 0)]);
    const r2 = clic("arc-tangent", pt(6, 2), etat, ui({ pointsEnCours: r1.pointsEnCours }), opts);
    expect(r2.commandes[0]).toMatchObject({ type: "esquisse.arc", params: { centre: { x: 4, y: 2 }, rayon: { value: 2 } } });
    expect(clic("arc-tangent", pt(9, 0), etat, ui({ pointsEnCours: r1.pointsEnCours }), opts).commandes).toHaveLength(0);
  });
});

describe("décaler avec angles arrondis (D-064)", () => {
  it("Alt au clic du côté : angles « arrondis » transmis", () => {
    const etat = appliquer(socle(), [{ type: "esquisse.polygone", params: { id: "pg", niveauId: "rdc", points: [pt(0, 0), pt(4, 0), pt(4, 3), pt(0, 3)] } }]);
    const u = ui({ selection: ["pg"], parametresOutil: { ...etatUi.get().parametresOutil, distanceDecalage: 0.5, distancesDecalage: "" } });
    const r = clic("decaler", pt(8, 8), etat, u, { ...opts, alt: true });
    expect(r.commandes[0]).toMatchObject({ type: "transformer.decaler", params: { cote: "exterieur", angles: "arrondis" } });
    const apres = appliquer(etat, r.commandes);
    expect(Object.values(apres.objets).some((o) => o.classe === "esquisse" && o.params.forme === "polyligne" && !!o.params.renflements)).toBe(true);
  });
});

describe("filtres d'affichage locaux (D-066)", () => {
  it("classe ou calque masqués localement : objet non affiché", async () => {
    const { visibleSelonFiltres } = await import("./etat-ui");
    const f = { classesMasquees: ["cotation"], calquesMasques: ["mob"] };
    expect(visibleSelonFiltres({ classe: "mur", calqueId: null }, f)).toBe(true);
    expect(visibleSelonFiltres({ classe: "cotation", calqueId: null }, f)).toBe(false);
    expect(visibleSelonFiltres({ classe: "esquisse", calqueId: "mob" }, f)).toBe(false);
  });
});

describe("extrusion d'un profil ouvert (D-067)", () => {
  it("ligne ouverte + épaisseur : solide de contour décalé de part et d'autre ; sans épaisseur : message", () => {
    const etat = appliquer(socle(), [{ type: "esquisse.polyligne", params: { id: "p", niveauId: "rdc", points: [pt(0, 0), pt(4, 0), pt(4, 3)] } }]);
    expect((actionImmediate("extruder", etat, ui({ selection: ["p"], parametresOutil: { hauteurSolide: 1 } })) as { message: string }).message).toMatch(/épaisseur/);
    const r = actionImmediate("extruder", etat, ui({ selection: ["p"], parametresOutil: { hauteurSolide: 1, epaisseurProfil: 0.2 } })) as { commandes: Commande[] };
    const contour = (r.commandes[0]!.params as { contour: { x: number; y: number }[] }).contour;
    expect(contour).toHaveLength(6);
    expect(contour[0]).toMatchObject({ x: 0, y: 0.1 });
    expect(contour[1]!.x).toBeCloseTo(3.9, 9);
    expect(appliquer(etat, r.commandes).objets).toBeDefined();
  });
});

describe("main levée (D-067)", () => {
  it("tracé simplifié à la tolérance, fermé s'il revient au départ ; Alt : courbe ; trop court : message", async () => {
    const { traceMainLevee } = await import("./plan2d/Plan2D");
    const u = ui({ parametresOutil: { ...etatUi.get().parametresOutil, toleranceMainLevee: 0.05 } });
    const droite = Array.from({ length: 50 }, (_, i) => pt(i * 0.1, Math.sin(i) * 0.01));
    const r = traceMainLevee(droite, u, false) as { commandes: Commande[] };
    expect(r.commandes[0]).toMatchObject({ type: "esquisse.polyligne", params: { ferme: false } });
    expect((r.commandes[0]!.params as { points: unknown[] }).points).toHaveLength(2);
    const boucle = Array.from({ length: 41 }, (_, i) => pt(Math.cos((i / 40) * 2 * Math.PI) * 2, Math.sin((i / 40) * 2 * Math.PI) * 2));
    const c = traceMainLevee(boucle, u, true) as { commandes: Commande[] };
    expect(c.commandes[0]).toMatchObject({ type: "esquisse.spline", params: { ferme: true } });
    expect("message" in traceMainLevee([pt(0, 0)], u, false)).toBe(true);
  });
});

describe("joindre deux murs (D-068)", () => {
  it("deux murs perpendiculaires non jointifs : chacun prolongé jusqu'à l'axe de l'autre", () => {
    const etat = murs(socle(), [[0, 0, 3, 0], [4, 1, 4, 5]]);
    const [a, b] = Object.keys(etat.objets);
    const r = actionImmediate("joindre", etat, ui({ selection: [a!, b!] })) as { commandes: Commande[]; label: string };
    expect(r.label).toMatch(/murs/);
    const e = appliquer(etat, r.commandes);
    const A = e.objets[a!] as Occurrence<"mur">;
    const B = e.objets[b!] as Occurrence<"mur">;
    expect(distance(A.params.b, pt(4, 0))).toBeLessThan(1e-6);
    expect(distance(B.params.a, pt(4, 0))).toBeLessThan(1e-6);
  });
});

describe("outil Plancher (D-069)", () => {
  it("rive et épaisseur exigées ; clic dans le contour proposé : dalle d'usage plancher sur la face extérieure", () => {
    const etat = carre(socle());
    const ici = pt(2, 2);
    expect(clic("plancher", ici, etat, ui({ outil: "plancher" }), opts).aide).toMatch(/ligne de rive/);
    expect(clic("plancher", ici, etat, ui({ outil: "plancher", parametresOutil: { rivePlancher: "exterieur" } }), opts).aide).toMatch(/épaisseur/);
    const r = clic("plancher", ici, etat, ui({ outil: "plancher", parametresOutil: { rivePlancher: "exterieur", epaisseurPlancher: 0.25 } }), opts);
    expect(r.commandes).toHaveLength(1);
    const p = r.commandes[0]!.params as { contour: { x: number; y: number }[]; usage: string };
    expect(p.usage).toBe("plancher");
    expect(Math.min(...p.contour.map((q) => q.x))).toBeCloseTo(-0.1, 9);
    expect(clic("plancher", pt(9, 9), etat, ui({ outil: "plancher", parametresOutil: { rivePlancher: "axe", epaisseurPlancher: 0.25 } }), opts).commandes).toHaveLength(0);
  });
});
