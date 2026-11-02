/**
 * REC-C-01 / EX-098 — comparaison chemin optimisé / chemin direct pour les cotes et les exports SVG / DXF / IFC, sur le
 * corpus S1–S4 et S7 et la scène de fidélité EX-055.
 *
 * Chemin direct : le document validé, mesuré par le modèle (`measureStudioDimension`) et exporté tel quel (ce que fait le
 * serveur). Chemins optimisés du client, tels qu'ils servent aujourd'hui :
 * - **brouillon incrémental** : le document reconstruit commande par commande dans le brouillon local (`brouillon.ts`,
 *   historique à instantanés), comme pendant une session d'édition ;
 * - **frontière du Worker** : le document copié par clonage structuré (transfert vers / depuis le Worker de calcul) ;
 * - **maillage incrémental** (C.2) : `studioMesh3dIncremental` (morceaux repris d'un cache) contre `studioMesh3d` ;
 * - **accrochage indexé** (C.1) : les extrémités de chaque cote retrouvées par l'index (grille) et par le parcours
 *   linéaire, puis mesurées ;
 * - **cote affichée** de la planche (`valeurCote`) contre la mesure du modèle.
 * Exigence : exports identiques octet pour octet, cotes identiques (écart 0), volumes identiques ; une divergence est
 * relevée (contrôle par mutation à la fin).
 */
import { describe, expect, it, vi } from "vitest";
import {
  exportStudioDxf, exportStudioIfc, exportStudioSvg, measureStudioDimension, studioMesh3d, studioMesh3dIncremental, validateStudioDocument, type StudioDocument,
} from "@parcours/atelier-model";
import { commandesDuDocument, genererCorpus } from "@parcours/atelier-model/studio-corpus";
import { appliquerBrouillon, creerBrouillon, documentBrouillon } from "../planche2d/brouillon";
import { valeurCote } from "../planche2d/geometrie-2d";
import { indexAccrochage, indexLineaire, boiteAutour } from "../planche2d/accrochage/entites";
import { sceneFidelite } from "../planche2d/rendus/scene-fidelite";

vi.setConfig({ testTimeout: 120_000 });

const META = { studyName: "Étude", variantName: "Variante", timestamp: "2026-10-25T00:00:00" };
const exports = (d: StudioDocument) => ({ svg: exportStudioSvg(d), dxf: exportStudioDxf(d), ifc: exportStudioIfc(d, META) });
const cotes = (d: StudioDocument) => (d.dimensions ?? []).map((c) => [c.id, measureStudioDimension(d, c.id)?.value ?? null] as const);

function documents(): { nom: string; doc: StudioDocument }[] {
  const out: { nom: string; doc: StudioDocument }[] = [];
  for (const s of ["S1", "S2", "S3", "S4", "S7"] as const) out.push({ nom: `${s} (100)`, doc: genererCorpus(s, 100).documents[0]! });
  out.push({ nom: "fidélité EX-055", doc: sceneFidelite() });
  return out;
}

describe("REC-C-01 — chemins optimisés et chemin direct : mêmes cotes, mêmes exports SVG / DXF / IFC", () => {
  it("brouillon incrémental (commande par commande) et frontière du Worker : exports identiques octet pour octet, cotes identiques", () => {
    for (const { nom, doc } of documents()) {
      const direct = validateStudioDocument(doc);
      const ref = exports(direct), refCotes = cotes(direct);
      expect(refCotes.length + (direct.objects.length > 0 ? 1 : 0), nom).toBeGreaterThan(0);
      // Brouillon : chaque commande est un pas de l'historique (le chemin d'édition du client).
      const b = creerBrouillon(validateStudioDocument({ id: direct.id, schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [] }));
      const cs = nom.startsWith("fidélité") ? null : commandesDuDocument(direct);
      const reconstruit = cs ? documentBrouillon(cs.reduce((x, c) => appliquerBrouillon(x, [c]), b)) : direct;
      if (cs) expect(reconstruit, nom).toEqual(direct);
      expect(exports(reconstruit), nom).toEqual(ref);
      expect(cotes(reconstruit), nom).toEqual(refCotes);
      // Frontière du Worker : clonage structuré aller et retour.
      const clone = structuredClone(structuredClone(direct));
      expect(exports(clone), nom).toEqual(ref);
      expect(cotes(clone), nom).toEqual(refCotes);
    }
  });

  it("cote affichée par la planche = mesure du modèle ; extrémités retrouvées par l'accrochage indexé = parcours linéaire", () => {
    for (const { nom, doc } of documents()) {
      const d = validateStudioDocument(doc);
      for (const c of d.dimensions ?? []) expect(valeurCote(c), `${nom} ${c.id}`).toBe(measureStudioDimension(d, c.id)?.value ?? null);
      const lin = indexLineaire(d.objects), idx = indexAccrochage(d.objects, 0);
      for (const c of d.dimensions ?? []) {
        for (const p of [c.start, c.end]) {
          const z = boiteAutour(p, 1e-6);
          const a = lin.formes(z).map((f) => f.forme.id).sort(), b = idx.formes(z).map((f) => f.forme.id).sort();
          expect(b, `${nom} ${c.id}`).toEqual(a);
        }
      }
    }
  });

  it("maillage incrémental (cache de morceaux) = maillage direct : mêmes volumes, donc mêmes quantités et même IFC de départ", () => {
    for (const { nom, doc } of documents()) {
      const d = validateStudioDocument(doc);
      const direct = studioMesh3d(d);
      const premier = studioMesh3dIncremental(d, null);
      expect(premier.mesh, nom).toEqual(direct);
      // Second passage sur le même document : tout est repris du cache, résultat inchangé.
      const second = studioMesh3dIncremental(d, premier.cache);
      expect(second.remailles, nom).toEqual([]);
      expect(second.mesh, nom).toEqual(direct);
    }
  });

  it("le contrôle porte : un chemin qui perd une cote ou décale un objet est relevé (exports et cotes différents)", () => {
    const d = validateStudioDocument(genererCorpus("S1", 100).documents[0]!);
    const ref = exports(d);
    const decale = { ...d, objects: d.objects.map((o, i) => (i === 0 && o.type === "line" ? { ...o, end: { x: o.end.x + 1e-3, y: o.end.y } } : o)) };
    if (d.objects[0]?.type === "line") {
      const e = exports(validateStudioDocument(decale));
      expect(e.svg).not.toBe(ref.svg);
      expect(e.dxf).not.toBe(ref.dxf);
    }
    const sansCote = { ...d, dimensions: (d.dimensions ?? []).slice(1) };
    if ((d.dimensions ?? []).length) expect(cotes(validateStudioDocument(sansCote))).not.toEqual(cotes(d));
  });
});
