import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { quantitesStudio } from "./quantites.js";
import { rapprocherObservations, type ObservationARapprocher } from "./rapprochement-observations.js";

/** EX-086 — réexamen des observations à la nouvelle révision (REF-02 w:p 820). */
const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 4, y } } } as StudioCommand);
const r12: StudioDocument = applyStudioCommands(newStudioDocument("doc"), [ligne("a", 0), ligne("b", 1)]);
const r13: StudioDocument = applyStudioCommands(r12, [{ toolId: "studio.dessin.supprimer", params: { ids: ["b"] } } as StudioCommand]);
const grandeurA = quantitesStudio(r13).objets.find((o) => o.objetId === "a")!.valeurs[0]!.grandeur;
const obs = (over: Partial<ObservationARapprocher> = {}): ObservationARapprocher => ({ id: "o1", statut: "ouverte", objectIds: [], liens: [], ...over });
const controle = (statut: "satisfaite" | "non-satisfaite" | "non-evaluee", revisionId = "r13") => ({
  id: "c13", result: { revisionId, execution: "execute" as const, ecarts: [{ exigenceId: "EXI-1", statut, comparaison: "<=" as const, valeurExigee: 1, unite: "m" }] },
});

describe("EX-086 — rapprochement des observations (modèle)", () => {
  it("EX-086 [+] rapproche par identité (ancrage, objet), source (métré) et règle (exigence) et produit un statut de suivi", () => {
    const [persiste] = rapprocherObservations([obs({ objectIds: ["a"], liens: [{ domaine: "exigence", ref: "EXI-1" }] })], { id: "r13", document: r13 }, controle("non-satisfaite"));
    expect(persiste).toEqual({
      observationId: "o1", statut: "ouverte", revisionId: "r13", controleId: "c13", suivi: "persiste",
      elements: [{ domaine: "ancrage", ref: "a", issue: "retrouve" }, { domaine: "exigence", ref: "EXI-1", issue: "regle-non-satisfaite" }],
    });
    const [corrigee] = rapprocherObservations([obs({ statut: "corrigee", liens: [{ domaine: "objet", ref: "a" }, { domaine: "metre", ref: `a#${grandeurA}` }, { domaine: "exigence", ref: "EXI-1" }] })], { id: "r13", document: r13 }, controle("satisfaite"));
    // Règle satisfaite : le suivi demande un recontrôle humain, jamais une clôture.
    expect(corrigee).toMatchObject({ statut: "corrigee", suivi: "a-recontroler" });
    expect(corrigee!.elements.map((e) => e.issue)).toEqual(["retrouve", "retrouve", "regle-satisfaite"]);
  });

  it("EX-086 [−] objet disparu de la nouvelle révision : observation marquée « objet-disparu », statut inchangé (aucune fermeture automatique)", () => {
    const entrees = [
      obs({ id: "ancre", objectIds: ["b"] }),
      obs({ id: "objet", statut: "rouverte", liens: [{ domaine: "objet", ref: "b" }] }),
      obs({ id: "metre", liens: [{ domaine: "metre", ref: `b#${grandeurA}` }] }),
      // L'exigence est satisfaite, mais l'objet suivi a disparu : la disparition l'emporte.
      obs({ id: "mixte", statut: "recontrolee", objectIds: ["b"], liens: [{ domaine: "exigence", ref: "EXI-1" }] }),
    ];
    const out = rapprocherObservations(entrees, { id: "r13", document: r13 }, controle("satisfaite"));
    expect(out.map((r) => [r.observationId, r.statut, r.suivi])).toEqual([
      ["ancre", "ouverte", "objet-disparu"], ["objet", "rouverte", "objet-disparu"], ["metre", "ouverte", "objet-disparu"], ["mixte", "recontrolee", "objet-disparu"],
    ]);
    for (const [i, r] of out.entries()) expect(r.statut).toBe(entrees[i]!.statut);
    // Le même objet présent en R12 : retrouvé.
    expect(rapprocherObservations([entrees[0]!], { id: "r12", document: r12 }, null)[0]!.suivi).toBe("a-recontroler");
  });

  it("EX-086 [−] sans contrôle de CETTE révision, la règle n'est pas réexaminée (jamais supposée satisfaite) ; une observation clôturée n'est pas rapprochée", () => {
    const o = obs({ liens: [{ domaine: "exigence", ref: "EXI-1" }] });
    expect(rapprocherObservations([o], { id: "r13", document: r13 }, null)[0]).toMatchObject({ controleId: null, suivi: "a-recontroler", elements: [{ issue: "regle-non-reexaminee" }] });
    // Contrôle d'une autre révision : ignoré pour la règle.
    expect(rapprocherObservations([o], { id: "r13", document: r13 }, controle("non-satisfaite", "r12"))[0]).toMatchObject({ controleId: null, elements: [{ issue: "regle-non-reexaminee" }] });
    // Exigence absente du contrôle : non réexaminée.
    expect(rapprocherObservations([obs({ liens: [{ domaine: "exigence", ref: "EXI-9" }] })], { id: "r13", document: r13 }, controle("non-satisfaite"))[0]!.elements[0]!.issue).toBe("regle-non-reexaminee");
    expect(rapprocherObservations([obs({ statut: "cloturee", objectIds: ["b"] })], { id: "r13", document: r13 }, null)).toEqual([]);
    // Aucun élément identifiable (lien de revue seul) : non rapprochable.
    expect(rapprocherObservations([obs({ liens: [{ domaine: "revue", ref: "pub1" }] })], { id: "r13", document: r13 }, null)[0]!.suivi).toBe("non-rapprochable");
  });
});
