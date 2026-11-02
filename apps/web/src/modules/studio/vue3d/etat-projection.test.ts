// EX-051, INV-006, EX-016 — projection 3D en état identifié : révision source, état dérivé, domaines périmés. Pur.
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument } from "@parcours/atelier-model";
import { etatProjection3d, type EntreeEtatProjection } from "./etat-projection";

const d12 = applyStudioCommands(newStudioDocument("d"), [{ toolId: "studio.dessin.rectangle", params: { id: "r", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1, extrusion: { base: 0, height: 3 } } }]);
const d13 = applyStudioCommands(d12, [{ toolId: "studio.dessin.deplacer", params: { id: "r", dx: 1, dy: 0 } }]);
const R12 = { revisionServeur: "studio_revision_aaaa0012", brouillon: false, revisionSession: "s12" };
const R13 = { revisionServeur: "studio_revision_aaaa0013", brouillon: false, revisionSession: "s13" };
const entree = (o: Partial<EntreeEtatProjection>): EntreeEtatProjection => ({ indisponible: false, echec: null, tache: "done", courante: R13, affichee: R13, docCourant: d13, docAffiche: d13, ...o });

describe("EX-051 / INV-006 — projection 3D en état identifié", () => {
  it("EX-051 [+] : après la commande R13, la scène affiche sa révision source et les données périmées, puis se recalcule", () => {
    const enCalcul = etatProjection3d(entree({ tache: "running", affichee: R12, docAffiche: d12 }));
    expect(enCalcul.sourceRevisionId).toBe(R12.revisionServeur);
    expect(enCalcul.etat.etat).toBe("en-calcul");
    expect(enCalcul.libelle).toBe("En calcul");
    expect(enCalcul.domainesPerimes).toEqual(["plan-2d", "maillage-3d", "quantites", "exports", "publications"]);
    const aJour = etatProjection3d(entree({}));
    expect(aJour).toMatchObject({ sourceRevisionId: R13.revisionServeur, libelle: "À jour pour la révision aaaa0013", domainesPerimes: [], coherent: true });
  });

  it("INV-006 [−] : un résultat calculé sur R12 n'est jamais présenté à jour pour R13 ; échec explicite avec l'ancienne image", () => {
    const ancien = etatProjection3d(entree({ tache: "stale", affichee: R12, docAffiche: d12 }));
    expect(ancien.etat.etat).toBe("a-recalculer");
    expect(ancien.sourceRevisionId).toBe(R12.revisionServeur);
    expect(ancien.coherent).toBe(true);
    const echec = etatProjection3d(entree({ tache: "failed", echec: "délai dépassé", affichee: R12, docAffiche: d12 }));
    expect(echec).toMatchObject({ libelle: "Échec du calcul : délai dépassé", sourceRevisionId: R12.revisionServeur });
    expect(echec.etat.etat).not.toBe("a-jour");
    expect(etatProjection3d(entree({ indisponible: true })).etat.etat).toBe("non-applicable");
  });
});
