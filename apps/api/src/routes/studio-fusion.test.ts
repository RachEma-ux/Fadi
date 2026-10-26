import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Fusion de variantes (lot W3-D, X.1-06) de bout en bout sur le routeur Express réel, base simulée en mémoire
 * (`testing/studio-base-simulee.ts` : aucune base ni serveur). Parcours : variante B dérivée de A (r1), changements des
 * deux côtés, aperçu (conflit), refus tant qu'un conflit n'est pas résolu, application en UNE révision `variant-merge`
 * de la cible (journal, effets), rejeu, annulation, ancêtre déplacé par la fusion, et les refus (droits, archive, têtes
 * changées, aperçu périmé, résolution inconnue, rien à fusionner, aucun ancêtre, copie indépendante).
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
import { studioRevisionEvents } from "../db/schema.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
const S = "/projects/p/studio/studies/s";
const A = `${S}/variants/v`;
const appel = (m: "get" | "post", url: string, corps?: unknown, acteur: Acteur = "proprietaire") => {
  const r = request(app)[m](url).set("x-acteur", acteur);
  return corps === undefined ? r : r.send(corps as object);
};
const ligne = (id: string, y: number, x = 1): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x, y } } });
async function tete(variant: string): Promise<string> { return (await appel("get", `${S}/variants/${variant}`)).body.revision.id; }
let n = 0;
async function commandes(variant: string, ...cs: StudioCommand[]): Promise<string> {
  const r = await appel("post", `${S}/variants/${variant}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: `q-${++n}`, baseRevisionId: await tete(variant), commands: cs });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.revision.id;
}
async function deriver(name = "B", mode?: "copie"): Promise<string> {
  const r = await appel("post", `${S}/variants`, { name, fromVariantId: "v", fromRevisionId: "r1", ...(mode ? { mode } : {}) });
  expect(r.status).toBe(201);
  return r.body.variant.id;
}
const apercu = (source: string, resolutions?: Record<string, string>, acteur: Acteur = "proprietaire") => appel("post", `${A}/fusion/apercu`, { sourceVariantId: source, ...(resolutions ? { resolutions } : {}) }, acteur);
async function corpsDepuisApercu(source: string, resolutions?: Record<string, string>, requestId = "fusion-1") {
  const a = (await apercu(source, resolutions)).body;
  return { requestId, sourceVariantId: source, sourceRevisionId: a.source.revisionId, baseRevisionId: a.cible.revisionId, empreinte: a.apercu.empreinte, ...(resolutions ? { resolutions } : {}) };
}
/** B (source) : déplace `a` et ajoute `b1` ; A (cible) : déplace aussi `a`, autrement, et ajoute `c1`. */
async function scenario() {
  const B = await deriver();
  await commandes(B, { toolId: "studio.dessin.deplacer", params: { id: "a", dx: 0, dy: 2 } }, ligne("b1", 5));
  await commandes("v", { toolId: "studio.dessin.deplacer", params: { id: "a", dx: 0, dy: 3 } }, ligne("c1", 6));
  return B;
}
const CONFLITS = ["modification:objects:a/end", "modification:objects:a/start"];
const tousSource = Object.fromEntries(CONFLITS.map((id) => [id, "source"]));

beforeEach(() => { initialiserProjet(); n = 0; });

describe("Fusion de variantes — API (lot W3-D, X.1-06)", () => {
  it("aperçu : ancêtre = révision de dérivation, changements des deux côtés, conflit par propriété, rien n'est écrit", async () => {
    const B = await scenario();
    const ecrites = banc.ecritures;
    const r = await apercu(B);
    expect(r.status).toBe(200);
    expect(r.body.ancetre).toEqual({ variantId: "v", revisionId: "r1" });
    expect(r.body.apercu.conflits.map((c: { id: string }) => c.id)).toEqual(CONFLITS);
    expect(r.body.apercu.nonResolus).toEqual(CONFLITS);
    expect(r.body.apercu.appliques).toEqual([{ cle: "objects:b1", etat: "ajoute", origine: "source" }]);
    expect(r.body.apercu.document).toBeUndefined();
    expect(r.body.canWrite).toBe(true);
    expect(banc.ecritures).toBe(ecrites);
    // Le lecteur voit l'aperçu, sans droit d'écrire.
    const l = await apercu(B, undefined, "lecteur");
    expect([l.status, l.body.canWrite]).toEqual([200, false]);
  });

  it("application : refusée tant qu'un conflit n'est pas résolu ; résolue, une seule révision `variant-merge` de la cible, journalisée", async () => {
    const B = await scenario();
    const avant = (await appel("get", `${A}/revisions`)).body.revisions.length;
    const refus = await appel("post", `${A}/fusion`, await corpsDepuisApercu(B));
    expect([refus.status, refus.body.error, refus.body.nonResolus]).toEqual([409, "conflits_non_resolus", CONFLITS]);
    const corps = await corpsDepuisApercu(B, tousSource);
    const r = await appel("post", `${A}/fusion`, corps);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.replayed).toBe(false);
    expect(r.body.fusion).toMatchObject({ type: "fusion", sourceVariantId: B, ancetreRevisionId: "r1", resolutions: tousSource, conflits: 2 });
    const doc = r.body.revision.document;
    expect(doc.objects.map((o: { id: string }) => o.id)).toEqual(["a", "c1", "b1"]);
    expect(doc.objects[0].start.y).toBe(2);
    const revisions = (await appel("get", `${A}/revisions`)).body.revisions;
    expect(revisions.length).toBe(avant + 1);
    expect(revisions.find((x: { id: string }) => x.id === r.body.revision.id)).toMatchObject({ source: "variant-merge", parentRevisionId: corps.baseRevisionId });
    const evenement = banc.lignes.get(studioRevisionEvents)!.find((e) => e["revisionId"] === r.body.revision.id)!;
    expect(evenement).toMatchObject({ variantId: "v", baseRevisionId: corps.baseRevisionId, authorId: "proprietaire", requestId: "fusion-1" });
    expect((evenement["effects"] as { crees: string[]; modifies: string[] })).toMatchObject({ crees: ["b1"], modifies: ["a"] });
    // La source n'est jamais écrite.
    expect((await appel("get", `${S}/variants/${B}/revisions`)).body.revisions.every((x: { source: string }) => x.source !== "variant-merge")).toBe(true);
    // Rejeu : même requestId, même contenu → réponse d'origine ; autre contenu → 409.
    const rejeu = await appel("post", `${A}/fusion`, corps);
    expect([rejeu.status, rejeu.body.replayed, rejeu.body.revision.id]).toEqual([200, true, r.body.revision.id]);
    const conflit = await appel("post", `${A}/fusion`, { ...corps, resolutions: { ...tousSource, [CONFLITS[0]!]: "cible" } });
    expect([conflit.status, conflit.body.error]).toEqual([409, "request_conflict"]);
    // Après la fusion, l'ancêtre d'une nouvelle fusion de B est la tête de B fusionnée : plus rien à fusionner.
    const ensuite = await apercu(B);
    expect([ensuite.body.ancetre.variantId, ensuite.body.apercu.aFusionner, ensuite.body.apercu.conflits]).toEqual([B, false, []]);
  });

  it("annulation : nouvelle révision `variant-merge-undo` au document d'avant ; la fusion annulée sort de l'histoire suivie", async () => {
    const B = await scenario();
    const corps = await corpsDepuisApercu(B, tousSource);
    const docAvant = (await appel("get", A)).body.revision.document;
    const fusion = await appel("post", `${A}/fusion`, corps);
    const r = await appel("post", `${A}/fusion/annulation`, { requestId: "annule-1", revisionId: fusion.body.revision.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.fusion).toEqual({ type: "annulation", revisionAnnulee: fusion.body.revision.id, revisionRendue: corps.baseRevisionId });
    expect(r.body.revision.document).toEqual(docAvant);
    expect((await appel("get", `${A}/revisions`)).body.revisions.find((x: { id: string }) => x.id === r.body.revision.id)).toMatchObject({ source: "variant-merge-undo", parentRevisionId: fusion.body.revision.id });
    // La même fusion se propose de nouveau (ancêtre d'avant), avec ses conflits.
    const de = await apercu(B);
    expect([de.body.ancetre.revisionId, de.body.apercu.nonResolus]).toEqual(["r1", CONFLITS]);
    // Une tête qui n'est pas une fusion ne s'annule pas.
    const non = await appel("post", `${A}/fusion/annulation`, { requestId: "annule-2", revisionId: r.body.revision.id });
    expect([non.status, non.body.error]).toEqual([409, "pas_une_fusion"]);
    const perime = await appel("post", `${A}/fusion/annulation`, { requestId: "annule-3", revisionId: fusion.body.revision.id });
    expect([perime.status, perime.body.error]).toEqual([409, "stale_revision"]);
  });

  it("droits : seul un rôle qui peut modifier la cible fusionne (lecteur 403, verrou d'un autre 423, étranger 404) ; rien n'est écrit", async () => {
    const B = await scenario();
    const corps = await corpsDepuisApercu(B, tousSource);
    for (const [acteur, statut, erreur] of [["lecteur", 403, "forbidden"], ["editeur-verrou", 423, "locked"], ["etranger", 404, "not_found"]] as const) {
      const ecrites = banc.ecritures;
      const r = await appel("post", `${A}/fusion`, corps, acteur);
      expect([acteur, r.status, r.body.error]).toEqual([acteur, statut, erreur]);
      expect(banc.ecritures).toBe(ecrites);
    }
    const e = await appel("post", `${A}/fusion`, corps, "editeur");
    expect(e.status).toBe(200);
  });

  it("cible archivée refusée (409 archived) ; source archivée lisible et fusionnable", async () => {
    const B = await scenario();
    const C = await deriver("C");
    await commandes(C, ligne("k1", 9));
    const corps = await corpsDepuisApercu(B, tousSource);
    expect((await appel("post", `${S}/variants/${B}/archive`)).status).toBe(200);
    expect((await appel("post", `${A}/fusion`, corps)).status).toBe(200);
    // Cible archivée : la variante C reçoit la fusion de A.
    expect((await appel("post", `${S}/variants/${C}/archive`)).status).toBe(200);
    const a = (await appel("post", `${S}/variants/${C}/fusion/apercu`, { sourceVariantId: "v" })).body;
    expect(a.canWrite).toBe(false);
    const r = await appel("post", `${S}/variants/${C}/fusion`, { requestId: "fz", sourceVariantId: "v", sourceRevisionId: a.source.revisionId, baseRevisionId: a.cible.revisionId, empreinte: a.apercu.empreinte ?? "0".repeat(64) });
    expect([r.status, r.body.error]).toEqual([409, "archived"]);
  });

  it("têtes changées et aperçu périmé : stale_revision, source_changee, apercu_perime ; résolution inconnue 400 ; rien à fusionner 409", async () => {
    const B = await scenario();
    const corps = await corpsDepuisApercu(B, tousSource);
    await commandes(B, ligne("b2", 7));
    expect((await appel("post", `${A}/fusion`, corps)).body.error).toBe("source_changee");
    const corps2 = await corpsDepuisApercu(B, tousSource);
    await commandes("v", ligne("c2", 8));
    expect((await appel("post", `${A}/fusion`, corps2)).body.error).toBe("stale_revision");
    const corps3 = await corpsDepuisApercu(B, tousSource);
    const perime = await appel("post", `${A}/fusion`, { ...corps3, empreinte: "0".repeat(64) });
    expect([perime.status, perime.body.error]).toEqual([409, "apercu_perime"]);
    const inconnue = await appel("post", `${A}/fusion`, { ...corps3, resolutions: { ...tousSource, "collision:objects:zz": "source" } });
    expect([inconnue.status, inconnue.body.error]).toEqual([400, "resolutions_inconnues"]);
    const invalide = await appel("post", `${A}/fusion`, { ...corps3, resolutions: { [CONFLITS[0]!]: "gauche" } });
    expect([invalide.status, invalide.body.error]).toEqual([400, "invalid_input"]);
    const C = await deriver("C");
    const rien = (await appel("post", `${S}/variants/${C}/fusion/apercu`, { sourceVariantId: "v" })).body;
    const vide = await appel("post", `${A}/fusion`, { requestId: "vide", sourceVariantId: C, sourceRevisionId: await tete(C), baseRevisionId: await tete("v"), empreinte: "0".repeat(64) });
    expect([vide.status, vide.body.error]).toEqual([409, "rien_a_fusionner"]);
    expect(rien.apercu.aFusionner).toBe(true);
  });

  it("aucun ancêtre commun (variante créée vide, copie indépendante) : 409 fusion_sans_ancetre ; même variante : 400", async () => {
    const vide = await appel("post", `${S}/variants`, { name: "Vide" });
    const r = await apercu(vide.body.variant.id);
    expect([r.status, r.body.error]).toEqual([409, "fusion_sans_ancetre"]);
    const copie = await deriver("Copie", "copie");
    const c = await apercu(copie);
    expect([c.status, c.body.error]).toEqual([409, "fusion_sans_ancetre"]);
    const meme = await apercu("v");
    expect([meme.status, meme.body.code]).toEqual([400, "meme_variante"]);
    const autre = await apercu("vq");
    expect(autre.status).toBe(404);
  });
});
