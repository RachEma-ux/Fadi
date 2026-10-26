import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Illustrations depuis une vue (lot F, décision P-12) — routeur Express réel, base simulée en mémoire
 * (`testing/studio-base-simulee.ts`), aucun réseau : le fournisseur externe est remplacé par un double.
 * TEST-032 (aucune mutation du modèle, provenance et permissions conservées), TR-AC-007, TR-EX-071, TR-EX-072,
 * TR-EX-094 (contrôle de politique avant transfert), F.2-03.
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
import { studioProvenanceRendu } from "@parcours/atelier-model";
import { STUDIO_CLE_PROVENANCE_ILLUSTRATION, STUDIO_CLE_PROVENANCE_RENDU } from "@parcours/atelier-model/studio-agents";
import { projectMembers, studioIllustrations, studioRevisions, studioStudies, studioVariants } from "../db/schema.js";
import { transportExterne } from "../lib/studio-illustration-externe.js";
import { ecrirePng, lirePng } from "../lib/studio-png.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => { res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) }); });

const V = "/projects/p/studio/studies/s/variants/v";
const camera = { projection: "perspective" as const, position: { x: 12, y: -9, z: 7 }, target: { x: 0, y: 0, z: 0 }, fov: 45 };
function rendu(over: { etude?: string; variante?: string; revisionId?: string } = {}) {
  return studioProvenanceRendu({ etude: { id: over.etude ?? "s", nom: "Étude" }, variante: { id: over.variante ?? "v", nom: "Variante" }, revisionId: over.revisionId ?? "r1", scene: null, date: new Date("2026-10-25T09:00:00Z"), camera , auteur: { id: "proprietaire", email: null } });
}
function pixels(w = 16, h = 12) {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const x = i % w; rgba[i * 4] = x * 15; rgba[i * 4 + 1] = 120; rgba[i * 4 + 2] = x > 8 ? 230 : 20; rgba[i * 4 + 3] = 255; }
  return { largeur: w, hauteur: h, rgba };
}
const source = (prov: unknown = rendu()) => ecrirePng(pixels(), prov === null ? {} : { [STUDIO_CLE_PROVENANCE_RENDU]: JSON.stringify(prov) }).toString("base64");
const corps = (over: Record<string, unknown> = {}) => ({ requestId: "illu-1", fournisseur: "local-derive", image: source(), parametres: { style: "trait", intensite: 0.5 }, ...over });
const poster = (a: Acteur, b: unknown) => request(app).post(`${V}/illustrations`).set("x-acteur", a).send(b as object);
const lire = (a: Acteur, url: string) => request(app).get(url).set("x-acteur", a);
/** État du modèle : études, variantes (têtes) et révisions — tout ce qu'une illustration ne doit pas toucher. */
const modele = () => JSON.stringify([banc.lignes.get(studioStudies), banc.lignes.get(studioVariants), banc.lignes.get(studioRevisions)]);
const nbIllustrations = () => (banc.lignes.get(studioIllustrations) ?? []).length;
const binaire = (r: request.Request) => r.buffer(true).parse((res, cb) => { const b: Buffer[] = []; res.on("data", (c: Buffer) => b.push(c)); res.on("end", () => cb(null, Buffer.concat(b))); });

let appelsExternes: { url: string; corps: Record<string, unknown> }[] = [];
const fetchReel = transportExterne.fetch;
beforeEach(() => {
  initialiserProjet();
  appelsExternes = [];
  transportExterne.fetch = (async (url: string, init: RequestInit) => {
    appelsExternes.push({ url, corps: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ image: ecrirePng(pixels(8, 6)).toString("base64") }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
afterEach(() => { transportExterne.fetch = fetchReel; vi.unstubAllEnvs(); });

function configurerExterne() {
  vi.stubEnv("STUDIO_ILLUSTRATION_EXTERNE_ACTIF", "1");
  vi.stubEnv("STUDIO_ILLUSTRATION_EXTERNE_URL", "https://illustrations.exemple.test/v1/generer");
  vi.stubEnv("STUDIO_ILLUSTRATION_EXTERNE_CLE", "cle-d-essai-fournie-par-l-administrateur");
  vi.stubEnv("STUDIO_ILLUSTRATION_EXTERNE_COUT", "0.04 CHF");
  vi.stubEnv("STUDIO_TRANSFERT_POLITIQUE", "avec-consentement");
  vi.stubEnv("STUDIO_TRANSFERT_CLASSIFICATIONS", "publique,interne");
  vi.stubEnv("STUDIO_TRANSFERT_FOURNISSEURS", "externe");
}
const consentement = { transfertExterne: true, coutAccepte: { montant: 0.04, devise: "CHF" } };

describe("TEST-032 — illustration depuis une vue : image séparée, modèle inchangé, provenance et permissions conservées", () => {
  it("TEST-032 [+] un éditeur produit une illustration locale depuis le rendu de la vue : 201, aucune révision, tête inchangée, provenance complète dans la réponse et dans le PNG archivé", async () => {
    const avant = modele();
    const r = await poster("editeur", corps());
    expect(r.status).toBe(201);
    expect(modele()).toBe(avant);
    expect(r.body).toMatchObject({
      revisionId: "r1", fournisseur: { id: "local-derive", nature: "local-deterministe" }, parametres: { style: "trait", intensite: 0.5 }, largeur: 16, hauteur: 12, creePar: "editeur", replayed: false,
      provenance: {
        nature: "illustration", mode: "derivee-locale", source: { rendu: { revisionId: "r1", camera, etude: { id: "s" }, variante: { id: "v" } } },
        modele: { revisionId: "r1", inchange: true }, auteur: { id: "editeur" }, sourcesEnvoyees: [], autorisation: { transfert: "aucun" },
        verification: { statut: "non-verifiee" }, reproductibilite: { deterministe: true },
      },
    });
    expect(r.body.provenance.modele.empreinteAvant).toBe(r.body.provenance.modele.empreinteApres);
    // L'image archivée est un PNG séparé qui porte sa provenance et son statut de vérification (AC-007).
    const img = await binaire(lire("lecteur", r.body.image));
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-studio-verification"]).toBe("non-verifiee");
    expect(img.headers["x-studio-source-revision"]).toBe("r1");
    const png = lirePng(img.body as Buffer);
    expect(JSON.parse(png.textes[STUDIO_CLE_PROVENANCE_ILLUSTRATION]!)).toEqual(r.body.provenance);
    expect([png.largeur, png.hauteur]).toEqual([16, 12]);
  });
  it("TEST-032 [+] permissions conservées : tout lecteur de la variante voit la liste et l'image ; un compte étranger au projet n'en voit rien", async () => {
    const r = await poster("proprietaire", corps());
    expect(r.status).toBe(201);
    const liste = await lire("lecteur", `${V}/illustrations`);
    expect(liste.status).toBe(200);
    expect(liste.body.illustrations.map((i: { id: string }) => i.id)).toEqual([r.body.id]);
    for (const url of [`${V}/illustrations`, r.body.image, `${V}/illustrations/fournisseurs`]) expect((await lire("etranger", url)).status).not.toBe(200);
    // Une illustration n'est lisible que sous sa variante (l'adresse sous une autre variante ne la divulgue pas).
    expect((await lire("autre" as Acteur, r.body.image.replace("/projects/p/", "/projects/q/").replace("/studies/s/variants/v/", "/studies/sq/variants/vq/"))).status).toBe(404);
  });
  it("TEST-032 [−] un lecteur ne produit pas d'illustration (403) ; source sans provenance, d'une autre variante ou d'une révision inconnue : refus 422 ; variante archivée : 409 ; rien n'est écrit", async () => {
    const avant = modele();
    expect((await poster("lecteur", corps())).status).toBe(403);
    expect((await poster("etranger", corps())).status).not.toBe(201);
    expect((await poster("editeur", corps({ image: source(null) }))).body).toMatchObject({ error: "source_inconnue" });
    expect((await poster("editeur", corps({ image: source(rendu({ variante: "vq" })) }))).body).toMatchObject({ error: "source_inconnue" });
    expect((await poster("editeur", corps({ image: source({ ...rendu(), nature: "illustration" }) }))).status).toBe(422);
    expect((await poster("editeur", corps({ image: source(rendu({ revisionId: "rq1" })) }))).body).toMatchObject({ error: "revision_differente" });
    expect((await poster("editeur", corps({ parametres: { style: "photo-realiste", intensite: 0.5 } }))).status).toBe(400);
    expect((await poster("editeur", corps({ image: Buffer.from("pas une image").toString("base64") }))).status).toBe(400);
    banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.archivedAt = new Date();
    expect((await poster("editeur", corps())).body).toMatchObject({ error: "archived" });
    banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.archivedAt = null;
    expect(modele()).toBe(avant);
    expect(nbIllustrations()).toBe(0);
  });
});

describe("TR-EX-072 — paramètres archivés, reproductibilité honnête ; idempotence par requestId", () => {
  it("TR-EX-072 [+] rejeu du même requestId : la même illustration (replayed) ; nouvelle génération locale avec les mêmes paramètres : mêmes pixels, déclarés reproductibles", async () => {
    const a = await poster("editeur", corps());
    const rejeu = await poster("editeur", corps());
    expect(rejeu.status).toBe(201);
    expect(rejeu.body).toMatchObject({ id: a.body.id, replayed: true });
    expect(rejeu.headers["idempotent-replayed"]).toBe("true");
    const b = await poster("editeur", corps({ requestId: "illu-2" }));
    expect(b.body.provenance.resultat.empreinte).toBe(a.body.provenance.resultat.empreinte);
    expect(b.body.provenance.reproductibilite.garantie).toMatch(/mêmes pixels/);
    expect(nbIllustrations()).toBe(2);
  });
  it("TR-EX-072 [−] même requestId pour un autre contenu ou un autre auteur : 409 request_conflict, rien n'est réécrit", async () => {
    await poster("editeur", corps());
    expect((await poster("editeur", corps({ parametres: { style: "lavis", intensite: 0.5 } }))).body).toMatchObject({ error: "request_conflict" });
    expect((await poster("proprietaire", corps())).body).toMatchObject({ error: "request_conflict" });
    expect(nbIllustrations()).toBe(1);
  });
});

describe("TR-EX-094 / TR-EX-071 — service externe : désactivé par défaut, jamais appelé sans politique, consentement, coût et clé", () => {
  it("TR-EX-094 [−] configuration par défaut : le service externe est indisponible et une demande est refusée avant toute transmission (le double n'est jamais appelé)", async () => {
    const f = await lire("lecteur", `${V}/illustrations/fournisseurs`);
    expect(f.body.fournisseurs.map((x: { id: string; disponible: boolean }) => [x.id, x.disponible])).toEqual([["local-derive", true], ["externe", false]]);
    expect(f.body.fournisseurs[1].manque).toEqual(expect.arrayContaining(["service externe non activé par l’administrateur", "aucune clé fournie par l’administrateur", "coût par génération non déclaré"]));
    const r = await poster("editeur", corps({ fournisseur: "externe", classification: "interne", consentement }));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe("transfert_refuse");
    expect(r.body.refus.map((x: { code: string }) => x.code)).toEqual(expect.arrayContaining(["fournisseur-inactif", "cle-absente", "cout-non-declare", "politique-interdit"]));
    expect(appelsExternes).toEqual([]);
    expect(nbIllustrations()).toBe(0);
  });
  it("TR-EX-094 [−] service configuré mais sans consentement, sans coût accepté, classification inconnue ou confidentielle : bloqué avant transmission", async () => {
    configurerExterne();
    for (const [extra, code] of [[{ classification: "interne" }, "consentement-absent"], [{ classification: "interne", consentement: { transfertExterne: true, coutAccepte: null } }, "cout-non-accepte"], [{ consentement }, "classification-inconnue"], [{ classification: "confidentielle", consentement }, "classification-refusee"]] as const) {
      const r = await poster("editeur", corps({ fournisseur: "externe", requestId: `x-${code}`, ...extra }));
      expect(r.status, code).toBe(422);
      expect(r.body.refus.map((x: { code: string }) => x.code), code).toEqual([code]);
    }
    expect(appelsExternes).toEqual([]);
  });
  it("TR-EX-094 [+] TR-EX-071 [+] politique, consentement au coût déclaré et clé fournie : un seul appel au double, provenance avec fournisseur, version « inconnue », source envoyée, consentement, coûts, quotas et reproductibilité non garantie ; modèle inchangé", async () => {
    configurerExterne();
    const avant = modele();
    const r = await poster("editeur", corps({ fournisseur: "externe", classification: "interne", consentement }));
    expect(r.status).toBe(201);
    expect(appelsExternes).toHaveLength(1);
    expect(appelsExternes[0]!.url).toBe("https://illustrations.exemple.test/v1/generer");
    expect(appelsExternes[0]!.corps["parametres"]).toEqual({ style: "trait", intensite: 0.5 });
    expect(r.body.provenance).toMatchObject({
      mode: "ia-externe", fournisseur: { id: "externe", nature: "ia-externe", version: "inconnue", service: "illustrations.exemple.test", reseau: true },
      sourcesEnvoyees: [{ type: "rendu", classification: "interne", provenanceConnue: true }], droits: "non déclarés par le fournisseur",
      autorisation: { transfert: "externe", consentement: { par: "editeur", coutAccepte: { montant: 0.04, devise: "CHF" } } },
      couts: { montant: 0.04, devise: "CHF", origine: "coût déclaré par l’administrateur" }, quotas: "non évalués",
      reproductibilite: { deterministe: false }, verification: { statut: "non-verifiee" }, modele: { inchange: true },
    });
    expect(r.body.provenance.reproductibilite.inconnues).toEqual(expect.arrayContaining(["version du fournisseur inconnue"]));
    expect(JSON.stringify(r.body)).not.toContain("cle-d-essai");
    expect(modele()).toBe(avant);
  });
  it("TR-EX-094 [−] un lecteur, même consentant, ne fait rien sortir : 403 avant tout contrôle ou appel", async () => {
    configurerExterne();
    expect((await poster("lecteur", corps({ fournisseur: "externe", classification: "interne", consentement }))).status).toBe(403);
    expect(appelsExternes).toEqual([]);
  });
});

describe("Revue de la PR #328 — téléchargement soumis au droit d'export ; requestId réservé avant le fournisseur facturé", () => {
  it("TEST-032 [−] l'image archivée est un téléchargement : un lecteur à qui le propriétaire n'a pas accordé l'export reçoit 403 ; avec l'export, 200", async () => {
    const r = await poster("proprietaire", corps());
    expect(r.status).toBe(201);
    expect((await lire("lecteur", r.body.image)).status).toBe(200);
    const membre = banc.lignes.get(projectMembers)!.find((m) => m["userId"] === "lecteur")!;
    membre["canExport"] = false;
    const refus = await lire("lecteur", r.body.image);
    expect(refus.status).toBe(403);
    expect(refus.headers["content-type"]).not.toMatch(/image\/png/);
    // La liste reste lisible (aucun contenu téléchargé).
    expect((await lire("lecteur", `${V}/illustrations`)).status).toBe(200);
  });
  it("TR-EX-072 [+] deux demandes simultanées de même requestId au fournisseur externe : un seul appel facturé, la seconde rejoue l'illustration archivée", async () => {
    configurerExterne();
    const reel = transportExterne.fetch;
    transportExterne.fetch = (async (url: string, init: RequestInit) => { await new Promise((ok) => setTimeout(ok, 30)); return reel(url, init); }) as typeof fetch;
    const b = corps({ requestId: "illu-simultanee", fournisseur: "externe", classification: "interne", consentement });
    const [a, c] = await Promise.all([poster("editeur", b), poster("editeur", b)]);
    expect([a.status, c.status]).toEqual([201, 201]);
    expect(appelsExternes).toHaveLength(1);
    expect([a.body.replayed, c.body.replayed].sort()).toEqual([false, true]);
    expect(a.body.id).toBe(c.body.id);
    expect(nbIllustrations()).toBe(1);
  });
});
