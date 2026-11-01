import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { applyToStudioHistory, createStudioHistory, redoStudioHistory, undoStudioHistory } from "./history.js";
import { quantitesStudio } from "./quantites.js";
import { bilanQuantitesStudio } from "./bilan-quantites.js";
import { appliquerAjustementsEnregistres, etatCibleQuantite, evaluerAjustementsQuantites, type AjustementQuantiteEnregistre } from "./quantites-ajustements.js";
import { studioMesh3d } from "./mesh-3d.js";
import { studioPlanArchitecture } from "./architecture/index.js";

/**
 * Preuves du groupe D2 (point 2 du rapprochement Studio), modèle pur : AC-008 (cas négatif) et AC-001 (annuler /
 * rétablir la modification du mur). Cas d'essai géométrique de REF-02 §4.5 (mur 6 × 3 × 0,2 m, baie 1 × 2,1 m, puis
 * 1,20 m) : 3,600 brut, 0,420 puis 0,504 déduits, 3,180 puis 3,096 net — pas une méthode de métré.
 */

const c = (x: unknown) => x as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(c));
const mur = { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" };
const baie = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };
const murEtBaie = () => avec(newStudioDocument("ac"), { toolId: "studio.architecture.mur", params: mur }, { toolId: "studio.architecture.ouverture", params: baie });
const valeur = (doc: StudioDocument, id: string, g: string) => quantitesStudio(doc).objets.find((o) => o.objetId === id)?.valeurs.find((v) => v.grandeur === g)?.valeur;
const ligneMur = (doc: StudioDocument) => bilanQuantitesStudio(doc).lignes.find((l) => l.objetId === "m1")!;
const gele = <T>(v: T): T => { if (v && typeof v === "object") { for (const x of Object.values(v)) gele(x); Object.freeze(v); } return v; };

/** Ajustement enregistré comme le serveur le pose (état de la cible à la révision de saisie). */
function ajustement(doc: StudioDocument, id: string, sequence: number, revisionId: string, valeurAjustee: number, motif: string): AjustementQuantiteEnregistre {
  const cible = { type: "objet" as const, id: "m1" };
  const e = etatCibleQuantite(doc, quantitesStudio(doc), cible, "volume-net");
  if ("refus" in e) throw new Error(e.refus);
  return { id, sequence, revisionId, cible, grandeur: "volume-net", unite: "m3", valeur: valeurAjustee, motif, derivee: e.derivee, etatCible: e.etat, auteur: "u1", date: "2026-10-25T08:00:00.000Z" };
}

describe("AC-008 — déductions 0,420 puis 0,504 m³, nets 3,180 puis 3,096 m³ ; résultats historiques à leur source (preuves D2)", () => {
  it("AC-008 [−] un ajustement manuel arrondi du net ne touche ni la déduction ni l'historique : 0,420 / 3,180 sur R1, 0,504 / 3,096 sur R2, ajustement à revoir, journal intact", () => {
    const d1 = gele(murEtBaie());
    const d2 = gele(avec(d1, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } }));
    // Ajustement du net arrondi (3,2 m³) saisi sur R1, puis un second sur R2 (3,1 m³) : le journal en ajout seul les garde tous deux.
    const a1 = gele(ajustement(d1, "aj1", 1, "R1", 3.2, "Arrondi au dixième (essai)"));
    const a2 = gele(ajustement(d2, "aj2", 2, "R2", 3.1, "Arrondi au dixième (essai)"));
    const journal = gele([a1, a2]);
    const avantJournal = structuredClone(journal);

    // R1 : la valeur retenue est l'ajustée, mais la dérivée nette, le brut et la déduction de la baie restent ceux de la source.
    const q1 = quantitesStudio(d1);
    const ev1 = evaluerAjustementsQuantites(d1, q1, [a1]);
    const v1 = appliquerAjustementsEnregistres(q1, ev1, { calques: true }).objets.find((o) => o.objetId === "m1")!.valeurs;
    expect(v1.find((v) => v.grandeur === "volume-net")).toMatchObject({ derivee: expect.closeTo(3.18, 12), retenue: 3.2, ajustee: 3.2 });
    expect(v1.find((v) => v.grandeur === "volume-deduit")).toMatchObject({ valeur: expect.closeTo(0.42, 12), retenue: expect.closeTo(0.42, 12) });
    expect(v1.find((v) => v.grandeur === "volume-deduit")!.ajustee).toBeUndefined();
    expect(ligneMur(d1)).toMatchObject({ brut: expect.closeTo(3.6, 12), deduit: expect.closeTo(0.42, 12), net: expect.closeTo(3.18, 12) });
    expect(ligneMur(d1).deductions).toEqual([{ sourceId: "o1", sourceType: "opening", valeur: expect.closeTo(0.42, 12) }]);

    // R2 : l'ajustement de R1 (cible modifiée) est à revoir, jamais appliqué ; la déduction suit la baie élargie (0,504).
    const q2 = quantitesStudio(d2);
    const ev2a = evaluerAjustementsQuantites(d2, q2, [a1]);
    expect(ev2a.journal[0]).toMatchObject({ statut: "a-revoir", revue: "cible-modifiee" });
    const v2a = appliquerAjustementsEnregistres(q2, ev2a, { calques: true }).objets.find((o) => o.objetId === "m1")!.valeurs;
    expect(v2a.find((v) => v.grandeur === "volume-net")).toMatchObject({ derivee: expect.closeTo(3.096, 12), retenue: expect.closeTo(3.096, 12) });
    expect(v2a.find((v) => v.grandeur === "volume-deduit")).toMatchObject({ valeur: expect.closeTo(0.504, 12) });
    // Le second ajustement (saisi sur R2) remplace le premier sans l'effacer ; la déduction reste 0,504.
    const ev2 = evaluerAjustementsQuantites(d2, q2, journal);
    expect(ev2.journal.map((l) => [l.ajustement.id, l.statut])).toEqual([["aj1", "remplace"], ["aj2", "en-vigueur"]]);
    const v2 = appliquerAjustementsEnregistres(q2, ev2, { calques: true }).objets.find((o) => o.objetId === "m1")!.valeurs;
    expect(v2.find((v) => v.grandeur === "volume-net")).toMatchObject({ derivee: expect.closeTo(3.096, 12), retenue: 3.1 });
    expect(v2.find((v) => v.grandeur === "volume-deduit")).toMatchObject({ valeur: expect.closeTo(0.504, 12) });
    expect(ligneMur(d2).deductions).toEqual([{ sourceId: "o1", sourceType: "opening", valeur: expect.closeTo(0.504, 12) }]);
    expect(ligneMur(d2)).toMatchObject({ deduit: expect.closeTo(0.504, 12), net: expect.closeTo(3.096, 12) });

    // Historique : l'ajustement de R1 garde sa source (révision, valeur dérivée 3,180, état de la cible) ; R1 relue est inchangée.
    expect(journal).toEqual(avantJournal);
    expect(a1).toMatchObject({ revisionId: "R1", derivee: expect.closeTo(3.18, 12) });
    expect(ev2.journal[0]!.ajustement).toBe(a1);
    expect(valeur(d1, "m1", "volume-deduit")).toBeCloseTo(0.42, 12);
    expect(valeur(d1, "m1", "volume-net")).toBeCloseTo(3.18, 12);
    // Le bilan ne lit aucun ajustement : même bilan avec ou sans journal.
    expect(bilanQuantitesStudio(d2, q2)).toEqual(bilanQuantitesStudio(d2));
  });
});

describe("AC-001 — même définition du mur d'une planche à l'autre ; annuler / rétablir retrouvent les valeurs (preuves D2)", () => {
  it("AC-001 [+] le mur modifié (épaisseur 0,25 m) puis annulé et rétabli : même objectId, baie toujours hébergée, métré, plan et 3D suivent", () => {
    const d1 = gele(avec(murEtBaie(), { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } }));
    expect(valeur(d1, "m1", "volume-net")).toBeCloseTo(3.096, 12);
    const h = applyToStudioHistory(createStudioHistory(d1), [c({ toolId: "studio.architecture.modifier", params: { ...mur, thickness: 0.25 } })]);
    const d2 = h.present;
    const etat = (d: StudioDocument) => ({
      ids: d.architecture!.map((a) => a.id),
      hote: studioPlanArchitecture(d.architecture).ouvertures.map((o) => [o.id, o.hostId]),
      ids3d: studioMesh3d(d).architecture!.map((m) => m.id),
      epaisseur: d.architecture!.find((a) => a.id === "m1")!.type === "wall" ? (d.architecture!.find((a) => a.id === "m1") as { thickness: number }).thickness : null,
      brut: valeur(d, "m1", "volume"),
      deduit: valeur(d, "m1", "volume-deduit"),
      net: valeur(d, "m1", "volume-net"),
    });
    // Après modification : 6 × 3 × 0,25 = 4,5 brut ; baie 1,2 × 2,1 × 0,25 = 0,63 ; net 3,87.
    expect(etat(d2)).toEqual({ ids: ["m1", "o1"], hote: [["o1", "m1"]], ids3d: ["m1", "o1"], epaisseur: 0.25, brut: expect.closeTo(4.5, 12), deduit: expect.closeTo(0.63, 12), net: expect.closeTo(3.87, 12) });
    const annule = undoStudioHistory(h);
    expect(annule.present).toEqual(d1);
    expect(etat(annule.present)).toEqual({ ids: ["m1", "o1"], hote: [["o1", "m1"]], ids3d: ["m1", "o1"], epaisseur: 0.2, brut: expect.closeTo(3.6, 12), deduit: expect.closeTo(0.504, 12), net: expect.closeTo(3.096, 12) });
    const retabli = redoStudioHistory(annule);
    expect(retabli.present).toEqual(d2);
    expect(etat(retabli.present)).toEqual(etat(d2));
  });
});
