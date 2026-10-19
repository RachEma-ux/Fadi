/**
 * Planche SVG : objets et cotes des calques visibles (un calque masqué n'est pas dessiné), aperçu du tracé, repère
 * d'accrochage, rectangle de sélection (fenêtre ou capture) et grille au pas de la vue. Coordonnées SVG = repère
 * `local-2d` du document, en mètres. Un objet d'un calque verrouillé est dessiné mais ni sélectionnable ni modifiable.
 * Les gestes (molette, panoramique, rectangle, glisser) sont interprétés par l'espace de travail.
 * Rendus par type : formes (`rendus/formes.tsx`), cotes (`rendus/cote.tsx`), aperçu du geste (`rendus/apercu.tsx`).
 */
import type { MouseEvent, PointerEvent, Ref } from "react";
import type { StudioDocument, StudioPoint, StudioShape } from "@parcours/atelier-model";
import { estSelectionnable, estVisible } from "./calques";
import { viewBox, type Cadre, type PointAccroche } from "./geometrie-2d";
import type { StudioToolId } from "./raccourcis";
import type { ModeRectangle } from "./selection";
import { Annotation } from "./rendus/annotations";
import { Apercu } from "./rendus/apercu";
import { Cote } from "./rendus/cote";
import { Forme } from "./rendus/formes";

export { TraceForme } from "./rendus/formes";

export interface PointPose { point: StudioPoint; accroche: PointAccroche | null }

export interface RectangleSelection { debut: StudioPoint; fin: StudioPoint; mode: ModeRectangle }

export interface Dessin2DProps {
  svgRef: Ref<SVGSVGElement>;
  doc: StudioDocument;
  cadre: Cadre;
  /** Pas de la grille affichée (mètres). */
  pas: number;
  outil: StudioToolId;
  selection: ReadonlySet<string>;
  /** Premier point posé (tracé ou point de base du déplacement). */
  trace: PointPose | null;
  survol: PointPose | null;
  rectangle: RectangleSelection | null;
  /** Un glisser de la sélection est en cours (aperçu). */
  glissement: boolean;
  /** Aperçu d'une courbe en cours de tracé (cercle, arc, polyligne), calculé par l'espace de travail ; jamais une donnée. */
  apercuForme?: StudioShape | null;
  /** Sommets déjà posés d'un tracé en plusieurs points (polyligne, arc par trois points). */
  sommetsPoses?: readonly StudioPoint[];
  /** Les clics sur un objet vont à la planche (pose de point) plutôt qu'à la sélection. */
  clicsVersPlanche: (o: { id: string }) => boolean;
  surPlanche: (e: MouseEvent<SVGSVGElement>) => void;
  surSurvol: (e: PointerEvent<SVGSVGElement>) => void;
  surPointeurBas: (e: PointerEvent<SVGSVGElement>) => void;
  surPointeurHaut: (e: PointerEvent<SVGSVGElement>) => void;
  /** Avant tout clic : un geste qui vient de finir (rectangle, glisser, panoramique) n'est pas un clic. */
  surClicCapture: (e: MouseEvent<SVGSVGElement>) => void;
  /** `ajouter` : Maj tenue (bascule de l'objet dans la sélection). */
  surSelection: (id: string, ajouter: boolean) => void;
}

export function Dessin2D({ svgRef, doc, cadre, pas, outil, selection, trace, survol, rectangle, glissement, apercuForme, sommetsPoses = [], clicsVersPlanche, surPlanche, surSurvol, surPointeurBas, surPointeurHaut, surClicCapture, surSelection }: Dessin2DProps) {
  const visible = (layerId: string | undefined) => estVisible(doc, layerId);
  return (
    <svg ref={svgRef} viewBox={viewBox(cadre)} role="group" aria-label="Planche de dessin 2D" data-studio-outil-actif={outil} data-studio-glissement={glissement || undefined}
      onPointerMove={surSurvol} onPointerDown={surPointeurBas} onPointerUp={surPointeurHaut} onPointerCancel={surPointeurHaut} onClickCapture={surClicCapture} onClick={surPlanche}
      onAuxClick={(e) => e.preventDefault()}>
      <defs><pattern id="studio-grid" width={pas} height={pas} patternUnits="userSpaceOnUse"><path d={`M ${pas} 0 L 0 0 0 ${pas}`} fill="none" stroke="#dbe5eb" strokeWidth={pas * 0.025} /></pattern></defs>
      <rect x={cadre.x} y={cadre.y} width={cadre.w} height={cadre.h} fill="url(#studio-grid)" data-studio-grille={pas} />
      {doc.objects.filter((o) => visible(o.layerId)).map((o) => (
        <Forme key={o.id} o={o} choisie={selection.has(o.id)} selectionnable={estSelectionnable(doc, o.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(o)} />
      ))}
      {(doc.dimensions ?? []).filter((d) => visible(d.layerId)).map((d) => (
        <Cote key={d.id} d={d} choisie={selection.has(d.id)} selectionnable={estSelectionnable(doc, d.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(d)} />
      ))}
      {(doc.annotations ?? []).filter((a) => visible(a.layerId)).map((a) => (
        <Annotation key={a.id} a={a} choisie={selection.has(a.id)} selectionnable={estSelectionnable(doc, a.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(a)} />
      ))}
      <Apercu cadre={cadre} outil={outil} trace={trace} survol={survol} rectangle={rectangle} apercuForme={apercuForme} sommetsPoses={sommetsPoses} />
    </svg>
  );
}
