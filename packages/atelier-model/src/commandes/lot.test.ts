import { describe, expect, it } from "vitest";
import { TYPES_COMMANDE, type EnveloppeCommandes } from "../contrats/enveloppe.js";
import type { EtatModele } from "../contrats/etat.js";
import { VERSION_ONTOLOGIE } from "../ontologie/descripteurs.js";
import { cmd, enveloppe, m, ok, P, projetDeBase, refus } from "./__tests__/aides.js";
import { calculerEmpreinte, condensat, jsonCanonique } from "./empreinte.js";
import { HistoriqueAtelier, ErreurHistorique } from "./historique.js";
import { appliquerLot, etatVide, REDUCTEURS } from "./moteur.js";

const base = projetDeBase();
const ligne = (id: string, x = 0) => cmd("esquisse.ligne", { id, niveauId: "rdc", calqueId: "C1", a: P(x, 5), b: P(x + 1, 5) });

describe("appliquerLot", () => {
  it("révision + 1, empreinte recalculée, inverse dans l'ordre inverse", () => {
    const r = ok(base, ligne("A"), ligne("B", 2));
    expect(r.etat.revision).toBe(base.revision + 1);
    expect(r.etat.empreinte).toBe(calculerEmpreinte(r.etat));
    expect(r.inverse.map((c) => c.cibles[0])).toEqual(["B", "A"]);
    expect(r.effets.objetsCrees).toEqual(["A", "B"]);
    expect(r.effets.vues).toContainEqual({ nature: "plan-niveau", niveauId: "rdc", etat: "a-recalculer" });
    expect(r.effets.documents).toEqual([{ nature: "documents-derives", etat: "perime" }]);
  });

  it("atomicité : une commande refusée annule tout le lot (rien n'est appliqué)", () => {
    const erreurs = refus(base, ligne("A"), cmd("mur.modifier", { modifications: { epaisseur: m(-1) } }, ["M1"]), ligne("B", 2));
    expect(erreurs[0]?.chemin).toBe("commands[1].params.epaisseur");
    expect(base.objets.A).toBeUndefined();
    // lot mixte avec un objet sur calque verrouillé : aucun objet modifié
    const r2 = appliquerLot(base, enveloppe(base, [cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["M1"]), cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["MV"])]));
    expect(r2.ok).toBe(false);
  });

  it("révision périmée refusée (conflit)", () => {
    const env: EnveloppeCommandes = { ...enveloppe(base, [ligne("A")]), baseRevision: base.revision - 1 };
    const r = appliquerLot(base, env);
    expect(r.ok === false && r.erreurs[0]).toMatchObject({ code: "conflit-revision", chemin: "baseRevision" });
  });

  it("enveloppe invalide : contrat, lot vide, type inconnu", () => {
    expect(appliquerLot(base, { ...enveloppe(base, [ligne("A")]), contract: "atelier-commands/2" as never }).ok).toBe(false);
    expect(appliquerLot(base, enveloppe(base, [])).ok).toBe(false);
    const r = appliquerLot(base, enveloppe(base, [{ type: "mur.voler", params: {}, cibles: [] } as never]));
    expect(r.ok === false && r.erreurs[0]?.chemin).toBe("commands[0].type");
  });

  it("effets nets : objet créé puis supprimé dans le même lot absent des effets ; pas de valeur partielle", () => {
    const r = ok(base, ligne("A"), cmd("esquisse.supprimer", {}, ["A"]), ligne("B", 2));
    expect(r.effets.objetsCrees).toEqual(["B"]);
    expect(r.effets.objetsSupprimes).toEqual([]);
    const retour = ok(r.etat, ...r.inverse);
    expect(retour.etat.empreinte).toBe(base.empreinte);
    expect(retour.etat.supprimes).toEqual(base.supprimes);
  });

  it("un inverse ne s'applique qu'à l'état qu'il annule (pas de double annulation)", () => {
    const r = ok(base, cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["M1"]));
    const annule = ok(r.etat, ...r.inverse);
    const deuxieme = refus(annule.etat, ...r.inverse);
    expect(deuxieme[0]?.message).toMatch(/modifié depuis la commande d'origine/);
  });

  it("idempotence d'identité : une création rejouée sur l'état produit est refusée (pas de second objet)", () => {
    const r = ok(base, ligne("A"));
    expect(refus(r.etat, ligne("A"))[0]?.message).toMatch(/déjà utilisé/);
  });

  it("la table couvre chaque type du contrat ; un réducteur rend l'empreinte à jour et ne touche pas la révision", () => {
    expect(Object.keys(REDUCTEURS).sort()).toEqual([...TYPES_COMMANDE].sort());
    const r = REDUCTEURS["esquisse.ligne"](base, { type: "esquisse.ligne", params: { id: "Z", niveauId: "rdc", calqueId: "C1", a: P(0, 9), b: P(1, 9) }, cibles: [] });
    expect(r.ok && r.etat.revision).toBe(base.revision);
    expect(r.ok && r.etat.empreinte).toBe(r.ok ? calculerEmpreinte(r.etat) : "");
  });
});

describe("empreinte atelier-empreinte/1", () => {
  it("SHA-256 conforme (vecteurs FIPS 180-4)", () => {
    expect(condensat("")).toBe("sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(condensat("abc")).toBe("sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(condensat("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("sha256-248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("indépendante de l'ordre d'insertion, de la révision et des traces de suppression", () => {
    const objets = base.objets;
    const inverse: Record<string, (typeof objets)[string]> = {};
    for (const k of Object.keys(objets).reverse()) inverse[k] = objets[k] as (typeof objets)[string];
    const autre: EtatModele = { ...base, objets: inverse, relations: [...base.relations].reverse(), revision: 99, supprimes: ["x"] };
    expect(calculerEmpreinte(autre)).toBe(base.empreinte);
    expect(jsonCanonique({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe('{"a":[2,{"c":3}],"b":1}');
  });

  it("état vide : aucune valeur par défaut", () => {
    const e = etatVide("p", VERSION_ONTOLOGIE);
    expect(e.objets).toEqual({});
    expect(e.empreinte).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
});

describe("historique (CommandHistory de domain-model)", () => {
  it("annuler / rétablir : nouvelles microversions, empreintes d'avant et d'après", () => {
    const h = new HistoriqueAtelier(base);
    const r1 = h.executer(enveloppe(base, [cmd("mur.modifier", { modifications: { epaisseur: m(0.3) } }, ["M1"])], "Épaissir M1"));
    expect(r1.ok).toBe(true);
    const apres = h.etat();
    const r2 = h.executer(enveloppe(apres, [ligne("A")], "Tracer A"));
    expect(r2.ok).toBe(true);
    const apres2 = h.etat();
    expect(h.libellesAnnulables()).toEqual(["Épaissir M1", "Tracer A"]);
    expect(h.annuler().empreinte).toBe(apres.empreinte);
    expect(h.annuler().empreinte).toBe(base.empreinte);
    expect(h.etat().revision).toBe(base.revision + 4);
    expect(h.peutAnnuler()).toBe(false);
    expect(h.retablir().empreinte).toBe(apres.empreinte);
    expect(h.retablir().empreinte).toBe(apres2.empreinte);
    expect(h.libellesRetablissables()).toEqual([]);
    expect(h.annuler().empreinte).toBe(apres.empreinte);
  });

  it("un lot refusé n'entre pas dans l'historique ; la révision périmée est refusée", () => {
    const h = new HistoriqueAtelier(base);
    const r = h.executer({ ...enveloppe(base, [ligne("A")]), baseRevision: 0 });
    expect(r.ok).toBe(false);
    expect(h.peutAnnuler()).toBe(false);
    expect(h.annuler()).toBe(base);
    expect(new ErreurHistorique("x", []).name).toBe("ErreurHistorique");
  });
});
