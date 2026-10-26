/**
 * X.1-05 — booléens exacts du corpus S5 : le résultat conservé dans `packages/atelier-model/src/studio/corpus/fixtures/
 * s5-exacts.ts` est recalculé ici par le noyau exact (occt-wasm en Node, même chemin que le serveur : `studioCaptureBooleen`
 * puis `executer`) et comparé à l'empreinte du brep ; son volume est comparé à la forme close (union 1,5 V, différence
 * 0,5 V, intersection 0,5 V). `STUDIO_CORPUS_ECRIRE=1` réécrit la donnée (changement délibéré du noyau ou du motif).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioCaptureBooleen, type StudioCommand, type StudioResultatExact } from "@parcours/atelier-model";
import { BOOLEENS_S5, genererCorpus, operandesBooleenS5, parametresS5, RESULTATS_EXACTS_S5 } from "@parcours/atelier-model/studio-corpus";
import { MoteurExact } from "@parcours/geometry-exact";

const FICHIER = fileURLToPath(new URL("../../../../packages/atelier-model/src/studio/corpus/fixtures/s5-exacts.ts", import.meta.url));
const ECRIRE = process.env.STUDIO_CORPUS_ECRIRE === "1";

describe("X.1-05 — booléens exacts du corpus S5 recalculés par le noyau OCCT", () => {
  it("X.1-05 booléens S5 : union, différence et intersection recalculées par le noyau — même empreinte que la donnée conservée, volumes de forme close", async () => {
    const M = await MoteurExact.charger();
    const calcules: Record<string, StudioResultatExact> = {};
    for (const [j, operation] of BOOLEENS_S5.entries()) {
      const [a, b] = operandesBooleenS5(j);
      const doc = applyStudioCommands(newStudioDocument("s5"), [{ toolId: "studio.calque.creer", params: { id: "solides", name: "Solides libres (synthétique)", visible: true, locked: false } }, { toolId: "studio.solide.boite", params: a }, { toolId: "studio.solide.boite", params: b }] as StudioCommand[]);
      const c = studioCaptureBooleen(doc, { operation, operandes: [a.id, b.id] });
      if (!c.ok) throw new Error(c.message);
      const r = M.executer(c.capture.entrees);
      const id = `s5-${j}-booleen`;
      calcules[id] = { brep: r.brep, maillage: r.maillage, volume: r.volume, aire: r.aire, faces: r.faces, solides: r.solides, moteur: r.moteur, versionMoteur: r.versionMoteur, empreinte: r.empreinte };
      const p = parametresS5(j).boite, V = p.largeur * p.profondeur * p.hauteur;
      expect(r.volume, `${operation} : forme close`).toBeCloseTo(operation === "union" ? 1.5 * V : 0.5 * V, 9);
    }
    if (ECRIRE) {
      writeFileSync(FICHIER, `// Généré par apps/api/src/lib/studio-corpus-s5.test.ts (STUDIO_CORPUS_ECRIRE=1) : ne pas éditer à la main.\nimport type { StudioResultatExact } from "../../objets-3d/exacts.js";\n\nexport const RESULTATS_EXACTS_S5: Readonly<Record<string, StudioResultatExact>> = ${JSON.stringify(calcules)};\n`);
      return;
    }
    for (const [id, r] of Object.entries(calcules)) {
      expect(RESULTATS_EXACTS_S5[id]?.empreinte, `${id} : empreinte conservée`).toBe(r.empreinte);
      expect(RESULTATS_EXACTS_S5[id]?.volume).toBe(r.volume);
    }
    // Le corpus généré porte exactement ces résultats (opérandes conservés).
    const doc = genererCorpus("S5", 100).documents[0]!;
    expect(doc.exacts?.map((e) => [e.id, e.operation, e.resultat.empreinte])).toEqual(BOOLEENS_S5.map((op, j) => [`s5-${j}-booleen`, op, calcules[`s5-${j}-booleen`]!.empreinte]));
  });
});
