/**
 * IF-009 — manifeste de publication (lot PUB) : identifiant / usage, documents ordonnés avec empreintes, références de
 * modèles et de règles, rapports de contrôle, observations bloquantes résolues ou dérogées ; publication refusée pour
 * une observation bloquante ni résolue ni dérogée. EX-074 / EX-076 : dossier de conception et pièces dans le manifeste.
 * Règles pures (aucune base) ; le câblage serveur est éprouvé par la recette `studio-pub.mjs`.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIONS_BLOQUEES_PAR_OBSERVATION, construireManifeste, contenuDe, controlerObservationsBloquantes, ecartsManifeste, empreinteManifeste, formatsDuContenu, normaliserControles,
  type ManifesteControles, type ManifesteDossier, type ManifesteMeta, type ManifesteSource,
} from "./studio-publication-statuts.js";

const H = (c: string) => c.repeat(64);
const meta: ManifesteMeta = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A", revisionCreatedAt: "2026-10-25T10:00:00.000Z" };
const principale: ManifesteSource = { role: "principale", variantId: "v_a", revisionId: "r_a1", documentHash: H("a") };
const docs = [
  { format: "svg", fileName: "x.svg", mime: "image/svg+xml", size: 10, sha256: H("1") },
  { format: "dxf", fileName: "x.dxf", mime: "application/dxf", size: 11, sha256: H("2") },
];
const controles = (resolution: "resolue" | "derogee" | "ouverte"): ManifesteControles => ({
  regles: [{ type: "exigences", id: "set_1", version: "3" }],
  rapports: [{ controleId: "chk_1", variantId: "v_a", revisionId: "r_a1", version: 3, execution: "execute", conclusion: "conforme", documentHash: H("a") }],
  observations: [{ issueId: "issue_1", observationId: "c_1", variantId: "v_a", gravite: "bloquante", statut: resolution === "resolue" ? "cloturee" : "ouverte", resolution }],
});

describe("IF-009 — manifeste de publication", () => {
  it("IF-009 [+] le manifeste porte usage, documents ordonnés et empreintes, sources (modèles), règles, rapports de contrôle et observations bloquantes résolues", () => {
    const m = construireManifeste([principale], meta, docs, "complet", { usage: "Dépôt du permis de construire", controles: controles("resolue") });
    expect(m.usage).toBe("Dépôt du permis de construire");
    expect(m.documents.map((d) => [d.format, d.sha256])).toEqual([["dxf", H("2")], ["svg", H("1")]]);
    expect(m.sources).toEqual([principale]);
    expect(m.controles).toEqual(controles("resolue"));
    expect(controlerObservationsBloquantes(m)).toBeNull();
    // Dérogée : admise aussi.
    expect(controlerObservationsBloquantes(construireManifeste([principale], meta, docs, "complet", { controles: controles("derogee") }))).toBeNull();
    // Rien à déclarer : forme historique, empreinte inchangée.
    const historique = construireManifeste([principale], meta, docs);
    expect(construireManifeste([principale], meta, docs, "complet", { controles: { regles: [], rapports: [], observations: [] }, usage: "  " })).toEqual(historique);
    expect(empreinteManifeste(historique)).toBe(empreinteManifeste(construireManifeste([principale], meta, docs)));
  });

  it("IF-009 [−] observation bloquante ni résolue ni dérogée : soumission, approbation et diffusion refusées (409 blocking_observation_open)", () => {
    const m = construireManifeste([principale], meta, docs, "complet", { controles: controles("ouverte") });
    const refus = controlerObservationsBloquantes(m);
    expect(refus).toMatchObject({ status: 409, body: { error: "blocking_observation_open", observations: [{ issueId: "issue_1", observationId: "c_1", variantId: "v_a" }] } });
    expect([...ACTIONS_BLOQUEES_PAR_OBSERVATION]).toEqual(["soumettre", "approuver", "diffuser"]);
  });

  it("IF-009 [−] contrôles changés depuis le manifeste (observation résolue, nouveau rapport) : écart « controles », l'approbation de l'ancien ensemble ne vaut plus", () => {
    const m = construireManifeste([principale], meta, docs, "complet", { controles: controles("ouverte") });
    const courantes = [{ variantId: "v_a", headRevisionId: "r_a1" }];
    const noms = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A" };
    expect(ecartsManifeste(m, courantes, noms, null, controles("ouverte"))).toEqual([]);
    expect(ecartsManifeste(m, courantes, noms, null, controles("resolue"))).toEqual([{ type: "controles" }]);
    expect(ecartsManifeste(m, courantes, noms, null, undefined)).toEqual([]);
    expect(normaliserControles({ regles: [], rapports: [], observations: [] })).toBeNull();
    const autre = construireManifeste([principale], meta, docs, "complet", { controles: controles("resolue") });
    expect(empreinteManifeste(autre)).not.toBe(empreinteManifeste(m));
  });
});

describe("EX-074 / EX-076 — dossier de conception publié", () => {
  const dossier: ManifesteDossier = {
    id: "dos_1", titre: "Dossier", empreinte: H("d"), pieces: [
      { ordre: 1, documentId: "sheet_1", nature: "feuille", origine: "dessin-2d", presentation: "document-independant", sources: [{ variantId: "v_d", revisionId: "r_d1", documentHash: H("e") }], empreinte: H("f") },
      { ordre: 2, documentId: "sv_1", nature: "vue-coupe", origine: "derive-maquette", presentation: "extrait-synchronise", sources: [{ variantId: "v_a", revisionId: "r_a1", documentHash: H("a") }], empreinte: H("0") },
    ],
  };
  it("EX-074 [+] contenu « dossier-conception » : PDF et JSON du dossier, pièces ordonnées avec origine, présentation et sources distinctes", () => {
    expect(formatsDuContenu("dossier-conception")).toEqual(["pdf", "json"]);
    const m = construireManifeste([principale], meta, [{ format: "pdf", fileName: "d.pdf", mime: "application/pdf", size: 5, sha256: H("3") }, { format: "json", fileName: "d.json", mime: "application/json", size: 6, sha256: H("4") }], "dossier-conception", { dossier });
    expect(m.contenu).toBe("dossier-conception");
    expect(contenuDe(m)).toBe("dossier-conception");
    expect(m.dossier).toEqual(dossier);
    expect(m.documents.map((d) => d.format)).toEqual(["json", "pdf"]);
  });
  it("EX-074 [−] un dossier sans contenu « dossier-conception » (ou l'inverse) est refusé", () => {
    expect(() => construireManifeste([principale], meta, docs, "complet", { dossier })).toThrow("studio_manifest_dossier");
    expect(() => construireManifeste([principale], meta, docs, "dossier-conception")).toThrow("studio_manifest_dossier");
  });
});
