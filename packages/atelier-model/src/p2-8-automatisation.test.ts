import { describe, expect, it } from "vitest";
import { appliquerLot, CONTRAT_COMMANDES } from "./commandes/index.js";
import type { Commande } from "./commandes/base.js";
import { modeleVide, type ModeleAtelier } from "./modele.js";
import { ancetres, compilerGraphe, controlerReglesGraphe, developperGraphe, GRAPHES_INTEGRES, ordonner, proposerGraphe, validerGraphe, variablesLues, type GrapheGeneration } from "./automatisation/graphes.js";
import { controlesClasses, valeursObjet } from "./automatisation/regles-classes.js";
import { graphesDuProjet, grapheDe } from "./commandes/graphes.js";
import { verifierModele } from "./archive.js";
import { m, pt } from "./unites.js";

let n = 0;
const lot = (etat: ModeleAtelier, commands: Commande[], label = "lot") => appliquerLot(etat, { requestId: `req-p28-${++n}`, baseRevision: 0, contract: CONTRAT_COMMANDES, label, commands });
const base = () => lot(modeleVide(), [{ type: "niveau.creer", params: { id: "n1", nom: "RDC", elevation: 0, hauteur: 3 } }]).etat;
const integre = (id: string) => GRAPHES_INTEGRES.find((g) => g.id === id)!;

const grapheTest = (): GrapheGeneration => ({
  id: "test",
  nom: "Test",
  version: 1,
  description: "",
  noeuds: [
    { id: "n", type: "parametre", nom: "nb", libelle: "Nombre", typeParametre: "entier", defaut: 2, x: 0, y: 0 },
    { id: "pas", type: "parametre", nom: "pas", libelle: "Pas", typeParametre: "longueur", defaut: 3, x: 0, y: 1 },
    { id: "double", type: "calcul", nom: "double", expression: "pas * 2", x: 1, y: 1 },
    { id: "r", type: "regle", expression: "nb <= 10", message: "dix au plus", x: 1, y: 0 },
    { id: "i", type: "serie", variable: "i", de: 0, a: "nb - 1", x: 2, y: 0 },
    { id: "c", type: "commande", commande: { type: "texte.creer", params: { niveauId: "n1", position: pt("=i * double" as unknown as number, 0), texte: "T{i}" } }, x: 3, y: 0 },
  ],
  liens: [{ de: "pas", a: "double" }, { de: "n", a: "r" }, { de: "n", a: "i" }, { de: "i", a: "c" }, { de: "double", a: "c" }],
});

describe("graphes de génération contrôlée (P2-8, DA-19-03 / 04)", () => {
  it("validation : forme, câblage (une variable lue vient d'un ancêtre), cycle refusé, séries bornées, au moins une commande", () => {
    const g = validerGraphe(grapheTest());
    expect(g.noeuds).toHaveLength(6);
    expect(ordonner(g).map((x) => x.id)).toEqual(["n", "pas", "double", "r", "i", "c"]);
    expect([...ancetres(g).get("c")!].sort()).toEqual(["double", "i", "n", "pas"]);
    expect(variablesLues(grapheTest().noeuds[5]!.type === "commande" ? (grapheTest().noeuds[5] as { commande: Commande }).commande.params : {})).toEqual(["i", "double"]);
    // Variable lue sans lien : refus nommé.
    const sansLien = grapheTest();
    sansLien.liens = sansLien.liens.filter((l) => !(l.de === "double" && l.a === "c"));
    expect(() => validerGraphe(sansLien)).toThrow(/« double » \(nœud double\) non reliée au nœud c/);
    // Cycle.
    const cycle = grapheTest();
    cycle.liens.push({ de: "c", a: "n" });
    expect(() => validerGraphe(cycle)).toThrow(/cycle/);
    // Une règle ne porte pas sur une variable de série.
    const regleSerie = grapheTest();
    regleSerie.noeuds.push({ id: "r2", type: "regle", expression: "i < 5", message: "x", x: 0, y: 0 });
    regleSerie.liens.push({ de: "i", a: "r2" });
    expect(() => validerGraphe(regleSerie)).toThrow(/variable de série/);
    expect(() => validerGraphe({ ...grapheTest(), noeuds: grapheTest().noeuds.filter((x) => x.type === "parametre"), liens: [] })).toThrow(/au moins un nœud de commande/);
    expect(() => validerGraphe({ ...grapheTest(), noeuds: [...grapheTest().noeuds, { id: "x", type: "commande", commande: { type: "interne.restaurer", params: {} }, x: 0, y: 0 }] })).toThrow(/réservée au serveur/);
    for (const g of GRAPHES_INTEGRES) expect(validerGraphe(g).id).toBe(g.id);
  });

  it("compilation : paramètres, séries et commandes en ordre topologique, calculs inlinés ; développement par le script du lot 8", () => {
    const s = compilerGraphe(validerGraphe(grapheTest()));
    expect(s.parametres.map((p) => p.nom)).toEqual(["nb", "pas"]);
    expect(s.pour).toEqual([{ variable: "i", de: 0, a: "nb - 1" }]);
    expect(s.commandes).toHaveLength(1);
    expect((s.commandes[0]!.params as { position: { x: string } }).position.x).toBe("=i * (pas * 2)");
    const prop = proposerGraphe(validerGraphe(grapheTest()), base(), { nb: 3, pas: 2 }, "n1");
    expect(prop.statut).toBe("proposee");
    expect(prop.commandes).toHaveLength(3);
    expect((prop.commandes[2]!.params as { position: { x: number } }).position.x).toBe(8);
    expect(prop.hypotheses.some((h) => h.texte === "double = 4")).toBe(true);
    expect(prop.effets?.crees).toHaveLength(3);
    expect(prop.iterations).toEqual([{ numero: 1, commandes: 3, resultat: "valide", erreur: null }]);
  });

  it("branches indépendantes : chaque commande n'est répétée que par ses propres séries ancêtres (2 A puis 3 B, pas 6 × 2)", () => {
    const g = validerGraphe({
      id: "branches", nom: "Branches", noeuds: [
        { id: "i", type: "serie", variable: "i", de: 1, a: 2, x: 0, y: 0 },
        { id: "j", type: "serie", variable: "j", de: 1, a: 3, x: 0, y: 1 },
        { id: "a", type: "commande", commande: { type: "texte.creer", params: { niveauId: "n1", position: pt("=i" as unknown as number, 0), texte: "A{i}" } }, x: 1, y: 0 },
        { id: "b", type: "commande", commande: { type: "texte.creer", params: { niveauId: "n1", position: pt("=j" as unknown as number, 5), texte: "B{j}" } }, x: 1, y: 1 },
        { id: "c", type: "commande", commande: { type: "texte.creer", params: { niveauId: "n1", position: pt(0, 9), texte: "C" } }, x: 1, y: 2 },
      ],
      liens: [{ de: "i", a: "a" }, { de: "j", a: "b" }],
    });
    const cmds = developperGraphe(g, base(), {});
    expect(cmds.map((c) => (c.params as { texte: string }).texte)).toEqual(["C", "A1", "A2", "B1", "B2", "B3"]); // ordre topologique : C (sans parent) d'abord
    expect(proposerGraphe(g, base(), {}, "n1").commandes).toHaveLength(6);
    // Séries imbriquées (j relié à i) : produit cartésien pour la commande qui lit les deux.
    const imbrique = validerGraphe({ ...g, id: "imbrique", liens: [{ de: "i", a: "j" }, { de: "j", a: "b" }, { de: "i", a: "a" }] });
    expect(developperGraphe(imbrique, base(), {}).map((c) => (c.params as { texte: string }).texte)).toEqual(["C", "A1", "A2", "B1", "B2", "B3", "B1", "B2", "B3"]);
  });

  it("règles du graphe : non tenue → proposition échouée nommée, aucune commande, aucune correction silencieuse", () => {
    const g = validerGraphe(grapheTest());
    expect(controlerReglesGraphe(g, base(), { nb: 11 })).toEqual(["dix au plus (nb <= 10 : 11 contre 10)"]);
    const prop = proposerGraphe(g, base(), { nb: 11 }, "n1");
    expect(prop.statut).toBe("echouee");
    expect(prop.commandes).toEqual([]);
    expect(prop.explication).toMatch(/dix au plus/);
    // Paramètre requis absent : refus nommé.
    const sansDefaut = grapheTest();
    delete (sansDefaut.noeuds[0] as { defaut?: number }).defaut;
    expect(proposerGraphe(validerGraphe(sansDefaut), base(), {}, "n1").explication).toMatch(/« Nombre » requis/);
    // Refus du modèle (niveau inconnu dans le gabarit) : nommé, pas contourné.
    const mauvaisNiveau = grapheTest();
    ((mauvaisNiveau.noeuds[5] as { commande: Commande }).commande.params as { niveauId: string }).niveauId = "inconnu";
    const refus = proposerGraphe(validerGraphe(mauvaisNiveau), base(), { nb: 1 }, "n1");
    expect(refus.statut).toBe("echouee");
    expect(refus.iterations[0]!.resultat).toBe("refuse");
    expect(refus.commandes).toHaveLength(1);
  });

  it("graphe intégré « trame de poteaux contrôlée » : 3 × 2 poteaux après accord ; section ≥ pas refusée par la règle ; aucune hauteur supposée", () => {
    const g = integre("trame-poteaux-controlee");
    const e = base();
    const prop = proposerGraphe(g, e, { niveauId: "n1", nx: 3, ny: 2, px: 4, py: 5, hauteur: 2.7 }, "n1");
    expect(prop.statut).toBe("proposee");
    expect(prop.commandes).toHaveLength(6);
    expect(prop.explication).toMatch(/6 commande\(s\), 3 règle\(s\) tenue\(s\)/);
    expect(prop.hypotheses.map((h) => h.texte)).toContain("emprise = 40");
    // L'accord est l'affaire du serveur : ici, la séquence passe par les mêmes réducteurs.
    const apres = lot(e, prop.commandes).etat;
    const poteaux = Object.values(apres.objets).filter((o) => o.classe === "poteau");
    expect(poteaux).toHaveLength(6);
    expect(poteaux.every((o) => (o.params as { hauteur: { value: number } }).hauteur.value === 2.7)).toBe(true);
    expect(proposerGraphe(g, e, { niveauId: "n1", nx: 3, ny: 2, px: 0.3, py: 5, section: 0.3, hauteur: 2.7 }, "n1").explication).toMatch(/section d'un poteau doit rester inférieure au pas en x/);
    expect(proposerGraphe(g, e, { niveauId: "n1", nx: 25, ny: 25, hauteur: 2.7 }, "n1").explication).toMatch(/400 poteaux au plus/);
    expect(proposerGraphe(g, e, { niveauId: "n1" }, "n1").explication).toMatch(/« Hauteur \(m\) » requis/);
  });

  it("graphe intégré « ossature de mur » : ossature créée puis générée (ontologie bois) ; refusé sans l'ontologie", () => {
    const g = integre("ossature-de-mur");
    const e0 = lot(base(), [{ type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(0, 0), b: pt(4.8, 0), epaisseur: m(0.2), hauteur: m(2.6) } }]).etat;
    const sans = proposerGraphe(g, e0, { murId: "w", ossatureId: "oss-w", entraxe: 0.6, largeur: 0.045, epaisseur: 0.145 }, "n1");
    expect(sans.statut).toBe("echouee");
    expect(sans.iterations[0]!.erreur).toMatch(/non activée/);
    const e = lot(e0, [{ type: "ontologie.activer", params: { nom: "timber" } }]).etat;
    const prop = proposerGraphe(g, e, { murId: "w", ossatureId: "oss-w", entraxe: 0.6, largeur: 0.045, epaisseur: 0.145 }, "n1");
    expect(prop.statut, prop.explication).toBe("proposee");
    expect(prop.commandes.map((c) => c.type)).toEqual(["ossature.creer", "ossature.generer"]);
    expect(prop.effets!.crees.length).toBeGreaterThan(5);
    const apres = lot(e, prop.commandes).etat;
    expect(Object.values(apres.objets).filter((o) => o.classe === "element-bois").length).toBeGreaterThan(5);
    expect(proposerGraphe(g, e, { murId: "w", ossatureId: "o2", entraxe: 0.04, largeur: 0.045, epaisseur: 0.145 }, "n1").explication).toMatch(/largeur d'un montant/);
  });

  it("graphes du projet : définitions `graphe` versionnées avec le modèle (définir, redéfinir, supprimer), identifiant intégré réservé, archive", () => {
    const g = grapheTest();
    const e1 = lot(base(), [{ type: "graphe.definir", params: { id: g.id, nom: g.nom, description: "d", noeuds: g.noeuds, liens: g.liens } }]).etat;
    expect(graphesDuProjet(e1).map((x) => [x.id, x.version])).toEqual([["test", 1]]);
    expect(grapheDe(e1, "test")!.noeuds).toHaveLength(6);
    expect(grapheDe(e1, "trame-poteaux-controlee")!.nom).toBe("Trame de poteaux contrôlée");
    const e2 = lot(e1, [{ type: "graphe.definir", params: { id: g.id, nom: "Test 2", noeuds: g.noeuds, liens: g.liens } }]).etat;
    expect(grapheDe(e2, "test")!.version).toBe(2);
    expect(grapheDe(e2, "test")!.nom).toBe("Test 2");
    expect(() => lot(e2, [{ type: "graphe.definir", params: { ...integre("trame-poteaux-controlee") } }])).toThrow(/réservé à un graphe intégré/);
    expect(() => lot(e2, [{ type: "graphe.definir", params: { id: "vide", nom: "X", noeuds: [], liens: [] } }])).toThrow(/1 à 60 nœuds/);
    const archive = verifierModele(JSON.parse(JSON.stringify(e2)));
    expect(archive.ok, archive.ok ? "" : archive.erreurs.join(" ; ")).toBe(true);
    expect(archive.ok && grapheDe(archive.modele, "test")!.version).toBe(2);
    // Archive avec un graphe mal formé (sans nœuds) ou cyclique : refusée nommément (relecture Codex #101).
    const brut = JSON.parse(JSON.stringify(e2)) as { definitions: Record<string, { params: Record<string, unknown> }> };
    brut.definitions["test"]!.params = {};
    const refus = verifierModele(brut);
    expect(refus.ok).toBe(false);
    expect(!refus.ok && refus.erreurs.join(" ; ")).toMatch(/definitions.test : graphe invalide \(noeuds : 1 à 60 nœuds\)/);
    const cyclique = JSON.parse(JSON.stringify(e2)) as { definitions: Record<string, { params: { liens: { de: string; a: string }[] } }> };
    cyclique.definitions["test"]!.params.liens.push({ de: "c", a: "n" });
    expect(!verifierModele(cyclique).ok).toBe(true);
    const e3 = lot(e2, [{ type: "graphe.supprimer", params: { id: "test" } }]).etat;
    expect(graphesDuProjet(e3)).toEqual([]);
    expect(proposerGraphe(grapheDe(e2, "test")!, e2, { nb: 2 }, "n1").commandes).toHaveLength(2);
  });
});

describe("règles par ontologie (P2-8, DA-19-05)", () => {
  it("valeurs lisibles d'un objet : nombres, grandeurs, un niveau d'imbrication, niveau porteur", () => {
    const e = lot(base(), [{ type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(2.6) } }]).etat;
    const v = valeursObjet(e, e.objets["w"]!);
    expect(v["epaisseur"]).toBe(0.2);
    expect(v["hauteur"]).toBe(2.6);
    expect(v["a_x"]).toBe(0);
    expect(v["b_x"]).toBe(4);
    expect(v["niveau_elevation"]).toBe(0);
    expect(v["niveau_hauteur"]).toBe(3);
  });

  it("une règle de classe est rejugée après chaque commande : problème « regle » par objet non tenu, levé quand l'objet change ; jamais corrigé", () => {
    const e0 = lot(base(), [
      { type: "mur.tracer", params: { id: "w1", niveauId: "n1", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(2.6) } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n1", a: pt(0, 2), b: pt(4, 2), epaisseur: m(0.4), hauteur: m(2.6) } },
    ]).etat;
    const r = lot(e0, [{ type: "regle.definir", params: { id: "r-ep", nom: "Épaisseur minimale (source : programme du projet, déclaré)", classe: "mur", expression: "epaisseur >= 0.3", message: "mur plus mince que l'épaisseur minimale du programme" } }]);
    const pbs = Object.values(r.etat.problemes).filter((p) => p.type === "regle");
    expect(pbs).toHaveLength(1);
    expect(pbs[0]!.objetId).toBe("w1");
    expect(pbs[0]!.id).toBe("pb-regle-r-ep-w1");
    expect(pbs[0]!.message).toMatch(/mur plus mince .* \(epaisseur >= 0.3 : 0.2 contre 0.3\)/);
    expect(r.effets.problemes).toHaveLength(1);
    expect((r.etat.objets["w1"]!.params as { epaisseur: { value: number } }).epaisseur.value).toBe(0.2); // rien n'est corrigé
    const c = controlesClasses(r.etat);
    expect(c).toHaveLength(1);
    expect(c[0]!.objets).toBe(2);
    expect(c[0]!.nonTenus.map((x) => x.objetId)).toEqual(["w1"]);
    // Épaissir w1 : le problème disparaît ; amincir w2 : il apparaît ; un mur créé ensuite est jugé aussi.
    const e2 = lot(r.etat, [{ type: "mur.modifier", params: { id: "w1", params: { epaisseur: m(0.3) } } }, { type: "mur.modifier", params: { id: "w2", params: { epaisseur: m(0.25) } } }]).etat;
    expect(Object.values(e2.problemes).filter((p) => p.type === "regle").map((p) => p.objetId)).toEqual(["w2"]);
    const e3 = lot(e2, [{ type: "mur.tracer", params: { id: "w3", niveauId: "n1", a: pt(0, 4), b: pt(4, 4), epaisseur: m(0.1), hauteur: m(2.6) } }]).etat;
    expect(Object.values(e3.problemes).filter((p) => p.type === "regle").map((p) => p.objetId).sort()).toEqual(["w2", "w3"]);
    // Supprimer la règle : plus aucun problème.
    const e4 = lot(e3, [{ type: "definition.supprimer", params: { id: "r-ep" } }]).etat;
    expect(Object.values(e4.problemes).filter((p) => p.type === "regle")).toEqual([]);
  });

  it("variable absente : objets « non évalués » dits une fois, sans valeur inventée ; classe d'une ontologie inactive refusée ; famille et classe exclusives", () => {
    const e0 = lot(base(), [{ type: "mur.tracer", params: { id: "w", niveauId: "n1", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2) } }]).etat; // sans hauteur
    const e = lot(e0, [{ type: "regle.definir", params: { id: "r-h", nom: "Hauteur", classe: "mur", expression: "hauteur <= 3", message: "trop haut" } }]).etat;
    const pbs = Object.values(e.problemes).filter((p) => p.type === "regle");
    expect(pbs).toHaveLength(1);
    expect(pbs[0]!.objetId).toBeNull();
    expect(pbs[0]!.message).toMatch(/1 objet\(s\) « mur » non évalué\(s\) — variable absente : hauteur/);
    expect(() => lot(e0, [{ type: "regle.definir", params: { nom: "x", classe: "poutre", expression: "za <= 3", message: "m" } }])).toThrow(/non activée/);
    expect(() => lot(e0, [{ type: "regle.definir", params: { nom: "x", classe: "inconnue", expression: "a <= 3", message: "m" } }])).toThrow(/classe inconnue/);
    const avecFamille = lot(e0, [{ type: "famille.definir", params: { id: "f", nom: "F", parametres: { a: { expression: "1", unite: null } } } }]).etat;
    expect(() => lot(avecFamille, [{ type: "regle.definir", params: { nom: "x", classe: "mur", familleId: "f", expression: "a <= 3", message: "m" } }])).toThrow(/pas les deux/);
    // Règle d'ontologie activée : poutres (structure).
    const s = lot(lot(e0, [{ type: "ontologie.activer", params: { nom: "structure" } }]).etat, [
      { type: "poutre.creer", params: { id: "b", niveauId: "n1", a: pt(0, 0), b: pt(6, 0), za: 2.8, section: { forme: "I", largeur: m(0.1), hauteur: m(0.2), epaisseur: m(0.006), epaisseurAile: m(0.009) }, materiau: "acier" } },
      { type: "regle.definir", params: { id: "r-b", nom: "Hauteur de section (source : déclarée par le projet)", classe: "poutre", expression: "section_hauteur >= 0.3", message: "section trop basse" } },
    ]).etat;
    expect(Object.values(s.problemes).filter((p) => p.type === "regle").map((p) => [p.objetId, p.message])).toEqual([["b", "Hauteur de section (source : déclarée par le projet) : section trop basse (section_hauteur >= 0.3 : 0.2 contre 0.3)"]]);
  });
});
