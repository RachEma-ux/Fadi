import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * B.2-07 / TEST-019 — un changement de profil (standard → métier → personnel, favoris, regroupements) ne modifie ni la
 * géométrie, ni la révision, ni les droits, sur un document **non vide** (lignes, rectangle extrudé, mur et ouverture
 * enregistrés par le propriétaire avant les changements de profil), pour un lecteur comme pour un éditeur. Routeur
 * Express réel, base simulée en mémoire (même banc que `studio-invariants.test.ts`).
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
import { STUDIO_CONTRACT, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";
import { studioRevisions, studioToolPreferences, studioVariants } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use(express.json());
app.use("/projects/:projectId/studio", studioRouter);

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const enveloppe = (requestId: string, baseRevisionId: string, commands: StudioCommand[]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands });
const tete = () => banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.headRevisionId as string;
const documentTete = () => structuredClone(banc.lignes.get(studioRevisions)!.find((r) => r.id === tete())!.document) as { objects: unknown[]; architecture?: unknown[] };
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const put = (a: Acteur, body: unknown) => request(app).put(`${S}/preferences/outils`).set("x-acteur", a).send(body as object);
const commander = (a: Acteur, e: StudioEnvelope) => request(app).post(`${V}/commands`).set("x-acteur", a).send(e);

const DESSIN: StudioCommand[] = [
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 2 }, end: { x: 5, y: 2 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r2", type: "rectangle", origin: { x: 1, y: 4 }, width: 3, height: 2 } },
  { toolId: "studio.objet.extruder", params: { ids: ["r2"], base: 0, height: 2.5 } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 10 }, { x: 6, y: 10 }], thickness: 0.2, height: 2.7, base: 0, justification: "center" } },
  { toolId: "studio.architecture.ouverture", params: { id: "o1", type: "opening", hostId: "m1", position: 2, width: 0.9, height: 2.1, sill: 0 } },
];

const PROFILS = [
  { profil: "metier:esquisse-2d", favoris: [], personnel: [] },
  { profil: "metier:cotation", favoris: ["studio.dessin.cote"], personnel: [] },
  { profil: "metier:volume", favoris: ["studio.objet.extruder"], personnel: [] },
  { profil: "personnel", favoris: ["studio.dessin.ligne"], personnel: ["studio.dessin.ligne", "studio.dessin.supprimer"], groupes: [{ id: "plans", nom: "Plans", outils: ["studio.dessin.ligne"] }] },
  { profil: "standard", favoris: [], personnel: [] },
];

beforeEach(initialiserProjet);

describe("B.2-07 / TEST-019 — changer de profil sur un document non vide", () => {
  it("lecteur et éditeur : standard → métier → personnel → standard ; géométrie, tête, révisions et catalogue autorisé inchangés, droits réels intacts", async () => {
    const pose = await commander("proprietaire", enveloppe("b207-dessin", tete(), DESSIN));
    expect(pose.status, JSON.stringify(pose.body)).toBe(200);
    const docAvant = documentTete();
    // Le contrôle porte sur une géométrie réelle : ligne initiale, ligne, rectangle extrudé, mur et son ouverture.
    expect(docAvant.objects.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(docAvant)).toContain('"extrusion"');
    expect(docAvant.architecture?.length).toBe(2);
    const teteAvant = tete();
    const revisionsAvant = structuredClone(banc.lignes.get(studioRevisions));
    const catalogues = { lecteur: (await get("lecteur", `${S}/preferences/catalogue`)).body, editeur: (await get("editeur", `${S}/preferences/catalogue`)).body };
    expect(catalogues.editeur.entrees.some((e: { autorise: boolean }) => e.autorise)).toBe(true);
    expect(catalogues.lecteur).not.toEqual(catalogues.editeur);

    for (const acteur of ["lecteur", "editeur"] as const) {
      for (const p of PROFILS) {
        const r = await put(acteur, p);
        expect(r.status, `${acteur} ${p.profil} ${JSON.stringify(r.body)}`).toBe(200);
        expect(tete(), `${acteur} ${p.profil}`).toBe(teteAvant);
        expect(documentTete(), `${acteur} ${p.profil}`).toEqual(docAvant);
        expect((await get(acteur, `${S}/preferences/catalogue`)).body, `${acteur} ${p.profil}`).toEqual(catalogues[acteur]);
      }
    }
    expect(banc.lignes.get(studioRevisions)).toEqual(revisionsAvant);
    expect(banc.lignes.get(studioToolPreferences)).toHaveLength(2);

    // Droits réels après les changements de profil : l'éditeur écrit toujours, le lecteur est toujours refusé.
    const refus = await commander("lecteur", enveloppe("b207-lecteur", teteAvant, [{ toolId: "studio.dessin.supprimer", params: { ids: ["l2"] } }]));
    expect(refus.status).toBe(403);
    expect(tete()).toBe(teteAvant);
    const ecrit = await commander("editeur", enveloppe("b207-editeur", teteAvant, [{ toolId: "studio.dessin.deplacer", params: { id: "l2", dx: 0, dy: 1 } }]));
    expect(ecrit.status, JSON.stringify(ecrit.body)).toBe(200);
    expect(tete()).not.toBe(teteAvant);
  });
});
