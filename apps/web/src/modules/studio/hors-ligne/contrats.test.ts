import { describe, expect, it } from "vitest";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { CONTRATS_LOCAUX, MIGRATIONS_BROUILLON, migrerBrouillon, type MigrationBrouillon } from "./contrats";
import { lireHorsLigne, VERSION_BROUILLON_HORS_LIGNE } from "./persistance";

const ligne = { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } };
const brouillon = (o: Record<string, unknown> = {}) => ({
  version: VERSION_BROUILLON_HORS_LIGNE, userId: "u1",
  base: { revision: { id: "r1", document: { id: "d", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] } }, variant: { id: "v" }, study: { projectId: "p" } },
  pas: [[ligne]], refaire: [], plan: null, pasCouverts: 0, conflit: null, ...o,
});

describe("Contrats de la file locale et migration (B.3-11)", () => {
  it("correspondance tenue : format du brouillon ↔ contrat des commandes ↔ schéma du document", () => {
    expect(CONTRATS_LOCAUX).toEqual({ brouillon: 1, commandes: STUDIO_CONTRACT, document: "studio-document/1" });
    expect(MIGRATIONS_BROUILLON).toEqual([]);
  });

  it("format courant : relu tel quel (même texte)", () => {
    const json = JSON.stringify(brouillon());
    expect(migrerBrouillon(json)).toEqual({ type: "a-jour", json });
  });

  it("format antérieur avec migration déclarée : migré (chaîne de versions), l'original intact", () => {
    const v0 = { ...brouillon(), version: 0, commandes: [[ligne]] } as Record<string, unknown>;
    delete v0.pas;
    const original = JSON.stringify(v0);
    const migrations: MigrationBrouillon[] = [{ de: 0, vers: 1, migrer: (v) => { const { commandes, ...reste } = v; return { ...reste, version: 1, pas: commandes }; } }];
    const r = migrerBrouillon(original, migrations);
    expect(r.type).toBe("migre");
    if (r.type !== "migre") return;
    expect(r).toMatchObject({ de: 0, vers: 1 });
    expect(lireHorsLigne(r.json, "u1").pas).toEqual([[ligne]]);
    expect(JSON.parse(original).commandes).toEqual([[ligne]]);
  });

  it("incompatibles, jamais réinterprétés : illisible, version inconnue, future, migration en échec", () => {
    expect(migrerBrouillon("{pas du json")).toMatchObject({ type: "incompatible", raison: "illisible" });
    expect(migrerBrouillon(JSON.stringify({ ...brouillon(), version: "1" }))).toMatchObject({ raison: "version-inconnue" });
    expect(migrerBrouillon(JSON.stringify({ ...brouillon(), version: 0 }))).toMatchObject({ raison: "version-inconnue", version: 0 });
    expect(migrerBrouillon(JSON.stringify({ ...brouillon(), version: 2 }))).toMatchObject({ raison: "version-future", version: 2 });
    const casse: MigrationBrouillon[] = [{ de: 0, vers: 1, migrer: () => { throw new Error("x"); } }];
    expect(migrerBrouillon(JSON.stringify({ ...brouillon(), version: 0 }), casse)).toMatchObject({ raison: "migration-echouee" });
    const fausse: MigrationBrouillon[] = [{ de: 0, vers: 1, migrer: (v) => v }];
    expect(migrerBrouillon(JSON.stringify({ ...brouillon(), version: 0 }), fausse)).toMatchObject({ raison: "migration-echouee" });
  });

  it("contrats : schéma du document ou outil hors contrat → incompatible (rien n'est envoyé)", () => {
    const b = brouillon();
    const schema = { ...b, base: { ...b.base, revision: { id: "r1", document: { ...b.base.revision.document, schemaVersion: "studio-document/2" } } } };
    expect(migrerBrouillon(JSON.stringify(schema))).toMatchObject({ raison: "schema-document" });
    expect(migrerBrouillon(JSON.stringify(brouillon({ pas: [[{ toolId: "studio.outil.retire", params: {} }]] })))).toMatchObject({ raison: "outil-hors-contrat" });
    const plan = { lots: [[{ toolId: "studio.outil.retire", params: {} }]], requestIds: ["r"], envoyes: 0, base: "r1" };
    expect(migrerBrouillon(JSON.stringify(brouillon({ plan, pasCouverts: 1 })))).toMatchObject({ raison: "outil-hors-contrat" });
  });
});
