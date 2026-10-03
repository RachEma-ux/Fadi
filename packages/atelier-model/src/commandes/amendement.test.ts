/**
 * Amendement D-024 du contrat `atelier-commands/1` : restauration officielle, propositions, code `doublon`,
 * erreurs « objet / cause / action », retrait par `null`, lot sans changement, « non évaluée » admise pour
 * `alignement` (mur) et `referencePlanSeulement` (escalier).
 */
import { describe, expect, it } from "vitest";
import type { Commande } from "../contrats/commandes.js";
import { CODES_PROBLEME } from "../contrats/probleme.js";
import { composerMessageErreur } from "../contrats/reducteurs.js";
import type { ObjetModele } from "../ontologie/classes.js";
import { nonEvaluee } from "../ontologie/provenance.js";
import { allerRetour, cmd, enveloppe, m, ok, P, projetDeBase, refus } from "./__tests__/aides.js";
import { HistoriqueAtelier } from "./historique.js";
import { appliquerLot } from "./moteur.js";

const base = projetDeBase();
const objet = (e: { objets: Readonly<Record<string, ObjetModele>> }, id: string): ObjetModele => {
  const o = e.objets[id];
  if (!o) throw new Error(`objet ${id} absent`);
  return o;
};
const epaissir = cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["M1"]);

describe("D-024 (1) restauration, champ officiel du contrat", () => {
  it("l'inverse porte `restauration` (état avant, empreinte attendue après)", () => {
    const r = ok(base, epaissir);
    const inv = r.inverse[0];
    expect(inv?.type).toBe("mur.modifier");
    expect(inv?.restauration?.version).toBe(1);
    expect(inv?.restauration?.objets[0]).toMatchObject({ id: "M1", avant: base.objets.M1 });
    expect(inv?.restauration?.objets[0]?.apres).toMatch(/^sha256-/);
    expect(inv?.restauration?.origine.restauration).toBeUndefined();
  });

  it("double restauration refusée : dans un lot suivant comme dans le même lot", () => {
    const r = ok(base, epaissir);
    const annule = ok(r.etat, ...r.inverse);
    expect(refus(annule.etat, ...r.inverse)[0]?.cause).toMatch(/déjà restauré/);
    const meme = refus(r.etat, ...r.inverse, ...r.inverse);
    expect(meme[0]?.chemin).toMatch(/^commands\[1\]\.restauration/);
  });

  it("double restauration d'une création ou d'une suppression refusée (objets et traces de suppression)", () => {
    const ligne = cmd("esquisse.ligne", { id: "L", niveauId: "rdc", calqueId: "C1", a: P(0, 5), b: P(1, 5) });
    const cree = ok(base, ligne);
    const annule = ok(cree.etat, ...cree.inverse);
    expect(annule.etat.objets.L).toBeUndefined();
    expect(refus(annule.etat, ...cree.inverse).length).toBeGreaterThan(0);
    const supprime = ok(cree.etat, cmd("esquisse.supprimer", {}, ["L"]));
    const restaure = ok(supprime.etat, ...supprime.inverse);
    expect(restaure.etat.empreinte).toBe(cree.etat.empreinte);
    const erreurs = refus(restaure.etat, ...supprime.inverse);
    expect(erreurs.map((e) => e.chemin)).toEqual(expect.arrayContaining(["commands[0].restauration.objets[0]", "commands[0].restauration.supprimesARetirer[0]"]));
  });

  it("restauration vide, imbriquée ou mal formée : refus motivé, rien n'est appliqué", () => {
    const r = ok(base, epaissir);
    const inv = r.inverse[0] as Commande & { restauration: NonNullable<Commande["restauration"]> };
    const vide: Commande = { ...inv, restauration: { ...inv.restauration, objets: [], relationsARetirer: [], relationsARajouter: [], supprimesARetirer: [], supprimesARajouter: [] } };
    expect(refus(r.etat, vide)[0]?.cause).toMatch(/vide/);
    const imbriquee: Commande = { ...inv, restauration: { ...inv.restauration, origine: inv } };
    expect(refus(r.etat, imbriquee)[0]?.cause).toMatch(/imbriquée/);
    const malFormee = { ...inv, restauration: { version: 2 } } as unknown as Commande;
    expect(refus(r.etat, malFormee)[0]?.code).toBe("parametre-invalide");
  });
});

describe("D-024 (2) Effets.propositions", () => {
  it("piece.detecter sans contour fermé : aucune proposition, aucun problème", () => {
    const r = ok(base, cmd("piece.detecter", { niveauId: "rdc" }));
    expect(r.effets.propositions).toEqual([]);
    expect(r.effets.problemes).toEqual([]);
  });
});

describe("D-024 (3) code de problème `doublon`", () => {
  it("existe au contrat ; code de pièce répété et copie à vecteur nul signalés `doublon`", () => {
    expect(CODES_PROBLEME).toContain("doublon");
    const piece = (id: string) => cmd("piece.creer", { id, niveauId: "rdc", calqueId: "C1", polygones: [{ contour: [P(0, 0), P(2, 0), P(2, 2)], trous: [] }], nom: id, code: "R01" });
    const r = ok(base, piece("S1"), piece("S2"));
    expect(r.effets.problemes.filter((p) => p.code === "doublon").flatMap((p) => p.objetIds)).toEqual(["S2", "S1"]);
    const copie = ok(base, cmd("transformer.copier", { vecteur: { dx: 0, dy: 0, unit: "m" }, nouveauxIds: ["D2"] }, ["D1"]));
    expect(copie.effets.problemes.map((p) => p.code)).toContain("doublon");
    expect(copie.effets.problemes.some((p) => p.code === "valeur-a-verifier")).toBe(false);
  });
});

describe("D-024 (4) ErreurCommande : objet, cause, action séparés", () => {
  it("champs séparés et message composé « objet : cause. Action : … »", () => {
    const e = refus(base, cmd("mur.modifier", { modifications: { epaisseur: m(-1) } }, ["M1"]))[0];
    expect(e).toBeDefined();
    if (!e) return;
    expect(e.objet).toBe("Mur M1");
    expect(e.cause).toMatch(/strictement positive/);
    expect(e.action).toBe("corriger la valeur");
    expect(e.message).toBe(composerMessageErreur(e.objet, e.cause, e.action));
    expect(e.message).toBe(`Mur M1 : ${e.cause}. Action : corriger la valeur.`);
    const conflit = appliquerLot(base, { ...enveloppe(base, [epaissir]), baseRevision: 0 });
    expect(conflit.ok === false && conflit.erreurs[0]).toMatchObject({ code: "conflit-revision", objet: "Enveloppe", action: "recharger le modèle et rejouer les commandes" });
  });
});

describe("D-024 (5) retrait d'un paramètre facultatif par `null`", () => {
  it("retire le paramètre ; l'inverse le rétablit exactement", () => {
    const nomme = ok(base, cmd("mur.modifier", { modifications: { nom: "Façade sud" } }, ["M1"]));
    const r = allerRetour(nomme.etat, cmd("mur.modifier", { modifications: { nom: null } }, ["M1"]));
    const mur = objet(r.etat, "M1");
    expect(mur.classe === "mur" && "nom" in mur.params).toBe(false);
    // L'inverse lisible d'un ajout retire par `null`.
    expect(nomme.inverse[0]?.params).toEqual({ modifications: { nom: null } });
  });

  it("refusé pour un paramètre obligatoire ; contrôles de la classe appliqués après retrait", () => {
    expect(refus(base, cmd("mur.modifier", { modifications: { epaisseur: null } as never }, ["M1"]))[0]?.cause).toMatch(/obligatoire/);
    // `hauteur` est facultative mais l'un de hauteur / niveauHaut est exigé.
    expect(refus(base, cmd("mur.modifier", { modifications: { hauteur: null } }, ["M1"]))[0]?.message).toMatch(/hauteur \/ niveauHaut/);
    allerRetour(base, cmd("mur.modifier", { modifications: { hauteur: null, niveauHaut: "r1" } }, ["M1"]));
  });

  it("type.modifier : `null` retire `categorie`, refusé pour `nom`", () => {
    const t = ok(base, cmd("type.definir", { definition: { id: "cloison", classe: "mur", nom: "Cloison", categorie: "intérieur", proprietes: [], provenance: "saisie", statut: "declaree" } }));
    const r = allerRetour(t.etat, cmd("type.modifier", { classe: "mur", id: "cloison", modifications: { categorie: null } }));
    expect(Object.values(r.etat.catalogue.definitions).find((d) => d.id === "cloison")?.categorie).toBeUndefined();
    expect(refus(t.etat, cmd("type.modifier", { classe: "mur", id: "cloison", modifications: { nom: null } as never }))[0]?.cause).toMatch(/obligatoire/);
  });
});

describe("D-024 (6) lot sans changement du modèle", () => {
  it("révision et empreinte inchangées, inverse vide, hors historique", () => {
    const h = new HistoriqueAtelier(base);
    const r = h.executer(enveloppe(base, [cmd("piece.detecter", { niveauId: "rdc" })], "Détecter"));
    expect(r.ok && r.etat.revision).toBe(base.revision);
    expect(r.ok && r.etat.empreinte).toBe(base.empreinte);
    expect(r.ok && r.inverse).toEqual([]);
    expect(h.peutAnnuler()).toBe(false);
    expect(h.etat()).toBe(base);
  });
});

describe("D-024 (7) « non évaluée » admise pour alignement et referencePlanSeulement", () => {
  it("alignement « non évaluée » : saisi, conservé par miroir, inverse exact ; motif obligatoire", () => {
    const r = allerRetour(base, cmd("mur.modifier", { modifications: { alignement: nonEvaluee("ligne de référence inconnue") } }, ["M1"]));
    const mir = ok(r.etat, cmd("transformer.miroir", { axe: { a: P(0, -1), b: P(1, -1) }, conserverOriginal: false }, ["M1"]));
    const mur = objet(mir.etat, "M1");
    expect(mur.classe === "mur" && mur.params.alignement).toEqual(nonEvaluee("ligne de référence inconnue"));
    expect(refus(base, cmd("mur.modifier", { modifications: { alignement: { nonEvaluee: true, motif: "" } } }, ["M1"]))[0]?.cause).toMatch(/sans motif/);
  });

  it("referencePlanSeulement « non évaluée » à la création d'un escalier", () => {
    const r = allerRetour(
      base,
      cmd("escalier.creer", {
        id: "E1",
        niveauId: "rdc",
        calqueId: "C1",
        axe: { a: P(1, 1), b: P(4, 1) },
        largeur: m(1),
        hauteurAFranchir: m(3),
        marches: 17,
        contremarches: 18,
        epaisseurPaillasse: m(0.18),
        decalageBase: m(0),
        niveauDepartId: "rdc",
        niveauArriveeId: "r1",
        referencePlanSeulement: nonEvaluee("drapeau non fourni"),
      }),
    );
    const e = objet(r.etat, "E1");
    expect(e.classe === "escalier" && e.params.referencePlanSeulement).toEqual(nonEvaluee("drapeau non fourni"));
  });
});

describe("convention d'alignement (DA-02-07)", () => {
  it("« gauche » : l'axe tracé a→b est la face gauche, le mur s'étend du côté de la normale (−dy, dx)", () => {
    // Fige la convention dans le contrat de type (documentation exécutable) : pour a = (0,0), b = (6,0),
    // la normale (−dy, dx) = (0, 6) pointe vers y > 0 ; un mur « gauche » d'épaisseur e occupe y ∈ [0, e].
    const a = { x: 0, y: 0 };
    const b = { x: 6, y: 0 };
    const normale = { x: -(b.y - a.y), y: b.x - a.x };
    expect(normale).toEqual({ x: -0, y: 6 });
    const r = ok(base, cmd("mur.modifier", { modifications: { alignement: "gauche" } }, ["M1"]));
    const mur = objet(r.etat, "M1");
    expect(mur.classe === "mur" && mur.params.alignement).toBe("gauche");
  });
});
