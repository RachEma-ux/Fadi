import { describe, expect, it } from "vitest";
import { newStudioDocument, validateStudioDocument } from "../composition/document.js";
import { SCENES_DOCUMENTS } from "../corpus/index.js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { avecInconnues, corpusMigration as corpusDe, rapportCorpusMigration as rapportDe, type Doc, type SourcesCorpusMigration } from "./corpus-migration.js";
import {
  STUDIO_MIGRATIONS_DOCUMENT, STUDIO_SCHEMA_DOCUMENT_V1, STUDIO_SCHEMA_DOCUMENT_V2, studioLireDocumentVersionne, studioMigrerDocumentV1V2, studioMigrerDocumentV2V1,
  studioRestaurerSourceV1, studioValiderDocumentV2,
} from "./migration-document.js";
import { studioSimulerMigration } from "./simulation-migration.js";

/**
 * Corpus de migration (P-12, ADR-STUDIO-PILOTE-01 ; REC-A-01) : l'ensemble des documents `studio-document/1` du dépôt
 * — fixtures JSON (caractérisation, corpus), corpus S1–S7 générés, exemple P.118 converti — migrés vers
 * `studio-document/2` avec aller-retour testé ; puis le même corpus enrichi de données inconnues (champ futur,
 * élément refusé) pour prouver la conservation, le rapport et la récupération exacte.
 */
/** Lecture des sources du corpus de migration (fichiers JSON de `src/studio/`, exemple P.118). */
function lireSourcesCorpus(): SourcesCorpusMigration {
  const racine = new URL("../", import.meta.url);
  const fichiersJson: { chemin: string; contenu: string }[] = [];
  const parcourir = (dir: URL, rel: string) => {
    for (const nom of readdirSync(dir).sort()) {
      const u = new URL(nom, dir);
      if (statSync(u).isDirectory()) { if (nom !== "node_modules") parcourir(new URL(`${nom}/`, dir), `${rel}${nom}/`); continue; }
      if (nom.endsWith(".json")) fichiersJson.push({ chemin: `src/studio/${rel}${nom}`, contenu: readFileSync(u, "utf8") });
    }
  };
  parcourir(racine, "");
  return { fichiersJson, exempleP118: JSON.parse(readFileSync(new URL("../../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) };
}
const SOURCES = lireSourcesCorpus();
const corpusMigration = () => corpusDe(SOURCES);
const rapportCorpusMigration = () => rapportDe(SOURCES);
const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Doc;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

describe("TR-EX-019 — migration de schéma studio-document/1 → /2", () => {
  it("EX-019 : la migration déclarée documente transformation, inverse, récupération et cas impossible", () => {
    expect(STUDIO_MIGRATIONS_DOCUMENT).toHaveLength(1);
    const m = STUDIO_MIGRATIONS_DOCUMENT[0]!;
    expect([m.de, m.vers]).toEqual([STUDIO_SCHEMA_DOCUMENT_V1, STUDIO_SCHEMA_DOCUMENT_V2]);
    for (const k of ["transformation", "inverse", "recuperation", "impossible"] as const) expect(m[k].length).toBeGreaterThan(20);
  });

  it("EX-019 [+] : lire un document de schéma ancien, appliquer la transformation, identités et propriétés identiques (aller-retour)", () => {
    const d = corpusMigration().find((x) => x.origine.startsWith("exemple P.118"))!.document;
    const m = studioMigrerDocumentV1V2(d);
    if (!m.ok) throw new Error(m.motif);
    expect(m.document.schemaVersion).toBe(STUDIO_SCHEMA_DOCUMENT_V2);
    expect(m.document.conserves).toBeUndefined();
    const retour = studioMigrerDocumentV2V1(m.document);
    expect(retour.rapport.pertes).toEqual([]);
    expect(stable(retour.document)).toBe(stable(validateStudioDocument(d)));
    expect(studioValiderDocumentV2(m.document)).toEqual(m.document);
  });

  it("EX-019 [−] : champ inconnu et élément refusé conservés et rapportés, retour arrière avec rapport des pertes, récupération exacte", () => {
    const src = avecInconnues(validateStudioDocument(corpusMigration()[0]!.document) as unknown as Doc);
    expect(() => validateStudioDocument(src)).toThrow();
    const m = studioMigrerDocumentV1V2(src);
    if (!m.ok) throw new Error(m.motif);
    expect(m.rapport.conserves.map((c) => c.cle ?? "élément")).toEqual(expect.arrayContaining(["extensionFuture", "élément"]));
    expect(m.document.conserves!.find((c) => c.cle === "extensionFuture")!.valeur).toEqual({ origine: "client /3", valeur: 42 });
    const retour = studioMigrerDocumentV2V1(m.document);
    expect(retour.rapport.pertes.length).toBe(m.document.conserves!.length);
    expect(retour.rapport.pertes.every((p) => p.motif.startsWith("non représentable en studio-document/1"))).toBe(true);
    expect(studioRestaurerSourceV1(m.document)).toEqual(src);
    // Deux éléments refusés dans la même liste : les indices glissent au retrait, la récupération les replace exactement.
    const ligne = (id: string, x: number) => ({ id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } });
    const deux = { ...(newStudioDocument("d2") as unknown as Doc), objects: [ligne("a", 0), { id: "x1", type: "futur" }, ligne("b", 2), { id: "x2", type: "futur" }, ligne("c", 4)] };
    const m2 = studioMigrerDocumentV1V2(deux);
    if (!m2.ok) throw new Error(m2.motif);
    expect(m2.document.objects.map((o) => o.id)).toEqual(["a", "b", "c"]);
    expect(studioRestaurerSourceV1(m2.document)).toEqual(deux);
  });

  it("EX-019 [−] : migration impossible (unité inconnue) — refus explicite, source rendue intacte, rien ne disparaît", () => {
    const src = { ...(newStudioDocument("x") as unknown as Doc), units: "ft" };
    const m = studioMigrerDocumentV1V2(src);
    expect(m.ok).toBe(false);
    if (m.ok) return;
    expect(m.motif).toMatch(/unité/);
    expect(m.source).toEqual(src);
    expect(studioLireDocumentVersionne({ ...src, schemaVersion: "studio-document/9" }).ok).toBe(false);
  });
});

describe("REC-A-01 — corpus de migration (P-12)", () => {
  it("REC-A-01 : tout le corpus studio-document/1 du dépôt migré vers /2, aller-retour exact, données inconnues conservées et rapportées", () => {
    const corpus = corpusMigration();
    const origines = new Set(corpus.map((c) => c.origine.split(/[.[ ]/)[0]));
    // Fixtures (src/studio/…json), corpus S1–S7, exemple P.118 : les trois familles de P-12 sont présentes.
    expect(corpus.some((c) => c.origine.startsWith("src/studio/caracterisation.fixtures.json"))).toBe(true);
    expect(corpus.some((c) => c.origine.startsWith("src/studio/corpus/fixtures/"))).toBe(true);
    expect(SCENES_DOCUMENTS.every((s) => corpus.some((c) => c.origine.startsWith(`corpus ${s}`)))).toBe(true);
    expect(corpus.filter((c) => c.origine.startsWith("exemple P.118")).length).toBe(6);
    let conserves = 0, rapportees = 0, documentsInconnus = 0;
    for (const { origine, document } of corpus) {
      const m = studioMigrerDocumentV1V2(document);
      if (!m.ok) {
        // Fixture refusée par /1 (document de refus attendu) : refus explicite, source rendue intacte.
        expect(m.source, origine).toEqual(document);
        continue;
      }
      // Aller-retour : la source est reconstruite (forme canonique de /1 si elle était valide, telle quelle sinon).
      if (m.document.conserves) expect(studioRestaurerSourceV1(m.document), origine).toEqual(document);
      else expect(stable(studioRestaurerSourceV1(m.document)), origine).toBe(stable(validateStudioDocument(document)));
      expect(stable(studioMigrerDocumentV2V1(m.document).document), origine).toBe(stable(validateStudioDocument(studioRestaurerSourceV1({ ...m.document, conserves: undefined }))));
      const enrichi = avecInconnues(studioMigrerDocumentV2V1(m.document).document as unknown as Doc);
      const mi = studioMigrerDocumentV1V2(enrichi);
      if (!mi.ok) throw new Error(`${origine} : ${mi.motif}`);
      documentsInconnus++;
      conserves += mi.document.conserves?.length ?? 0;
      rapportees += studioMigrerDocumentV2V1(mi.document).rapport.pertes.length;
      expect(studioRestaurerSourceV1(mi.document), origine).toEqual(enrichi);
    }
    const rapport = { documents: corpus.length, familles: [...origines].length, documentsInconnus, conserves, rapportees };
    console.log(`REC-A-01 corpus de migration : ${JSON.stringify(rapport)}`);
    // Rapport publié (docs/studio/LIVRABLES-LOT-A.md) : chaque document migré ou refusé explicitement, aller-retour exact.
    const publie = rapportCorpusMigration();
    expect(publie.documents).toBe(corpus.length);
    expect(publie.migres + publie.refusesExplicitement).toBe(publie.documents);
    expect(publie.allerRetourExacts).toBe(publie.migres);
    expect(publie.donneesConservees).toBe(publie.donneesRapportees);
    expect(publie.recuperationsExactes).toBe(publie.documentsAvecInconnues);
    expect(rapport.documents).toBeGreaterThanOrEqual(20);
    expect(conserves).toBe(rapportees);
    expect(conserves).toBeGreaterThanOrEqual(2 * documentsInconnus);
  }, 30_000);
});

describe("TR-EX-091 — simulation de migration non destructrice", () => {
  const corpus = () => corpusMigration().filter((c) => c.origine.startsWith("exemple P.118")).map((c) => validateStudioDocument(c.document));
  it("EX-091 [+] : simulation compare identifiants, propriétés, cotes, associations, historique et accès avant / après — sans perte", () => {
    const docs = corpus();
    const revisions = docs.map((d, i) => ({ id: `R${i}`, parentRevisionId: i ? `R${i - 1}` : null, document: d }));
    const r = studioSimulerMigration(revisions, { avant: [{ userId: "u", role: "owner" }], apres: [{ userId: "u", role: "owner" }] });
    expect(r.verdict).toBe("sans-perte");
    expect(r.ecarts).toEqual([]);
    for (const c of ["identifiants", "proprietes", "cotes", "associations", "historique", "acces"] as const) expect(r.comptes[c].compares, c).toBeGreaterThan(0);
    expect(r.revisions.every((x) => x.migree && x.allerRetourExact)).toBe(true);
  });

  it("EX-091 [−] : objet non convertible conservé et rapporté (jamais supprimé pour améliorer le taux) ; perte d'historique ou d'accès refusée", () => {
    const [d] = corpus();
    const src = avecInconnues(d as unknown as Doc);
    const r = studioSimulerMigration([{ id: "R1", parentRevisionId: null, document: src }]);
    expect(r.verdict).toBe("conserves-rapportes");
    expect(r.ecarts.some((e) => e.element === "objects:inconnu-1" && e.nature === "conserve-rapporte")).toBe(true);
    expect(r.ecarts.every((e) => e.nature === "conserve-rapporte")).toBe(true);
    const h = studioSimulerMigration([{ id: "R2", parentRevisionId: "R1", document: d }]);
    expect(h.verdict).toBe("refusee");
    expect(h.ecarts[0]).toMatchObject({ categorie: "historique", nature: "perte" });
    const a = studioSimulerMigration([{ id: "R1", parentRevisionId: null, document: d }], { avant: ["u1", "u2"], apres: ["u1"] });
    expect(a.verdict).toBe("refusee");
    const imp = studioSimulerMigration([{ id: "R1", parentRevisionId: null, document: { ...(d as unknown as Doc), frame: "local-3d" } }]);
    expect(imp.verdict).toBe("refusee");
    expect(imp.revisions[0]).toMatchObject({ migree: false });
  });
});
