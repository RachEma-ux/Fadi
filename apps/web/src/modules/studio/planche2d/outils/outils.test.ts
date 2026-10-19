/**
 * Outils de la planche (découpage S0) : l'aide et l'aperçu par outil reproduisent exactement la chaîne de l'ancien
 * espace de travail (recopiée ci-dessous comme référence), et chaque clic produit l'action attendue.
 */
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS, studioArcFromCenter, studioArcFromThreePoints, type StudioPoint, type StudioShape } from "@parcours/atelier-model";
import type { PointPose } from "../Dessin2D";
import type { StudioToolId } from "../raccourcis";
import { aidePlanche, apercuPlanche, outilPlanche } from "./index";
import type { ContexteClic, ModeArc } from "./type";
import { OUTILS_TRANSFORMATION } from "./modification";

/** Chaîne d'aide de VariantWorkspace avant le découpage (0f02cb3), recopiée telle quelle. */
function aideAvant(o: { writable: boolean; historical: boolean; canWrite: boolean | undefined; trace: PointPose | null; tool: StudioToolId; suite: StudioPoint[]; modeArc: ModeArc; moveWithPointer: boolean }): string {
  const { writable, historical, trace, tool, suite, modeArc, moveWithPointer } = o;
  return !writable && !historical && o.canWrite === false ? "Lecture seule : la planche se consulte sans modification."
    : trace && tool === "studio.dessin.polyligne" ? "Cliquez les sommets suivants ; Entrée termine, Maj+Entrée ou un clic sur le premier sommet ferme. Échap pour annuler."
    : trace && tool === "studio.dessin.arc" ? (suite.length === 0 ? (modeArc === "centre" ? "Centre placé. Cliquez le début de l’arc (il fixe le rayon)." : "Début placé. Cliquez un point de passage de l’arc.") : (modeArc === "centre" ? "Cliquez la direction de la fin de l’arc (sens trigonométrique)." : "Cliquez la fin de l’arc."))
    : trace && tool === "studio.dessin.cercle" ? "Centre placé. Cliquez un point du cercle. Échap pour annuler."
    : trace ? (tool === "studio.dessin.deplacer" ? "Point de base placé. Cliquez la destination. Échap pour annuler." : "Premier point placé. Cliquez le second point. Échap pour annuler.")
    : tool === "studio.dessin.decaler" ? "Sélectionnez un objet, saisissez la distance (positive : à gauche d’une ligne, vers l’extérieur d’une forme fermée, d’un cercle ou d’un arc), puis décalez."
    : tool === "studio.dessin.selection" ? "Cliquez un objet, Maj + clic pour l’ajouter ou le retirer ; glissez vers la droite pour une fenêtre, vers la gauche pour une capture ; glissez la sélection pour la déplacer."
    : tool === "studio.dessin.cote" ? "Cote : cliquez deux points ; près d’un sommet, le point s’y accroche et la cote suit l’objet."
    : moveWithPointer ? "Cliquez un point de base puis sa destination, ou saisissez le déplacement."
    : "Deux clics pour dessiner, ou utilisez les valeurs numériques.";
}

/** Aperçu de VariantWorkspace avant le découpage. */
function apercuAvant(tool: StudioToolId, trace: PointPose | null, suite: StudioPoint[], modeArc: ModeArc, fin: StudioPoint | undefined): StudioShape | null {
  if (!trace || !fin) return null;
  const a = trace.point;
  if (tool === "studio.dessin.cercle") { const radius = Math.hypot(fin.x - a.x, fin.y - a.y); return radius > 0 ? { id: "apercu", type: "circle", center: a, radius } : null; }
  if (tool === "studio.dessin.arc" && suite[0]) {
    const g = modeArc === "centre" ? studioArcFromCenter(a, suite[0], fin) : studioArcFromThreePoints(a, suite[0], fin);
    return g ? { id: "apercu", type: "arc", ...g } : null;
  }
  if (tool === "studio.dessin.polyligne") return { id: "apercu", type: "polyline", points: [a, ...suite, fin], closed: false };
  return null;
}

const pp = (x: number, y: number): PointPose => ({ point: { x, y }, accroche: null });
const ctx = (): ContexteClic => { let n = 0; return { nouvelId: () => `id-${++n}`, layerId: undefined, decalageCote: 0.5, tolerance: 0.1 }; };

describe("Outils de la planche : aide et aperçu identiques à l'ancien espace de travail", () => {
  // Les transformations (Copier, Rotation, Symétrie, Échelle), postérieures au découpage, ont leurs propres tests.
  const tools = STUDIO_TOOLS.map((t) => t.toolId).filter((t) => !OUTILS_TRANSFORMATION.has(t));
  const traces = [null, pp(0, 0)];
  const suites: StudioPoint[][] = [[], [{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 0 }]];
  it("aide : tous outils × tracé × suite × mode × droits", () => {
    let n = 0;
    for (const tool of tools) for (const trace of traces) for (const suite of suites) for (const modeArc of ["trois-points", "centre"] as const)
      for (const [writable, historical, canWrite] of [[true, false, true], [false, false, false], [false, true, true], [false, false, undefined]] as const)
        for (const moveWithPointer of [false, true]) {
          const attendu = aideAvant({ writable, historical, canWrite, trace, tool, suite, modeArc, moveWithPointer: moveWithPointer && tool === "studio.dessin.deplacer" });
          const obtenu = aidePlanche({ outil: tool, trace, suite, modeArc, moveWithPointer: moveWithPointer && tool === "studio.dessin.deplacer", lectureSeule: !writable && !historical && canWrite === false });
          expect(obtenu).toBe(attendu);
          n++;
        }
    expect(n).toBeGreaterThan(1000);
  });
  it("aperçu : tous outils × tracé × suite × mode", () => {
    for (const tool of tools) for (const trace of traces) for (const suite of suites) for (const modeArc of ["trois-points", "centre"] as const)
      for (const fin of [undefined, { x: 3, y: 0 }, { x: 0, y: 0 }]) expect(apercuPlanche({ outil: tool, trace, suite, modeArc }, fin)).toEqual(apercuAvant(tool, trace, suite, modeArc, fin));
  });
});

describe("Outils de la planche : actions d'un clic", () => {
  const etat = (outil: StudioToolId, suite: StudioPoint[] = [], modeArc: ModeArc = "trois-points") => ({ outil, trace: pp(0, 0), suite, modeArc });
  it("ligne, rectangle, cote : commandes puis fin du tracé ; points confondus et rectangle plat refusés", () => {
    expect(outilPlanche("studio.dessin.ligne")!.clic(etat("studio.dessin.ligne"), pp(2, 1), ctx())).toEqual({ type: "commandes", apres: "fin-trace", commandes: [{ toolId: "studio.dessin.ligne", params: { id: "id-1", type: "line", start: { x: 0, y: 0 }, end: { x: 2, y: 1 } } }] });
    expect(outilPlanche("studio.dessin.rectangle")!.clic(etat("studio.dessin.rectangle"), pp(-2, 1), ctx())).toEqual({ type: "commandes", apres: "fin-trace", commandes: [{ toolId: "studio.dessin.rectangle", params: { id: "id-1", type: "rectangle", origin: { x: -2, y: 0 }, width: 2, height: 1 } }] });
    expect(outilPlanche("studio.dessin.rectangle")!.clic(etat("studio.dessin.rectangle"), pp(2, 0), ctx())).toEqual({ type: "erreur", message: "La largeur et la hauteur doivent être strictement positives." });
    expect(outilPlanche("studio.dessin.cote")!.clic(etat("studio.dessin.cote"), pp(0, 0), ctx())).toEqual({ type: "erreur", message: "Les deux points doivent être distincts." });
    const cote = outilPlanche("studio.dessin.cote")!.clic(etat("studio.dessin.cote"), pp(3, 0), ctx());
    expect(cote.type === "commandes" && cote.commandes[0]!.toolId).toBe("studio.dessin.cote");
  });
  it("cercle, arc, polyligne : rayon arrondi, passage puis fin, sommets et fermeture sur le premier sommet", () => {
    expect(outilPlanche("studio.dessin.cercle")!.clic(etat("studio.dessin.cercle"), pp(1, 1), ctx())).toEqual({ type: "commandes", apres: "annuler-trace", commandes: [{ toolId: "studio.dessin.cercle", params: { id: "id-1", type: "circle", center: { x: 0, y: 0 }, radius: 1.414214 } }] });
    expect(outilPlanche("studio.dessin.arc")!.clic(etat("studio.dessin.arc"), pp(1, 1), ctx())).toEqual({ type: "sommet", suite: [{ x: 1, y: 1 }] });
    expect(outilPlanche("studio.dessin.arc")!.clic(etat("studio.dessin.arc", [{ x: 1, y: 1 }]), pp(1, 1), ctx())).toEqual({ type: "erreur", message: "Les deux points doivent être distincts." });
    expect(outilPlanche("studio.dessin.arc")!.clic(etat("studio.dessin.arc", [{ x: 1, y: 1 }]), pp(2, 2), ctx())).toEqual({ type: "erreur", message: "Arc impossible : points alignés ou confondus." });
    const arc = outilPlanche("studio.dessin.arc")!.clic(etat("studio.dessin.arc", [{ x: 1, y: 1 }]), pp(2, 0), ctx());
    expect(arc.type === "commandes" && arc.apres).toBe("annuler-trace");
    const poly = outilPlanche("studio.dessin.polyligne")!;
    expect(poly.clic(etat("studio.dessin.polyligne", [{ x: 1, y: 0 }]), pp(1, 0), ctx())).toEqual({ type: "erreur", message: "Deux sommets consécutifs doivent être distincts." });
    expect(poly.clic(etat("studio.dessin.polyligne", [{ x: 1, y: 0 }]), pp(1, 1), ctx())).toEqual({ type: "sommet", suite: [{ x: 1, y: 0 }, { x: 1, y: 1 }] });
    expect(poly.clic(etat("studio.dessin.polyligne", [{ x: 1, y: 0 }, { x: 1, y: 1 }]), pp(0.05, 0), ctx())).toEqual({ type: "terminer-polyligne", fermee: true });
  });
  it("déplacer : écart au micromètre, accrochage hors sélection", () => {
    expect(outilPlanche("studio.dessin.deplacer")!.horsSelection).toBe(true);
    expect(outilPlanche("studio.dessin.deplacer")!.clic(etat("studio.dessin.deplacer"), pp(0.1 + 0.2, -1), ctx())).toEqual({ type: "deplacer", dx: 0.3, dy: -1 });
    expect(outilPlanche("studio.dessin.selection")).toBeNull();
  });
});
