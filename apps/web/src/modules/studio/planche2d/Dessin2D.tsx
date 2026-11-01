/**
 * Planche SVG : objets et cotes des calques visibles (un calque masqué n'est pas dessiné), aperçu du tracé, repère
 * d'accrochage, rectangle de sélection (fenêtre ou capture) et grille au pas de la vue. Coordonnées SVG = repère
 * `local-2d` du document, en mètres. Un objet d'un calque verrouillé est dessiné mais ni sélectionnable ni modifiable.
 * Les gestes (molette, panoramique, rectangle, glisser) sont interprétés par l'espace de travail.
 * Rendus par type : formes (`rendus/formes.tsx`), cotes (`rendus/cote.tsx`), graphismes (`rendus/graphismes.tsx` :
 * splines, hachures, symboles, transparence), insertions de blocs et marques des contraintes (`rendus/blocs.tsx`),
 * aperçu du geste (`rendus/apercu.tsx`).
 *
 * Moteur (F.1-02) : `svg` par défaut (DEC-08). `canvas` — seulement quand la règle F.1-01 l'autorise
 * (`rendus/moteur-canvas.ts`) — trace le dessin sur un canevas posé au-dessus (`PlancheCanvas`, transparent aux gestes) ;
 * la planche SVG garde tous ses éléments (désignation, accrochage, accessibilité), leurs traits devenus transparents.
 */
import { useCallback, useRef, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import type { StudioDocument, StudioPoint, StudioShape } from "@parcours/atelier-model";
import { estSelectionnable, estVisible } from "./calques";
import { viewBox, type Cadre, type PointAccroche } from "./geometrie-2d";
import type { StudioToolId } from "./raccourcis";
import type { ModeRectangle } from "./selection";
import { Annotation } from "./rendus/annotations";
import { Architecture2D } from "./rendus/architecture";
import { Apercu } from "./rendus/apercu";
import { Cote } from "./rendus/cote";
import { Forme } from "./rendus/formes";
import { Graphisme } from "./rendus/graphismes";
import { Insertion, MarquesContraintes } from "./rendus/blocs";
import { insertionsPosees } from "./selection";
import { PlancheCanvas } from "./rendus/PlancheCanvas";

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
  /** Murs et ouvertures (A.4) : objet architectural sélectionné, sa désignation, clics vers la planche (outil Ouverture). */
  architecture?: { selection: ReadonlySet<string>; surSelection: (id: string, ajouter: boolean) => void; versPlanche: boolean };
  /** Surimpression dessinée par-dessus (sessions en direct : pointeurs et sélections des autres participants), jamais une donnée. */
  superposition?: ReactNode;
  /** Moteur de rendu effectif (règle F.1-01) : `svg` par défaut. */
  moteur?: "svg" | "canvas";
}

export function Dessin2D({ svgRef, doc, cadre, pas, outil, selection, trace, survol, rectangle, glissement, apercuForme, sommetsPoses = [], clicsVersPlanche, surPlanche, surSurvol, surPointeurBas, surPointeurHaut, surClicCapture, surSelection, architecture, superposition, moteur = "svg" }: Dessin2DProps) {
  const visible = (layerId: string | undefined) => estVisible(doc, layerId);
  const interne = useRef<SVGSVGElement | null>(null);
  const poserRef = useCallback((el: SVGSVGElement | null) => {
    interne.current = el;
    if (typeof svgRef === "function") svgRef(el); else if (svgRef) (svgRef as { current: SVGSVGElement | null }).current = el;
  }, [svgRef]);
  return (<>
    <svg ref={poserRef} viewBox={viewBox(cadre)} role="group" aria-label="Planche de dessin 2D" data-studio-outil-actif={outil} data-studio-glissement={glissement || undefined}
      data-studio-moteur={moteur === "canvas" ? "canvas" : undefined} className={moteur === "canvas" ? "studio-moteur-canvas" : undefined}
      onPointerMove={surSurvol} onPointerDown={surPointeurBas} onPointerUp={surPointeurHaut} onPointerCancel={surPointeurHaut} onClickCapture={surClicCapture} onClick={surPlanche}
      onAuxClick={(e) => e.preventDefault()}>
      <defs><pattern id="studio-grid" width={pas} height={pas} patternUnits="userSpaceOnUse"><path d={`M ${pas} 0 L 0 0 0 ${pas}`} fill="none" stroke="#dbe5eb" strokeWidth={pas * 0.025} /></pattern></defs>
      <rect x={cadre.x} y={cadre.y} width={cadre.w} height={cadre.h} fill="url(#studio-grid)" data-studio-grille={pas} />
      {architecture && <Architecture2D doc={doc} selection={architecture.selection} surSelection={architecture.surSelection} versPlanche={architecture.versPlanche} />}
      {doc.objects.filter((o) => visible(o.layerId)).map((o) => (
        <Forme key={o.id} o={o} choisie={selection.has(o.id)} selectionnable={estSelectionnable(doc, o.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(o)} />
      ))}
      {(doc.dimensions ?? []).filter((d) => visible(d.layerId)).map((d) => (
        <Cote key={d.id} d={d} choisie={selection.has(d.id)} selectionnable={estSelectionnable(doc, d.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(d)} />
      ))}
      {(doc.annotations ?? []).filter((a) => visible(a.layerId)).map((a) => (
        <Annotation key={a.id} a={a} choisie={selection.has(a.id)} selectionnable={estSelectionnable(doc, a.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(a)} />
      ))}
      {(doc.graphismes ?? []).filter((g) => visible(g.layerId)).map((g) => (
        <Graphisme key={g.id} g={g} choisie={selection.has(g.id)} selectionnable={estSelectionnable(doc, g.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(g)} />
      ))}
      {insertionsPosees(doc).filter((p) => visible(p.layerId)).map((p) => (
        <Insertion key={p.id} p={p} nom={doc.blocs?.find((b) => b.id === p.insertion.bloc)?.nom ?? p.insertion.bloc} choisie={selection.has(p.id)} selectionnable={estSelectionnable(doc, p.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(p)} />
      ))}
      <MarquesContraintes doc={doc} taille={Math.max(cadre.w, cadre.h) / 60} />
      <Apercu cadre={cadre} outil={outil} trace={trace} survol={survol} rectangle={rectangle} apercuForme={apercuForme} sommetsPoses={sommetsPoses} />
      {superposition}
    </svg>
    {moteur === "canvas" && <PlancheCanvas doc={doc} cadre={cadre} svgRef={interne} />}
  </>);
}
