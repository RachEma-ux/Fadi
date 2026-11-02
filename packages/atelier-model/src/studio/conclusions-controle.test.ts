/**
 * EX-068 — conclusion normative d'un contrôle (lot PUB) : conforme, non conforme, non testé, non applicable justifié
 * (justification vérifiable) ; « en attente », « délai dépassé » et « échec technique » ne sont jamais conformes.
 * Exigences et document synthétiques de recette.
 */
import { describe, expect, it } from "vitest";
import { controlerExigences } from "./composition/ecarts.js";
import { conclureControle, conclusionDemande, estConforme, etatDemandeControle, verifierJustification, type JustificationNonApplicable } from "./conclusions-controle.js";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "./document-2d.js";
import type { ExigenceStudio, JeuExigences } from "./exigences/exigences.js";

const doc = applyStudioCommands(newStudioDocument("ctl"), [
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: 2, height: 1 } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
] as StudioCommand[]);
const ex = (id: string, over: Partial<ExigenceStudio>): ExigenceStudio => ({ id, libelle: id, metrique: { type: "total", grandeur: "surface" }, comparaison: "<=", valeur: 10, unite: "m2", source: "recette", ...over });
const jeu = (exigences: ExigenceStudio[], version = 2): JeuExigences => ({ studyId: "e1", version, exigences, auteur: "u_1", creeLe: "2026-10-25T08:00:00.000Z" });
const just = (over: Partial<JustificationNonApplicable> = {}): JustificationNonApplicable => ({ exigenceId: "e-long", version: 2, motif: "Sans objet : aucun garde-corps dans ce lot", auteur: "u_2", date: "2026-10-25T09:00:00.000Z", ...over });

describe("EX-068 — conclusions normatives", () => {
  it("EX-068 [+] un contrôle exécuté conclut conforme, non conforme, non testé ou non applicable justifié", () => {
    const j = jeu([ex("e-surf", {}), ex("e-long", { metrique: { type: "total", grandeur: "longueur" }, valeur: 1, unite: "m" }), ex("e-vol", { metrique: { type: "total", grandeur: "volume" }, unite: "m3" })]);
    const r = controlerExigences("e1", "rev-1", doc, j);
    const sans = conclureControle(r, j);
    expect(sans.exigences.map((e) => [e.exigenceId, e.conclusion])).toEqual([["e-surf", "conforme"], ["e-long", "non-conforme"], ["e-vol", "non-teste"]]);
    expect(sans.conclusion).toBe("non-conforme");
    const avec = conclureControle(r, j, [just()]);
    expect(avec.exigences[1]).toMatchObject({ exigenceId: "e-long", statutMesure: "non-satisfaite", conclusion: "non-applicable-justifie", justification: just() });
    expect(avec.conclusion).toBe("non-teste");
    const jConf = jeu([ex("e-surf", {})]);
    expect(conclureControle(controlerExigences("e1", "rev-1", doc, jConf), jConf).conclusion).toBe("conforme");
    const jNa = jeu([ex("e-long", { metrique: { type: "total", grandeur: "longueur" }, valeur: 1, unite: "m" })]);
    expect(conclureControle(controlerExigences("e1", "rev-1", doc, jNa), jNa, [just()]).conclusion).toBe("non-applicable-justifie");
  });

  it("EX-068 [+] la justification « non applicable » est vérifiable : exigence de la version examinée, motif, auteur, date", () => {
    const j = jeu([ex("e-long", { metrique: { type: "total", grandeur: "longueur" }, valeur: 1, unite: "m" })]);
    expect(verifierJustification(just(), j)).toBeNull();
    expect(verifierJustification(just({ exigenceId: "absente" }), j)).toBe("exigence-inconnue");
    expect(verifierJustification(just({ version: 1 }), j)).toBe("version-differente");
    expect(verifierJustification(just({ motif: " " }), j)).toBe("motif-obligatoire");
    expect(verifierJustification(just({ auteur: "" }), j)).toBe("auteur-obligatoire");
    expect(verifierJustification(just({ date: "hier" }), j)).toBe("date-invalide");
    const r = conclureControle(controlerExigences("e1", "rev-1", doc, j), j, [just({ motif: "" })]);
    expect(r.exigences[0]).toMatchObject({ conclusion: "non-conforme", justificationRefusee: "motif-obligatoire" });
    expect(r.conclusion).toBe("non-conforme");
  });

  it("EX-068 [−] en attente, délai dépassé ou échec technique : jamais conforme, aucune conclusion", () => {
    const d = { id: "d1", revisionId: "rev-1", demandeLe: "2026-10-25T10:00:00.000Z", delaiMs: 60_000 };
    const j = jeu([ex("e-surf", {})]);
    const attente = conclusionDemande(d, null, j, new Date("2026-10-25T10:00:30.000Z"));
    expect(attente).toMatchObject({ execution: "en-attente", conclusion: null });
    const depasse = conclusionDemande(d, null, j, new Date("2026-10-25T10:01:01.000Z"));
    expect(depasse).toMatchObject({ execution: "delai-depasse", conclusion: null });
    const echec = conclusionDemande(d, controlerExigences("e1", "rev-1", { illisible: true }, j), j, new Date("2026-10-25T10:00:10.000Z"));
    expect(echec).toMatchObject({ execution: "echec-technique", conclusion: null });
    for (const c of [attente, depasse, echec]) expect(estConforme(c)).toBe(false);
    expect(etatDemandeControle(d, controlerExigences("e1", "rev-1", doc, null), new Date())).toBe("non-execute");
    const ok = conclusionDemande(d, controlerExigences("e1", "rev-1", doc, j), j, new Date("2026-10-25T10:00:10.000Z"));
    expect(estConforme(ok)).toBe(true);
  });
});
