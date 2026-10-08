import { describe, expect, it } from "vitest";
import { ajouterRectangle, differencePlanche, empreintePlanche, pousserTirer, modeleVide as plancheVide, type Modele as ModelePlanche } from "@parcours/planche-model";
import { appliquerLot, CONTRAT_COMMANDES, ErreurCommande, modeleVide, planches, type Commande, type ModeleAtelier } from "../index.js";

const lot = (etat: ModeleAtelier, commands: Commande[], requestId = "t") => appliquerLot(etat, { requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: "test", commands });
const boite = (m: ModelePlanche) => {
  const r = ajouterRectangle(m, { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }).modele;
  return pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
};

describe("lot 7 — commandes planche.*", () => {
  const base = lot(modeleVide(), [{ type: "niveau.creer", params: { id: "rdc", nom: "Rez", elevation: 0, hauteur: 3 } }]).etat;

  it("créer (vide ou depuis un brouillon), renommer, copier, supprimer ; noms uniques ; niveau de référence connu", () => {
    const r1 = lot(base, [{ type: "planche.creer", params: { id: "pl1", nom: "Esquisse", niveauId: "rdc" } }]);
    expect(r1.effets.crees).toEqual(["pl1"]);
    const p = planches(r1.etat);
    expect(p).toHaveLength(1);
    expect(p[0]!.params.nom).toBe("Esquisse");
    expect(p[0]!.params.empreinte).toBe(empreintePlanche(plancheVide()));
    expect(() => lot(r1.etat, [{ type: "planche.creer", params: { nom: "esquisse" } }])).toThrow(/porte déjà le nom/);
    expect(() => lot(r1.etat, [{ type: "planche.creer", params: { nom: "Autre", niveauId: "r9" } }])).toThrow(/niveau inconnu/);
    const brouillon = boite(plancheVide());
    const r2 = lot(r1.etat, [{ type: "planche.creer", params: { id: "pl2", nom: "Reprise", modele: JSON.parse(JSON.stringify(brouillon)) } }]);
    expect(planches(r2.etat).find((d) => d.id === "pl2")!.params.empreinte).toBe(empreintePlanche(brouillon));
    expect(() => lot(r1.etat, [{ type: "planche.creer", params: { nom: "Cassée", modele: { racine: {} } } }])).toThrow(/mal formé/);
    const r3 = lot(r2.etat, [{ type: "planche.renommer", params: { id: "pl2", nom: "Variante", niveauId: null } }]);
    const pl2 = r3.etat.definitions["pl2"]!;
    expect(pl2.nom).toBe("Variante");
    expect((pl2.params as { niveauId: string | null }).niveauId).toBeNull();
    expect(pl2.version).toBe(2);
    const r4 = lot(r3.etat, [{ type: "planche.copier", params: { id: "pl3", source: "pl2", nom: "Copie" } }]);
    expect((r4.etat.definitions["pl3"]!.params as { empreinte: string }).empreinte).toBe(empreintePlanche(brouillon));
    const r5 = lot(r4.etat, [{ type: "planche.supprimer", params: { id: "pl3" } }]);
    expect(r5.effets.supprimes).toEqual(["pl3"]);
    expect(planches(r5.etat)).toHaveLength(2);
    // L'inverse du lot (instantané différentiel) restaure la Planche supprimée.
    const retour = lot(r5.etat, [r5.inverse]).etat;
    expect(planches(retour)).toHaveLength(3);
  });

  it("opération : le delta est appliqué par la même fonction pure et l'empreinte vérifiée ; une empreinte fausse est une précondition", () => {
    const etat0 = lot(base, [{ type: "planche.creer", params: { id: "pl1", nom: "Esquisse" } }]).etat;
    const avant = plancheVide();
    const apres = boite(avant);
    const delta = differencePlanche(avant, apres)!;
    const r = lot(etat0, [{ type: "planche.operation", params: { id: "pl1", libelle: "Rectangle + Pousser/Tirer", delta, empreinteApres: empreintePlanche(apres) } }]);
    const params = r.etat.definitions["pl1"]!.params as { modele: ModelePlanche; empreinte: string };
    expect(Object.keys(params.modele.racine.faces)).toHaveLength(6);
    expect(params.empreinte).toBe(empreintePlanche(apres));
    expect(r.effets.modifies).toEqual(["pl1"]);
    // Rejouer le même delta (valeurs posées à l'identique) ne change rien : même empreinte, lot accepté — l'idempotence
    // par `requestId` est celle du serveur. Mais une Planche modifiée entre-temps (réglages posés par un autre poste)
    // ne donne plus l'empreinte annoncée → précondition (409 côté serveur).
    expect((lot(r.etat, [{ type: "planche.operation", params: { id: "pl1", libelle: "rejeu", delta, empreinteApres: empreintePlanche(apres) } }]).etat.definitions["pl1"]!.params as { empreinte: string }).empreinte).toBe(empreintePlanche(apres));
    const reglages = { accrochageLongueur: 0.05, accrochageAngle: 15, extremitesTexte: "fleche-fermee", alignerTexte: "epingle", extremitesCote: "barre", alignerCote: "centre" } as const;
    const autre = lot(etat0, [{ type: "planche.operation", params: { id: "pl1", libelle: "Réglages", delta: { annotations: { reglages } }, empreinteApres: empreintePlanche({ ...avant, annotations: { guides: {}, cotes: {}, textes: {}, plansDeCoupe: {}, materiaux: {}, balises: {}, scenes: {}, reglages } }) } }]).etat;
    let err: unknown = null;
    try {
      lot(autre, [{ type: "planche.operation", params: { id: "pl1", libelle: "Rectangle + Pousser/Tirer", delta, empreinteApres: empreintePlanche(apres) } }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ErreurCommande);
    expect((err as ErreurCommande).code).toBe("precondition");
    expect(() => lot(r.etat, [{ type: "planche.operation", params: { id: "pl1", libelle: "x", delta: { racine: { faces: { f: 2 } } }, empreinteApres: "0".repeat(16) } }])).toThrow(/mal formé/);
    // Annuler = l'inverse du lot : la Planche vide revient.
    const annule = lot(r.etat, [r.inverse]).etat;
    expect((annule.definitions["pl1"]!.params as { empreinte: string }).empreinte).toBe(empreintePlanche(avant));
  });
});
