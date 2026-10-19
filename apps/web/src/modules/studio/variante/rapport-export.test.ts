/** Libellés du rapport de fidélité (E.6-03) : chaque raison, statut, type et traitement a son libellé, traduit en anglais. */
import { describe, expect, it } from "vitest";
import { STUDIO_CAPACITES_EXPORT, STUDIO_RAISONS_FIDELITE, STUDIO_STATUTS_FIDELITE, studioRapportFidelite, newStudioDocument } from "@parcours/atelier-model";
import en from "../../../lib/i18n/en.json";
import {
  LIBELLES_RAISON_FIDELITE, LIBELLES_STATUT_FIDELITE, LIBELLES_TRAITEMENT_MASQUES, LIBELLES_TYPE_ELEMENT, libelleType, lignesTriees, urlRapportExport,
} from "./rapport-export";

const dico = en as Record<string, string>;

describe("Rapport de fidélité : libellés", () => {
  it("chaque raison et chaque statut du modèle a un libellé français traduit", () => {
    for (const r of STUDIO_RAISONS_FIDELITE) expect(dico[LIBELLES_RAISON_FIDELITE[r]], r).toBeTruthy();
    for (const s of STUDIO_STATUTS_FIDELITE) expect(dico[LIBELLES_STATUT_FIDELITE[s]], s).toBeTruthy();
    for (const t of Object.values(LIBELLES_TRAITEMENT_MASQUES)) expect(dico[t], t).toBeTruthy();
  });
  it("chaque type de la table des capacités a un libellé ; un type inconnu s'affiche tel quel", () => {
    const types = Object.values(STUDIO_CAPACITES_EXPORT).flatMap((t) => Object.keys(t));
    expect(Object.keys(LIBELLES_TYPE_ELEMENT).sort()).toEqual([...types].sort());
    for (const t of types) expect(dico[libelleType(t)], t).toBeTruthy();
    expect(libelleType("architecture:mur")).toBe("architecture:mur");
  });
  it("lignes les moins fidèles d'abord ; adresse du rapport dérivée de l'export", () => {
    const doc = { ...newStudioDocument("d"), objects: [{ id: "l", type: "line" as const, start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }], annotations: [{ id: "t", type: "text" as const, position: { x: 0, y: 0 }, height: 1, rotation: 0, content: "A", justification: "left" as const }] };
    expect(lignesTriees(studioRapportFidelite(doc, "ifc")).map((l) => l.statut)).toEqual(["non-couvert", "non-couvert"]);
    expect(lignesTriees(studioRapportFidelite(doc, "svg")).map((l) => l.statut)).toEqual(["approche", "exact"]);
    expect(urlRapportExport("/projects/p/studio/studies/s/variants/v/export?format=dxf&revision=r1")).toBe("/projects/p/studio/studies/s/variants/v/export/rapport?format=dxf&revision=r1");
  });
});
