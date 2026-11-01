/**
 * X.1-08 — références visuelles du corpus S6 (étude à variantes et révisions) : S6 n'avait que son oracle numérique et
 * l'empreinte de son plan. Ici, le plan est rejoué par le modèle seul (comme `corpus.test.ts`) et la tête de chaque
 * variante (A, B, C) reçoit sa référence visuelle, sur le même principe que S1–S5 et S7 : SVG sérialisé conservé
 * (`references/S6-<variante>-100.svg`), empreinte SHA-256 du SVG et empreinte de contenu du maillage 3D dérivé
 * (`references/S6-100.json`). Ces références sont des sérialisations, pas des captures rendues (raster, vue 3D) sur un
 * banc autorisé : celles-ci restent hors de ce test.
 *
 * Réécriture (après un changement voulu du rendu) : `STUDIO_CORPUS_ECRIRE=1`, comme pour le reste du corpus.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioDocument } from "../document-2d.js";
import { exportStudioSvg } from "../export.js";
import { studioMesh3d } from "../mesh-3d.js";
import { studioEmpreinteContenu } from "../projections.js";
import { studioSha256 } from "../empreinte-sha256.js";
import { planS6, type CleVarianteS6 } from "./index.js";

const REFERENCES = join(dirname(fileURLToPath(import.meta.url)), "references");
const ECRIRE = process.env.STUDIO_CORPUS_ECRIRE === "1";
const VARIANTES: readonly CleVarianteS6[] = ["A", "B", "C"];

/** Têtes des variantes après rejeu du plan (une variante dérivée part de l'état de sa source après l'étape citée). */
function tetesS6(): Map<string, StudioDocument> {
  const plan = planS6();
  const tetes = new Map<string, StudioDocument>(), apres = new Map<string, StudioDocument>();
  for (const e of plan.etapes) {
    let doc = tetes.get(e.variante);
    if (!doc) {
      const v = plan.variantes.find((x) => x.cle === e.variante)!;
      doc = v.depuis ? apres.get(v.depuis.apresEtape)! : newStudioDocument(plan.base.id);
    }
    doc = applyStudioCommands(doc, e.commandes);
    tetes.set(e.variante, doc);
    apres.set(e.cle, doc);
  }
  return tetes;
}

describe("X.1-08 : références visuelles du corpus S6 (têtes des variantes A, B, C)", () => {
  const FORMAT_FR = new Intl.NumberFormat("fr-FR").format(1.5);

  it("plateforme : formatage fr-FR complet (les cotes des SVG en dépendent)", () => {
    expect(FORMAT_FR).toBe("1,5");
  });

  it("chaque tête de variante a un SVG de référence conservé, identique octet pour octet, et ses empreintes (SVG, maillage 3D)", () => {
    const tetes = tetesS6();
    const calcule: Record<string, { svg: string; maillage: string }> = {};
    for (const cle of VARIANTES) {
      const doc = tetes.get(cle);
      expect(doc, `tête de la variante ${cle}`).toBeDefined();
      const svg = exportStudioSvg(doc!);
      const fichier = join(REFERENCES, `S6-${cle}-100.svg`);
      if (ECRIRE) { mkdirSync(REFERENCES, { recursive: true }); writeFileSync(fichier, svg); }
      expect(existsSync(fichier), `référence ${fichier} (STUDIO_CORPUS_ECRIRE=1 pour l'écrire)`).toBe(true);
      expect(readFileSync(fichier, "utf8"), `référence visuelle ${fichier}`).toBe(svg);
      calcule[cle] = { svg: studioSha256(svg), maillage: studioEmpreinteContenu(studioMesh3d(doc!)) };
    }
    const manifeste = join(REFERENCES, "S6-100.json");
    if (ECRIRE) writeFileSync(manifeste, `${JSON.stringify(calcule, null, 1)}\n`);
    expect(JSON.parse(readFileSync(manifeste, "utf8"))).toEqual(calcule);
  });

  it("les trois têtes sont visuellement distinctes (une référence ne masque pas une variante)", () => {
    const tetes = tetesS6();
    const empreintes = VARIANTES.map((c) => studioSha256(exportStudioSvg(tetes.get(c)!)));
    expect(new Set(empreintes).size).toBe(3);
  });
});
