import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Suite `studio-invariants` — côté serveur (X.2-01, X.2-04). Invariants INV-001 à INV-015 du référentiel technique
 * (REF-02, STUDIO-RT-001 §2.4) et défauts éliminatoires (Plan §7.3, Checklist BLOC-01 à BLOC-05) qui se prouvent au
 * niveau de l'API : routeur Express réel et `lib/studio-*.ts`, base simulée en mémoire (`testing/studio-base-simulee.ts` : garde
 * DB fermée, aucune base ni serveur). Les invariants du modèle pur sont dans
 * `packages/atelier-model/src/studio/studio-invariants.test.ts`, ceux de l'interface (hors ligne, catalogue) dans
 * `apps/web/src/modules/studio/studio-invariants.test.ts`.
 *
 * Convention de titre, lue par `studio-tracabilite.test.ts` qui génère et vérifie
 * `docs/ai-team/reports/claude-v9-x2/INVARIANTS.md` : `INV-xxx [+]` (scénario positif) ou `INV-xxx [−]` (scénario
 * d'échec : la violation est tentée et refusée, ou ne se produit pas), plusieurs identifiants possibles (`BLOC-0x`).
 * Rangée sous `routes/` : supertest ouvre une socket de boucle locale, refusée par les sentinelles réseau de
 * `vitest.guard.config.ts` ; aucune base n'est touchée (client simulé). Un volet « Base simulée » vérifie la fidélité de
 * l'outil d'essai lui-même (tx distinct, écriture par `db` refusée pendant une transaction, unicités et déclencheurs relus
 * dans `db/init.sql`, chemin `23505` en concurrence) ; ses limites restantes sont déclarées dans son en-tête. Les rôles
 * sont relus dans la base simulée : rétrograder un membre (`project_members`) suffit à changer son accès.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT, STUDIO_TOOLS, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { projectMembers, studioComments, studioObservationLinks, studioPublicationEvents, studioPublications, studioRevisions, studioToolPreferences, studioVariants } from "../db/schema.js";
import { StudioRequestError, submitStudioCommands } from "../lib/studio-commands.js";
import { createStudioComment } from "../lib/studio-commentaires.js";
import { importStudioArchive, StudioArchiveError } from "../lib/studio-archive.js";
import { buildStudioManifest, checkStudioArchive, emptyStudioTables, STUDIO_ARCHIVE_SCHEMA, STUDIO_ARCHIVE_SCHEMA_VERSION } from "../lib/studio-archive-manifest.js";
import { controlerApprobation, controlerEnsembleExamine, empreinteManifeste, construireManifeste } from "../lib/studio-publication-statuts.js";
import { catalogueAutorise, lireCorpsPreferences, lireLignePreferences, motifRefusEcriture } from "../lib/studio-preferences.js";
import { studioDocumentHash } from "../lib/studio-publications.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, SCHEMA, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const scope = { projectId: "p", studyId: "s", variantId: "v" };
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);
const get = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const deplacer = (id: string, dy: number): StudioCommand => ({ toolId: "studio.dessin.deplacer", params: { id, dx: 0, dy } });
const supprimer = (...ids: string[]): StudioCommand => ({ toolId: "studio.dessin.supprimer", params: { ids } });
const enveloppe = (requestId: string, baseRevisionId: string, commands: StudioCommand[]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands });
const tete = () => banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.headRevisionId as string;
const nbRevisions = () => banc.lignes.get(studioRevisions)!.length;
const pub = (id: string) => banc.lignes.get(studioPublications)!.find((r) => r.id === id)!;
const commander = async (a: Acteur, e: StudioEnvelope) => post(a, `${V}/commands`, e);

/** Publication (dessin 2D) créée par le propriétaire, soumise ; rend sa vue. */
async function publicationSoumise(): Promise<Record<string, any>> {
  const c = await post("proprietaire", `${V}/publications`, { title: "Dossier d'essai", contenu: "dessin-2d" });
  expect(c.status).toBe(201);
  const s = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
  expect(s.status).toBe(200);
  return s.body;
}
/** Ensemble présenté à la décision : manifeste, révision et empreinte du document de la publication soumise. */
const presente = (v: Record<string, any>) => ({ manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash });
async function diffusee(): Promise<Record<string, any>> {
  const v = await publicationSoumise();
  expect((await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, presente(v))).status).toBe(200);
  const d = await post("proprietaire", `${S}/studies/s/publications/${v.id}/diffuser`);
  expect(d.status).toBe(200);
  return d.body;
}

beforeEach(initialiserProjet);

describe("INV-001 — une approbation référence exactement les éléments présentés à la décision", () => {
  it("INV-001 [+] l'approbation enregistre le manifeste, la révision et l'empreinte du document présentés", async () => {
    const v = await publicationSoumise();
    const r = await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, presente(v));
    expect(r.status).toBe(200);
    expect(r.body.approval).toMatchObject({ revisionId: v.revisionId, documentHash: v.documentHash, manifestHash: v.manifestHash });
    expect(pub(v.id)).toMatchObject({ approvedManifestHash: v.manifestHash, approvedRevisionId: v.revisionId, approvedDocumentHash: v.documentHash, manifestHash: v.manifestHash });
    // Le manifeste couvre ses sources et ses documents : changer l'un d'eux change son empreinte.
    const m = v.manifest;
    expect(empreinteManifeste(m)).toBe(v.manifestHash);
    expect(empreinteManifeste({ ...m, sources: [{ ...m.sources[0], revisionId: "autre" }] })).not.toBe(v.manifestHash);
    expect(empreinteManifeste({ ...m, documents: m.documents.slice(1) })).not.toBe(v.manifestHash);
  });
  it("INV-001 [−] un autre ensemble (manifeste, révision ou document) est refusé : 409 revision_mismatch, rien n'est approuvé", async () => {
    const v = await publicationSoumise();
    const avant = instantane();
    for (const autre of [{ ...presente(v), manifestHash: "a".repeat(64) }, { ...presente(v), revisionId: "r0" }, { ...presente(v), documentHash: "b".repeat(64) }]) {
      const r = await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, autre);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: "revision_mismatch" });
    }
    // Sans ensemble examiné, l'approbation ne vaut rien : 400.
    expect((await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, {})).body).toMatchObject({ code: "examined_set_required" });
    expect(instantane()).toBe(avant);
    expect(pub(v.id).approvedManifestHash).toBeNull();
    // Règle pure : seul l'ensemble exact passe.
    expect(controlerEnsembleExamine(presente(v), { manifestHash: v.manifestHash, revisionId: v.revisionId, documentHash: v.documentHash })).toBeNull();
  });
});

describe("BLOC-05 — aucune publication ne s'appuie sur une approbation ne couvrant pas son contenu", () => {
  it("INV-001 BLOC-05 [+] la diffusion est admise sous l'approbation exacte de son contenu ; le paquet porte ce manifeste", async () => {
    const d = await diffusee();
    expect(d.diffusionStatus).toBe("diffuse");
    expect(d.diffusion).toMatchObject({ manifestHash: d.approval.manifestHash });
  });
  it("INV-001 BLOC-05 [−] la tête change après l'approbation : diffuser → 409 manifest_mismatch, aucun paquet", async () => {
    const v = await publicationSoumise();
    expect((await post("proprietaire", `${S}/studies/s/publications/${v.id}/approuver`, presente(v))).status).toBe(200);
    expect((await commander("editeur", enveloppe("q1", tete(), [ligne("b", 2)]))).status).toBe(200);
    const r = await post("proprietaire", `${S}/studies/s/publications/${v.id}/diffuser`);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "manifest_mismatch", approvedManifestHash: v.manifestHash });
    expect(pub(v.id)).toMatchObject({ package: null, packageHash: null, diffusionStatus: "non-diffuse" });
    // Règle pure : approuvé ≠ courant, ou aucune approbation → refus.
    expect(controlerApprobation(v.manifestHash, v.manifestHash, "c".repeat(64))).toMatchObject({ status: 409 });
    expect(controlerApprobation(null, v.manifestHash, v.manifestHash)).toMatchObject({ status: 409, body: { error: "manifest_missing" } });
  });
});

describe("INV-012 — une publication antérieure n'est pas réécrite par la création d'une nouvelle publication", () => {
  it("INV-012 [+] une seconde diffusion remplace la première : statut « remplacé » journalisé, paquet et manifeste d'origine identiques", async () => {
    const d1 = await diffusee();
    const figee = structuredClone({ package: pub(d1.id).package, packageHash: pub(d1.id).packageHash, manifest: pub(d1.id).manifest, manifestHash: pub(d1.id).manifestHash, approvedManifestHash: pub(d1.id).approvedManifestHash, revisionId: pub(d1.id).revisionId });
    const journal1 = banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === d1.id).map((e) => structuredClone(e));
    const d2 = await diffusee();
    expect(d2.id).not.toBe(d1.id);
    expect(pub(d1.id)).toMatchObject({ ...figee, diffusionStatus: "remplace", replacedByPublicationId: d2.id });
    // Journal en ajout seul : les entrées antérieures sont intactes, le remplacement est une entrée de plus.
    const journal2 = banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === d1.id);
    expect(journal2.slice(0, journal1.length)).toEqual(journal1);
    expect(journal2.at(-1)).toMatchObject({ action: "remplacer" });
    // Le fichier figé de la première reste servi, à l'identique.
    const f = await get("lecteur", `${S}/studies/s/publications/${d1.id}/files/svg`);
    expect(f.status).toBe(200);
    expect(f.headers["x-content-sha256"]).toBe((figee.package as { files: { format: string; sha256: string }[] }).files.find((x) => x.format === "svg")!.sha256);
  });
  it("INV-012 [−] une publication diffusée ne se réapprouve ni ne s'actualise ; retirée, son contenu reste lisible et journalisé", async () => {
    const d = await diffusee();
    const figee = structuredClone(pub(d.id).package);
    for (const action of ["actualiser", "approuver", "soumettre"]) {
      const r = await post("proprietaire", `${S}/studies/s/publications/${d.id}/${action}`, action === "approuver" ? presente(d) : {});
      expect(r.status, action).toBe(409);
      expect(r.body).toMatchObject({ error: "invalid_transition" });
    }
    const w = await post("proprietaire", `${S}/studies/s/publications/${d.id}/retirer`, { comment: "Remplacé hors Studio (essai)" });
    expect(w.status).toBe(200);
    expect(pub(d.id)).toMatchObject({ diffusionStatus: "retire", package: figee });
    expect(banc.lignes.get(studioPublicationEvents)!.filter((e) => e.publicationId === d.id).at(-1)).toMatchObject({ action: "retirer", comment: "Remplacé hors Studio (essai)" });
    expect((await get("lecteur", `${S}/studies/s/publications/${d.id}/files/svg`)).status).toBe(200);
  });
});

describe("INV-005 — une opération rejetée ne modifie pas partiellement les données canoniques", () => {
  it("INV-005 [+] un lot valide est appliqué en entier : une révision, tête avancée", async () => {
    const n = nbRevisions();
    const r = await commander("editeur", enveloppe("q1", "r1", [ligne("b", 1), ligne("c", 2), deplacer("a", 1)]));
    expect(r.status).toBe(200);
    expect(nbRevisions()).toBe(n + 1);
    expect(tete()).toBe(r.body.revision.id);
    expect(r.body.revision.document.objects.map((o: { id: string }) => o.id)).toEqual(["a", "b", "c"]);
  });
  it("INV-005 [−] refus au milieu du lot, ou panne après l'insertion de la révision : aucune ligne modifiée", async () => {
    const avant = instantane();
    const r = await commander("editeur", enveloppe("q1", "r1", [ligne("b", 1), ligne("c", 2), deplacer("inconnu", 1)]));
    expect(r.status).toBe(400);
    expect(r.body.path).toContain("commands[2]");
    expect(instantane()).toBe(avant);
    banc.panneSur = studioVariants;
    expect((await commander("editeur", enveloppe("q2", "r1", [ligne("b", 1)]))).status).toBe(500);
    expect(instantane()).toBe(avant);
  });
});

describe("INV-006 / BLOC-04 — un résultat dérivé ancien est identifiable et n'écrase pas le résultat courant", () => {
  it("INV-006 BLOC-04 [+] manifeste à jour : « a-jour » ; après un changement de la tête : « perimee » avec l'écart nommé", async () => {
    const v = await publicationSoumise();
    expect(v.freshness).toBe("a-jour");
    expect((await commander("editeur", enveloppe("q1", tete(), [ligne("b", 2)]))).status).toBe(200);
    const lu = await get("lecteur", `${S}/studies/s/publications/${v.id}`);
    expect(lu.body).toMatchObject({ freshness: "perimee", revisionId: v.revisionId, headRevisionId: tete() });
    expect(lu.body.drift).toEqual([expect.objectContaining({ type: "source", revisionFigee: v.revisionId, revisionCourante: tete() })]);
  });
  it("INV-006 BLOC-04 [−] un manifeste périmé n'est ni soumis ni approuvé : 409 manifest_outdated ; seule l'actualisation explicite le refait", async () => {
    const c = await post("proprietaire", `${V}/publications`, { title: "Dossier", contenu: "dessin-2d" });
    expect((await commander("editeur", enveloppe("q1", tete(), [ligne("b", 2)]))).status).toBe(200);
    const avant = instantane();
    const r = await post("proprietaire", `${S}/studies/s/publications/${c.body.id}/soumettre`);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "manifest_outdated" });
    expect(instantane()).toBe(avant);
    const a = await post("editeur", `${S}/studies/s/publications/${c.body.id}/actualiser`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ revisionId: tete(), freshness: "a-jour" });
  });
  it("INV-006 BLOC-04 [−] le rejeu d'une requête ancienne rend sa révision d'origine sans toucher la tête courante", async () => {
    const r1 = await commander("proprietaire", enveloppe("q1", "r1", [ligne("b", 1)]));
    const r2 = await commander("editeur", enveloppe("q2", r1.body.revision.id, [deplacer("b", 2)]));
    const rejeu = await commander("proprietaire", enveloppe("q1", "r1", [ligne("b", 1)]));
    expect(rejeu.body).toMatchObject({ replayed: true, revision: { id: r1.body.revision.id } });
    expect(tete()).toBe(r2.body.revision.id);
  });
});

describe("BLOC-03 — aucune commande appliquée deux fois, aucun écrasement de conflit", () => {
  it("BLOC-03 [+] la première application d'un requestId écrit une révision", async () => {
    const n = nbRevisions();
    expect((await commander("editeur", enveloppe("q1", "r1", [ligne("b", 1)]))).body.replayed).toBe(false);
    expect(nbRevisions()).toBe(n + 1);
  });
  it("BLOC-03 [−] même requestId rejoué : aucune seconde révision ; autre contenu : 409 request_conflict ; base périmée : 409 stale_revision", async () => {
    const e = enveloppe("q1", "r1", [ligne("b", 1)]);
    const r = await commander("editeur", e);
    const n = nbRevisions();
    expect((await commander("editeur", e)).body).toMatchObject({ replayed: true, revision: { id: r.body.revision.id } });
    expect(nbRevisions()).toBe(n);
    expect((await commander("editeur", enveloppe("q1", "r1", [ligne("b", 9)]))).body).toMatchObject({ error: "request_conflict" });
    const avant = instantane();
    const s = await commander("proprietaire", enveloppe("q2", "r1", [deplacer("a", 1)]));
    expect(s.status).toBe(409);
    expect(s.body).toMatchObject({ error: "stale_revision", headRevisionId: r.body.revision.id });
    expect(instantane()).toBe(avant);
  });
});

describe("INV-011 — les annulations concurrentes ne détruisent pas silencieusement le travail d'un autre acteur", () => {
  async function deuxSessions() {
    // A crée `b`, B modifie ensuite `a` sur la tête : la session A est restée sur la révision de sa création.
    const ra = await commander("proprietaire", enveloppe("qa", "r1", [ligne("b", 1)]));
    const rb = await commander("editeur", enveloppe("qb", ra.body.revision.id, [deplacer("a", 3)]));
    return { baseA: ra.body.revision.id as string, teteB: rb.body.revision.id as string };
  }
  it("INV-011 [+] A annule son propre ajout (élément distinct) : refus 409 sans chevauchement, reporté sur la tête, le travail de B demeure", async () => {
    const { baseA, teteB } = await deuxSessions();
    const r = await commander("proprietaire", enveloppe("qa-annule", baseA, [supprimer("b")]));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "stale_revision", overlapCount: 0, appliesOnHead: true });
    const report = await commander("proprietaire", enveloppe("qa-annule-2", teteB, [supprimer("b")]));
    expect(report.status).toBe(200);
    expect(report.body.revision.document.objects).toEqual([expect.objectContaining({ id: "a", start: { x: 0, y: 3 } })]);
  });
  it("INV-011 [−] l'annulation de A retirerait `a` modifié par B : conflit signalé (chevauchement objects:a), tête de B intacte", async () => {
    const { baseA, teteB } = await deuxSessions();
    const avant = instantane();
    const r = await commander("proprietaire", enveloppe("qa-annule", baseA, [supprimer("a")]));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: "stale_revision", headRevisionId: teteB, overlaps: ["objects:a"] });
    expect(instantane()).toBe(avant);
  });
});

describe("INV-009 — un profil personnalisé ne change ni données, ni droits, ni révision de conception", () => {
  it("INV-009 [+] standard → métier → personnel : préférences du compte seulement ; révisions, tête et catalogue autorisé inchangés", async () => {
    const catalogue = (await get("lecteur", `${S}/preferences/catalogue`)).body;
    const etude = structuredClone([banc.lignes.get(studioRevisions), banc.lignes.get(studioVariants)]);
    for (const profil of ["standard", "metier:volume", "personnel"]) {
      const r = await request(app).put(`${S}/preferences/outils`).set("x-acteur", "lecteur").send({ profil, favoris: ["studio.dessin.ligne"], personnel: ["studio.dessin.ligne"] });
      expect(r.status).toBe(200);
      expect((await get("lecteur", `${S}/preferences/catalogue`)).body).toEqual(catalogue);
    }
    expect([banc.lignes.get(studioRevisions), banc.lignes.get(studioVariants)]).toEqual(etude);
    expect(banc.lignes.get(studioToolPreferences)).toHaveLength(1);
    // Le catalogue autorisé ne lit aucune préférence : même verdict quel que soit le profil (signature : droit, rôle).
    expect(catalogueAutorise(motifRefusEcriture(null), "editeur").entrees.every((e) => e.autorise)).toBe(true);
  });
  it("INV-009 [−] un profil qui affiche « Publier » ou se déclare des droits ne donne rien : champs refusés, commande du lecteur refusée par le serveur", async () => {
    expect(lireCorpsPreferences({ profil: "standard", favoris: [], personnel: [], droits: { ecriture: true } })).toMatchObject({ ok: false, body: { error: "invalid_input" } });
    expect(lireCorpsPreferences({ profil: "standard", favoris: ["studio.publier"], personnel: [] })).toMatchObject({ ok: false, body: { error: "unknown_tool", tools: ["studio.publier"] } });
    expect(lireCorpsPreferences({ profil: "admin", favoris: [], personnel: [] })).toMatchObject({ ok: false });
    // Un lecteur dont toutes les mutations sont en favoris : la barre peut les montrer, l'exécution reste refusée.
    const mutations = STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => t.toolId);
    expect((await request(app).put(`${S}/preferences/outils`).set("x-acteur", "lecteur").send({ profil: "personnel", favoris: mutations, personnel: mutations })).status).toBe(200);
    const avant = instantane();
    const r = await commander("lecteur", enveloppe("q1", "r1", [ligne("b", 1)]));
    expect(r.status).toBe(403);
    expect(instantane()).toBe(avant);
    // Relu, un identifiant retiré du registre est signalé, jamais réinterprété comme un droit.
    expect(lireLignePreferences({ profile: "personnel", favorites: ["studio.retire"], personal: [] })).toMatchObject({ favoris: [], retires: ["studio.retire"] });
  });
  it("TEST-018 INV-009 [−] profil importé contenant « Publier » : la barre peut le montrer, la création et les transitions de publication du lecteur sont refusées par le serveur (403), rien n'est écrit", async () => {
    // Profil personnel du lecteur : toutes les mutations du registre en favoris (dont celles que la barre range sous « Publier »).
    const mutations = STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => t.toolId);
    expect((await request(app).put(`${S}/preferences/outils`).set("x-acteur", "lecteur").send({ profil: "personnel", favoris: mutations, personnel: mutations })).status).toBe(200);
    // Un brouillon existant (créé par le propriétaire) : le lecteur tente de le soumettre, l'approuver, le diffuser.
    const brouillon = await post("proprietaire", `${V}/publications`, { title: "Dossier du propriétaire", contenu: "dessin-2d" });
    expect(brouillon.status).toBe(201);
    const avant = instantane();
    const nbPublications = banc.lignes.get(studioPublications)!.length;
    const creation = await post("lecteur", `${V}/publications`, { title: "Publication du lecteur", contenu: "dessin-2d", requestId: "pub-lecteur" });
    expect(creation.status).toBe(403);
    expect(creation.body.id).toBeUndefined();
    for (const action of ["soumettre", "approuver", "diffuser", "actualiser"]) {
      const r = await post("lecteur", `${S}/studies/s/publications/${brouillon.body.id}/${action}`, action === "approuver" ? presente(brouillon.body) : {});
      expect(r.status, action).toBe(403);
    }
    expect(instantane()).toBe(avant);
    expect(banc.lignes.get(studioPublications)!).toHaveLength(nbPublications);
    expect(pub(brouillon.body.id)).toMatchObject({ workStatus: "brouillon", diffusionStatus: "non-diffuse", approvedManifestHash: null });
  });
});

describe("INV-010 — une requête IA ou extension passe par les mêmes validations centrales qu'une action humaine", () => {
  it("INV-010 [+] appel simulé d'un agent (MCP) sur une commande protégée : même point d'entrée, même schéma, mêmes droits, même idempotence", async () => {
    // Studio n'expose aujourd'hui aucun point d'entrée d'agent (`agentExposure: none`) : un adaptateur futur n'aurait que
    // `submitStudioCommands`, le point d'entrée de la route humaine.
    expect(STUDIO_TOOLS.every((t) => t.agentExposure === "none")).toBe(true);
    const e = enveloppe("agent-1", "r1", [ligne("b", 1)]);
    const humain = await commander("editeur", e);
    initialiserProjet();
    const agent = await submitStudioCommands(scope, "editeur", structuredClone(e));
    expect(agent.revision.document).toEqual(humain.body.revision.document);
    expect((await submitStudioCommands(scope, "editeur", structuredClone(e))).replayed).toBe(true);
  });
  it("INV-010 [−] un agent qui se déclare autre (auteur, origine, contournement) ou agit pour un lecteur est refusé ; aucune route n'écrit une révision hors du point d'entrée", async () => {
    const e = enveloppe("agent-1", "r1", [ligne("b", 1)]);
    for (const extra of [{ authorId: "proprietaire" }, { origin: "mcp" }, { skipValidation: true }]) {
      const err = await submitStudioCommands(scope, "editeur", { ...e, ...extra }).then(() => null, (x: unknown) => x);
      expect(err).toBeInstanceOf(StudioRequestError);
      expect((err as StudioRequestError).status).toBe(400);
    }
    expect(await submitStudioCommands(scope, "lecteur", e).then(() => null, (x: StudioRequestError) => x.status)).toBe(403);
    // Inventaire de tout `src/` (hors tests et outils d'essai) : seul `lib/studio-commands.ts` insère une révision ou
    // applique des commandes Studio — par drizzle ou en SQL brut (`INSERT INTO studio_revisions`, `UPDATE …`, ou
    // insertion dans une table nommée dynamiquement). Exception déclarée : `lib/studio-archive.ts`, qui réinsère les
    // révisions d'une archive en SQL brut sans appliquer de commande — chaque document y passe `validateStudioDocument`
    // (test suivant).
    const racine = fileURLToPath(new URL("../", import.meta.url));
    const sources = (readdirSync(racine, { recursive: true }) as string[]).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.startsWith("testing/"));
    const motif = /insert\(studioRevisions\)|applyStudioCommands\(|INSERT\s+INTO\s+"?studio_revisions\b|UPDATE\s+"?studio_revisions\b|INSERT\s+INTO\s+\$\{/i;
    const ecrivains = sources.filter((f) => motif.test(readFileSync(`${racine}${f}`, "utf8"))).sort();
    expect(ecrivains).toEqual(["lib/studio-archive.ts", "lib/studio-commands.ts"]);
  });
  it("INV-010 [−] import d'archive : un document de révision invalide refuse la section entière (validation centrale), avant toute écriture", async () => {
    const tables = emptyStudioTables();
    const valide = { id: "doc", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }] };
    tables.studio_studies = [{ id: "s9", project_id: "pA", name: "Étude", initial_variant_id: "v9" }];
    tables.studio_variants = [{ id: "v9", study_id: "s9", name: "Initiale", head_revision_id: "r9" }];
    const section = (document: unknown) => {
      const t = { ...tables, studio_revisions: [{ id: "r9", variant_id: "v9", parent_revision_id: null, document, payload_hash: "a".repeat(64), author_id: "uOwner" }] };
      const ident = { sourceProjectId: "pA", ownerId: "uOwner", accounts: [{ id: "uOwner", email: "owner@exemple.test" }] };
      return { schema: STUDIO_ARCHIVE_SCHEMA, schemaVersion: STUDIO_ARCHIVE_SCHEMA_VERSION, ...ident, tables: t, manifest: buildStudioManifest(t, ident) };
    };
    // Base de transaction factice : la validation précède tout accès (le premier accès lève « atteinte »).
    const atteinte = new Proxy({}, { get: () => () => { throw new Error("transaction atteinte"); } }) as never;
    for (const mauvais of [{ ...valide, units: "mm" }, { ...valide, frame: "geographic" }, { ...valide, objects: [{ ...valide.objects[0], end: { x: 0, y: 0 }, type: "cercle" }] }, { ...valide, objects: [valide.objects[0], valide.objects[0]] }]) {
      expect(checkStudioArchive(section(mauvais)).ok).toBe(true);
      const err = await importStudioArchive(atteinte, "pB", "importeur", section(mauvais)).then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(StudioArchiveError);
      expect((err as StudioArchiveError).erreurs[0]).toMatch(/^studio_revisions r9 : document invalide/);
    }
    // Document valide : la validation passe, l'import continue jusqu'à la base.
    expect(await importStudioArchive(atteinte, "pB", "importeur", section(valide)).then(() => null, (e: Error) => e.message)).toBe("transaction atteinte");
  });
});

describe("INV-014 — le mode hors connexion différencie travail local, confirmation serveur et droits à revérifier", () => {
  it("INV-014 [+] une enveloppe préparée hors ligne est confirmée par le serveur à la reconnexion, une seule fois (même requestId)", async () => {
    const e = enveloppe("hors-ligne-1", "r1", [ligne("b", 1)]);
    const r = await commander("editeur", e);
    expect(r.body.replayed).toBe(false);
    // Coupure pendant l'accusé : le client renvoie la même enveloppe, le serveur rend la confirmation d'origine.
    expect((await commander("editeur", e)).body).toMatchObject({ replayed: true, revision: { id: r.body.revision.id } });
  });
  it("INV-014 [−] au retour du réseau, les droits sont revérifiés : un compte devenu lecteur ou retiré est refusé, rien n'est écrit", async () => {
    const e = enveloppe("hors-ligne-1", "r1", [ligne("b", 1)]);
    const avant = instantane();
    expect((await commander("lecteur", e)).status).toBe(403);
    expect((await commander("etranger", e)).status).toBe(404);
    expect((await commander("editeur-verrou", e)).status).toBe(423);
    expect(instantane()).toBe(avant);
  });
  it("INV-014 [−] l'éditeur rétrogradé entre la préparation hors ligne et l'envoi est refusé (rôle relu dans la base) ; retiré, 404", async () => {
    const e = enveloppe("hors-ligne-2", "r1", [ligne("b", 1)]);
    // Préparée hors ligne par un éditeur, jamais envoyée ; le propriétaire le rétrograde pendant la coupure.
    roleDe("editeur", "lecteur");
    const avant = instantane();
    const r = await commander("editeur", e);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "forbidden", role: "lecteur" });
    expect(instantane()).toBe(avant);
    banc.lignes.set(projectMembers, banc.lignes.get(projectMembers)!.filter((m) => m["userId"] !== "editeur"));
    expect((await commander("editeur", e)).status).toBe(404);
  });
  it("INV-014 BLOC-03 [−] rejeu du même requestId après rétrogradation : refus 403 AVANT tout rejeu (la confirmation d'origine n'est pas rendue)", async () => {
    const e = enveloppe("hors-ligne-3", "r1", [ligne("b", 1)]);
    const r = await commander("editeur", e);
    expect(r.body.replayed).toBe(false);
    // L'accusé s'est perdu ; le compte est rétrogradé avant que le client ne renvoie la même enveloppe.
    roleDe("editeur", "lecteur");
    const n = nbRevisions();
    const rejeu = await commander("editeur", e);
    expect(rejeu.status).toBe(403);
    expect(rejeu.body.replayed).toBeUndefined();
    expect(rejeu.body.revision).toBeUndefined();
    expect(nbRevisions()).toBe(n);
  });
});

/** Rôle d'un membre du projet `p`, modifié dans la base simulée (que relit l'accès simulé). */
function roleDe(userId: string, role: "lecteur" | "editeur") {
  const m = banc.lignes.get(projectMembers)!.find((x) => x["projectId"] === "p" && x["userId"] === userId);
  if (!m) throw new Error(`membre ${userId} absent`);
  m["role"] = role;
}

describe("BLOC-02 — aucun accès inter-projets non autorisé", () => {
  it("BLOC-02 [+] un membre lit son projet, son étude, sa variante et ses exports", async () => {
    for (const url of [`${S}/studies`, `${S}/studies/s`, V, `${V}/export?format=svg`]) expect((await get("lecteur", url)).status, url).toBe(200);
  });
  it("BLOC-02 [−] objets d'un autre projet par l'adresse, la variante ou l'export : 404 sans fuite, même pour le propriétaire de p", async () => {
    for (const url of ["/projects/q/studio/studies", "/projects/q/studio/studies/s", "/projects/q/studio/studies/s/variants/v", "/projects/q/studio/studies/s/variants/v/export?format=svg", `${S}/studies/autre/variants/v`, `${S}/studies/s/variants/autre/export?format=svg`]) {
      const r = await get("proprietaire", url);
      expect(r.status, url).toBe(404);
      expect(r.body).toEqual({ error: "not_found" });
    }
    const avant = instantane();
    expect((await request(app).post("/projects/q/studio/studies/s/variants/v/commands").set("x-acteur", "proprietaire").send(enveloppe("x", "r1", [ligne("b", 1)]))).status).toBe(404);
    expect(instantane()).toBe(avant);
  });
  it("BLOC-02 [−] étude et variante RÉELLES du projet q (autre propriétaire) adressées par /projects/p/… : 404 sans fuite, rien n'est écrit", async () => {
    // Elles existent bien : leur propriétaire les lit par leur projet.
    expect((await get("autre" as Acteur, "/projects/q/studio/studies/sq/variants/vq")).status).toBe(200);
    const Q = `${S}/studies/sq`, VQ = `${Q}/variants/vq`;
    for (const url of [Q, `${Q}/variants`, VQ, `${VQ}/revisions`, `${VQ}/revisions/rq1`, `${VQ}/export?format=svg`, `${VQ}/comments`, `${S}/studies/s/variants/vq`, `${S}/studies/s/variants/vq/export?format=svg`, `${V}/revisions/rq1`, `${S}/studies/sq/compare?from=vq&to=vq`]) {
      const r = await get("proprietaire", url);
      expect(r.status, url).toBe(404);
      expect(r.body, url).toEqual({ error: "not_found" });
      expect(JSON.stringify(r.body)).not.toMatch(/sq|vq|rq1|doc-q/);
    }
    const avant = instantane();
    for (const [url, corps] of [[`${VQ}/commands`, enveloppe("x-q", "rq1", [ligne("b", 1)])], [`${S}/studies/s/variants/vq/commands`, enveloppe("x-q2", "rq1", [ligne("b", 1)])], [`${VQ}/comments`, { body: "Fuite ?" }], [`${Q}/variants`, { name: "Intruse" }]] as const) {
      const r = await post("proprietaire", url, corps);
      expect(r.status, url).toBe(404);
    }
    expect(instantane()).toBe(avant);
  });
  it("TEST-035 BLOC-02 [−] publication de p référençant la variante ou la révision RÉELLES du projet q : refusée côté serveur, sans fuite (ni nom, ni empreinte, ni révision de q), rien n'est écrit", async () => {
    const docQ = banc.lignes.get(studioRevisions)!.find((r) => r.id === "rq1")!.document;
    const empreinteQ = studioDocumentHash(docQ as never);
    const fuite = new RegExp(["Variante de q", "Étude de q", "Autre projet", "doc-q", "rq1", empreinteQ].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
    const avant = instantane();
    // Variante coordonnée d'un autre projet (par son identifiant) ; révision d'un autre projet comme source principale.
    for (const corps of [{ title: "Dossier coordonné", coordinatedVariantIds: ["vq"] }, { title: "Dossier coordonné", coordinatedVariantIds: ["vq"], requestId: "pub-q" }, { title: "Dossier révision q", revisionId: "rq1" }, { title: "Dossier révision q", contenu: "dessin-2d", revisionId: "rq1" }]) {
      const r = await post("proprietaire", `${V}/publications`, corps);
      expect([400, 404], JSON.stringify(corps)).toContain(r.status);
      expect(r.body.id, JSON.stringify(corps)).toBeUndefined();
      expect(r.body.manifest, JSON.stringify(corps)).toBeUndefined();
      expect(JSON.stringify(r.body), JSON.stringify(corps)).not.toMatch(fuite);
    }
    // Par la variante de q directement sous /projects/p/… : 404 nu.
    const direct = await post("proprietaire", `${S}/studies/s/variants/vq/publications`, { title: "Intrus" });
    expect(direct.status).toBe(404);
    expect(direct.body).toEqual({ error: "not_found" });
    expect(instantane()).toBe(avant);
    expect(banc.lignes.get(studioPublications) ?? []).toHaveLength(0);
  });
});

describe("Base simulée — transactions, unicités et déclencheurs de db/init.sql (fidélité de l'outil d'essai)", () => {
  it("la transaction reçoit un tx distinct de db ; écrire par db pendant qu'elle est ouverte échoue, et elle est annulée", async () => {
    const avant = instantane();
    let distinct = false;
    const err = await db.transaction(async (tx) => {
      distinct = (tx as unknown) !== db;
      await tx.insert(studioComments).values({ id: "c-tx", variantId: "v", authorId: "editeur", body: "dans tx", objectIds: [], payloadHash: "h" });
      await db.insert(studioComments).values({ id: "c-hors", variantId: "v", authorId: "editeur", body: "hors tx", objectIds: [], payloadHash: "h" });
    }).then(() => null, (e: Error) => e.message);
    expect(distinct).toBe(true);
    expect(err).toMatch(/écriture par db pendant une transaction ouverte/);
    expect(instantane()).toBe(avant);
    // db.transaction imbriqué : refusé aussi (autre connexion) ; tx employé après sa transaction : refusé.
    let fuite: unknown;
    expect(await db.transaction(async (tx) => { fuite = tx; await db.transaction(async () => undefined); }).then(() => null, (e: Error) => e.message)).toMatch(/pendant une transaction ouverte/);
    expect(await (fuite as typeof db).insert(studioComments).values({ id: "c-x", variantId: "v", authorId: "editeur", body: "x", objectIds: [], payloadHash: "h" }).then(() => null, (e: Error) => e.message)).toMatch(/hors de sa transaction/);
    // Point de sauvegarde annulé seul ; la transaction englobante valide le reste.
    await db.transaction(async (tx) => {
      await tx.insert(studioComments).values({ id: "c-a", variantId: "v", authorId: "editeur", body: "a", objectIds: [], payloadHash: "h" });
      await tx.transaction(async (sp) => { await sp.insert(studioComments).values({ id: "c-b", variantId: "v", authorId: "editeur", body: "b", objectIds: [], payloadHash: "h" }); throw new Error("annule"); }).catch(() => undefined);
    });
    expect(banc.lignes.get(studioComments)!.map((c) => c["id"])).toEqual(["c1", "c-a"]);
  });
  it("unicités lues dans init.sql : requestId de révision, de commentaire (partiel : NULL ne se heurte pas), liens d'observation, ajustements du métré ; 23505 sans rien écrire", async () => {
    const noms = (t: string) => SCHEMA.unicites.get(t)!.map((u) => u.nom);
    expect(noms("studio_revisions")).toEqual(expect.arrayContaining(["studio_revisions_pkey", "studio_revisions_request_unique"]));
    expect(noms("studio_comments")).toContain("studio_comments_request_unique");
    expect(noms("studio_observation_links")).toEqual(expect.arrayContaining(["studio_observation_links_ref_unique", "studio_observation_links_request_unique"]));
    expect(noms("studio_quantity_adjustments")).toEqual(expect.arrayContaining(["studio_quantity_adjustments_request_unique", "studio_quantity_adjustments_seq_unique"]));
    const avant = instantane();
    const code = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: { code?: string; constraint?: string }) => `${e.code} ${e.constraint}`);
    expect(await code(db.insert(studioRevisions).values({ id: "r-dup", variantId: "v", parentRevisionId: "r1", document: {} as never, envelope: null, requestId: "init-0", payloadHash: "h", source: "authenticated-session", authorId: "editeur", response: null as never }))).toBe("23505 studio_revisions_request_unique");
    expect(await code(db.insert(studioComments).values([{ id: "c-n1", variantId: "v", authorId: "editeur", body: "x", objectIds: [], payloadHash: "h" }, { id: "c-n2", variantId: "v", authorId: "editeur", body: "y", objectIds: [], payloadHash: "h", requestId: "c-1" }]))).toBe("23505 studio_comments_request_unique");
    expect(instantane()).toBe(avant);
    // Requêtes sans identifiant : NULL ne se heurte pas.
    await db.insert(studioComments).values([{ id: "c-n1", variantId: "v", authorId: "editeur", body: "x", objectIds: [], payloadHash: "h" }, { id: "c-n2", variantId: "v", authorId: "editeur", body: "y", objectIds: [], payloadHash: "h" }]);
    // onConflictDoNothing respecte l'unicité : la ligne en conflit est ignorée, l'autre insérée.
    await db.insert(studioComments).values([{ id: "c-n1", variantId: "v", authorId: "editeur", body: "doublon", objectIds: [], payloadHash: "h" }, { id: "c-n3", variantId: "v", authorId: "editeur", body: "z", objectIds: [], payloadHash: "h" }]).onConflictDoNothing();
    expect(banc.lignes.get(studioComments)!.map((c) => [c["id"], c["body"]])).toEqual([["c1", "Remarque"], ["c-n1", "x"], ["c-n2", "y"], ["c-n3", "z"]]);
    await db.insert(studioObservationLinks).values({ id: "l1", observationId: "c1", variantId: "v", domaine: "objet", ref: "a", createdBy: "editeur", requestId: "l-1" });
    expect(await code(db.insert(studioObservationLinks).values({ id: "l2", observationId: "c9", variantId: "v", domaine: "objet", ref: "a", createdBy: "editeur" }))).toBe("23505 studio_observation_links_ref_unique");
    expect(await code(db.update(studioComments).set({ requestId: "c-1" }).where(eq(studioComments.id, "c-n1")))).toBe("23505 studio_comments_request_unique");
  });
  it("déclencheurs de init.sql : UPDATE d'une révision ou d'un journal refusé, DELETE d'un évènement de publication existante refusé", async () => {
    expect([...SCHEMA.declencheurs.keys()]).toEqual(expect.arrayContaining(["studio_revisions", "studio_publication_events", "studio_observation_events", "studio_requirement_sets", "studio_quantity_adjustments"]));
    const avant = instantane();
    const message = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: Error) => e.message);
    expect(await message(db.update(studioRevisions).set({ payloadHash: "autre" }).where(eq(studioRevisions.id, "r1")))).toBe("studio_revision_immutable");
    // Aucune ligne visée : le déclencheur FOR EACH ROW ne se déclenche pas.
    expect(await message(db.update(studioRevisions).set({ payloadHash: "autre" }).where(eq(studioRevisions.id, "inconnue")))).toBeNull();
    expect(instantane()).toBe(avant);
    const d = await diffusee();
    expect(await message(db.delete(studioPublicationEvents).where(eq(studioPublicationEvents.publicationId, d.id)))).toBe("studio_publication_event_undeletable");
    expect(await message(db.delete(studioPublications).where(eq(studioPublications.id, d.id)))).toBe("studio_publication_undeletable");
  });
  it("BLOC-03 [−] concurrence simulée : deux envois simultanés du même commentaire (même requestId) — le second heurte l'index unique (23505) et relit le premier ; une seule ligne", async () => {
    const entree = { body: "Envoyé deux fois", requestId: "c-concurrent" };
    const [a, b] = await Promise.all([createStudioComment(scope, "editeur", entree), createStudioComment(scope, "editeur", entree)]);
    expect(banc.violations).toEqual(["studio_comments_request_unique"]);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.id).toBe(b.id);
    expect(banc.lignes.get(studioComments)!.filter((c) => c["requestId"] === "c-concurrent")).toHaveLength(1);
    // Même requestId, autre contenu, en concurrence : 409 request_conflict, jamais un second commentaire.
    initialiserProjet();
    const r = await Promise.allSettled([createStudioComment(scope, "editeur", entree), createStudioComment(scope, "editeur", { ...entree, body: "Autre" })]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason as StudioRequestError).body).toMatchObject({ error: "request_conflict" });
    expect(banc.lignes.get(studioComments)!.filter((c) => c["requestId"] === "c-concurrent")).toHaveLength(1);
  });
  it("BLOC-03 [−] lots concurrents sur la même base : sérialisés, un seul avance la tête, l'autre reçoit 409 stale_revision", async () => {
    const n = nbRevisions();
    const [x, y] = await Promise.all([commander("editeur", enveloppe("cc-1", "r1", [ligne("b", 1)])), commander("proprietaire", enveloppe("cc-2", "r1", [ligne("c", 2)]))]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect(nbRevisions()).toBe(n + 1);
    expect([x, y].find((r) => r.status === 409)!.body).toMatchObject({ error: "stale_revision", headRevisionId: tete() });
  });
});

/** Manifeste construit hors de toute base (sert de témoin à la règle pure de normalisation). */
it("INV-001 [+] le manifeste normalisé est indépendant de l'ordre de présentation des sources et des documents", () => {
  const meta = { projectCode: "P", projectName: "Projet", studyName: "Étude", variantName: "Variante", revisionCreatedAt: "2026-10-19T08:00:00.000Z" };
  const doc = (format: string) => ({ format, fileName: `f.${format}`, mime: "x", size: 1, sha256: format.padEnd(64, "0") });
  const sources = [{ role: "principale" as const, variantId: "v", revisionId: "r1", documentHash: "h1" }, { role: "coordonnee" as const, variantId: "w", revisionId: "r9", documentHash: "h9" }];
  const a = construireManifeste(sources, meta, [doc("svg"), doc("dxf")]);
  const b = construireManifeste([...sources].reverse(), meta, [doc("dxf"), doc("svg")]);
  expect(empreinteManifeste(a)).toBe(empreinteManifeste(b));
});
