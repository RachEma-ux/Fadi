import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Étude exemple Studio du P.118 (`lib/studio-exemple.ts`) — sans base : base simulée en mémoire
 * (`testing/studio-base-simulee.ts`, garde DB fermée, aucune connexion). Vrai convertisseur, vraies fonctions
 * `createStudioStudy` / `createStudioVariant` / `submitStudioCommands`. Couvre : état de l'exemple lu dans le marquage
 * explicite (`absente | partielle | complete`), reprise d'une installation INTERROMPUE (deux points d'interruption, sans
 * doublon), chemin « déjà complète » en lecture seule (aucun 423 pendant le verrou d'un autre compte), correspondance
 * niveau ↔ variante par `creationRequestId`, préfixe réservé refusé aux identifiants de requête du client, installation
 * partielle d'une autre version de la conversion non reprise.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { lotsDeCommandes } from "@parcours/atelier-model/studio-exemples";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { projects, studioRevisions, studioStudies, studioVariants } from "../db/schema.js";
import { banc, initialiserProjet } from "../testing/studio-base-simulee.js";
import { createStudioStudy, createStudioVariant, StudioRequestError, submitStudioCommands } from "./studio-commands.js";
import { conversionExempleP118, etatExempleStudio, installerExempleStudio, STUDIO_EXEMPLE_P118 } from "./studio-exemple.js";

const refus = async (p: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> }> => {
  try { await p; } catch (e) { if (e instanceof StudioRequestError) return { status: e.status, body: e.body }; throw e; }
  throw new Error("refus attendu");
};
const lignes = (t: unknown) => banc.lignes.get(t) ?? [];
const etudeExemple = () => lignes(studioStudies).find((s) => (s["exampleInstall"] as { exampleId?: string } | null)?.exampleId === STUDIO_EXEMPLE_P118.exampleId);
const revisionsDe = (studyId: string) => {
  const variantes = new Set(lignes(studioVariants).filter((v) => v["studyId"] === studyId).map((v) => v["id"]));
  return lignes(studioRevisions).filter((r) => variantes.has(r["variantId"]));
};
const { conversion, prefixe, version, empreinte } = conversionExempleP118();
const lotsAttendus = conversion.niveaux.reduce((n, c) => n + lotsDeCommandes(c.commandes).length, 0);

beforeEach(() => {
  initialiserProjet();
  const p = lignes(projects).find((x) => x["id"] === "p")!;
  p["sourceExampleId"] = STUDIO_EXEMPLE_P118.exampleId;
});

describe("Étude exemple Studio P.118 (base simulée)", () => {
  it("préfixe versionné : exemple, version du convertisseur et empreinte des commandes", () => {
    expect(prefixe).toBe(`${STUDIO_EXEMPLE_P118.requete}.v${version}.${empreinte}`);
    expect(empreinte).toMatch(/^[0-9a-f]{12}$/);
    expect(prefixe.length).toBeLessThan(80);
  });

  it("projet hors exemple : état null, installation 409 exemple_indisponible", async () => {
    lignes(projects).find((x) => x["id"] === "p")!["sourceExampleId"] = null;
    expect(await etatExempleStudio("p", "proprietaire")).toBeNull();
    expect((await refus(installerExempleStudio("p", "proprietaire"))).body).toMatchObject({ error: "exemple_indisponible" });
  });

  it("installation interrompue puis reprise (deux interruptions) : partielle, partielle, complète, sans doublon", async () => {
    expect(await etatExempleStudio("p", "proprietaire")).toEqual({ etat: "absente", studyId: null });

    // 1. Interruption au premier lot de commandes : étude et variantes créées, aucun lot.
    banc.panneSur = studioVariants;
    await expect(installerExempleStudio("p", "proprietaire")).rejects.toThrow("panne simulée");
    banc.panneSur = null;
    const etude = etudeExemple()!;
    expect(etude).toBeDefined();
    expect(etude["exampleInstall"]).toMatchObject({ exampleId: STUDIO_EXEMPLE_P118.exampleId, version, empreinte, prefixe, complete: false });
    expect((etude["exampleInstall"] as { rapport: { niveaux: unknown[] } }).rapport.niveaux).toHaveLength(conversion.niveaux.length);
    expect(etude["creationRequestId"]).toBe(prefixe);
    expect(await etatExempleStudio("p", "proprietaire")).toEqual({ etat: "partielle", studyId: etude["id"] });
    expect(lignes(studioVariants).filter((v) => v["studyId"] === etude["id"])).toHaveLength(conversion.niveaux.length);
    expect(revisionsDe(etude["id"] as string)).toHaveLength(conversion.niveaux.length);

    // Pendant l'état partiel, le verrou d'édition d'un autre compte s'oppose à la reprise (423), rien n'est écrit.
    const avant = banc.ecritures;
    expect((await refus(installerExempleStudio("p", "proprietaire-verrou"))).status).toBe(423);
    expect(banc.ecritures).toBe(avant);

    // 2. Interruption après le dernier lot, avant le marquage « complète ».
    banc.panneSur = studioStudies;
    await expect(installerExempleStudio("p", "proprietaire")).rejects.toThrow("panne simulée");
    banc.panneSur = null;
    expect(await etatExempleStudio("p", "proprietaire")).toMatchObject({ etat: "partielle" });
    const apresLots = revisionsDe(etude["id"] as string).length;
    expect(apresLots).toBe(conversion.niveaux.length + lotsAttendus);

    // 3. Reprise : tout est rejoué, rien n'est réécrit (mêmes révisions), l'étude est marquée complète.
    const r = await installerExempleStudio("p", "proprietaire");
    expect(r.created).toBe(true);
    expect(r.etude.study.id).toBe(etude["id"]);
    expect(revisionsDe(etude["id"] as string)).toHaveLength(apresLots);
    expect(lignes(studioStudies).filter((s) => s["exampleInstall"])).toHaveLength(1);
    expect(etudeExemple()!["exampleInstall"]).toMatchObject({ complete: true, empreinte });
    expect(await etatExempleStudio("p", "proprietaire")).toEqual({ etat: "complete", studyId: etude["id"] });
    // Lecteur : même état (lecture), installation refusée (403).
    expect(await etatExempleStudio("p", "lecteur")).toMatchObject({ etat: "complete" });
    expect((await refus(installerExempleStudio("p", "editeur"))).status).toBe(403);

    // Correspondance niveau ↔ variante : initiale pour le premier niveau, sinon creationRequestId.
    const variantes = lignes(studioVariants).filter((v) => v["studyId"] === etude["id"]);
    for (const [i, n] of r.rapport.niveaux.entries()) {
      const v = variantes.find((x) => x["id"] === n.variantId)!;
      expect(v["name"]).toBe(conversion.niveaux[i]!.nom);
      if (i === 0) expect(v["id"]).toBe(etude["initialVariantId"]);
      else expect(v["creationRequestId"]).toBe(`${prefixe}:${n.niveauId}`);
    }
    const tete = variantes.find((v) => v["id"] === r.rapport.niveaux[1]!.variantId)!;
    expect(lignes(studioRevisions).find((x) => x["id"] === tete["headRevisionId"])!["requestId"]).toBe(`${prefixe}:${conversion.niveaux[1]!.niveauId}:${lotsDeCommandes(conversion.niveaux[1]!.commandes).length}`);
  });

  it("déjà complète : renvoyée en lecture seule, même pendant le verrou d'édition d'un autre compte (aucun 423, rien écrit)", async () => {
    const r1 = await installerExempleStudio("p", "proprietaire");
    const ecritures = banc.ecritures;
    const r2 = await installerExempleStudio("p", "proprietaire-verrou");
    expect(r2.created).toBe(false);
    expect(r2.etude.study.id).toBe(r1.etude.study.id);
    expect(banc.ecritures).toBe(ecritures);
    // Rapport : celui enregistré avec l'installation, variantes retrouvées par creationRequestId.
    expect(r2.rapport.niveaux.map((n) => n.variantId)).toEqual(r1.rapport.niveaux.map((n) => n.variantId));
    expect(r2.rapport.niveaux.every((n) => n.variantId)).toBe(true);
    expect(r2.rapport).toMatchObject({ version, empreinte });
    expect(r2.rapport.niveaux[1]!.rapport.absents).toEqual(r1.rapport.niveaux[1]!.rapport.absents);
  });

  it("installation partielle d'une autre version de la conversion : non reprise (409 exemple_version_changee)", async () => {
    banc.panneSur = studioVariants;
    await expect(installerExempleStudio("p", "proprietaire")).rejects.toThrow("panne simulée");
    banc.panneSur = null;
    const e = etudeExemple()!;
    e["exampleInstall"] = { ...(e["exampleInstall"] as object), empreinte: "000000000000" };
    expect((await refus(installerExempleStudio("p", "proprietaire"))).body).toMatchObject({ error: "exemple_version_changee" });
    expect(lignes(studioStudies).filter((s) => s["exampleInstall"])).toHaveLength(1);
  });

  it("préfixe réservé : refusé dans les identifiants de requête du client (étude, variante, lot), sans écriture", async () => {
    const ecritures = banc.ecritures;
    for (const id of [prefixe, `${STUDIO_EXEMPLE_P118.requete}:x`, "EXEMPLE-STUDIO-autre"]) {
      expect((await refus(createStudioStudy("p", "editeur", "Étude", id))).body).toMatchObject({ code: "request_id_reserve" });
      expect((await refus(createStudioVariant("p", "s", "editeur", "Variante", id))).body).toMatchObject({ code: "request_id_reserve" });
      const lot = { contractVersion: STUDIO_CONTRACT, requestId: id, baseRevisionId: "r1", commands: [{ toolId: "studio.dessin.ligne", params: { id: "z", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }] };
      expect((await refus(submitStudioCommands({ projectId: "p", studyId: "s", variantId: "v" }, "editeur", lot))).status).toBe(400);
    }
    expect(banc.ecritures).toBe(ecritures);
    // Un identifiant ordinaire reste admis.
    await expect(createStudioStudy("p", "editeur", "Étude", "etude-ordinaire-1")).resolves.toMatchObject({ replayed: false });
  });
});
