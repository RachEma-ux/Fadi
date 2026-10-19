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
 * `vitest.guard.config.ts` ; aucune base n'est touchée (client simulé).
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
import { studioPublicationEvents, studioPublications, studioRevisions, studioToolPreferences, studioVariants } from "../db/schema.js";
import { StudioRequestError, submitStudioCommands } from "../lib/studio-commands.js";
import { controlerApprobation, controlerEnsembleExamine, empreinteManifeste, construireManifeste } from "../lib/studio-publication-statuts.js";
import { catalogueAutorise, lireCorpsPreferences, lireLignePreferences, motifRefusEcriture } from "../lib/studio-preferences.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

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
    // Inventaire : seul `lib/studio-commands.ts` insère une révision ou applique des commandes Studio.
    const racine = fileURLToPath(new URL("../", import.meta.url));
    const sources = ["routes", "lib"].flatMap((d) => readdirSync(`${racine}${d}`).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `${d}/${f}`));
    const ecrivains = sources.filter((f) => /insert\(studioRevisions\)|applyStudioCommands\(/.test(readFileSync(`${racine}${f}`, "utf8")));
    expect(ecrivains).toEqual(["lib/studio-commands.ts"]);
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
});

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
