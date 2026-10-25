import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { ApiError } from "../../../lib/api";
import { Traducteur } from "../../../lib/i18n/traduire";
import type { ObservationSuivie } from "./api-observations";
import {
  compterSuivi, dernierRapprochement, LIBELLE_SUIVI_RAPPROCHEMENT, libelleDecision, libelleLien, LIBELLE_DOMAINE, LIBELLE_FILTRE_SUIVI, LIBELLE_JOURNAL_TACHE, LIBELLE_PASSAGE_TACHE, LIBELLE_STATUT_TACHE, LIBELLE_VUE,
  lireRefus, optionsLien, passeFiltreSuivi, suiviPar,
} from "./suivi-ui";

const doc = applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thickness: 0.2, height: 2.5, base: 0, justification: "center" } },
] as StudioCommand[]);

const obs = (id: string, extra: Partial<ObservationSuivie> = {}): ObservationSuivie => ({
  id, authorId: "a", responsableId: "r", responsableEmail: "r@x", echeance: null, statut: "ouverte", correctionRevisionId: null, recontroleRevisionId: null,
  createdBy: "a", createdAt: "2026-10-19T08:00:00Z", updatedAt: "2026-10-19T08:00:00Z", journal: [], assignedToMe: false, possibles: [],
  body: "Remarque", authorEmail: "a@x", contexte: { projectId: "p", studyId: "s", variantId: "v", revisionId: null, objectIds: [] }, vue: null,
  liens: [], taches: [], decisions: [], peut: { lier: false, creerTache: false, proposer: false, decider: false }, ...extra,
});
const tache = (assignedToMe: boolean, statut: "a-faire" | "faite" | "annulee") => ({
  id: "t", libelle: "x", assigneeId: "u", assigneeEmail: "u@x", echeance: null, statut, createdBy: "o", createdAt: "", updatedAt: "", journal: [], assignedToMe, possibles: [],
});

describe("Observations Studio — suivi (affichage pur)", () => {
  it("identité réemployée : l'observation qui suit un élément de domaine est retrouvée", () => {
    const list = [obs("o1", { liens: [{ id: "l", domaine: "exigence", ref: "e1", revisionId: null, controleId: null, createdBy: "a", createdAt: "" }] }), obs("o2")];
    expect(suiviPar(list, "exigence", "e1")?.id).toBe("o1");
    expect(suiviPar(list, "objet", "e1")).toBeNull();
    expect(suiviPar(list, "exigence", "e2")).toBeNull();
  });

  it("filtres : mes tâches à faire, ouvertes, à clôturer (recontrôlée)", () => {
    const list = [obs("o1", { taches: [tache(true, "a-faire")] }), obs("o2", { statut: "recontrolee", taches: [tache(true, "faite")] }), obs("o3", { statut: "rouverte" })];
    expect(compterSuivi(list)).toEqual({ toutes: 3, "mes-taches": 1, ouvertes: 2, "a-cloturer": 1 });
    expect(passeFiltreSuivi(list[1]!, "mes-taches")).toBe(false);
  });

  it("éléments proposés : objets sélectionnés de la révision, leurs lignes de métré, exigences et publications fournies ; rien d'inventé", () => {
    const s = { revision: doc, selection: ["m1", "absent"], exigences: [{ id: "e1", libelle: "Murs" }], publications: [{ id: "p1", title: "Dossier" }] };
    expect(optionsLien("objet", s)).toEqual([{ ref: "m1", libelle: "m1" }]);
    const metre = optionsLien("metre", s);
    expect(metre.length).toBeGreaterThan(0);
    expect(metre.every((o) => o.ref.startsWith("m1#"))).toBe(true);
    expect(optionsLien("exigence", s)).toEqual([{ ref: "e1", libelle: "Murs (e1)" }]);
    expect(optionsLien("revue", s)).toEqual([{ ref: "p1", libelle: "Dossier" }]);
    expect(optionsLien("metre", { ...s, selection: [] })).toEqual([]);
    expect(libelleLien("metre", "m1#surface")).toBe("Ligne de métré : m1 · Surface");
    expect(libelleLien("objet", "m1")).toBe("Objet du modèle : m1");
  });

  it("refus : message du serveur ; observation à réemployer quand l'élément est déjà suivi", () => {
    expect(lireRefus(new ApiError(409, "deja_suivie", "Déjà suivi", { observationId: "o1" }), "x")).toEqual({ message: "Déjà suivi", observationId: "o1" });
    expect(lireRefus(new ApiError(403, "forbidden", null, null), "Refusé")).toEqual({ message: "Refusé", observationId: null });
    expect(lireRefus(new TypeError("réseau"), "x").observationId).toBeNull();
  });

  it("libellés traduits en anglais (dictionnaire de l'interface)", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const libelles = [
      ...Object.values(LIBELLE_DOMAINE), ...Object.values(LIBELLE_VUE), ...Object.values(LIBELLE_STATUT_TACHE), ...Object.values(LIBELLE_PASSAGE_TACHE),
      ...Object.values(LIBELLE_JOURNAL_TACHE), ...Object.values(LIBELLE_FILTRE_SUIVI),
      libelleDecision({ nature: "decision", portee: "cloture" }), libelleDecision({ nature: "decision", portee: "autre" }),
      libelleDecision({ nature: "proposition", portee: "cloture" }), libelleDecision({ nature: "proposition", portee: "autre" }),
    ];
    // Un libellé identique dans les deux langues (« Plan ») doit tout de même figurer au dictionnaire.
    for (const l of libelles) expect(l in dico || t.traduire(l) !== l, l).toBe(true);
  });
});

describe("EX-086 — suivi des rapprochements (affichage)", () => {
  const r = (id: string, observationId: string, createdAt: string, suivi: "objet-disparu" | "persiste" | "a-recontroler" | "non-rapprochable") =>
    ({ id, observationId, revisionId: "r", checkId: null, observationStatus: "ouverte", suivi, elements: [], actor: { id: "a", email: "a@x.test" }, createdAt });
  it("EX-086 [+] le dernier rapprochement de chaque observation est affiché ; un objet disparu n'est jamais présenté comme une clôture", () => {
    const m = dernierRapprochement([r("1", "o1", "2026-10-25T08:00:00.000Z", "a-recontroler"), r("2", "o1", "2026-10-25T09:00:00.000Z", "objet-disparu"), r("3", "o2", "2026-10-25T08:30:00.000Z", "persiste")]);
    expect([...m.entries()].map(([k, v]) => [k, v.suivi])).toEqual([["o1", "objet-disparu"], ["o2", "persiste"]]);
    for (const l of Object.values(LIBELLE_SUIVI_RAPPROCHEMENT)) expect(l.toLowerCase()).not.toMatch(/clôtur|\bclos|\bfermé/);
    const t = new Traducteur(dico as Record<string, string>);
    for (const l of [...Object.values(LIBELLE_SUIVI_RAPPROCHEMENT), "Rapprocher avec la révision courante", "Rapprochement refusé par le serveur.",
      "2 observation(s) rapprochée(s) avec la révision 89abcdef ; 1 avec un objet disparu (aucune n’est close)."]) expect(t.traduire(l), l).not.toBe(l);
  });
});
