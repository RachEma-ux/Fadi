import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
/**
 * BLOC-02 / TEST-035 — « aucun accès entre projets par une tâche » : volet des TRAITEMENTS SERVEUR de Studio (les refus
 * par URL, export et composition de publication sont prouvés ailleurs, voir « TEST-035 » dans `routes/`). Routeur
 * Express réel, base simulée en mémoire (`testing/studio-base-simulee.ts`) : le compte `editeur` n'est membre que du
 * projet `p` ; le projet `q` (compte `autre`) porte des solides, une observation, un modèle externe et une feuille.
 *
 * Pour chaque traitement serveur — recalcul des booléens exacts (`lib/studio-exact.ts`, dans `submitStudioCommands`),
 * contrôle d'exigences et rapprochement des observations (`lib/studio-observations-rapprochement.ts`), relecture des
 * modèles externes (`lib/studio-modeles-externes.ts`), composition des feuilles et dossiers — la demande qui vise `q`,
 * ou qui mêle un identifiant de `q` à une demande sur `p`, est refusée (404 ou refus nommé) ; des ESPIONS montrent que
 * le traitement n'a pas tourné (noyau exact jamais chargé ni appelé, fonctions de calcul jamais appelées), l'instantané
 * de la base est inchangé, et aucune donnée de `q` n'apparaît dans la réponse. Un témoin positif sur `p` montre, dans
 * chaque test, que les mêmes espions relèvent bien le traitement quand il est légitime.
 */
const espions = vi.hoisted(() => ({ executer: undefined as unknown as Mock }));

vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
// Noyau exact espionné : `moteurExact` (chargement) et `executer` (calcul), résultat fixe (empreinte 0123456789abcdef).
vi.mock("../lib/atelier-exact.js", async () => {
  espions.executer = vi.fn(() => ({
    brep: Buffer.from("brep-srv").toString("base64"), maillage: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, volume: 12, aire: 32, faces: 10, solides: 1,
    moteur: "occt-wasm", versionMoteur: "0.0.1", empreinte: "0123456789abcdef",
  }));
  return { TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn(), moteurExact: vi.fn(async () => ({ executer: espions.executer })) };
});
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));
// Calculs espionnés (comportement réel conservé).
vi.mock("@parcours/atelier-model", async (original) => {
  const reel = await original<typeof import("@parcours/atelier-model")>();
  return { ...reel, rapprocherObservations: vi.fn(reel.rapprocherObservations), composerFeuilleComposee: vi.fn(reel.composerFeuilleComposee) };
});
vi.mock("../lib/studio-exigences.js", async (original) => {
  const reel = await original<typeof import("../lib/studio-exigences.js")>();
  return { ...reel, resultatControle: vi.fn(reel.resultatControle) };
});
vi.mock("../lib/studio-modeles-externes.js", async (original) => {
  const reel = await original<typeof import("../lib/studio-modeles-externes.js")>();
  return { ...reel, deciderReception: vi.fn(reel.deciderReception), decideComparaison: vi.fn(reel.decideComparaison), deciderPassage: vi.fn(reel.deciderPassage) };
});

import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { applyStudioCommands, composerFeuilleComposee, newStudioDocument, rapprocherObservations, STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import { studioExternalModels, studioRevisions, studioVariants } from "../db/schema.js";
import { moteurExact } from "../lib/atelier-exact.js";
import { resultatControle } from "../lib/studio-exigences.js";
import { decideComparaison, deciderPassage, deciderReception } from "../lib/studio-modeles-externes.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, instantane, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const AUTRE = "autre" as Acteur;
const S = "/projects/p/studio", V = `${S}/studies/s/variants/v`;
const Q = "/projects/q/studio", VQ = `${Q}/studies/sq/variants/vq`;
/** Adresses MÊLÉES : projet `p` dans l'URL, étude ou variante de `q`. */
const MELEES = [`${S}/studies/sq/variants/vq`, `${S}/studies/s/variants/vq`];
const post = (a: Acteur, url: string, body: unknown = {}) => request(app).post(url).set("x-acteur", a).send(body as object);

const boite = (id: string, x: number): StudioCommand => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } }) as StudioCommand;
const ligneQ = { toolId: "studio.dessin.ligne", params: { id: "QL", type: "line", start: { x: 0, y: 0 }, end: { x: 7, y: 0 } } } as StudioCommand;
const booleen = (operandes: string[], id = "E"): StudioCommand => ({ toolId: "studio.solide.booleen", params: { id, operation: "union", operandes, resultat: { empreinte: "0123456789abcdef" } } }) as StudioCommand;
let n = 0;
const lot = (commands: StudioCommand[], baseRevisionId = "r1") => ({ contractVersion: STUDIO_CONTRACT, requestId: `lot-${++n}`, baseRevisionId, commands });

const IFC = readFileSync(new URL("../../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const reception = (reference: string) => ({ reference, auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B", uniteDeclaree: "mm", transformation: null, nomFichier: "recette.ifc", contenu: IFC });
const FEUILLE = { title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" };

/** Chaînes propres au projet `q` (jamais envoyées par le compte de `p`) : aucune ne doit sortir dans une réponse. */
const SECRETS_Q = ["doc-q", "Étude de q", "Variante de q", "autre@exemple.test", "Secret de q", "Référence secrète de q", "Plan secret de q"];
let modeleQ = "", feuilleQ = "";

const tousLesEspions = () => [moteurExact, espions.executer, rapprocherObservations, composerFeuilleComposee, resultatControle, deciderReception, decideComparaison, deciderPassage].map((f) => vi.mocked(f as never) as { mock: { calls: unknown[] }; mockClear: () => void });
const remettreEspions = () => tousLesEspions().forEach((f) => f.mockClear());

/**
 * Demande refusée par `editeur` (membre de `p` seulement) : statut attendu, base inchangée (instantané, aucune écriture
 * ni transaction validée), espions muets, aucune donnée de `q` dans la réponse.
 */
async function refusee(url: string, body: unknown, statut: number, code?: string) {
  remettreEspions();
  const avant = instantane(), ecritures = banc.ecritures, validees = banc.transactions.validees;
  const r = await post("editeur", url, body);
  expect(r.status, `${url} ${r.text}`).toBe(statut);
  if (code) expect(r.body.code ?? r.body.error, url).toBe(code);
  expect(instantane(), url).toBe(avant);
  expect(banc.ecritures, url).toBe(ecritures);
  expect(banc.transactions.validees, url).toBe(validees);
  tousLesEspions().forEach((f, i) => expect(f.mock.calls, `${url} : espion ${i} appelé`).toHaveLength(0));
  for (const s of SECRETS_Q) expect(r.text, `${url} laisse fuir « ${s} »`).not.toContain(s);
  return r;
}

beforeEach(async () => {
  initialiserProjet();
  n = 0;
  // Solides des deux projets : A, B dans `p` (tête r1) ; QA, QB dans `q` (tête rq1), identifiants propres à `q`.
  const revisions = banc.lignes.get(studioRevisions)!;
  const r1 = revisions.find((r) => r["id"] === "r1")!, rq1 = revisions.find((r) => r["id"] === "rq1")!;
  r1["document"] = applyStudioCommands(r1["document"] as never, [boite("A", 0), boite("B", 1)]);
  rq1["document"] = applyStudioCommands(newStudioDocument("doc-q"), [boite("QA", 0), boite("QB", 1), ligneQ]);
  // Contenu de `q` créé par ses routes (compte `autre`) : observation ancrée sur la ligne QL, modèle externe, feuille.
  const o = await post(AUTRE, `${VQ}/observations`, { body: "Secret de q", responsableId: "autre", audience: "projet", revisionId: "rq1", objectIds: ["QL"] });
  expect(o.status, o.text).toBe(201);
  const m = await post(AUTRE, `${VQ}/modeles-externes`, reception("Référence secrète de q"));
  expect(m.status).toBe(201);
  modeleQ = m.body.id as string;
  const f = await post(AUTRE, `${VQ}/sheets`, { ...FEUILLE, number: "Q-01", title: "Plan secret de q" });
  expect(f.status).toBe(201);
  feuilleQ = f.body.id as string;
  remettreEspions();
});

describe("TEST-035 / BLOC-02 — aucun accès entre projets par une tâche serveur", () => {
  it("TEST-035 / BLOC-02 [−] booléen exact : lot visant la variante de q, adresse mêlée, opérandes ou base de q dans un lot sur p → refusé sans fuite, noyau exact jamais chargé ni appelé, rien d'écrit", async () => {
    // Témoin : le même booléen sur les solides de p est recalculé par le noyau du serveur.
    const t = await post("editeur", `${V}/commands`, lot([booleen(["A", "B"])]));
    expect(t.status, t.text).toBe(200);
    expect(vi.mocked(moteurExact)).toHaveBeenCalledTimes(1);
    expect(espions.executer).toHaveBeenCalledTimes(1);
    const tete = banc.lignes.get(studioVariants)!.find((v) => v["id"] === "v")!["headRevisionId"] as string;

    // La variante de q, par son adresse.
    await refusee(`${VQ}/commands`, lot([booleen(["QA", "QB"])], "rq1"), 404, "not_found");
    for (const url of MELEES) await refusee(`${url}/commands`, lot([booleen(["QA", "QB"])], "rq1"), 404, "not_found");
    // Opérandes de q dans un lot sur p (seuls, ou mêlés à un solide de p) : relus dans le document de p, introuvables.
    await refusee(`${V}/commands`, lot([booleen(["QA", "QB"], "E2")], tete), 400, "studio-invalid");
    await refusee(`${V}/commands`, lot([booleen(["A", "QB"], "E2")], tete), 400, "studio-invalid");
    // Base citée = révision de q : conflit de révision, sans rien relire de q (`baseKnown` faux).
    const r = await refusee(`${V}/commands`, lot([booleen(["A", "B"], "E2")], "rq1"), 409, "stale_revision");
    expect(r.body).toMatchObject({ baseKnown: false, headRevisionId: tete });
    expect(r.body).not.toHaveProperty("changedKeys");
  });

  it("TEST-035 / BLOC-02 [−] contrôle d'exigences et rapprochement des observations : variante de q, adresse mêlée ou révision de q citée sur p → 404 (objet de q ancré : refus nommé), ni contrôle ni rapprochement calculé, rien d'écrit", async () => {
    // Témoin : sur p, le contrôle et le rapprochement tournent (une observation de p à rapprocher).
    expect((await post("editeur", `${V}/observations`, { body: "Remarque de p", responsableId: "editeur", audience: "projet", revisionId: "r1", objectIds: ["a"] })).status).toBe(201);
    remettreEspions();
    expect((await post("editeur", `${V}/controles`, {})).status).toBe(201);
    expect(vi.mocked(resultatControle)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rapprocherObservations)).toHaveBeenCalledTimes(1);
    remettreEspions();
    expect((await post("editeur", `${V}/observations/rapprochements`, {})).status).toBe(200);
    expect(vi.mocked(rapprocherObservations)).toHaveBeenCalledTimes(1);

    for (const url of [VQ, ...MELEES]) {
      await refusee(`${url}/controles`, {}, 404, "not_found");
      await refusee(`${url}/controles`, { revisionId: "rq1" }, 404, "not_found");
      await refusee(`${url}/observations/rapprochements`, {}, 404, "not_found");
      await refusee(`${url}/observations/rapprochements`, { revisionId: "rq1" }, 404, "not_found");
    }
    await refusee(`${V}/controles`, { revisionId: "rq1" }, 404, "not_found");
    await refusee(`${V}/observations/rapprochements`, { revisionId: "rq1" }, 404, "not_found");
    // Ancrage : un objet de q (QL) ou la révision de q ne peuvent pas être cités par une observation de p (ce que le
    // rapprochement relirait ensuite).
    await refusee(`${V}/observations`, { body: "Ancrage croisé", responsableId: "editeur", audience: "projet", revisionId: "rq1", objectIds: ["QL"] }, 404, "not_found");
    await refusee(`${V}/observations`, { body: "Ancrage croisé", responsableId: "editeur", audience: "projet", revisionId: "r1", objectIds: ["QL"] }, 400, "unknown_objects");
  });

  it("TEST-035 / BLOC-02 [−] relecture des modèles externes : réception sur la variante de q ou adresse mêlée, comparaison / décision d'un modèle de q depuis p → 404 (décision : 403 avant toute recherche), aucun modèle relu ni comparé, rien d'écrit", async () => {
    // Témoin : sur p, la réception relit le fichier et la comparaison le compare à la tête.
    const m = await post("editeur", `${V}/modeles-externes`, reception("Référence de p"));
    expect(m.status).toBe(201);
    expect(vi.mocked(deciderReception)).toHaveBeenCalledTimes(1);
    remettreEspions();
    expect((await post("editeur", `${V}/modeles-externes/${m.body.id}/comparer`, {})).status).toBe(200);
    expect(vi.mocked(decideComparaison)).toHaveBeenCalledTimes(1);

    for (const url of [VQ, ...MELEES]) {
      await refusee(`${url}/modeles-externes`, reception("Référence de p"), 404, "not_found");
      await refusee(`${url}/modeles-externes/${modeleQ}/comparer`, {}, 404, "not_found");
    }
    // Modèle de q cité sous la variante de p.
    await refusee(`${V}/modeles-externes/${modeleQ}/comparer`, {}, 404, "not_found");
    // Accepter / refuser : réservé au rôle habilité ; l'éditeur de p est refusé avant même de chercher le modèle de q.
    for (const action of ["accepter", "refuser"]) await refusee(`${V}/modeles-externes/${modeleQ}/${action}`, { motif: "essai" }, 403);
    expect(banc.lignes.get(studioExternalModels)!.find((x) => x["id"] === modeleQ)).toMatchObject({ status: "compare", decidedBy: null });
  });

  it("TEST-035 / BLOC-02 [−] composition des feuilles et dossiers : feuille sur la variante ou la révision de q, dossier citant une feuille ou un métré de q → refusé sans fuite, aucune vue composée, rien d'écrit", async () => {
    // Témoin : sur p, la feuille est composée (vue contrôlée) puis versée dans un dossier.
    const f = await post("editeur", `${V}/sheets`, { ...FEUILLE, number: "A-01" });
    expect(f.status).toBe(201);
    expect(vi.mocked(composerFeuilleComposee)).toHaveBeenCalled();
    expect((await post("editeur", `${S}/studies/s/dossiers`, { title: "Dossier de p", sheetIds: [f.body.id] })).status).toBe(201);

    for (const url of [VQ, ...MELEES]) await refusee(`${url}/sheets`, { ...FEUILLE, number: "A-02" }, 404, "not_found");
    await refusee(`${V}/sheets`, { ...FEUILLE, number: "A-02", revisionId: "rq1" }, 404, "not_found");
    await refusee(`${Q}/studies/sq/dossiers`, { title: "Dossier croisé", sheetIds: [feuilleQ] }, 404, "not_found");
    await refusee(`${S}/studies/sq/dossiers`, { title: "Dossier croisé", sheetIds: [feuilleQ] }, 404, "not_found");
    const d = await refusee(`${S}/studies/s/dossiers`, { title: "Dossier croisé", sheetIds: [f.body.id, feuilleQ] }, 400, "dossier_sheet_unknown");
    expect(d.body.sheetIds).toEqual([feuilleQ]);
    await refusee(`${S}/studies/s/dossiers`, { title: "Dossier croisé", sheetIds: [f.body.id], quantities: { variantId: "vq" } }, 400, "dossier_quantities_invalid");
    await refusee(`${S}/studies/s/dossiers`, { title: "Dossier croisé", sheetIds: [f.body.id], quantities: { variantId: "v", revisionId: "rq1" } }, 400, "dossier_quantities_invalid");
  });
});
