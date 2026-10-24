import { describe, expect, it } from "vitest";
import {
  actualiteDe, actualiteParEmpreinte, actualiteVue, baseAutorite, besoinTransition, CacheRegeneration, canonicalJson, cleRegeneration, construireManifeste, controlerApprobation, controlerEnsembleExamine, controlerTransition, diffusionPlusRecente, documentsRegeneres,
  dimensionsDe, ecartsManifeste, empreinteManifeste, memeContenu, REGLES_TRANSITION, ROLES_CAPACITE, sha256, statutCombine, STUDIO_PUBLICATION_ACTIONS,
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

describe("Publications Studio — Approbateur et Diffuseur, base d'autorité (écart E5, CR-D2, CR-D6)", () => {
  const approb = { id: "pra_a", role: "approbateur" as const };
  const diff = { id: "pra_d", role: "diffuseur" as const };
  it("le propriétaire agit au titre de son rôle ; l'éditeur au titre du sien pour la revue seulement", () => {
    for (const a of STUDIO_PUBLICATION_ACTIONS) expect(baseAutorite(a, "proprietaire", [])).toEqual({ base: "role-projet", role: "proprietaire" });
    expect(baseAutorite("soumettre", "editeur", [])).toEqual({ base: "role-projet", role: "editeur" });
    expect(baseAutorite("actualiser", "editeur", [])).toEqual({ base: "role-projet", role: "editeur" });
    for (const a of ["approuver", "refuser", "diffuser", "retirer"] as const) expect(baseAutorite(a, "editeur", []), a).toBeNull();
  });
  it("un Relecteur ou un lecteur sans affectation n'approuve ni ne diffuse ; l'affectation explicite ouvre sa seule capacité", () => {
    for (const a of STUDIO_PUBLICATION_ACTIONS) expect(baseAutorite(a, "lecteur", []), a).toBeNull();
    expect(baseAutorite("approuver", "lecteur", [approb])).toEqual({ base: "affectation", role: "approbateur", assignmentId: "pra_a" });
    expect(baseAutorite("refuser", "editeur", [approb])).toEqual({ base: "affectation", role: "approbateur", assignmentId: "pra_a" });
    // Un Approbateur sans affectation de Diffuseur ne diffuse pas, et réciproquement (affectations distinctes).
    expect(baseAutorite("diffuser", "lecteur", [approb])).toBeNull();
    expect(baseAutorite("approuver", "lecteur", [diff])).toBeNull();
    expect(baseAutorite("retirer", "lecteur", [diff])).toEqual({ base: "affectation", role: "diffuseur", assignmentId: "pra_d" });
    // Une affectation n'ouvre jamais la revue : un lecteur approbateur ne prépare ni ne soumet.
    expect(baseAutorite("soumettre", "lecteur", [approb, diff])).toBeNull();
  });
  it("une même personne peut tenir les deux affectations (CR-D2 a) ; l'accès support n'a jamais de base", () => {
    expect(baseAutorite("approuver", "lecteur", [approb, diff])?.base).toBe("affectation");
    expect(baseAutorite("diffuser", "lecteur", [approb, diff])?.role).toBe("diffuseur");
    for (const a of STUDIO_PUBLICATION_ACTIONS) expect(baseAutorite(a, "support", [approb, diff]), a).toBeNull();
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

  it("documents régénérés (exporteur modifié, sources et noms identiques) : périmé, actualisable, jamais bloqué", () => {
    const m = construireManifeste([principale, coord], meta, docs);
    const noms = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A" };
    const tetes = [{ variantId: "v_a", headRevisionId: "r_a1" }, { variantId: "v_b", headRevisionId: "r_b1" }];
    const regeneres = [docs[0]!, { ...docs[1]!, sha256: H("9"), size: 12 }];
    expect(documentsRegeneres(m.documents, m.documents)).toEqual([]);
    expect(actualiteDe(ecartsManifeste(m, tetes, noms, docs))).toBe("a-jour");
    const e = ecartsManifeste(m, tetes, noms, regeneres);
    expect(e).toEqual([{ type: "documents", formats: ["dxf"] }]);
    expect(documentsRegeneres(m.documents, [docs[0]!])).toEqual(["dxf"]);
    // Le manifeste recalculé a une autre empreinte : la diffusion est refusée, l'actualisation admise.
    const figee = empreinteManifeste(m);
    const courante = empreinteManifeste(construireManifeste([principale, coord], meta, regeneres));
    expect(controlerApprobation(figee, figee, courante)?.body["error"]).toBe("manifest_mismatch");
    const actualite = actualiteParEmpreinte(figee, courante);
    expect(actualite).toBe("perimee");
    expect(actualiteParEmpreinte(figee, figee)).toBe("a-jour");
    expect(actualiteParEmpreinte(null, figee)).toBe("perimee");
    const v = controlerTransition("actualiser", etat({ travail: "approuve", actualite }));
    expect(v.ok && v.vers).toEqual({ travail: "brouillon", diffusion: "non-diffuse" });
    expect(controlerTransition("actualiser", etat({ travail: "approuve", actualite: actualiteParEmpreinte(figee, figee) })).ok).toBe(false);
  });

  it("cache de régénération : clé = empreinte du document figé, noms figés, clé IFC et version des exporteurs", () => {
    const base = { documentHash: H("a"), meta, ifcKey: "s|v", versionExporteurs: "studio-package-exports/1" };
    const k = cleRegeneration(base);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(cleRegeneration({ ...base, meta: { ...meta } })).toBe(k);
    expect(cleRegeneration({ versionExporteurs: base.versionExporteurs, ifcKey: base.ifcKey, meta: { ...meta }, documentHash: base.documentHash })).toBe(k);
    for (const autre of [
      { ...base, documentHash: H("b") }, { ...base, ifcKey: "s|w" }, { ...base, versionExporteurs: "studio-package-exports/2" },
      { ...base, meta: { ...meta, variantName: "B" } }, { ...base, meta: { ...meta, projectCode: "P2" } }, { ...base, meta: { ...meta, revisionCreatedAt: "2026-10-20T00:00:00.000Z" } },
    ]) expect(cleRegeneration(autre)).not.toBe(k);
    const cache = new CacheRegeneration(2);
    expect(cache.get(k)).toBeUndefined();
    cache.set(k, docs);
    expect(cache.get(k)).toEqual(docs);
    cache.set("k2", docs); cache.get(k); cache.set("k3", docs);
    expect(cache.taille).toBe(2);
    expect(cache.get("k2")).toBeUndefined();
    expect(cache.get(k)).toEqual(docs);
  });

  it("vue de liste sans régénération en cache : documents « non vérifiée », actualité des sources et des noms seulement", () => {
    const m = construireManifeste([principale, coord], meta, docs);
    const noms = { projectCode: "P1", projectName: "Projet", studyName: "Étude", variantName: "A" };
    const tetes = [{ variantId: "v_a", headRevisionId: "r_a1" }, { variantId: "v_b", headRevisionId: "r_b1" }];
    expect(actualiteVue(m, tetes, noms, undefined)).toEqual({ ecarts: [], actualite: "a-jour", documents: "non-verifiee" });
    expect(actualiteVue(m, tetes, noms, docs)).toEqual({ ecarts: [], actualite: "a-jour", documents: "verifiee" });
    const regeneres = [docs[0]!, { ...docs[1]!, sha256: H("9") }];
    expect(actualiteVue(m, tetes, noms, regeneres)).toEqual({ ecarts: [{ type: "documents", formats: ["dxf"] }], actualite: "perimee", documents: "verifiee" });
    const deplacee = actualiteVue(m, [tetes[0]!, { variantId: "v_b", headRevisionId: "r_b2" }], noms, undefined);
    expect(deplacee.actualite).toBe("perimee");
    expect(deplacee.documents).toBe("non-verifiee");
  });

  it("paquet antérieur au lot E.4 remplacé par une diffusion plus récente de la même variante : « remplacé », un seul en vigueur", () => {
    const t = (n: number) => new Date(Date.UTC(2026, 9, 1, n));
    const pubs = [
      { id: "p1", variantId: "v", diffusedAt: t(1), status: "diffuse" as const },
      { id: "p2", variantId: "v", diffusedAt: t(2), status: "diffuse" as const },
      { id: "p3", variantId: "v", diffusedAt: t(3), status: "retire" as const },
      { id: "p4", variantId: "w", diffusedAt: t(4), status: "diffuse" as const },
    ];
    expect(diffusionPlusRecente(pubs[0]!, pubs)).toBe("p2");
    expect(diffusionPlusRecente(pubs[1]!, pubs)).toBeNull();
    expect(diffusionPlusRecente({ id: "p0", variantId: "v", diffusedAt: null }, pubs)).toBeNull();
    const enVigueur = pubs.filter((p) => p.status === "diffuse" && p.variantId === "v" && diffusionPlusRecente(p, pubs) === null);
    expect(enVigueur.map((p) => p.id)).toEqual(["p2"]);
    // Le statut combiné reste « diffuse » (refus de suppression) ; la diffusion déduite devient « remplace ».
    const row = { status: "diffuse" as const, workStatus: null, diffusionStatus: null, approvedRevisionId: "r" };
    expect(dimensionsDe({ ...row, replacedAt: t(2) }).diffusion).toBe("remplace");
    expect(statutCombine(dimensionsDe({ ...row, replacedAt: t(2) }))).toBe("diffuse");
  });

  it("une diffusion ne remplace que les paquets de même contenu : dessin 2D et paquet complet coexistent (I-1)", () => {
    const t = (n: number) => new Date(Date.UTC(2026, 9, 1, n));
    const pubs = [
      { id: "complet-ancien", variantId: "v", diffusedAt: t(1), status: "diffuse" as const, manifest: { schema: "m" }, package: null },
      { id: "dessin-ancien", variantId: "v", diffusedAt: t(2), status: "diffuse" as const, manifest: { contenu: "dessin-2d" }, package: null },
      { id: "complet-paquet", variantId: "v", diffusedAt: t(3), status: "diffuse" as const, manifest: null, package: { schema: "p" } },
      { id: "dessin-paquet", variantId: "v", diffusedAt: t(4), status: "diffuse" as const, manifest: null, package: { contenu: "dessin-2d" } },
    ];
    expect(memeContenu("dessin-2d", pubs).map((p) => p.id)).toEqual(["dessin-ancien", "dessin-paquet"]);
    expect(memeContenu("complet", pubs).map((p) => p.id)).toEqual(["complet-ancien", "complet-paquet"]);
    // Remplacement déduit (dossier antérieur au lot E.4) : le complet n'est pas remplacé par un dessin plus récent.
    expect(diffusionPlusRecente(pubs[0]!, memeContenu("complet", pubs))).toBe("complet-paquet");
    expect(diffusionPlusRecente(pubs[2]!, memeContenu("complet", pubs))).toBeNull();
    expect(diffusionPlusRecente(pubs[2]!, pubs)).toBe("dessin-paquet");
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
