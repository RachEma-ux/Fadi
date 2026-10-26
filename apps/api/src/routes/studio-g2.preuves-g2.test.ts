import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Lot G2 (achèvement Studio, outils et BIM), côté serveur : routeur Express réel et `lib/studio-*.ts` sur la base
 * simulée (`testing/studio-base-simulee.ts`, même montage que `studio-invariants.preuves-d2.test.ts` : aucune base,
 * aucun serveur). Chaque titre cite la fiche dont il contrôle le critère, `[+]` scénario positif, `[−]` échec refusé.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
// Le noyau exact réel (moteurExact) reste en place : le serveur recalcule chaque booléen (IF-003, R9).
vi.mock("../lib/atelier-exact.js", async (original) => ({ ...(await original<typeof import("../lib/atelier-exact.js")>()), revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import express from "express";
import request from "supertest";
import { applyStudioCommands, STUDIO_CONTRACT, studioCaptureBooleen, studioMesh3d, validateStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { projectMembers, studioRevisions, studioVariants } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use(express.json());
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const commander = (a: Acteur, corps: unknown) => request(app).post(`${V}/commands`).set("x-acteur", a).send(corps as object);
const teteDe = (variantId: string) => banc.lignes.get(studioVariants)!.find((v) => v.id === variantId)!.headRevisionId as string;
const docDe = (revisionId: string) => validateStudioDocument(banc.lignes.get(studioRevisions)!.find((r) => r.id === revisionId)!.document);
const nbRevisions = () => banc.lignes.get(studioRevisions)!.length;
const env = (requestId: string, baseRevisionId: string, commands: unknown[], extra: Record<string, unknown> = {}) => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands, ...extra });
const ligne = (id: string, y: number) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const portee = { projectId: "p", studyId: "s", variantId: "v" };

beforeEach(initialiserProjet);

describe("IF-006 — commande métier : enveloppe complète validée avec l'identité de la session (lot G2)", () => {
  it("IF-006 [+] enveloppe requestId / toolId / contractVersion / scope / baseRevision / targets / opération / paramètres / mode validée ; auteur = session ; essai sans écriture puis application", async () => {
    const base = teteDe("v");
    const commandes = [
      { ...ligne("n1", 2), targetIds: ["n1"], operation: "creer" },
      { toolId: "studio.dessin.deplacer", params: { id: "a", dx: 0, dy: 1 }, targetIds: ["a"], operation: "modifier" },
    ];
    // Mode essai : mêmes contrôles, effets calculés, rien n'est écrit (ni révision, ni tête, ni requestId consommé).
    const avant = instantane();
    const essai = await commander("editeur", env("g2-1", base, commandes, { scope: portee, mode: "essai" }));
    expect(essai.status).toBe(200);
    expect(essai.body).toMatchObject({ mode: "essai", written: false, baseRevisionId: base, effects: { crees: ["n1"], modifies: ["a"], origine: { auteurId: "editeur", source: "authenticated-session" } } });
    expect(essai.body.document.objects.map((o: { id: string }) => o.id)).toEqual(["a", "n1"]);
    expect(instantane()).toBe(avant);
    // Mode appliquer (explicite) : même enveloppe, nouvelle révision, auteur = la session (jamais lu du corps).
    const ok = await commander("editeur", env("g2-1", base, commandes, { scope: portee, mode: "appliquer" }));
    expect(ok.status).toBe(200);
    expect(ok.body.effects).toMatchObject({ crees: ["n1"], modifies: ["a"], origine: { auteurId: "editeur", requestId: "g2-1" } });
    const rev = banc.lignes.get(studioRevisions)!.find((r) => r.id === ok.body.revision.id)!;
    expect(rev).toMatchObject({ authorId: "editeur", requestId: "g2-1" });
    // Le noyau n'a appliqué que les commandes nues : la révision enregistrée se relit et se rejoue.
    expect((rev.envelope as { commands: unknown[] }).commands).toEqual([ligne("n1", 2), { toolId: "studio.dessin.deplacer", params: { id: "a", dx: 0, dy: 1 } }]);
    // Rejeu identique : même réponse ; même requestId avec d'autres cibles : 409, rien n'est écrit.
    expect((await commander("editeur", env("g2-1", base, commandes, { scope: portee, mode: "appliquer" }))).body.replayed).toBe(true);
    const n = nbRevisions();
    expect((await commander("editeur", env("g2-1", base, [{ ...commandes[0], targetIds: ["n1"] }, commandes[1]], { scope: portee }))).status).toBe(409);
    expect(nbRevisions()).toBe(n);
    // Une enveloppe sans attribut logique reste valide (compatibilité du contrat /1).
    expect((await commander("editeur", env("g2-2", teteDe("v"), [ligne("n2", 3)]))).status).toBe(200);
  });

  it("IF-006 [−] portée déclarée d'un autre projet, cible non touchée, opération fausse, actorId forgé, lecteur en essai : refus atomique, aucune écriture ni permission", async () => {
    const base = teteDe("v");
    const membres = structuredClone(banc.lignes.get(projectMembers));
    const avant = instantane();
    const cas: [Acteur, unknown, number, string][] = [
      ["editeur", env("x1", base, [ligne("z", 1)], { scope: { projectId: "q", studyId: "sq", variantId: "vq" } }), 400, "scope_mismatch"],
      ["editeur", env("x2", base, [ligne("z", 1)], { scope: { ...portee, variantId: "autre" } }), 400, "scope_mismatch"],
      ["editeur", env("x3", base, [{ ...ligne("z", 1), targetIds: ["a"] }]), 400, "target_mismatch"],
      ["editeur", env("x4", base, [{ toolId: "studio.dessin.deplacer", params: { id: "a", dx: 1, dy: 0 }, targetIds: ["a"], operation: "supprimer" }]), 400, "operation_mismatch"],
      ["editeur", env("x5", base, [{ ...ligne("z", 1), operation: "supprimer" }]), 400, "operation_mismatch"],
      ["editeur", { ...env("x6", base, [ligne("z", 1)]), actorId: "proprietaire" }, 400, "invalid_input"],
      ["editeur", env("x7", base, [ligne("z", 1)], { mode: "forcer" }), 400, "invalid_input"],
      ["lecteur", env("x8", base, [ligne("z", 1)], { mode: "essai", scope: portee }), 403, ""],
      ["editeur", env("x9", "r-ancienne", [ligne("z", 1)], { mode: "essai" }), 409, "stale_revision"],
    ];
    for (const [acteur, corps, statut, code] of cas) {
      const r = await commander(acteur, corps);
      expect(r.status, JSON.stringify(corps)).toBe(statut);
      if (code) expect(r.body.error).toBe(code);
      expect(instantane()).toBe(avant);
    }
    expect(banc.lignes.get(projectMembers)).toEqual(membres);
    expect(teteDe("v")).toBe(base);
  });
});

// ——— IF-003 : calcul lourd (booléen exact), du côté du serveur ———

const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } });
async function resultatWorker(d: StudioDocument, operandes: [string, string]) {
  const c = studioCaptureBooleen(d, { operation: "union", operandes });
  if (!c.ok) throw new Error(c.message);
  return { capture: c.capture, resultat: await (await MoteurExact.charger()).executer(c.capture.entrees) };
}

describe("IF-003 — calcul lourd : révision capturée, droits et contexte revérifiés par le serveur, engagement explicite, projections invalidées (lot G2)", () => {
  it("IF-003 [+] capture R12 → calcul (noyau exact) → engagement sur R12 : révision R13 engagée, maillage 3D et quantités invalidés, solide exact présent dans la scène", async () => {
    const r12 = (await commander("editeur", env("b-0", teteDe("v"), [boite("A", 0), boite("B", 1)]))).body.revision.id as string;
    const { resultat } = await resultatWorker(docDe(r12), ["A", "B"]);
    const r = await commander("editeur", env("b-1", r12, [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat }, targetIds: ["E"], operation: "creer" }]));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.revision.parentRevisionId).toBe(r12);
    expect(r.body.effects.domainesInvalides).toEqual(expect.arrayContaining(["maillage-3d", "quantites", "exports", "publications"]));
    expect(r.body.effects.crees).toContain("E");
    const scene = studioMesh3d(docDe(r.body.revision.id));
    expect(scene.exacts?.map((e) => e.id)).toEqual(["E"]);
    expect(docDe(r.body.revision.id).exacts![0]!.resultat.volume).toBeCloseTo(12, 9);
  });

  it("IF-003 [−] résultat calculé sur R12 rendu après une modification R13, ou après retrait des droits : aucun engagement courant, rien n'est écrit", async () => {
    const r12 = (await commander("editeur", env("b-0", teteDe("v"), [boite("A", 0), boite("B", 1)]))).body.revision.id as string;
    const { resultat } = await resultatWorker(docDe(r12), ["A", "B"]);
    const booleen = { toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat } };
    // R13 : un autre membre déplace B pendant le calcul.
    const r13 = (await commander("proprietaire", env("p-1", r12, [{ toolId: "studio.solide.deplacer", params: { id: "B", dx: 0.5, dy: 0, dz: 0 } }]))).body.revision.id as string;
    let avant = instantane();
    const perime = await commander("editeur", env("b-1", r12, [booleen]));
    expect(perime.status).toBe(409);
    expect(perime.body).toMatchObject({ error: "stale_revision", headRevisionId: r13, baseRevisionId: r12 });
    expect(instantane()).toBe(avant);
    // Rebasé de force sur R13 : le serveur recalcule sur SES opérandes (B déplacé) et refuse l'empreinte du calcul R12.
    const rebase = await commander("editeur", env("b-2", r13, [booleen]));
    expect(rebase.status).toBe(400);
    expect(rebase.body).toMatchObject({ code: "exact-mismatch" });
    expect(instantane()).toBe(avant);
    // Droits révoqués entre la capture et l'engagement : 403, rien n'est écrit.
    const { resultat: r2 } = await resultatWorker(docDe(r13), ["A", "B"]);
    banc.lignes.set(projectMembers, banc.lignes.get(projectMembers)!.filter((m) => m.userId !== "editeur"));
    avant = instantane();
    const revoque = await commander("editeur", env("b-3", r13, [{ ...booleen, params: { ...booleen.params, resultat: r2 } }]));
    expect([403, 404]).toContain(revoque.status);
    expect(instantane()).toBe(avant);
    expect(teteDe("v")).toBe(r13);
    expect(docDe(r13).exacts).toBeUndefined();
    // Le même résultat, engagé par un membre qui a le droit sur la révision courante, s'applique.
    const ok = await commander("proprietaire", env("b-4", r13, [{ ...booleen, params: { ...booleen.params, resultat: r2 } }]));
    expect(ok.status).toBe(200);
    expect(applyStudioCommands(docDe(r13), [{ ...booleen, params: { ...booleen.params, resultat: r2 } } as StudioCommand]).exacts).toHaveLength(1);
  });
});

// ——— AC-010 : « Approuver », commande du catalogue ; le serveur seul juge du droit métier ———

const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const put = (a: Acteur, url: string, body: unknown) => request(app).put(url).set("x-acteur", a).send(body as object);
const PREF = `${S}/preferences`;
const presente = (v: Record<string, unknown>) => ({ manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash });
const profilAvecApprouver = () => ({
  format: "fadi-studio-profil/1", profileId: "studio_profil_chef", version: 2, profil: "personnel", favoris: [], personnel: [], groupes: [],
  ordre: ["studio.publication.approuver", "studio.dessin.ligne"], raccourcis: { "studio.publication.approuver": "Ctrl+Shift+F11" },
});

describe("AC-010 — « Approuver » découvert dans le catalogue, refusé par le serveur sans droit métier (lot G2)", () => {
  it("AC-010 [+] le catalogue du serveur expose « Approuver » à tous (concepteur : non autorisé ; propriétaire : autorisé) ; le concepteur qui l'exécute reçoit 403, rien n'est écrit", async () => {
    const capacite = async (a: Acteur) => ((await get(a, `${PREF}/catalogue`)).body.capacites as { id: string; autorise: boolean; droit: string }[]).find((c) => c.id === "studio.publication.approuver");
    expect(await capacite("editeur")).toEqual({ id: "studio.publication.approuver", libelle: "Approuver", droit: "approve", autorise: false });
    expect(await capacite("lecteur")).toMatchObject({ autorise: false });
    expect(await capacite("proprietaire")).toMatchObject({ autorise: true });
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d" });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect(s.status).toBe(200);
    const avant = instantane();
    const r = await post("editeur", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body));
    expect(r.status).toBe(403);
    expect(instantane()).toBe(avant);
    expect((await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body))).status).toBe(200);
  });

  it("AC-010 [−] importer un profil qui place « Approuver », ou l'écrire dans ses préférences, ne confère rien : refus 403 (permission non conférée) et l'approbation reste refusée", async () => {
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d" });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    for (const acteur of ["editeur", "lecteur"] as const) {
      const avant = instantane();
      const imp = await post(acteur, `${PREF}/outils/import`, { profil: profilAvecApprouver() });
      expect(imp.status).toBe(403);
      expect(imp.body).toMatchObject({ error: "permission_non_conferee", capacites: ["studio.publication.approuver"] });
      expect((await put(acteur, `${PREF}/outils`, { profil: "standard", favoris: [], personnel: [], ordre: ["studio.publication.approuver"] })).status).toBe(403);
      expect(instantane()).toBe(avant);
      const r = await post(acteur, `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body));
      expect(r.status).toBe(403);
      expect(instantane()).toBe(avant);
      expect(((await get(acteur, `${PREF}/catalogue`)).body.capacites as { id: string; autorise: boolean }[]).find((x) => x.id === "studio.publication.approuver")!.autorise).toBe(false);
    }
    // Le propriétaire, qui détient le droit d'approbation, importe ce profil.
    expect((await post("proprietaire", `${PREF}/outils/import`, { profil: profilAvecApprouver() })).status).toBe(200);
  });
});
