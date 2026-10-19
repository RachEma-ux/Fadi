import { describe, expect, it } from "vitest";
import {
  actualiteDe, besoinTransition, canonicalJson, construireManifeste, controlerApprobation, controlerEnsembleExamine, controlerTransition,
  dimensionsDe, ecartsManifeste, empreinteManifeste, REGLES_TRANSITION, ROLES_CAPACITE, sha256, statutCombine, STUDIO_PUBLICATION_ACTIONS,
  type EtatPublication, type ManifesteMeta, type ManifesteSource,
} from "./studio-publication-statuts.js";

const H = (c: string) => c.repeat(64);
const meta: ManifesteMeta = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A", revisionCreatedAt: "2026-10-19T10:00:00.000Z" };
const principale: ManifesteSource = { role: "principale", variantId: "v_a", revisionId: "r_a1", documentHash: H("a") };
const coord: ManifesteSource = { role: "coordonnee", variantId: "v_b", revisionId: "r_b1", documentHash: H("b") };
const docs = [
  { format: "svg", fileName: "x.svg", mime: "image/svg+xml", size: 10, sha256: H("1") },
  { format: "dxf", fileName: "x.dxf", mime: "application/dxf", size: 11, sha256: H("2") },
];
const etat = (e: Partial<EtatPublication> = {}): EtatPublication => ({ travail: "brouillon", diffusion: "non-diffuse", manifeste: true, actualite: "a-jour", ...e });

describe("Publications Studio — trois dimensions de statut (E.4-01)", () => {
  it("cycle complet : brouillon → en revue → approuvé → diffusé → retiré, le travail ne bouge pas à la diffusion", () => {
    let d = etat();
    for (const [action, travail, diffusion] of [["soumettre", "en-revue", "non-diffuse"], ["approuver", "approuve", "non-diffuse"], ["diffuser", "approuve", "diffuse"], ["retirer", "approuve", "retire"]] as const) {
      const v = controlerTransition(action, d, "motif");
      expect(v.ok, action).toBe(true);
      if (v.ok) { expect(v.vers).toEqual({ travail, diffusion }); d = { ...d, ...v.vers }; }
    }
  });

  it("transitions refusées depuis un mauvais statut : 409 invalid_transition avec les deux dimensions", () => {
    const v = controlerTransition("approuver", etat());
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.refus).toMatchObject({ status: 409, body: { error: "invalid_transition", workStatus: "brouillon", diffusionStatus: "non-diffuse" } });
    expect(controlerTransition("diffuser", etat({ travail: "refuse" })).ok).toBe(false);
    expect(controlerTransition("diffuser", etat({ travail: "approuve", diffusion: "diffuse" })).ok).toBe(false);
    expect(controlerTransition("retirer", etat({ diffusion: "retire" }), "x").ok).toBe(false);
    expect(controlerTransition("actualiser", etat({ travail: "approuve", diffusion: "diffuse", actualite: "perimee" })).ok).toBe(false);
  });

  it("un paquet remplacé reste retirable ; refus et retrait exigent un motif", () => {
    expect(controlerTransition("retirer", etat({ travail: "approuve", diffusion: "remplace" }), "motif").ok).toBe(true);
    const sans = controlerTransition("retirer", etat({ travail: "approuve", diffusion: "diffuse" }), "  ");
    expect(!sans.ok && sans.refus.body["code"]).toBe("comment_required");
    expect(!sans.ok && sans.refus.status).toBe(400);
    expect(controlerTransition("refuser", etat({ travail: "en-revue" })).ok).toBe(false);
  });

  it("soumettre et approuver exigent un manifeste figé et à jour ; actualiser seulement s'il est périmé ou absent", () => {
    const perime = controlerTransition("approuver", etat({ travail: "en-revue", actualite: "perimee" }));
    expect(!perime.ok && perime.refus.body["error"]).toBe("manifest_outdated");
    const absent = controlerTransition("soumettre", etat({ manifeste: false }));
    expect(!absent.ok && absent.refus.body["error"]).toBe("manifest_missing");
    const inutile = controlerTransition("actualiser", etat({ travail: "approuve" }));
    expect(!inutile.ok && inutile.refus.body["error"]).toBe("manifest_current");
    const v = controlerTransition("actualiser", etat({ travail: "approuve", actualite: "perimee" }));
    expect(v.ok && v.vers).toEqual({ travail: "brouillon", diffusion: "non-diffuse" });
    expect(controlerTransition("actualiser", etat({ manifeste: false, travail: "en-revue" })).ok).toBe(true);
  });

  it("statut combiné historique et déduction pour une ligne antérieure au lot", () => {
    expect(statutCombine({ travail: "en-revue", diffusion: "non-diffuse" })).toBe("soumis");
    expect(statutCombine({ travail: "approuve", diffusion: "remplace" })).toBe("diffuse");
    expect(statutCombine({ travail: "brouillon", diffusion: "retire" })).toBe("retire");
    expect(dimensionsDe({ status: "diffuse", workStatus: null, diffusionStatus: null, approvedRevisionId: "r" })).toEqual({ travail: "approuve", diffusion: "diffuse" });
    expect(dimensionsDe({ status: "retire", workStatus: null, diffusionStatus: null, approvedRevisionId: null })).toEqual({ travail: "brouillon", diffusion: "retire" });
    expect(dimensionsDe({ status: "soumis", workStatus: "en-revue", diffusionStatus: "non-diffuse", approvedRevisionId: null })).toEqual({ travail: "en-revue", diffusion: "non-diffuse" });
    for (const t of ["brouillon", "en-revue", "approuve", "refuse"] as const) for (const d of ["non-diffuse", "diffuse", "retire", "remplace"] as const) {
      const c = statutCombine({ travail: t, diffusion: d });
      expect(["travail", "soumis", "approuve", "refuse", "diffuse", "retire"]).toContain(c);
    }
  });
});

describe("Publications Studio — droits distincts (E.4-02)", () => {
  it("revue : propriétaire et éditeur ; approbation et publication : propriétaire seul ; lecteur : lecture seule", () => {
    expect(besoinTransition("soumettre")).toBe("write");
    expect(besoinTransition("actualiser")).toBe("write");
    expect(besoinTransition("approuver")).toBe("owner");
    expect(besoinTransition("refuser")).toBe("owner");
    expect(besoinTransition("diffuser")).toBe("owner");
    expect(besoinTransition("retirer")).toBe("owner");
    expect(ROLES_CAPACITE.lecture).toContain("lecteur");
    for (const c of ["revue", "approbation", "publication"] as const) expect(ROLES_CAPACITE[c]).not.toContain("lecteur");
    expect(ROLES_CAPACITE.approbation).toEqual(["proprietaire"]);
    expect(Object.keys(REGLES_TRANSITION).sort()).toEqual([...STUDIO_PUBLICATION_ACTIONS].sort());
  });
});

describe("Publications Studio — manifeste figé multi-sources (E.4-03 à E.4-05)", () => {
  it("JSON canonique : clés triées, undefined omis ; empreinte stable quel que soit l'ordre d'entrée", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: "x" }] })).toBe('{"a":[2,{"c":"x"}],"b":1}');
    const m1 = construireManifeste([coord, principale], meta, docs);
    const m2 = construireManifeste([principale, coord, coord], meta, [...docs].reverse());
    expect(m1).toEqual(m2);
    expect(m1.sources.map((s) => s.role)).toEqual(["principale", "coordonnee"]);
    expect(m1.documents.map((d) => d.format)).toEqual(["dxf", "svg"]);
    expect(empreinteManifeste(m1)).toBe(empreinteManifeste(m2));
    expect(empreinteManifeste(m1)).toBe(sha256(canonicalJson(m1)));
    expect(empreinteManifeste(m1)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("toute source, métadonnée ou empreinte de document change l'empreinte du manifeste", () => {
    const base = empreinteManifeste(construireManifeste([principale, coord], meta, docs));
    expect(empreinteManifeste(construireManifeste([principale, { ...coord, revisionId: "r_b2" }], meta, docs))).not.toBe(base);
    expect(empreinteManifeste(construireManifeste([principale, coord], { ...meta, variantName: "A'" }, docs))).not.toBe(base);
    expect(empreinteManifeste(construireManifeste([principale, coord], meta, [docs[0]!, { ...docs[1]!, sha256: H("3") }]))).not.toBe(base);
    expect(empreinteManifeste(construireManifeste([principale], meta, docs))).not.toBe(base);
  });

  it("une seule source principale, un document par format", () => {
    expect(() => construireManifeste([coord], meta, docs)).toThrow("studio_manifest_principal_source");
    expect(() => construireManifeste([principale, { ...principale, variantId: "v_c" }], meta, docs)).toThrow();
    expect(() => construireManifeste([principale], meta, [docs[0]!, docs[0]!])).toThrow("studio_manifest_duplicate_document");
  });

  it("actualité : périmée dès qu'une source coordonnée ou une métadonnée change", () => {
    const m = construireManifeste([principale, coord], meta, docs);
    const noms = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A" };
    expect(actualiteDe(ecartsManifeste(m, [{ variantId: "v_a", headRevisionId: "r_a1" }, { variantId: "v_b", headRevisionId: "r_b1" }], noms))).toBe("a-jour");
    const e = ecartsManifeste(m, [{ variantId: "v_a", headRevisionId: "r_a1" }, { variantId: "v_b", headRevisionId: "r_b2" }], noms);
    expect(e).toEqual([{ type: "source", role: "coordonnee", variantId: "v_b", revisionFigee: "r_b1", revisionCourante: "r_b2" }]);
    expect(actualiteDe(e)).toBe("perimee");
    expect(ecartsManifeste(m, [{ variantId: "v_a", headRevisionId: "r_a1" }], noms)[0]).toMatchObject({ variantId: "v_b", revisionCourante: null });
    expect(ecartsManifeste(m, [{ variantId: "v_a", headRevisionId: "r_a1" }, { variantId: "v_b", headRevisionId: "r_b1" }], { ...noms, studyName: "Autre" }))
      .toEqual([{ type: "meta", champ: "studyName", figee: "Étude", courante: "Autre" }]);
  });

  it("l'approbation porte l'empreinte du manifeste examiné ; un autre ensemble est refusé (409 revision_mismatch)", () => {
    const dossier = { manifestHash: H("m"), revisionId: "r_a1", documentHash: H("a") };
    expect(controlerEnsembleExamine({ manifestHash: H("m") }, dossier)).toBeNull();
    expect(controlerEnsembleExamine({ manifestHash: H("m"), revisionId: "r_a1", documentHash: H("a") }, dossier)).toBeNull();
    expect(controlerEnsembleExamine({ revisionId: "r_a1", documentHash: H("a") }, dossier)).toMatchObject({ status: 400, body: { code: "examined_set_required" } });
    expect(controlerEnsembleExamine({ manifestHash: H("n") }, dossier)).toMatchObject({ status: 409, body: { error: "revision_mismatch", publicationManifestHash: H("m"), examinedManifestHash: H("n") } });
    expect(controlerEnsembleExamine({ manifestHash: H("m"), documentHash: H("b") }, dossier)?.status).toBe(409);
  });

  it("diffusion : refusée (409 manifest_mismatch) si le manifeste courant diffère de l'approuvé ; sans approbation : manifest_missing", () => {
    expect(controlerApprobation(H("m"), H("m"), H("m"))).toBeNull();
    expect(controlerApprobation(H("m"), H("m"), H("n"))).toMatchObject({ status: 409, body: { error: "manifest_mismatch", approvedManifestHash: H("m"), currentManifestHash: H("n") } });
    expect(controlerApprobation(H("m"), H("o"), H("o"))?.body["error"]).toBe("manifest_mismatch");
    expect(controlerApprobation(null, H("m"), H("m"))?.body["error"]).toBe("manifest_missing");
  });
});
