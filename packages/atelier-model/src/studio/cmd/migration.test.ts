import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyStudioCommands } from "../composition/commandes.js";
import { newStudioDocument, validateStudioDocument } from "../composition/document.js";
import type { StudioDocument } from "../composition/types.js";
import { genererCorpus, SCENES_DOCUMENTS } from "../corpus/index.js";
import { convertirExempleP118, lotsDeCommandes } from "../exemples/index.js";
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
const RACINE_SRC = new URL("../", import.meta.url);
type Doc = Record<string, unknown>;
function documentsJson(): { origine: string; document: Doc }[] {
  const out: { origine: string; document: Doc }[] = [];
  const visiter = (valeur: unknown, origine: string) => {
    if (Array.isArray(valeur)) { valeur.forEach((v, i) => visiter(v, `${origine}[${i}]`)); return; }
    if (!valeur || typeof valeur !== "object") return;
    const o = valeur as Doc;
    if (o["schemaVersion"] === STUDIO_SCHEMA_DOCUMENT_V1 && "objects" in o) { out.push({ origine, document: o }); return; }
    for (const [k, v] of Object.entries(o)) visiter(v, `${origine}.${k}`);
  };
  const parcourir = (dir: URL) => {
    for (const nom of readdirSync(dir).sort()) {
      const u = new URL(nom, dir);
      if (statSync(u).isDirectory()) { if (nom !== "node_modules") parcourir(new URL(`${nom}/`, dir)); continue; }
      if (nom.endsWith(".json")) visiter(JSON.parse(readFileSync(u, "utf8")), `src/studio/${u.pathname.split("/src/studio/")[1]}`);
    }
  };
  parcourir(RACINE_SRC);
  return out;
}
function corpusMigration(): { origine: string; document: Doc }[] {
  const docs = documentsJson();
  for (const s of SCENES_DOCUMENTS) genererCorpus(s, 100).documents.forEach((d, i) => docs.push({ origine: `corpus ${s} (100) feuillet ${i}`, document: d as unknown as Doc }));
  const jeu = JSON.parse(readFileSync(new URL("../../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as { domains: Record<string, unknown> };
  for (const n of convertirExempleP118({ levels: jeu.domains["levels"], floorDesign: jeu.domains["floorDesign"] }).niveaux) {
    let d: StudioDocument = newStudioDocument(`p118-${n.niveauId}`);
    for (const lot of lotsDeCommandes(n.commandes)) d = applyStudioCommands(d, lot);
    docs.push({ origine: `exemple P.118 niveau ${n.niveauId}`, document: d as unknown as Doc });
  }
  return docs;
}
/** Données inconnues ajoutées à une copie : champ futur d'en-tête, champ futur d'un objet, élément d'un type inconnu. */
function avecInconnues(d: Doc): Doc {
  const c = structuredClone(d);
  c["extensionFuture"] = { origine: "client /3", valeur: 42 };
  const objets = c["objects"] as Doc[];
  if (objets.length) objets[0]!["couleurFuture"] = "#ff8800";
  objets.push({ id: "inconnu-1", type: "spline-future", poles: [[0, 0], [1, 1]] });
  return c;
}
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
    expect(rapport.documents).toBeGreaterThanOrEqual(20);
    expect(conserves).toBe(rapportees);
    expect(conserves).toBeGreaterThanOrEqual(2 * documentsInconnus);
  });
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
