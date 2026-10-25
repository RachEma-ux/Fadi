import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Preuves du groupe D2 (point 2 du rapprochement Studio), côté serveur : routeur Express réel et `lib/studio-*.ts` sur la
 * base simulée (`testing/studio-base-simulee.ts`, même montage que `studio-invariants.test.ts` : aucune base, aucun
 * serveur). Chaque titre cite l'identifiant de la fiche (INV, IF, AC) dont il contrôle le critère, `[+]` scénario
 * positif, `[−]` scénario d'échec tenté et refusé.
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
import { quantitesStudio, STUDIO_CONTRACT, validateStudioDocument, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projectMembers, studioPublicationEvents, studioPublications, studioRevisions, studioVariants } from "../db/schema.js";
import { projectAccessRefusal, type AccessibleProject } from "../lib/owned-project.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, SCHEMA, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use(express.json());
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const enveloppe = (requestId: string, baseRevisionId: string, commands: StudioCommand[]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands });
const teteDe = (variantId: string) => banc.lignes.get(studioVariants)!.find((v) => v.id === variantId)!.headRevisionId as string;
const nbRevisions = () => banc.lignes.get(studioRevisions)!.length;
const pub = (id: string) => banc.lignes.get(studioPublications)!.find((r) => r.id === id)!;
const commander = (a: Acteur, variantPath: string, e: StudioEnvelope) => post(a, `${variantPath}/commands`, e);
const presente = (v: Record<string, any>) => ({ manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash });
const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const mur = { id: "m1", type: "wall", axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }], thickness: 0.2, height: 3, base: 0, justification: "center" };
const baie = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };
const cmd = (toolId: string, params: unknown) => ({ toolId, params }) as StudioCommand;
const net = (doc: unknown) => quantitesStudio(validateStudioDocument(doc)).objets.find((o) => o.objetId === "m1")!.valeurs.find((x) => x.grandeur === "volume-net")!.valeur;

/** Variante coordonnée `B` de l'étude `s`, créée par l'API (dérivée de `v`), avec une ligne propre. */
async function varianteB(): Promise<{ id: string; path: string }> {
  const c = await post("proprietaire", `${S}/studies/s/variants`, { name: "Variante B", fromVariantId: "v" });
  expect(c.status).toBe(201);
  const id = (c.body.variant?.id ?? c.body.id) as string;
  const path = `${S}/studies/s/variants/${id}`;
  expect((await commander("proprietaire", path, enveloppe("b-1", teteDe(id), [ligne("b-propre", 3)]))).status).toBe(200);
  return { id, path };
}

beforeEach(initialiserProjet);

describe("INV-001 — une approbation référence exactement les éléments présentés à la décision (preuves D2)", () => {
  it("INV-001 [+] A et B approuvées ensemble : la décision relue porte le manifeste dont les sources nomment A et B avec leurs révisions et empreintes exactes", async () => {
    const b = await varianteB();
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier coordonné", coordinatedVariantIds: [b.id] });
    expect(c.status).toBe(201);
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect(s.status).toBe(200);
    const sources = s.body.manifest.sources;
    expect(sources).toEqual([
      expect.objectContaining({ role: "principale", variantId: "v", revisionId: teteDe("v") }),
      expect.objectContaining({ role: "coordonnee", variantId: b.id, revisionId: teteDe(b.id) }),
    ]);
    expect(sources[1].documentHash).toMatch(/^[0-9a-f]{64}$/);
    const a = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body));
    expect(a.status).toBe(200);
    const relu = await get("lecteur", `${S}/studies/s/publications/${c.body.id}`);
    expect(relu.body).toMatchObject({ approval: { manifestHash: s.body.manifestHash, revisionId: s.body.revisionId, documentHash: s.body.documentHash } });
    expect(relu.body.manifest.sources).toEqual(sources);
    expect(pub(c.body.id)).toMatchObject({ approvedManifestHash: s.body.manifestHash });
  });
  it("INV-001 [−] la variante coordonnée B modifiée entre l'approbation et la diffusion : diffusion refusée (409 manifest_mismatch, écart sur B), aucun paquet", async () => {
    const b = await varianteB();
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier coordonné", coordinatedVariantIds: [b.id] });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect((await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body))).status).toBe(200);
    const teteA = teteDe("v");
    // Seule B change : la variante principale A est intacte.
    expect((await commander("editeur", b.path, enveloppe("b-2", teteDe(b.id), [ligne("b-apres", 4)]))).status).toBe(200);
    expect(teteDe("v")).toBe(teteA);
    const r = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/diffuser`);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "manifest_mismatch", approvedManifestHash: s.body.manifestHash });
    expect(r.body.drift).toEqual(expect.arrayContaining([expect.objectContaining({ role: "coordonnee", variantId: b.id })]));
    expect(pub(c.body.id)).toMatchObject({ package: null, packageHash: null, diffusionStatus: "non-diffuse", approvedManifestHash: s.body.manifestHash });
  });
});

describe("INV-012 — une publication antérieure n'est pas réécrite par la création d'une nouvelle publication (preuves D2)", () => {
  async function diffusee(): Promise<Record<string, any>> {
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d" });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect((await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body))).status).toBe(200);
    const d = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/diffuser`);
    expect(d.status).toBe(200);
    return d.body;
  }
  it("INV-012 [+] une nouvelle diffusion marque l'ancienne « remplacée » par un évènement journalisé ; son identité, son paquet et son manifeste restent identiques", async () => {
    const d1 = await diffusee();
    const avant = structuredClone(pub(d1.id));
    expect((await commander("editeur", V, enveloppe("q1", teteDe("v"), [ligne("b", 2)]))).status).toBe(200);
    const d2 = await diffusee();
    const apres = pub(d1.id);
    expect(apres).toMatchObject({ id: d1.id, package: avant.package, packageHash: avant.packageHash, manifest: avant.manifest, manifestHash: avant.manifestHash, revisionId: avant.revisionId, documentHash: avant.documentHash, diffusionStatus: "remplace", replacedByPublicationId: d2.id });
    expect(banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === d1.id).at(-1)).toMatchObject({ action: "remplacer" });
  });
  it("INV-012 [−] réécrire le paquet, le manifeste ou l'approbation d'une publication diffusée est refusé explicitement par la base (déclencheur studio_publication_package_frozen) ; rien n'est écrit", async () => {
    expect(SCHEMA.declencheurs.get("studio_publications")!.map((d) => [d.nom, d.quand])).toEqual(expect.arrayContaining([["studio_publications_package_frozen", "UPDATE"]]));
    const d = await diffusee();
    const avant = instantane();
    const message = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: Error) => e.message);
    const ecrase = { schema: "studio-publication-package/1", revisionId: "autre", files: [] };
    for (const patch of [
      { package: ecrase }, { packageHash: "f".repeat(64) }, { manifest: { ...(pub(d.id).manifest as Record<string, unknown>), documents: [] } }, { manifestHash: "e".repeat(64) },
      { revisionId: "r-autre" },{ documentHash: "d".repeat(64) }, { approvedManifestHash: "c".repeat(64) },
    ]) {
      expect(await message(db.update(studioPublications).set(patch as never).where(eq(studioPublications.id, d.id))), JSON.stringify(Object.keys(patch))).toBe("studio_publication_package_frozen");
    }
    expect(instantane()).toBe(avant);
    // Les dimensions (retrait, remplacement) restent modifiables, contenu inchangé ; un brouillon non diffusé s'actualise.
    expect(await message(db.update(studioPublications).set({ diffusionStatus: "retire", status: "retire" }).where(eq(studioPublications.id, d.id)))).toBeNull();
    const brouillon = await post("proprietaire", `${V}/publications`, { title: "Brouillon", contenu: "dessin-2d" });
    expect((await commander("editeur", V, enveloppe("q9", teteDe("v"), [ligne("z", 7)]))).status).toBe(200);
    expect((await post("editeur", `${S}/studies/s/publications/${brouillon.body.id}/actualiser`)).status).toBe(200);
  });
});

describe("AC-003 — deux utilisateurs modifient un mur de façon incompatible (preuves D2)", () => {
  async function murPose(): Promise<string> {
    const r = await commander("proprietaire", V, enveloppe("pose", "r1", [cmd("studio.architecture.mur", mur), cmd("studio.architecture.ouverture", baie)]));
    expect(r.status).toBe(200);
    return r.body.revision.id as string;
  }
  it("AC-003 [+] le second reçoit un conflit traçable (tête, base, élément commun), la révision de référence est préservée ; après coupure, le rejeu du même requestId ne duplique rien ; le report explicite s'applique une fois", async () => {
    const base = await murPose();
    // Utilisateur 1 : hauteur 3,2 m ; utilisateur 2, sur la même base : épaisseur 0,25 m.
    const u1 = await commander("proprietaire", V, enveloppe("u1-hauteur", base, [cmd("studio.architecture.modifier", { ...mur, height: 3.2 })]));
    expect(u1.status).toBe(200);
    const tete = u1.body.revision.id as string;
    const avant = instantane();
    const u2 = await commander("editeur", V, enveloppe("u2-epaisseur", base, [cmd("studio.architecture.modifier", { ...mur, thickness: 0.25 })]));
    expect(u2.status).toBe(409);
    expect(u2.body).toMatchObject({ error: "stale_revision", headRevisionId: tete, baseRevisionId: base, baseKnown: true });
    expect(u2.body.overlaps).toEqual(expect.arrayContaining([expect.stringContaining("m1")]));
    // Aucune application implicite du dernier enregistrement : rien n'est écrit, la tête reste celle de l'utilisateur 1.
    expect(instantane()).toBe(avant);
    expect(teteDe("v")).toBe(tete);
    const lu = (await get("lecteur", V)).body;
    expect(lu.revision.document.architecture.find((a: { id: string }) => a.id === "m1")).toMatchObject({ height: 3.2, thickness: 0.2 });
    // Coupure simulée : la réponse de l'utilisateur 1 est perdue, son client renvoie la même enveloppe.
    const n = nbRevisions();
    const rejeu = await commander("proprietaire", V, enveloppe("u1-hauteur", base, [cmd("studio.architecture.modifier", { ...mur, height: 3.2 })]));
    expect(rejeu.body).toMatchObject({ replayed: true, revision: { id: tete } });
    expect(nbRevisions()).toBe(n);
    // Restauration : l'utilisateur 2 reporte explicitement sur la tête ; un second envoi de ce report n'écrit rien de plus.
    const report = enveloppe("u2-report", tete, [cmd("studio.architecture.modifier", { ...mur, height: 3.2, thickness: 0.25 })]);
    const r2 = await commander("editeur", V, report);
    expect(r2.status).toBe(200);
    expect(r2.body.revision.parentRevisionId).toBe(tete);
    expect((await commander("editeur", V, report)).body).toMatchObject({ replayed: true, revision: { id: r2.body.revision.id } });
    expect(nbRevisions()).toBe(n + 1);
    const final = r2.body.revision.document.architecture;
    expect(final.map((a: { id: string }) => a.id)).toEqual(["m1", "o1"]);
    expect(final.find((a: { id: string }) => a.id === "o1")).toMatchObject({ hostId: "m1" });
  });
  it("AC-003 [−] la seconde sauvegarde n'écrase jamais la première en silence, et un rejeu n'applique pas deux fois : même base → 409, même requestId au contenu différent → 409 request_conflict", async () => {
    const base = await murPose();
    const u1 = await commander("proprietaire", V, enveloppe("u1", base, [cmd("studio.architecture.modifier", { ...mur, height: 3.2 })]));
    const avant = instantane();
    for (const [acteur, e] of [
      ["editeur", enveloppe("u2", base, [cmd("studio.architecture.modifier", { ...mur, height: 2.8 })])],
      ["proprietaire", enveloppe("u1", base, [cmd("studio.architecture.modifier", { ...mur, height: 2.8 })])],
    ] as const) {
      const r = await commander(acteur, V, e);
      expect(r.status).toBe(409);
      expect(["stale_revision", "request_conflict"]).toContain(r.body.error);
    }
    expect(instantane()).toBe(avant);
    expect(teteDe("v")).toBe(u1.body.revision.id);
  });
});

describe("AC-001 — le dossier publié conserve la version examinée du mur (preuves D2)", () => {
  it("AC-001 [+] dossier du mur (baie 1 m, net 3,180) approuvé et diffusé ; la baie élargie à 1,20 m ensuite (net 3,096) : le paquet garde la révision examinée, relue à 3,180", async () => {
    const r = await commander("proprietaire", V, enveloppe("pose", "r1", [cmd("studio.architecture.mur", { ...mur, axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }] }), cmd("studio.architecture.ouverture", baie)]));
    const examinee = r.body.revision.id as string;
    expect(net(r.body.revision.document)).toBeCloseTo(3.18, 12);
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier du mur" });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect(s.body.revisionId).toBe(examinee);
    expect((await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body))).status).toBe(200);
    const d = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/diffuser`);
    expect(d.status).toBe(200);
    const m = await commander("editeur", V, enveloppe("elargir", examinee, [cmd("studio.architecture.modifier", { ...baie, width: 1.2 })]));
    expect(m.status).toBe(200);
    expect(net(m.body.revision.document)).toBeCloseTo(3.096, 12);
    const relu = (await get("lecteur", `${S}/studies/s/publications/${c.body.id}`)).body;
    expect(relu).toMatchObject({ revisionId: examinee, diffusion: { manifestHash: s.body.manifestHash }, freshness: "perimee" });
    expect(pub(c.body.id).package).toMatchObject({ revisionId: examinee, documentHash: s.body.documentHash });
    const versionExaminee = (await get("lecteur", `${V}/revisions/${examinee}`)).body.revision;
    expect(versionExaminee.document.architecture.find((a: { id: string }) => a.id === "o1")).toMatchObject({ width: 1, hostId: "m1" });
    expect(net(versionExaminee.document)).toBeCloseTo(3.18, 12);
  });
});

describe("IF-006 — commande métier : identité établie par le serveur (preuves D2)", () => {
  it("IF-006 [−] actorId forgé, portée interprojet ou répétition incompatible : refus atomique, aucune permission créée (membres et droits du lecteur inchangés)", async () => {
    const membres = structuredClone(banc.lignes.get(projectMembers));
    const avant = instantane();
    const forge = await commander("lecteur", V, { ...enveloppe("f1", "r1", [ligne("b", 1)]), actorId: "proprietaire" } as StudioEnvelope);
    expect(forge.status).toBe(400);
    const forgeEditeur = await commander("editeur", V, { ...enveloppe("f2", "r1", [ligne("b", 1)]), actorId: "proprietaire" } as StudioEnvelope);
    expect(forgeEditeur.status).toBe(400);
    const interprojet = await commander("proprietaire", `${S}/studies/sq/variants/vq`, enveloppe("f3", "rq1", [ligne("b", 1)]));
    expect(interprojet.status).toBe(404);
    expect(instantane()).toBe(avant);
    const ok = await commander("editeur", V, enveloppe("f4", "r1", [ligne("b", 1)]));
    expect(ok.status).toBe(200);
    const apresOk = instantane();
    expect((await commander("editeur", V, enveloppe("f4", "r1", [ligne("b", 9)]))).body).toMatchObject({ error: "request_conflict" });
    expect(instantane()).toBe(apresOk);
    // Aucune permission créée : membres inchangés, le lecteur reste refusé.
    expect(banc.lignes.get(projectMembers)).toEqual(membres);
    expect((await commander("lecteur", V, enveloppe("f5", teteDe("v"), [ligne("c", 2)]))).status).toBe(403);
  });
});

describe("AC-010 — un rôle d'administration technique ne donne aucun droit d'approbation (preuves D2)", () => {
  it("AC-010 [−] l'accès support d'un administrateur de la plateforme, ou un éditeur, ne peut ni approuver ni diffuser : 403 ; seul le droit métier (canApprove) ouvre l'approbation", () => {
    const projet = { id: "p", ownerId: "proprietaire", editingLock: null, exampleMode: null } as unknown as AccessibleProject;
    const avec = (o: Record<string, unknown>) => ({ ...projet, ...o }) as AccessibleProject;
    for (const need of ["approve", "publish"] as const) {
      expect(projectAccessRefusal(avec({ role: "support", canExport: false, canApprove: false, canPublish: false }), "admin", need)).toMatchObject({ status: 403 });
      expect(projectAccessRefusal(avec({ role: "editeur", canExport: true, canApprove: false, canPublish: false }), "editeur", need)).toMatchObject({ status: 403 });
    }
    expect(projectAccessRefusal(avec({ role: "editeur", canExport: true, canApprove: true, canPublish: false }), "editeur", "approve")).toBeNull();
  });
  it("AC-010 [−] le concepteur (éditeur) dont le profil affiche toutes les mutations reçoit un refus d'exécution de l'approbation ; rien n'est écrit", async () => {
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d" });
    const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    const avant = instantane();
    const r = await post("editeur", `${S}/studies/s/publications/${c.body.id}/approuver`, presente(s.body));
    expect(r.status).toBe(403);
    expect(instantane()).toBe(avant);
  });
});
