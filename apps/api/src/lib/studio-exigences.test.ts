import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type ExigenceStudio, type StudioCommand } from "@parcours/atelier-model";
import {
  canonique, deciderAcceptation, deciderEdition, empreinte, rejeuAdmis, resultatControle, studioControleSchema, studioExigenceAcceptationSchema,
  studioExigencesEditionSchema, versionExaminee,
} from "./studio-exigences.js";

const exigence = (id: string, extra: Partial<ExigenceStudio> = {}): ExigenceStudio => ({
  id, libelle: `Exigence ${id}`, metrique: { type: "nombre", nature: "mur-architectural" }, comparaison: ">=", valeur: 1, unite: "u",
  source: "Programme saisi par le maître d’ouvrage", ...extra,
});
const document = () => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thickness: 0.2, height: 2.5, base: 0, justification: "center" } },
] as StudioCommand[]);

describe("Exigences Studio — règles pures du serveur", () => {
  it("schémas stricts : champ inconnu, version négative, identifiant invalide refusés", () => {
    expect(studioExigencesEditionSchema.safeParse({ baseVersion: 0, exigences: [] }).success).toBe(true);
    expect(studioExigencesEditionSchema.safeParse({ baseVersion: -1, exigences: [] }).success).toBe(false);
    expect(studioExigencesEditionSchema.safeParse({ baseVersion: 0, exigences: [], defaut: true }).success).toBe(false);
    expect(studioExigenceAcceptationSchema.safeParse({ baseVersion: 0, exigenceId: "e" }).success).toBe(false);
    expect(studioControleSchema.safeParse({ revisionId: "a b" }).success).toBe(false);
    expect(studioControleSchema.safeParse({}).success).toBe(true);
  });

  it("édition : version suivante en ajout seul, base exacte exigée, aucun jeu fourni par défaut", () => {
    expect(deciderEdition(null, { baseVersion: 0, exigences: [exigence("e1")] })).toEqual({ ok: { version: 1, exigences: [exigence("e1")] } });
    const v1 = { version: 1, exigences: [exigence("e1")] };
    expect(deciderEdition(v1, { baseVersion: 1, exigences: [exigence("e1", { valeur: 2 })] })).toEqual({ ok: { version: 2, exigences: [exigence("e1", { valeur: 2 })] } });
    expect(deciderEdition(v1, { baseVersion: 0, exigences: [] })).toMatchObject({ refus: { status: 409, body: { error: "version_perimee", currentVersion: 1 } } });
    expect(deciderEdition(v1, { baseVersion: 1, exigences: [exigence("e1")] })).toMatchObject({ refus: { status: 409, body: { error: "inchangee" } } });
    // Le jeu entrant n'est jamais modifié par la décision.
    expect(v1.exigences).toEqual([exigence("e1")]);
  });

  it("édition : exigence invalide → 400 avec le chemin ; acceptation forgée → 400", () => {
    expect(deciderEdition(null, { baseVersion: 0, exigences: [{ ...exigence("e1"), unite: "m" }] })).toMatchObject({ refus: { status: 400, body: { error: "invalid_input", path: "exigences[0].unite" } } });
    const forgee = exigence("p", { origine: { reference: "R-1", acceptation: { par: "u", le: "2026-10-19T08:00:00.000Z" } } });
    expect(deciderEdition(null, { baseVersion: 0, exigences: [forgee] })).toMatchObject({ refus: { status: 400, body: { error: "acceptation_forgee", exigenceId: "p" } } });
  });

  it("acceptation : compte et horloge du serveur, version suivante ; refus explicites", () => {
    const v1 = { version: 1, exigences: [exigence("p", { origine: { reference: "R-1" } }), exigence("e")] };
    const le = new Date("2026-10-19T09:30:00.000Z");
    const r = deciderAcceptation(v1, { baseVersion: 1, exigenceId: "p" }, { id: "u1", email: "proprio@exemple.fr" }, le);
    expect(r).toEqual({ ok: { version: 2, exigences: [exigence("p", { origine: { reference: "R-1", acceptation: { par: "u1", parEmail: "proprio@exemple.fr", le: "2026-10-19T09:30:00.000Z" } } }), exigence("e")] } });
    expect(deciderAcceptation(v1, { baseVersion: 1, exigenceId: "e" }, { id: "u1", email: "x" }, le)).toMatchObject({ refus: { status: 409, body: { error: "pas_une_reference" } } });
    expect(deciderAcceptation(v1, { baseVersion: 1, exigenceId: "z" }, { id: "u1", email: "x" }, le)).toMatchObject({ refus: { status: 404 } });
    expect(deciderAcceptation(null, { baseVersion: 1, exigenceId: "p" }, { id: "u1", email: "x" }, le)).toMatchObject({ refus: { status: 409, body: { error: "version_perimee" } } });
  });

  it("contrôle : version demandée ou courante ; résultat lié à la révision et à la version, conclusion seulement s'il a tourné", () => {
    expect(versionExaminee([1, 2, 3], undefined)).toEqual({ ok: 3 });
    expect(versionExaminee([1, 2, 3], 2)).toEqual({ ok: 2 });
    expect(versionExaminee([1], 4)).toMatchObject({ refus: { status: 404 } });
    expect(versionExaminee([], undefined)).toEqual({ ok: null });
    const fait = resultatControle("s", "r1", document(), { version: 2, exigences: [exigence("e1")] });
    expect(fait).toMatchObject({ execution: "execute", conclusion: "satisfaite", result: { studyId: "s", revisionId: "r1", version: 2 } });
    const sansJeu = resultatControle("s", "r1", document(), null);
    expect(sansJeu).toMatchObject({ execution: "non-execute", conclusion: null, result: { version: null, motifExecution: "aucun-jeu" } });
    const erreur = resultatControle("s", "r1", { cassé: true }, { version: 1, exigences: [exigence("e1")] });
    expect(erreur).toMatchObject({ execution: "erreur", conclusion: null });
  });

  it("empreintes canoniques et rejeu : même auteur et même contenu seulement", () => {
    expect(canonique({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(empreinte({ a: 1, b: 2 })).toBe(empreinte({ b: 2, a: 1 }));
    expect(rejeuAdmis({ authorId: "u", payloadHash: "h" }, "u", "h")).toBeNull();
    expect(rejeuAdmis({ authorId: "u", payloadHash: "h" }, "v", "h")).toMatchObject({ status: 409 });
    expect(rejeuAdmis({ authorId: "u", payloadHash: "h" }, "u", "k")).toMatchObject({ status: 409 });
  });
});
