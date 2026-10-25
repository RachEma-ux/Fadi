import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * G1-03 — tests fonctionnels des quatre routes de lecture que seule la matrice des droits X.2-02 exerçait :
 * `GET /dossiers` (dossiers de conception du projet), `GET …/controles/:checkId` (un contrôle d'exigences),
 * `GET …/modeles-externes/:modelId` (un modèle externe reçu, avec son journal) et `GET …/modeles-externes/:modelId/contenu`
 * (le fichier reçu tel quel). Routeur Express réel, base simulée en mémoire (`testing/studio-base-simulee.ts`) : la
 * ressource est créée par sa route d'écriture, puis relue ; la lecture rend exactement ce qui a été écrit, et refuse sans
 * fuite le non-membre, l'étude ou la variante d'un autre projet et l'identifiant inconnu (404), sans rien écrire.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { studioExternalModels, studioRequirementChecks } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
/** Une lecture refusée n'écrit rien. */
const refuseSansEcrire = async (a: Acteur, url: string) => {
  const avant = instantane();
  const r = await get(a, url);
  expect(r.status, url).toBe(404);
  expect(instantane()).toBe(avant);
  return r;
};

const IFC = readFileSync(new URL("../../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const reception = { reference: "Architecte — bâtiment A", auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B", uniteDeclaree: "mm", transformation: null, nomFichier: "recette.ifc", contenu: IFC };
const exigence = { id: "e1", libelle: "Au plus dix objets", metrique: { type: "nombre" }, comparaison: "<=", valeur: 10, unite: "u", source: "Programme saisi (essai)" };

const AUTRE = "autre" as Acteur;
const Q = "/projects/q/studio";
const VQ = `${Q}/studies/sq/variants/vq`;
const feuilleDe = async (a: Acteur, v: string) => {
  const f = await post(a, `${v}/sheets`, { number: "A-01", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" });
  expect(f.status).toBe(201);
  return f.body.id as string;
};

beforeEach(initialiserProjet);

describe("GET /dossiers — dossiers de conception du projet (G1-03)", () => {
  it("G1-03 [+] GET /dossiers : le dossier composé est relu tel que créé, avec son étude, ses feuilles, son empreinte et ses sources", async () => {
    expect((await get("lecteur", `${S}/dossiers`)).body).toEqual({ dossiers: [] });
    const f = await feuilleDe("proprietaire", V);
    const d = await post("proprietaire", `${S}/studies/s/dossiers`, { title: "Dossier d'essai", sheetIds: [f] });
    expect(d.status).toBe(201);
    const l = await get("lecteur", `${S}/dossiers`);
    expect(l.status).toBe(200);
    expect(l.body.dossiers).toHaveLength(1);
    const { replayed: _r, ...cree } = d.body;
    const lu = l.body.dossiers[0];
    expect(lu).toMatchObject({ ...cree, studyName: "Étude", sheetCount: 1, error: null });
    expect(lu.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(lu.sources).toEqual([expect.objectContaining({ studyId: "s", variantId: "v", revisionId: "r1" })]);
  });

  it("G1-03 [−] GET /dossiers : un dossier d'un autre projet n'apparaît pas ; non-membre et projet d'autrui → 404, rien d'écrit", async () => {
    const f = await feuilleDe(AUTRE, VQ);
    expect((await post(AUTRE, `${Q}/studies/sq/dossiers`, { title: "Dossier de q", sheetIds: [f] })).status).toBe(201);
    expect((await get("proprietaire", `${S}/dossiers`)).body).toEqual({ dossiers: [] });
    await refuseSansEcrire("etranger", `${S}/dossiers`);
    await refuseSansEcrire("proprietaire", `${Q}/dossiers`);
  });
});

describe("GET …/controles/:checkId — un contrôle d'exigences (G1-03)", () => {
  it("G1-03 [+] GET …/controles/:checkId : le contrôle consigné est relu à l'identique (révision, version, conclusion, écarts, empreinte du document)", async () => {
    expect((await post("proprietaire", `${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] })).status).toBe(201);
    const c = await post("editeur", `${V}/controles`, {});
    expect(c.status).toBe(201);
    const l = await get("lecteur", `${V}/controles/${c.body.id}`);
    expect(l.status).toBe(200);
    // La réponse de création porte en plus `replayed` et les rapprochements du contrôle (EX-086) ; le reste est identique.
    const { replayed: _r, rapprochements: _rp, ...cree } = c.body;
    expect(l.body).toEqual(cree);
    expect(l.body).toMatchObject({ studyId: "s", variantId: "v", revisionId: "r1", version: 1, conclusion: "satisfaite", auteur: "editeur" });
    expect(l.body.resultat.ecarts).toEqual([expect.objectContaining({ exigenceId: "e1", statut: "satisfaite", mesure: { valeur: 1, unite: "u" } })]);
    expect(banc.lignes.get(studioRequirementChecks)).toHaveLength(1);
  });

  it("G1-03 [−] GET …/controles/:checkId : identifiant inconnu, contrôle d'une autre variante, non-membre, étude d'un autre projet → 404, rien d'écrit", async () => {
    expect((await post("proprietaire", `${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] })).status).toBe(201);
    const c = await post("editeur", `${V}/controles`, {});
    expect(c.status).toBe(201);
    await refuseSansEcrire("lecteur", `${V}/controles/inconnu`);
    await refuseSansEcrire("etranger", `${V}/controles/${c.body.id}`);
    await refuseSansEcrire("proprietaire", `${S}/studies/sq/variants/vq/controles/${c.body.id}`);
    await refuseSansEcrire("proprietaire", `${S}/studies/s/variants/vq/controles/${c.body.id}`);
    await refuseSansEcrire(AUTRE, `${VQ}/controles/${c.body.id}`);
  });
});

describe("GET …/modeles-externes/:modelId et /contenu (G1-03)", () => {
  it("G1-03 [+] GET …/modeles-externes/:modelId : le modèle reçu est relu tel que créé, avec son journal de réception", async () => {
    const m = await post("proprietaire", `${V}/modeles-externes`, reception);
    expect(m.status).toBe(201);
    const l = await get("lecteur", `${V}/modeles-externes/${m.body.id}`);
    expect(l.status).toBe(200);
    const { replayed: _r, journal: _j, ...cree } = m.body;
    expect(l.body).toMatchObject(cree);
    expect(l.body).toMatchObject({ reference: reception.reference, nomFichier: "recette.ifc", contentSha256: createHash("sha256").update(IFC).digest("hex"), recuPar: "proprietaire", decision: null });
    expect(l.body.journal).toEqual([expect.objectContaining({ seq: 1, par: "proprietaire" })]);
  });

  it("G1-03 [+] GET …/modeles-externes/:modelId/contenu : le fichier reçu est rendu octet pour octet, avec son empreinte", async () => {
    const m = await post("proprietaire", `${V}/modeles-externes`, reception);
    expect(m.status).toBe(201);
    const c = await get("lecteur", `${V}/modeles-externes/${m.body.id}/contenu`);
    expect(c.status).toBe(200);
    expect(c.body).toEqual({ id: m.body.id, statut: m.body.statut, nomFichier: "recette.ifc", contentSha256: createHash("sha256").update(IFC).digest("hex"), transformation: null, contenu: IFC });
    expect(banc.lignes.get(studioExternalModels)).toHaveLength(1);
  });

  it("G1-03 [−] GET …/modeles-externes/:modelId[/contenu] : identifiant inconnu, autre variante, non-membre, projet d'autrui → 404, rien d'écrit", async () => {
    const m = await post("proprietaire", `${V}/modeles-externes`, reception);
    expect(m.status).toBe(201);
    for (const suffixe of ["", "/contenu"]) {
      await refuseSansEcrire("lecteur", `${V}/modeles-externes/inconnu${suffixe}`);
      await refuseSansEcrire("etranger", `${V}/modeles-externes/${m.body.id}${suffixe}`);
      await refuseSansEcrire("proprietaire", `${S}/studies/s/variants/vq/modeles-externes/${m.body.id}${suffixe}`);
      await refuseSansEcrire(AUTRE, `${VQ}/modeles-externes/${m.body.id}${suffixe}`);
    }
  });
});
