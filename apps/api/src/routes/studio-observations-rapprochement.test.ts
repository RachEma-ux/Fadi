import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * EX-086 — réexamen des observations au contrôle d'une nouvelle révision (REF-02 w:p 820), côté serveur : routeur
 * Express réel, base simulée en mémoire (`testing/studio-base-simulee.ts`). « Un contrôle de nouvelle révision rapproche
 * les observations antérieures par identité/source/règle et produit un statut de suivi ; la fermeture automatique sur
 * simple disparition d'un objet est interdite. »
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import { studioObservationEvents, studioObservationReconciliations, studioObservations, studioVariants } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const tete = () => banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.headRevisionId as string;
let n = 0;
const commander = async (commands: StudioCommand[]) => {
  const r = await post("editeur", `${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: `rq-${++n}`, baseRevisionId: tete(), commands });
  expect(r.status).toBe(200);
  return tete();
};
const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } } as StudioCommand);
const observer = async (body: Record<string, unknown>) => {
  const r = await post("proprietaire", `${V}/observations`, { responsableId: "editeur", audience: "projet", ...body });
  expect(r.status).toBe(201);
  return r.body.commentId ?? r.body.id as string;
};
const statut = (id: string) => banc.lignes.get(studioObservations)!.find((o) => o.commentId === id)!.statut;

beforeEach(() => { initialiserProjet(); n = 0; });

describe("EX-086 — rapprochement des observations au contrôle d'une nouvelle révision (serveur)", () => {
  it("EX-086 [+] le contrôle de R(n+1) rapproche chaque observation par identité, source et règle et consigne un statut de suivi", async () => {
    const r2 = await commander([ligne("b", 1)]);
    // Exigence : au plus un objet (le document en porte deux : non satisfaite).
    expect((await post("proprietaire", `${S}/studies/s/exigences`, { baseVersion: 0, exigences: [{ id: "e1", libelle: "Au plus un objet", metrique: { type: "nombre" }, comparaison: "<=", valeur: 1, unite: "u", source: "Programme saisi (essai)" }] })).status).toBe(201);
    const regle = await observer({ body: "Trop d'objets", revisionId: r2, objectIds: ["a"], liens: [{ domaine: "exigence", ref: "e1" }] });
    const objet = await observer({ body: "Ligne b à reprendre", revisionId: r2, liens: [{ domaine: "objet", ref: "b", revisionId: r2 }] });
    const r3 = await commander([ligne("c", 2)]);
    const c = await post("editeur", `${V}/controles`, {});
    expect(c.status).toBe(201);
    const parObs = Object.fromEntries((c.body.rapprochements as { observationId: string; suivi: string; statut: string }[]).map((x) => [x.observationId, x]));
    expect(parObs[regle]).toEqual({ observationId: regle, suivi: "persiste", statut: "ouverte" });
    expect(parObs[objet]).toEqual({ observationId: objet, suivi: "a-recontroler", statut: "ouverte" });
    const consignes = banc.lignes.get(studioObservationReconciliations)!;
    expect(consignes.find((x) => x.observationId === regle)).toMatchObject({ revisionId: r3, checkId: c.body.id, suivi: "persiste", observationStatus: "ouverte",
      elements: [{ domaine: "ancrage", ref: "a", issue: "retrouve" }, { domaine: "exigence", ref: "e1", issue: "regle-non-satisfaite" }] });
    // Lecture : les rapprochements consignés de la variante.
    const l = await get("lecteur", `${V}/observations/rapprochements`);
    expect(l.status).toBe(200);
    expect(l.body.rapprochements.map((x: { observationId: string; suivi: string }) => [x.observationId, x.suivi]).sort()).toEqual([[objet, "a-recontroler"], [regle, "persiste"]].sort());
    // Un même rapprochement n'est consigné qu'une fois (rapprochement sur demande, même révision, même contrôle).
    const d = await post("editeur", `${V}/observations/rapprochements`, {});
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ revisionId: r3, checkId: c.body.id });
    expect(banc.lignes.get(studioObservationReconciliations)!).toHaveLength(2);
  });

  it("EX-086 [−] objet disparu de la nouvelle révision : observation marquée « objet-disparu », jamais close ni modifiée", async () => {
    const r2 = await commander([ligne("b", 1)]);
    const obs = await observer({ body: "Ligne b mal placée", revisionId: r2, objectIds: ["b"], liens: [{ domaine: "objet", ref: "b", revisionId: r2 }] });
    const journalAvant = banc.lignes.get(studioObservationEvents)!.filter((e) => e.observationId === obs).length;
    await commander([{ toolId: "studio.dessin.supprimer", params: { ids: ["b"] } } as StudioCommand]);
    const c = await post("proprietaire", `${V}/controles`, {});
    expect(c.status).toBe(201);
    expect(c.body.rapprochements).toEqual([{ observationId: obs, suivi: "objet-disparu", statut: "ouverte" }]);
    // Ni statut changé, ni passage ajouté au journal de l'observation : la résolution reste une décision explicite.
    expect(statut(obs)).toBe("ouverte");
    expect(banc.lignes.get(studioObservationEvents)!.filter((e) => e.observationId === obs)).toHaveLength(journalAvant);
    expect(banc.lignes.get(studioObservationReconciliations)![0]).toMatchObject({ suivi: "objet-disparu", observationStatus: "ouverte",
      elements: [{ domaine: "ancrage", ref: "b", issue: "disparu" }, { domaine: "objet", ref: "b", issue: "disparu" }] });
    // Sur la révision où l'objet existait encore, le même rapprochement le retrouve.
    const ancien = await post("editeur", `${V}/observations/rapprochements`, { revisionId: r2 });
    expect(ancien.body.resultats[0]).toMatchObject({ observationId: obs, suivi: "a-recontroler" });
    expect(statut(obs)).toBe("ouverte");
  });

  it("EX-086 [−] droits et portée : le lecteur ne rapproche pas ; une observation clôturée n'est pas rapprochée", async () => {
    await observer({ body: "Observation", objectIds: ["a"] });
    expect((await post("lecteur", `${V}/observations/rapprochements`, {})).status).toBe(403);
    expect((await post("etranger", `${V}/observations/rapprochements`, {})).status).toBe(404);
    expect((await post("editeur", `${V}/observations/rapprochements`, { revisionId: "inconnue" })).status).toBe(404);
    expect(banc.lignes.get(studioObservationReconciliations) ?? []).toEqual([]);
    // Observation clôturée (état posé directement) : aucun rapprochement.
    for (const o of banc.lignes.get(studioObservations)!) o.statut = "cloturee";
    const r = await post("editeur", `${V}/observations/rapprochements`, {});
    expect(r.body.resultats).toEqual([]);
  });
});
