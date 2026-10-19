/**
 * Planche 2D — murs et ouvertures (A.4) : outils au pointeur, saisie sans valeur proposée, désignation d'un mur,
 * modification depuis le panneau (même identité en 2D et en 3D), rendu en plan avec le vide de l'ouverture.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d, type StudioCommand, type StudioDocument, type StudioOpening } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import { lireSommets } from "../geometrie-2d";
import { outilPlanche } from "../outils";
import type { ContexteClic } from "../outils/type";
import { Architecture2D } from "../rendus/architecture";
import { commandesDeplacement, selectionParRectangle, toutSelectionnable } from "../selection";
import {
  commandeModifierArchitecture, commandeMur, contoursMurs, commandeOuverture, editionDe, ERREUR_PARAMETRES_MUR, ERREUR_PARAMETRES_OUVERTURE, murSousPoint, PARAMETRES_ARCHITECTURE_VIDES,
  type ParametresArchitecture,
} from "./architecture-ui";
import { PanneauArchitecture } from "./PanneauArchitecture";

const pp = (x: number, y: number): PointPose => ({ point: { x, y }, accroche: null });
const PARAMS: ParametresArchitecture = { mur: { epaisseur: 0.2, hauteur: 3, base: 0, justification: "center" }, ouverture: { largeur: 1, hauteur: 2.1, allege: 0, type: "" } };
const ctx = (architecture: ParametresArchitecture | undefined, document?: StudioDocument): ContexteClic => {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, layerId: undefined, decalageCote: 0.5, tolerance: 0.1, architecture, document };
};
const appliquer = (doc: StudioDocument, r: { commandes: StudioCommand[] } | { erreur: string } | { type: string }) => {
  const cs = "commandes" in r ? r.commandes : null;
  if (!cs) throw new Error(JSON.stringify(r));
  return applyStudioCommands(doc, cs);
};

describe("Outils Mur et Ouverture", () => {
  it("Mur : deux clics donnent l'axe ; sans paramètres saisis, refus explicite (rien n'est proposé)", () => {
    const mur = outilPlanche("studio.architecture.mur")!;
    const e = { outil: "studio.architecture.mur" as const, trace: pp(0, 0), suite: [], modeArc: "trois-points" as const };
    expect(mur.clic(e, pp(6, 0), ctx(undefined))).toEqual({ type: "erreur", message: ERREUR_PARAMETRES_MUR });
    expect(mur.clic(e, pp(6, 0), ctx(PARAMETRES_ARCHITECTURE_VIDES))).toEqual({ type: "erreur", message: ERREUR_PARAMETRES_MUR });
    expect(mur.clic(e, pp(6, 0), ctx(PARAMS))).toEqual({ type: "commandes", apres: "fin-trace", commandes: [{ toolId: "studio.architecture.mur", params: { id: "id-1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } }] });
    expect(mur.apercu?.(e, { x: 6, y: 0 })).toMatchObject({ type: "line", start: { x: 0, y: 0 }, end: { x: 6, y: 0 } });
  });
  it("Ouverture : un clic sur le mur la centre sur le point ; hors d'un mur, refus", () => {
    const doc = appliquer(newStudioDocument("d"), commandeMur({ nouvelId: () => "m1", layerId: undefined }, [{ x: 0, y: 0 }, { x: 6, y: 0 }], PARAMS.mur));
    const ouv = outilPlanche("studio.architecture.ouverture")!;
    expect(ouv.premierClic!(pp(3, 0.05), ctx(PARAMS, doc))).toEqual({ type: "commandes", apres: "fin-trace", commandes: [{ toolId: "studio.architecture.ouverture", params: { id: "id-1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 } }] });
    expect(ouv.premierClic!(pp(3, 2), ctx(PARAMS, doc))).toEqual({ type: "erreur", message: "Cliquez sur un mur : une ouverture n’existe que dans un mur." });
    expect(ouv.premierClic!(pp(3, 0), ctx(PARAMETRES_ARCHITECTURE_VIDES, doc))).toEqual({ type: "erreur", message: ERREUR_PARAMETRES_OUVERTURE });
    expect(murSousPoint(doc, { x: 1, y: -0.1 }, 0.01)).toEqual({ mur: doc.architecture![0], abscisse: 1 });
  });
  it("le type déclaré n'est écrit que s'il est choisi", () => {
    const sans = commandeOuverture({ nouvelId: () => "o", layerId: undefined }, "m1", 1, PARAMS.ouverture);
    const avec = commandeOuverture({ nouvelId: () => "o", layerId: undefined }, "m1", 1, { ...PARAMS.ouverture, type: "porte" });
    expect("commandes" in sans && (sans.commandes[0]!.params as StudioOpening).kind).toBeUndefined();
    expect("commandes" in avec && (avec.commandes[0]!.params as StudioOpening).kind).toBe("porte");
  });
});

describe("REC-A-03 depuis le panneau : modification de l'ouverture, même identité en 2D et en 3D", () => {
  const doc0 = () => {
    const d = appliquer(newStudioDocument("d"), commandeMur({ nouvelId: () => "m1", layerId: undefined }, [{ x: 0, y: 0 }, { x: 6, y: 0 }], PARAMS.mur));
    return appliquer(d, commandeOuverture({ nouvelId: () => "o1", layerId: undefined }, "m1", 2.5, PARAMS.ouverture));
  };
  it("élargie de 1 m à 1,20 m : volume net 3,180 → 3,096 m³ affiché dans le panneau", () => {
    const d1 = doc0();
    const o = d1.architecture![1]!;
    const e = editionDe(o);
    expect(e).toEqual({ type: "opening", position: 2.5, largeur: 1, hauteur: 2.1, allege: 0, genre: "" });
    const d2 = appliquer(d1, commandeModifierArchitecture(o, { ...e, largeur: 1.2 } as typeof e, lireSommets));
    const panneau = (doc: StudioDocument) => renderToStaticMarkup(createElement(PanneauArchitecture, {
      doc, outil: "studio.dessin.selection", selection: "m1", modifiable: true, parametres: PARAMS, surParametres: () => {}, contexte: () => ({ nouvelId: () => "x", layerId: undefined }),
      surCommandes: () => true, surErreur: () => {}, surSelection: () => {},
    }));
    expect(panneau(d1)).toMatch(/Volume net<\/dt><dd translate="no">3,180 m³/);
    expect(panneau(d2)).toMatch(/Volume net<\/dt><dd translate="no">3,096 m³/);
    expect(panneau(d2)).toMatch(/Déduction des ouvertures déclarées \(1\)<\/dt><dd translate="no">0,504 m³/);
    // Mêmes identifiants sur la planche et dans la vue 3D.
    const plan = renderToStaticMarkup(createElement("svg", null, createElement(Architecture2D, { doc: d2, selection: new Set(["o1"]), surSelection: () => {}, versPlanche: false })));
    const ids2d = [...plan.matchAll(/data-studio-architecture="([^"]+)"/g)].map((m) => m[1]);
    expect(ids2d).toEqual(["m1", "o1"]);
    expect(studioMesh3d(d2).architecture!.map((a) => a.id)).toEqual(ids2d);
    // Le mur est dessiné en deux parties pleines de part et d'autre du vide.
    expect(plan.match(/<polygon points=/g)).toHaveLength(2);
    expect(plan).toMatch(/aria-pressed="true"[^>]*data-studio-architecture="o1"/);
  });
  it("une modification incompatible est refusée par le modèle (rien n'est rogné)", () => {
    const d1 = doc0();
    const o = d1.architecture![1]!;
    expect(() => appliquer(d1, commandeModifierArchitecture(o, { ...editionDe(o), largeur: 4 } as ReturnType<typeof editionDe>, lireSommets))).toThrow(/hors du mur hôte m1/);
  });
});

describe("Correctifs de revue A.4 : désignation, visibilité, sélection des murs", () => {
  const avecMur = (over: object = {}, layers?: unknown[]) => {
    const d = { ...newStudioDocument("d"), ...(layers ? { layers } : {}) } as StudioDocument;
    return applyStudioCommands(d, [{ toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over } } as StudioCommand]);
  };
  it("un mur justifié à gauche n'est désigné que du côté de son corps", () => {
    const d = avecMur({ justification: "left" });
    expect(murSousPoint(d, { x: 3, y: 0.15 }, 0.01)?.mur.id).toBe("m1");
    expect(murSousPoint(d, { x: 3, y: -0.15 }, 0.01)).toBeNull();
    expect(murSousPoint(d, { x: 6.5, y: 0.1 }, 0.01)).toBeNull();
  });
  it("l'outil Ouverture ne désigne pas un mur d'un calque masqué ou verrouillé", () => {
    for (const calque of [{ id: "c", name: "C", visible: false, locked: false }, { id: "c", name: "C", visible: true, locked: true }]) {
      const d = { ...avecMur({ layerId: "c" }, [{ ...calque, visible: true, locked: false }]), layers: [calque] };
      expect(outilPlanche("studio.architecture.ouverture")!.premierClic!(pp(3, 0), ctx(PARAMS, d))).toEqual({ type: "erreur", message: "Cliquez sur un mur : une ouverture n’existe que dans un mur." });
    }
  });
  it("les murs entrent dans « tout sélectionner », la sélection par rectangle, le déplacement et l'accrochage", () => {
    const d = avecMur();
    expect(toutSelectionnable(d)).toEqual(["m1"]);
    expect(selectionParRectangle(d, { x: -1, y: -1 }, { x: 7, y: 1 })).toEqual(["m1"]);
    expect(selectionParRectangle(d, { x: 3, y: 1 }, { x: 2, y: -1 })).toEqual(["m1"]);
    expect(selectionParRectangle(d, { x: 2, y: -1 }, { x: 3, y: 1 })).toEqual([]);
    const { commandes } = commandesDeplacement(d, ["m1"], 1, 2);
    expect((applyStudioCommands(d, commandes).architecture![0] as { axis: unknown }).axis).toEqual([{ x: 1, y: 2 }, { x: 7, y: 2 }]);
    expect(contoursMurs(d, () => true)).toEqual([{ id: "m1", type: "polyline", closed: true, points: expect.any(Array) }]);
  });
});
