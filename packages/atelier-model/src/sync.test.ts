import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot } from "./commandes/index.js";
import { modeleVide } from "./modele.js";
import { cibleAnnulation, cibleRetablissement, rejouerLots, type EntreeJournal, type LotEnAttente } from "./sync.js";
import { m, pt } from "./unites.js";

const e = (id: string, kind: EntreeJournal["kind"], rev: number, inverseOf: string | null = null): EntreeJournal => ({ id, kind, requestId: id, label: id, baseRevision: rev - 1, resultRevision: rev, inverseOf });

describe("cibles d'annulation et de rétablissement", () => {
  it("annule la dernière commande non annulée, rétablit la dernière annulation après la dernière commande", () => {
    const j = [e("c1", "commande", 1), e("c2", "commande", 2), e("u1", "annulation", 3, "c2")];
    expect(cibleAnnulation(j)?.id).toBe("c1");
    expect(cibleRetablissement(j)?.id).toBe("u1");
    const j2 = [...j, e("r1", "retablissement", 4, "u1")];
    expect(cibleAnnulation(j2)?.id).toBe("r1");
    expect(cibleRetablissement(j2)).toBeNull();
    const j3 = [...j, e("c3", "commande", 4)];
    expect(cibleRetablissement(j3)).toBeNull();
    expect(cibleAnnulation(j3)?.id).toBe("c3");
  });
});

describe("rejeu de lots en attente sur un état serveur plus récent", () => {
  const base = appliquerLot(modeleVide(), { requestId: "s", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }, { type: "mur.tracer", params: { id: "m1", niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2) } }] }).etat;
  const lot = (requestId: string, commands: LotEnAttente["enveloppe"]["commands"]): LotEnAttente => ({ enveloppe: { requestId, baseRevision: 1, contract: CONTRAT_COMMANDES, label: requestId, commands }, etat: "local", creeA: "2026-10-03T00:00:00Z", detail: null });

  it("réaligne les révisions de base et garde les lots compatibles", () => {
    const r = rejouerLots(base, 5, [lot("a", [{ type: "mur.modifier", params: { id: "m1", params: { hauteur: m(3) } } }]), lot("b", [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 1), b: pt(4, 1), epaisseur: m(0.2) } }])]);
    expect(r.rejoues.map((l) => l.enveloppe.baseRevision)).toEqual([5, 6]);
    expect(r.incompatibles).toEqual([]);
    expect(Object.keys(r.etat.objets)).toHaveLength(2);
  });

  it("isole un lot devenu incompatible (objet supprimé par autrui) sans perdre les suivants", () => {
    const serveur = appliquerLot(base, { requestId: "del", baseRevision: 2, contract: CONTRAT_COMMANDES, label: "", commands: [{ type: "mur.supprimer", params: { id: "m1" } }] }).etat;
    const r = rejouerLots(serveur, 3, [lot("a", [{ type: "mur.modifier", params: { id: "m1", params: { hauteur: m(3) } } }]), lot("b", [{ type: "mur.tracer", params: { niveauId: "rdc", a: pt(0, 1), b: pt(4, 1), epaisseur: m(0.2) } }])]);
    expect(r.incompatibles).toHaveLength(1);
    expect(r.incompatibles[0]!.lot.etat).toBe("conflit");
    expect(r.incompatibles[0]!.erreur.code).toBe("precondition");
    expect(r.rejoues.map((l) => l.enveloppe.requestId)).toEqual(["b"]);
    expect(r.rejoues[0]!.enveloppe.baseRevision).toBe(3);
  });
});
