import { describe, expect, it } from "vitest";
import type { ObjetModele } from "../ontologie/classes.js";
import { nonEvaluee } from "../ontologie/provenance.js";
import { pointCadastral } from "../ontologie/reperes.js";
import { allerRetour, cmd, deg, m, ok, P, projetDeBase, refus } from "./__tests__/aides.js";
import { detecterPieces } from "./detection.js";

const base = projetDeBase();
const objet = (e: { objets: Readonly<Record<string, ObjetModele>> }, id: string) => {
  const o = e.objets[id];
  if (!o) throw new Error(`objet ${id} absent`);
  return o;
};

describe("niveaux", () => {
  it("créer, modifier, supprimer avec destination : inverse exact", () => {
    const r = allerRetour(base, cmd("niveau.creer", { id: "r2", nom: "R+2", elevation: m(6), hauteur: m(2.8), ordre: 2 }));
    expect(objet(r.etat, "r2")).toMatchObject({ provenance: "saisie", statut: "declaree", classe: "niveau" });
    allerRetour(base, cmd("niveau.modifier", { modifications: { elevation: m(3.05), nom: "R+1" } }, ["r1"]));
    const e2 = ok(base, cmd("mur.tracer", { id: "M9", niveauId: "r1", calqueId: "C1", a: P(0, 0), b: P(3, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: false })).etat;
    const s = allerRetour(e2, cmd("niveau.supprimer", { niveauDestinationId: "rdc" }, ["r1"]));
    expect(objet(s.etat, "M9").niveauId).toBe("rdc");
    expect(s.etat.supprimes).toContain("r1");
  });

  it("refus motivés : objets sans destination, ordre en double", () => {
    const e = refus(base, cmd("niveau.supprimer", {}, ["rdc"]));
    expect(e[0]).toMatchObject({ code: "precondition", chemin: "commands[0].params.niveauDestinationId" });
    expect(e[0]?.message).toMatch(/M1/);
    expect(e[0]?.message).toMatch(/Action :/);
    expect(refus(base, cmd("niveau.creer", { id: "x", nom: "X", elevation: m(9), hauteur: m(3), ordre: 1 }))[0]?.code).toBe("precondition");
  });
});

describe("murs", () => {
  it("tracer : provenance saisie, aucun paramètre ajouté (R3)", () => {
    const r = allerRetour(base, cmd("mur.tracer", { id: "M2", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(0, 4), epaisseur: m(0.2), niveauHaut: "r1", alignement: "gauche", typeId: "non-type", exterieur: false }));
    const o = objet(r.etat, "M2");
    expect(o).toMatchObject({ provenance: "saisie", statut: "declaree", niveauId: "rdc", calqueId: "C1" });
    expect("hauteur" in o.params).toBe(false);
  });

  it("modifier l'axe : la porte garde sa distance (t recalculé)", () => {
    const r = allerRetour(base, cmd("mur.modifier", { modifications: { axe: { a: P(0, 0), b: P(3, 0) }, epaisseur: m(0.3) } }, ["M1"]));
    const p = objet(r.etat, "P1");
    expect(p.classe === "porte" && p.params.position.t).toBeCloseTo(0.5, 12);
  });

  it("scinder : deux murs, la porte suit, l'ancien mur est supprimé", () => {
    const r = allerRetour(base, cmd("mur.scinder", { point: P(4, 0), nouveauxIds: ["M1a", "M1b"] }, ["M1"]));
    const p = objet(r.etat, "P1");
    expect(p.classe === "porte" && p.params.murHoteId).toBe("M1a");
    expect(p.classe === "porte" && p.params.position.t).toBeCloseTo(0.375, 12);
    expect(r.etat.objets.M1).toBeUndefined();
    expect(r.effets.objetsCrees).toEqual(expect.arrayContaining(["M1a", "M1b"]));
    expect(r.etat.relations).toContainEqual({ type: "heberge-par", sourceId: "P1", cibleId: "M1a", derivee: true });
  });

  it("scinder refusé si une baie est à cheval", () => {
    const e = refus(base, cmd("mur.scinder", { point: P(1.5, 0), nouveauxIds: ["A", "B"] }, ["M1"]));
    expect(e[0]?.message).toMatch(/à cheval/);
  });

  it("joindre deux murs colinéaires contigus", () => {
    const e1 = ok(base, cmd("mur.scinder", { point: P(4, 0), nouveauxIds: ["M1a", "M1b"] }, ["M1"])).etat;
    const r = allerRetour(e1, cmd("mur.joindre", { nouvelId: "M1c" }, ["M1a", "M1b"]));
    const mur = objet(r.etat, "M1c");
    expect(mur.classe === "mur" && mur.params.axe).toEqual({ a: P(0, 0), b: P(6, 0) });
    const p = objet(r.etat, "P1");
    expect(p.classe === "porte" && p.params.murHoteId).toBe("M1c");
  });

  it("supprimer : les baies hébergées partent avec le mur", () => {
    const r = allerRetour(base, cmd("mur.supprimer", {}, ["M1"]));
    expect(r.effets.objetsSupprimes).toEqual(expect.arrayContaining(["M1", "P1"]));
  });

  it("refus : unité, repère, longueur, niveau, type, identifiant réutilisé", () => {
    const tracer = (extra: Record<string, unknown>) =>
      cmd("mur.tracer", { id: "Mx", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(2, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: false, ...extra } as never);
    expect(refus(base, tracer({ epaisseur: { value: 20, unit: "cm" } })).some((e) => e.code === "unite-invalide" && e.chemin === "commands[0].params.epaisseur")).toBe(true);
    expect(refus(base, tracer({ b: pointCadastral(2, 0, "EPSG:26191") })).some((e) => e.code === "repere-melange")).toBe(true);
    expect(refus(base, tracer({ b: P(0.0005, 0) }))[0]?.message).toMatch(/longueur/);
    expect(refus(base, tracer({ niveauId: "inconnu" }))[0]).toMatchObject({ code: "precondition", chemin: "commands[0].params.niveauId" });
    expect(refus(base, tracer({ typeId: "inconnu" }))[0]?.message).toMatch(/catalogue/);
    expect(refus(base, tracer({ hauteur: undefined }))[0]?.message).toMatch(/hauteur \/ niveauHaut/);
    const sansM1 = ok(base, cmd("mur.supprimer", {}, ["M1"])).etat;
    expect(refus(sansM1, tracer({ id: "M1" }))[0]?.message).toMatch(/supprimé/);
  });

  it("modifier un mur au point de mettre la porte hors emprise est refusé avec la porte citée", () => {
    const e = refus(base, cmd("mur.modifier", { modifications: { axe: { a: P(0, 0), b: P(1, 0) } } }, ["M1"]));
    expect(e.some((x) => x.code === "hors-emprise" && x.objetIds?.includes("P1"))).toBe(true);
    expect(refus(base, cmd("mur.modifier", { modifications: { hauteur: m(2) } }, ["M1"]))[0]?.code).toBe("hors-emprise");
  });
});

describe("ouvertures", () => {
  const fenetre = cmd("ouverture.poser", { id: "F1", niveauId: "rdc", calqueId: "C1", classe: "fenetre", murHoteId: "M1", position: { t: 0.7, distance: m(4.2) }, largeur: m(1.2), hauteur: m(1.2), allege: m(0.9), typeId: "non-type" });

  it("poser, modifier, déplacer, supprimer : inverse exact ; relations dérivées", () => {
    const r = allerRetour(base, fenetre);
    expect(r.etat.relations).toContainEqual({ type: "heberge", sourceId: "M1", cibleId: "F1", derivee: true });
    const e = r.etat;
    allerRetour(e, cmd("ouverture.modifier", { modifications: { largeur: m(1), repere: "F02" } }, ["F1"]));
    const d = allerRetour(e, cmd("ouverture.deplacer", { distance: m(3) }, ["F1"]));
    const f = objet(d.etat, "F1");
    expect(f.classe === "fenetre" && f.params.position).toEqual({ t: 0.5, distance: m(3) });
    allerRetour(e, cmd("ouverture.supprimer", {}, ["F1"]));
  });

  it("contrôle d'emprise : hors mur, recouvrement, hauteur, distance incohérente", () => {
    const poser = (extra: Record<string, unknown>) => cmd("ouverture.poser", { ...(fenetre.params as object), ...extra } as never);
    expect(refus(base, poser({ position: { t: 0.99 } }))[0]?.code).toBe("hors-emprise");
    expect(refus(base, poser({ position: { t: 0.3 } }))[0]?.message).toMatch(/recouvre/);
    expect(refus(base, poser({ hauteur: m(2.5) }))[0]?.message).toMatch(/allège \+ hauteur/);
    expect(refus(base, poser({ position: { t: 0.7, distance: m(4) } }))[0]?.message).toMatch(/incohérente/);
    expect(refus(base, poser({ murHoteId: "D1" }))[0]?.code).toBe("precondition");
    expect(refus(base, poser({ classe: "lucarne" }))[0]?.code).toBe("classe-inconnue");
  });
});

describe("dalles, toitures, escaliers", () => {
  it("dalle : modifier le contour, trous, supprimer", () => {
    allerRetour(base, cmd("dalle.modifier", { modifications: { trous: [{ polygone: [P(1, 1), P(2, 1), P(2, 2)] }] } }, ["D1"]));
    allerRetour(base, cmd("dalle.supprimer", {}, ["D1"]));
    expect(refus(base, cmd("dalle.modifier", { modifications: { contour: [P(0, 0), P(4, 3), P(4, 0), P(0, 4)] } }, ["D1"]))[0]?.message).toMatch(/auto-sécant/);
    expect(refus(base, cmd("dalle.modifier", { modifications: { trous: [{ polygone: [P(5, 1), P(8, 1), P(8, 2)] }] } }, ["D1"]))[0]?.message).toMatch(/sort du contour/);
  });

  it("toiture : pente non évaluée signalée, jamais devinée", () => {
    const r = allerRetour(base, cmd("toiture.creer", { id: "T1", niveauId: "r1", calqueId: "C1", contour: [P(0, 0), P(6, 0), P(6, 4)], trous: [], type: "plate", epaisseur: m(0.3), pente: nonEvaluee("non fournie"), decalageBase: m(0) }));
    expect(r.effets.problemes.some((p) => p.code === "valeur-non-evaluee")).toBe(true);
    allerRetour(r.etat, cmd("toiture.modifier", { modifications: { pente: deg(5) } }, ["T1"]));
  });

  it("escalier : relation relie, contradiction affichée, niveaux inversés refusés", () => {
    const escalier = { id: "E1", niveauId: "rdc", calqueId: "C1", axe: { a: P(1, 1), b: P(4, 1) }, largeur: m(1), hauteurAFranchir: m(2.9), marches: 17, contremarches: 18, epaisseurPaillasse: nonEvaluee("non fournie"), decalageBase: m(0), niveauDepartId: "rdc", niveauArriveeId: "r1", referencePlanSeulement: false };
    const r = allerRetour(base, cmd("escalier.creer", escalier));
    expect(r.etat.relations).toContainEqual({ type: "relie", sourceId: "E1", cibleId: "r1", role: "arrivee", derivee: true });
    expect(r.effets.problemes.map((p) => p.code)).toEqual(expect.arrayContaining(["valeur-a-verifier", "valeur-non-evaluee"]));
    allerRetour(r.etat, cmd("escalier.modifier", { modifications: { largeur: m(1.2) } }, ["E1"]));
    allerRetour(r.etat, cmd("escalier.supprimer", {}, ["E1"]));
    expect(refus(base, cmd("escalier.creer", { ...escalier, niveauDepartId: "r1", niveauArriveeId: "rdc" }))[0]?.message).toMatch(/pas au-dessus/);
    expect(refus(base, cmd("escalier.creer", { ...escalier, contremarches: 0 }))[0]?.chemin).toBe("commands[0].params.contremarches");
  });
});

describe("pièces, espaces, zones", () => {
  const carre = [{ contour: [P(0, 0), P(3, 0), P(3, 3), P(0, 3)], trous: [] }];
  it("pièce : aire calculée jamais saisie ; espace ; zone avec contenu", () => {
    const r = allerRetour(base, cmd("piece.creer", { id: "S1", niveauId: "rdc", calqueId: "C1", polygones: carre, nom: "Séjour", code: "01", aireDeclaree: { value: 9, unit: "m²" } }));
    expect(refus(r.etat, cmd("piece.modifier", { modifications: { aireCalculee: { value: 9, unit: "m²" } } as never }, ["S1"]))[0]?.message).toMatch(/calculée/);
    allerRetour(r.etat, cmd("piece.modifier", { modifications: { nom: "Salon" } }, ["S1"]));
    const e = ok(r.etat, cmd("espace.creer", { id: "ES1", niveauId: "rdc", calqueId: "C1", polygones: carre, nom: "Hall" })).etat;
    const z = allerRetour(e, cmd("zone.creer", { id: "Z1", niveauId: "rdc", calqueId: "C1", polygones: carre, nom: "Jour", contenu: ["S1", "ES1"] }));
    expect(z.etat.relations).toContainEqual({ type: "contient", sourceId: "Z1", cibleId: "S1", derivee: false });
    allerRetour(z.etat, cmd("zone.modifier", { modifications: { nom: "Nuit" }, contenu: ["S1"] }, ["Z1"]));
    allerRetour(z.etat, cmd("zone.supprimer", {}, ["Z1"]));
    allerRetour(z.etat, cmd("piece.supprimer", {}, ["S1"]));
    expect(refus(e, cmd("zone.creer", { id: "Z2", niveauId: "rdc", calqueId: "C1", polygones: carre, nom: "X", contenu: ["M1"] }))[0]?.message).toMatch(/pièces ou des espaces/);
  });

  it("piece.detecter propose sans rien créer", () => {
    const e = ok(
      base,
      cmd("mur.tracer", { id: "W2", niveauId: "rdc", calqueId: "C1", a: P(6, 0), b: P(6, 4), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
      cmd("mur.tracer", { id: "W3", niveauId: "rdc", calqueId: "C1", a: P(0, 4), b: P(0, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
    ).etat;
    const props = detecterPieces(e, "rdc");
    expect(props).toHaveLength(1);
    expect(props[0]?.aire).toBeCloseTo(24, 9);
    const r = ok(e, cmd("piece.detecter", { niveauId: "rdc", point: P(1, 1) }));
    expect(r.effets.objetsCrees).toEqual([]);
    expect(r.effets.problemes[0]?.message).toMatch(/proposition de pièce/);
    expect(r.inverse).toEqual([]);
  });
});

describe("poteaux, solides", () => {
  it("cycle complet", () => {
    const r = allerRetour(base, cmd("poteau.creer", { id: "C1p", niveauId: "rdc", calqueId: "C1", point: P(2, 2), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: deg(0) }));
    allerRetour(r.etat, cmd("poteau.modifier", { modifications: { angle: deg(45) } }, ["C1p"]));
    allerRetour(r.etat, cmd("poteau.supprimer", {}, ["C1p"]));
    const s = allerRetour(base, cmd("solide.extruder", { id: "SO1", niveauId: "rdc", calqueId: "C1", contour: [P(0, 0), P(1, 0), P(1, 1)], trous: [], ferme: true, hauteur: m(1), decalageBase: m(0), role: "clearance" }));
    allerRetour(s.etat, cmd("solide.modifier", { modifications: { role: "core-zone" } }, ["SO1"]));
    allerRetour(s.etat, cmd("solide.supprimer", {}, ["SO1"]));
  });
});

describe("esquisse", () => {
  const t = { niveauId: "rdc", calqueId: "C1" };
  it("chaque forme se crée et s'annule exactement ; modifier ; supprimer", () => {
    allerRetour(base, cmd("esquisse.ligne", { id: "L1", ...t, a: P(0, 0), b: P(1, 1) }));
    allerRetour(base, cmd("esquisse.polyligne", { id: "L2", ...t, points: [P(0, 0), P(1, 0), P(1, 1)], ferme: false }));
    allerRetour(base, cmd("esquisse.arc", { id: "L3", ...t, centre: P(0, 0), rayon: m(1), angleDebut: deg(0), angleFin: deg(90), sens: "trigo" }));
    allerRetour(base, cmd("esquisse.cercle", { id: "L4", ...t, centre: P(0, 0), rayon: m(1) }));
    allerRetour(base, cmd("esquisse.rectangle", { id: "L5", ...t, origine: P(0, 0), largeur: m(4), profondeur: m(3), angle: deg(0) }));
    allerRetour(base, cmd("esquisse.polygone", { id: "L6", ...t, centre: P(0, 0), nombreCotes: 6, rayon: m(1), mode: "inscrit", angle: deg(0) }));
    allerRetour(base, cmd("esquisse.spline", { id: "L7", ...t, points: [P(0, 0), P(1, 1), P(2, 0)], mode: "controle", degre: 2, ferme: false }));
    allerRetour(base, cmd("esquisse.construction", { id: "L8", ...t, nature: "construction", point: P(0, 0), direction: deg(30), etendue: "droite" }));
    allerRetour(base, cmd("esquisse.hachure", { id: "L9", ...t, contour: [P(0, 0), P(1, 0), P(1, 1)], trous: [], motifId: "diagonal", angle: deg(45), espacement: m(0.1) }));
    const e = ok(base, cmd("esquisse.rectangle", { id: "R", ...t, origine: P(0, 0), largeur: m(4), profondeur: m(3), angle: deg(0) })).etat;
    allerRetour(e, cmd("esquisse.modifier", { classe: "esquisse.rectangle", modifications: { largeur: m(5) } }, ["R"]));
    allerRetour(e, cmd("esquisse.supprimer", {}, ["R"]));
    expect(refus(e, cmd("esquisse.modifier", { classe: "esquisse.ligne", modifications: {} }, ["R"]))[0]?.code).toBe("precondition");
  });

  it("refus : polygone à 2 côtés, arc nul, sommets confondus, construction incohérente", () => {
    expect(refus(base, cmd("esquisse.polygone", { id: "X", ...t, centre: P(0, 0), nombreCotes: 2, rayon: m(1), mode: "inscrit", angle: deg(0) }))[0]?.chemin).toMatch(/nombreCotes/);
    expect(refus(base, cmd("esquisse.arc", { id: "X", ...t, centre: P(0, 0), rayon: m(1), angleDebut: deg(10), angleFin: deg(10), sens: "trigo" }))[0]?.message).toMatch(/arc nul/);
    expect(refus(base, cmd("esquisse.polyligne", { id: "X", ...t, points: [P(0, 0), P(0, 0), P(1, 1)], ferme: false }))[0]?.message).toMatch(/confondus/);
    expect(refus(base, cmd("esquisse.construction", { id: "X", ...t, nature: "axe", a: P(0, 0), b: P(1, 0), direction: deg(0) } as never))[0]?.message).toMatch(/réservé/);
  });
});

describe("annotations et références", () => {
  const cote = cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(6, 0), decalage: m(0.5), references: [{ extremite: "a", objetId: "M1", caracteristique: "mur:arete-debut" }] });
  it("cotation rattachée : relation reference ; suppression du mur → « à réparer », puis réparation", () => {
    const r = allerRetour(base, cote);
    const k = objet(r.etat, "K1");
    expect(k.classe === "cotation" && k.params.etat).toBe("rattachee");
    expect(r.etat.relations).toContainEqual({ type: "reference", sourceId: "K1", cibleId: "M1", role: "mur:arete-debut", derivee: true });
    const s = allerRetour(r.etat, cmd("mur.scinder", { point: P(4, 0), nouveauxIds: ["M1a", "M1b"] }, ["M1"]));
    const k2 = objet(s.etat, "K1");
    expect(k2.classe === "cotation" && k2.params.etat).toBe("a-reparer");
    const pb = s.effets.problemes.find((p) => p.code === "reference-a-reparer");
    expect(pb?.propositions?.[0]?.cible).toEqual({ objetId: "M1a", caracteristique: "mur:arete-debut" });
    expect(s.effets.referencesTouchees).toContainEqual({ porteurId: "K1", reference: { objetId: "M1", caracteristique: "mur:arete-debut" } });
    const rep = allerRetour(s.etat, cmd("reference.reparer", { ancienne: { objetId: "M1", caracteristique: "mur:arete-debut" }, nouvelle: { objetId: "M1a", caracteristique: "mur:arete-debut" } }, ["K1"]));
    const k3 = objet(rep.etat, "K1");
    expect(k3.classe === "cotation" && k3.params.etat).toBe("rattachee");
    const det = allerRetour(s.etat, cmd("reference.reparer", { ancienne: { objetId: "M1", caracteristique: "mur:arete-debut" }, nouvelle: null }, ["K1"]));
    const k4 = objet(det.etat, "K1");
    expect(k4.classe === "cotation" && k4.params.etat).toBe("libre");
  });

  it("modifier, rattacher, supprimer ; textes et étiquettes", () => {
    const e = ok(base, cote).etat;
    allerRetour(e, cmd("cotation.modifier", { modifications: { decalage: m(-0.5), texteRemplacement: "6,00" } }, ["K1"]));
    allerRetour(e, cmd("cotation.rattacher", { references: [{ extremite: "b", objetId: "M1", caracteristique: "mur:arete-fin" }] }, ["K1"]));
    allerRetour(e, cmd("cotation.supprimer", {}, ["K1"]));
    const t = allerRetour(base, cmd("texte.creer", { id: "X1", niveauId: "rdc", calqueId: "C1", position: P(1, 1), texte: "Séjour\n24 m²" }));
    allerRetour(t.etat, cmd("texte.modifier", { modifications: { texte: "Salon" } }, ["X1"]));
    allerRetour(t.etat, cmd("texte.supprimer", {}, ["X1"]));
    const et = allerRetour(base, cmd("etiquette.creer", { id: "ET1", niveauId: "rdc", calqueId: "C1", position: P(1, 1), objetId: "P1", caracteristique: "ouverture:centre" }));
    allerRetour(et.etat, cmd("etiquette.modifier", { modifications: { texte: "P01" } }, ["ET1"]));
    allerRetour(et.etat, cmd("etiquette.supprimer", {}, ["ET1"]));
  });

  it("références refusées : classe non admise, caractéristique inconnue, texte vide", () => {
    const c = (references: unknown) => cmd("cotation.creer", { ...(cote.params as object), references } as never);
    expect(refus(base, c([{ extremite: "a", objetId: "C1", caracteristique: "mur:axe" }]))[0]?.message).toMatch(/ne peut pas référencer/);
    expect(refus(base, c([{ extremite: "a", objetId: "M1", caracteristique: "poteau:centre" }]))[0]?.message).toMatch(/inexistante/);
    expect(refus(base, cmd("texte.creer", { id: "X", niveauId: "rdc", calqueId: "C1", position: P(1, 1), texte: " " }))[0]?.message).toMatch(/texte vide/);
  });
});

describe("organisation", () => {
  it("calques : créer, modifier, réordonner, affecter, supprimer avec destination", () => {
    const r = allerRetour(base, cmd("calque.creer", { id: "C2", nom: "Cloisons", couleur: "#aa0000", visible: true, verrouille: false, ordre: 2 }));
    allerRetour(r.etat, cmd("calque.modifier", { modifications: { couleur: "#00aa00", visible: false } }, ["C2"]));
    allerRetour(r.etat, cmd("calque.reordonner", { ordre: ["C2", "C1", "CV"] }));
    const a = allerRetour(r.etat, cmd("calque.affecter", { calqueId: "C2" }, ["M1", "P1"]));
    expect(objet(a.etat, "M1").calqueId).toBe("C2");
    const s = allerRetour(r.etat, cmd("calque.supprimer", { calqueDestinationId: "C2" }, ["C1"]));
    expect(objet(s.etat, "D1").calqueId).toBe("C2");
    expect(refus(r.etat, cmd("calque.supprimer", {}, ["C1"]))[0]?.message).toMatch(/objet\(s\) sur ce calque/);
    expect(refus(r.etat, cmd("calque.creer", { id: "C3", nom: "Murs", couleur: "#aa0000", visible: true, verrouille: false, ordre: 7 }))[0]?.message).toMatch(/déjà pris/);
    expect(refus(r.etat, cmd("calque.creer", { id: "C3", nom: "N", couleur: "rouge", visible: true, verrouille: false, ordre: 7 }))[0]?.message).toMatch(/couleur/);
  });

  it("calque verrouillé : toute modification de ses objets refusée", () => {
    const e = refus(base, cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["MV"]));
    expect(e[0]?.code).toBe("calque-verrouille");
    expect(refus(base, cmd("calque.affecter", { calqueId: "CV" }, ["D1"]))[0]?.code).toBe("calque-verrouille");
    expect(refus(base, cmd("calque.supprimer", { calqueDestinationId: "C1" }, ["CV"]))[0]?.code).toBe("calque-verrouille");
  });

  it("groupes : créer, dissoudre ; un objet dans un seul groupe", () => {
    const g = allerRetour(base, cmd("groupe.creer", { id: "G1", nom: "Façade" }, ["M1", "D1"]));
    expect(objet(g.etat, "M1").groupeId).toBe("G1");
    expect(g.etat.relations).toContainEqual({ type: "appartient-a", sourceId: "M1", cibleId: "G1", derivee: false });
    allerRetour(g.etat, cmd("groupe.dissoudre", {}, ["G1"]));
    allerRetour(g.etat, cmd("mur.supprimer", {}, ["M1"]));
    expect(refus(g.etat, cmd("groupe.creer", { id: "G2" }, ["M1"]))[0]?.message).toMatch(/déjà au groupe/);
    expect(refus(base, cmd("groupe.creer", { id: "G2" }, ["rdc"]))[0]?.code).toBe("precondition");
  });

  it("types : définir, modifier (catalogue versionné), puis utiliser", () => {
    const def = { id: "cloison", classe: "mur" as const, nom: "Cloison", dimensionsProposees: { epaisseur: m(0.1) }, proprietes: [], provenance: "saisie" as const, statut: "declaree" as const };
    const r = allerRetour(base, cmd("type.definir", { definition: def }));
    expect(r.etat.catalogue.version).toBe(base.catalogue.version + 1);
    expect(r.etat.catalogue.definitions["mur:cloison"]).toMatchObject({ classeIfc: "IfcWallType", versionCatalogue: 1 });
    allerRetour(r.etat, cmd("type.modifier", { classe: "mur", id: "cloison", modifications: { nom: "Cloison légère" } }));
    allerRetour(r.etat, cmd("mur.modifier", { modifications: { typeId: "cloison" } }, ["M1"]));
    expect(refus(r.etat, cmd("type.definir", { definition: def }))[0]?.message).toMatch(/déjà défini/);
    expect(refus(base, cmd("type.definir", { definition: { ...def, provenance: "import" } }))[0]?.message).toMatch(/réservée/);
  });

  it("propriétés : définir, remplacer, retirer ; refus motivés", () => {
    const def = { nom: "resistanceFeu", valeur: "EI 60", provenance: "saisie" as const, statut: "declaree" as const };
    const r = allerRetour(base, cmd("propriete.definir", def, ["M1"]));
    expect(objet(r.etat, "M1").proprietes).toEqual([def]);
    allerRetour(r.etat, cmd("propriete.definir", { ...def, valeur: "EI 90" }, ["M1"]));
    allerRetour(r.etat, cmd("propriete.definir", { ...def, retirer: true }, ["M1"]));
    allerRetour(base, cmd("propriete.definir", { nom: "uValeur", valeur: 0.25, unite: "m", provenance: "saisie", statut: "declaree" }, ["M1"]));
    expect(refus(base, cmd("propriete.definir", { nom: "u", valeur: 0.25, provenance: "saisie", statut: "declaree" }, ["M1"]))[0]?.code).toBe("unite-invalide");
    expect(refus(base, cmd("propriete.definir", { ...def, provenance: "import" }, ["M1"]))[0]?.message).toMatch(/réservée/);
    expect(refus(base, cmd("propriete.definir", { ...def, nom: "import.lineRef" }, ["M1"]))[0]?.message).toMatch(/importée/);
    expect(refus(base, cmd("propriete.definir", { ...def, nom: "epaisseur" }, ["M1"]))[0]?.message).toMatch(/paramètre canonique/);
    expect(refus(base, cmd("propriete.definir", { ...def, statut: "verifiee" }, ["M1"]))[0]?.message).toMatch(/sans source/);
  });

  it("classification : affecter et remplacer par système", () => {
    const r = allerRetour(base, cmd("classification.affecter", { classification: { systeme: "CFC", code: "214", provenance: "saisie" } }, ["M1"]));
    allerRetour(r.etat, cmd("classification.affecter", { classification: { systeme: "CFC", code: "215", provenance: "saisie" } }, ["M1"]));
    expect(refus(base, cmd("classification.affecter", { definitionId: "cloison", classification: { systeme: "CFC", code: "1", provenance: "saisie" } }))[0]?.code).toBe("precondition");
  });

  it("blocs : refus motivé (lot 5, classe absente de l'ontologie)", () => {
    expect(refus(base, cmd("bloc.definir", { id: "B", nom: "B", origine: P(0, 0) }))[0]?.message).toMatch(/lot 5/);
    expect(refus(base, cmd("bloc.placer", { id: "B", niveauId: "rdc", calqueId: "C1", blocId: "B", position: P(0, 0), angle: deg(0) }))[0]?.message).toMatch(/lot 5/);
  });
});

describe("site", () => {
  const sommets = [pointCadastral(0, 0, "EPSG:26191"), pointCadastral(10, 0, "EPSG:26191"), pointCadastral(10, 10, "EPSG:26191")];
  it("parcelle et emprise : définir puis redéfinir", () => {
    const r = allerRetour(base, cmd("site.parcelle.definir", { id: "PA", crs: "EPSG:26191", sommetsCadastraux: sommets }));
    allerRetour(r.etat, cmd("site.parcelle.definir", { id: "PA", crs: "EPSG:26191", sommetsCadastraux: sommets, numero: "118" }));
    allerRetour(r.etat, cmd("site.emprise.definir", { id: "EM", sommetsLocaux: [P(0, 0), P(6, 0), P(6, 4)] }));
    expect(refus(r.etat, cmd("site.parcelle.definir", { id: "PB", crs: "EPSG:26191", sommetsCadastraux: sommets }))[0]?.message).toMatch(/déjà une parcelle/);
    expect(refus(base, cmd("site.parcelle.definir", { id: "PA", crs: "EPSG:2056", sommetsCadastraux: sommets }))[0]?.code).toBe("repere-melange");
  });
});
