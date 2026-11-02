/** Relevé des références aux volumes (pur : aucune base) et garde de schéma « toute table qui cite un volume est connue ». */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chainesDe, collecterReferencesVolumes, REFERENCES_VOLUMES, referencesInconnues, volumesOrphelins } from "./volumes-gc.js";

const h = (c: string) => c.repeat(64);

describe("volumes-gc — relevé des références", () => {
  it("relève les volumeId des documents de l'Atelier et les sha256 des paquets Studio", () => {
    const refs = collecterReferencesVolumes({
      atelier_publications: [[{ kind: "vue-pdf", volumeId: h("a"), inputHash: "x1" }, { kind: "ifc", volumeId: h("b") }], []],
      studio_publications: [{ schema: "studio-publication-package/1", files: [{ format: "svg", sha256: h("c") }, { format: "pdf", sha256: h("d") }] }],
      review_packages: [[{ format: "svg", sha256: h("5") }]],
      review_findings: [[{ name: "note.pdf", sha256: h("6") }]],
      studio_observations: [[{ name: "releve.pdf", mime: "application/pdf", size: 10, sha256: h("7") }]],
    });
    for (const id of [h("a"), h("b"), h("c"), h("d"), h("5"), h("6"), h("7")]) expect(refs.has(id)).toBe(true);
  });

  it("prudent : toute chaîne d'une colonne de référence compte, même hors des champs attendus ou en texte JSON", () => {
    const refs = collecterReferencesVolumes({
      atelier_publications: [JSON.stringify([{ ancien: { contenu: h("e") } }])],
      studio_publications: [{ files: [{ autreNom: h("f") }], extra: [[h("1")]] }],
      review_packages: [], review_findings: [], studio_observations: [],
    });
    expect([h("e"), h("f"), h("1")].every((id) => refs.has(id))).toBe(true);
    expect(chainesDe({ [h("2")]: 3 }).has(h("2"))).toBe(true);
  });

  it("refuse un relevé incomplet ou illisible au lieu de supprimer à l'aveugle", () => {
    expect(() => collecterReferencesVolumes({ atelier_publications: [] })).toThrow(/studio_publications/);
    expect(() => collecterReferencesVolumes({ atelier_publications: ["{pas du json"], studio_publications: [], review_packages: [], review_findings: [], studio_observations: [] })).toThrow();
  });

  it("ne désigne jamais un volume cité ; les autres sont orphelins", () => {
    const refs = new Set([h("a"), h("B")]);
    expect(volumesOrphelins([h("a"), h("b"), h("c")], refs)).toEqual([h("c")]);
    expect(volumesOrphelins([], refs)).toEqual([]);
    expect(volumesOrphelins([h("a")], new Set())).toEqual([h("a")]);
  });

  it("une colonne inconnue qui pourrait citer un volume est signalée (le nettoyage refuse alors)", () => {
    expect(referencesInconnues([{ table: "atelier_publications", colonne: "documents" }, { table: "volumes", colonne: "id" }])).toEqual([]);
    expect(referencesInconnues([{ table: "step_files", colonne: "volume_id" }])).toEqual([{ table: "step_files", colonne: "volume_id" }]);
  });
});

describe("volumes-gc — garde de schéma", () => {
  /** Tables de `schema.ts` (commentaires retirés) dont la définition cite un volume ou un type qui en porte. */
  function tablesQuiCitentDesVolumes(): string[] {
    const src = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const out: string[] = [];
    for (const bloc of src.split(/(?=export const \w+ = pgTable\()/)) {
      const nom = /^export const \w+ = pgTable\("([^"]+)"/.exec(bloc)?.[1];
      if (!nom || nom === "volumes") continue;
      const corps = bloc.split(/\n(?=export )/)[0]!;
      if (/volume|DocumentPublie|StudioPublicationPackage|StudioPackageFile|sha256/i.test(corps)) out.push(nom);
    }
    return out.sort();
  }

  it("toute table qui cite un volume figure dans REFERENCES_VOLUMES (sinon : l'ajouter avant tout nettoyage)", () => {
    expect(tablesQuiCitentDesVolumes()).toEqual(REFERENCES_VOLUMES.map((r) => r.table).sort());
  });

  it("aucune clé étrangère SQL ne vise volumes et seule la table volumes porte ce nom", () => {
    const sql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
    expect(/REFERENCES\s+volumes\b/i.test(sql)).toBe(false);
    expect([...sql.matchAll(/\b\w*volume\w*\b/gi)].map((m) => m[0]).every((w) => w.toLowerCase() === "volumes")).toBe(true);
  });
});
