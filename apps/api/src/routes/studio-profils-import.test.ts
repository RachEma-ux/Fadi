import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Profils d'outils persistants, exportés et importés — routeur Studio réel sur la base simulée en mémoire
 * (`testing/studio-base-simulee.ts`, aucune base ni réseau) :
 * - TR-EX-034 / EX-034 — profileId, propriétaire, version, ordre des capacités, raccourcis personnels ; relu dans une
 *   autre session ; conflits de raccourcis détectés à l'import, explicités, résolus sans effacer la configuration source ;
 * - TR-EX-033 / EX-033 et TR-INV-009 / INV-009 — importer un profil ne confère aucune permission : un profil importé
 *   contenant « Publier » sans le droit de publier est refusé, rien n'est écrit ; un profil ne change ni données, ni
 *   droits, ni révision de conception.
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
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { studioRouter } from "./studio.js";
import { initialiserProjet, instantane } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
const P = "/projects/p/studio/preferences/outils";
const V = "/projects/p/studio/studies/s/variants/v";
const comme = (acteur: string) => ({
  get: (url: string) => request(app).get(url).set("x-acteur", acteur),
  put: (url: string, corps: object) => request(app).put(url).set("x-acteur", acteur).send(corps),
  post: (url: string, corps: object) => request(app).post(url).set("x-acteur", acteur).send(corps),
});
const fichier = (extra: Record<string, unknown> = {}) => ({
  format: "fadi-studio-profil/1", profileId: "studio_profil_source", version: 4, profil: "personnel",
  favoris: ["studio.dessin.ligne"], personnel: ["studio.dessin.ligne", "studio.dessin.cote"], groupes: [{ id: "cotes", nom: "Cotes", outils: ["studio.dessin.cote"] }],
  ordre: ["studio.dessin.cote", "studio.dessin.ligne"], raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M" }, ...extra,
});

beforeEach(initialiserProjet);

describe("TR-EX-034 — profil persistant : profileId, propriétaire, version, ordre, raccourcis", () => {
  it("enregistrer un profil avec ordre et raccourcis puis le rouvrir dans une autre session : même profileId, propriétaire, version croissante", async () => {
    const a = comme("editeur");
    const r1 = await a.put(P, { profil: "personnel", favoris: [], personnel: ["studio.dessin.ligne"], ordre: ["studio.dessin.ligne", "studio.dessin.selection"], raccourcis: { "studio.dessin.ligne": "Ctrl+Shift+M" } });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ proprietaire: "editeur", version: 1, ordre: ["studio.dessin.ligne", "studio.dessin.selection"], raccourcis: { "studio.dessin.ligne": "Ctrl+Shift+M" } });
    expect(r1.body.profileId).toMatch(/^studio_profil/);
    // Autre session (nouvelle requête, rien en mémoire côté client) : relu tel quel.
    const relu = await comme("editeur").get(P);
    expect(relu.body).toMatchObject({ profileId: r1.body.profileId, proprietaire: "editeur", version: 1, raccourcis: { "studio.dessin.ligne": "Ctrl+Shift+M" } });
    // Un PUT sans raccourcis ni ordre les garde ; la version avance, l'identifiant ne change pas.
    const r2 = await a.put(P, { profil: "standard", favoris: [], personnel: [] });
    expect(r2.body).toMatchObject({ profileId: r1.body.profileId, version: 2, ordre: ["studio.dessin.ligne", "studio.dessin.selection"], raccourcis: { "studio.dessin.ligne": "Ctrl+Shift+M" } });
    const exporte = await a.get(`${P}/export`);
    expect(exporte.body).toMatchObject({ format: "fadi-studio-profil/1", profileId: r1.body.profileId, proprietaire: "editeur", version: 2 });
  });

  it("import par un autre compte : le compte importateur devient propriétaire, la provenance est gardée, la version est la sienne", async () => {
    const r = await comme("lecteur").post(`${P}/import`, { profil: fichier() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ proprietaire: "lecteur", version: 1, importeDe: "studio_profil_source@4", profil: "personnel", ordre: ["studio.dessin.cote", "studio.dessin.ligne"], raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M" }, ecartes: [] });
    expect(r.body.profileId).not.toBe("studio_profil_source");
  });

  it("cas négatif : deux raccourcis en conflit (doublon, raccourci natif d'un autre outil) → 409, conflits explicités, rien d'écrit, fichier source intact ; « écarter » importe le reste", async () => {
    const a = comme("editeur");
    await a.put(P, { profil: "standard", favoris: ["studio.dessin.arc"], personnel: [] });
    const avant = instantane();
    const source = fichier({ raccourcis: { "studio.dessin.cote": "Ctrl+Shift+M", "studio.dessin.ligne": "Ctrl+Shift+M", "studio.dessin.arc": "R" } });
    const copie = JSON.stringify(source);
    const r = await a.post(`${P}/import`, { profil: source });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "shortcut_conflict" });
    expect(r.body.conflits).toEqual([
      { raccourci: "Ctrl+Shift+M", capacite: "studio.dessin.ligne", type: "doublon", avec: "studio.dessin.cote" },
      { raccourci: "R", capacite: "studio.dessin.arc", type: "registre", avec: "studio.dessin.rectangle" },
    ]);
    expect(instantane()).toBe(avant);
    expect((await a.get(P)).body).toMatchObject({ favoris: ["studio.dessin.arc"], version: 1 });
    // Résolution explicite : tout est importé sauf les raccourcis en conflit, rendus ; le fichier n'est pas modifié.
    const ok = await a.post(`${P}/import`, { profil: source, resolution: "ecarter" });
    expect(ok.status).toBe(200);
    expect(ok.body.raccourcis).toEqual({ "studio.dessin.cote": "Ctrl+Shift+M" });
    expect(ok.body.ecartes.map((c: { capacite: string }) => c.capacite)).toEqual(["studio.dessin.ligne", "studio.dessin.arc"]);
    expect(ok.body.version).toBe(2);
    expect(JSON.stringify(source)).toBe(copie);
    // Un enregistrement direct en conflit est refusé de la même façon.
    expect((await a.put(P, { profil: "standard", favoris: [], personnel: [], raccourcis: { "studio.dessin.ligne": "C" } })).status).toBe(409);
  });
});

describe("TR-EX-033 / TR-INV-009 — importer un profil ne confère aucune permission", () => {
  it("profil importé contenant « Publier » sans le droit de publier (éditeur, lecteur) : refusé 403, rien n'est écrit ; le propriétaire, qui publie, l'importe", async () => {
    const avecPublier = fichier({ ordre: ["studio.publication.publier", "studio.dessin.ligne"], raccourcis: { "studio.publication.publier": "Ctrl+Shift+9" } });
    for (const acteur of ["editeur", "lecteur"]) {
      const avant = instantane();
      const r = await comme(acteur).post(`${P}/import`, { profil: avecPublier });
      expect(r.status).toBe(403);
      expect(r.body).toMatchObject({ error: "permission_non_conferee", capacites: ["studio.publication.publier"] });
      expect(instantane()).toBe(avant);
      expect((await comme(acteur).put(P, { profil: "standard", favoris: [], personnel: [], ordre: ["studio.publication.publier"] })).status).toBe(403);
    }
    expect((await comme("proprietaire").post(`${P}/import`, { profil: avecPublier })).status).toBe(200);
  });

  it("INV-009 : un lecteur importe un profil qui montre la Ligne — préférences changées, mais ni données, ni droits, ni révision : ses commandes restent refusées", async () => {
    const tete = (await comme("lecteur").get(V)).body.revision.id;
    const r = await comme("lecteur").post(`${P}/import`, { profil: fichier() });
    expect(r.status).toBe(200);
    const commande = await comme("lecteur").post(`${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "inv9", baseRevisionId: tete, commands: [{ toolId: "studio.dessin.ligne", params: { id: "z", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] });
    expect(commande.status).toBe(403);
    expect((await comme("lecteur").get(V)).body.revision.id).toBe(tete);
    const catalogue = await comme("lecteur").get("/projects/p/studio/preferences/catalogue");
    expect(catalogue.body.droits).toMatchObject({ ecriture: false });
    expect(catalogue.body.entrees.find((e: { toolId: string }) => e.toolId === "studio.dessin.ligne")).toMatchObject({ autorise: false });
  });

  it("fichier forgé : format inconnu ou capacité hors registre → refusé, rien n'est écrit", async () => {
    const avant = instantane();
    expect((await comme("editeur").post(`${P}/import`, { profil: { ...fichier(), format: "autre/1" } })).status).toBe(400);
    const r = await comme("editeur").post(`${P}/import`, { profil: fichier({ ordre: ["studio.inexistant"] }) });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: "unknown_tool", tools: ["studio.inexistant"] });
    expect(instantane()).toBe(avant);
  });
});
