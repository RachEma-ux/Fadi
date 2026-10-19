/**
 * Planche SVG : objets et cotes des calques visibles (un calque masqué n'est pas dessiné), aperçu du tracé, repère
 * d'accrochage, rectangle de sélection (fenêtre ou capture) et grille au pas de la vue. Coordonnées SVG = repère
 * `local-2d` du document, en mètres. Un objet d'un calque verrouillé est dessiné mais ni sélectionnable ni modifiable.
 * Les gestes (molette, panoramique, rectangle, glisser) sont interprétés par l'espace de travail.
 */
import type { MouseEvent, PointerEvent, Ref } from "react";
import { studioSvgPath, type StudioDimension, type StudioDocument, type StudioPoint, type StudioShape } from "@parcours/atelier-model";
import { LOCALE } from "../../../lib/i18n";
import { estSelectionnable, estVisible } from "./calques";
import { formaterMetres, traceCote, valeurCote, viewBox, type Cadre, type PointAccroche } from "./geometrie-2d";
import type { StudioToolId } from "./raccourcis";
import { rectangleEntre, type ModeRectangle } from "./selection";

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

interface PropsElement { choisie: boolean; selectionnable: boolean; surSelection: (id: string, ajouter: boolean) => void; versPlanche: boolean }

function Cote({ d, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { d: StudioDimension }) {
  const g = traceCote(d);
  const valeur = valeurCote(d);
  const u = { x: g.b.x - g.a.x, y: g.b.y - g.a.y };
  const l = Math.hypot(u.x, u.y) || 1;
  const t = { x: (u.x / l - u.y / l) * 0.12, y: (u.y / l + u.x / l) * 0.12 };
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`Cote ${d.id}`} aria-pressed={choisie}
      className={`studio-cote${choisie ? " selected" : ""}${d.toResolve ? " a-resoudre" : ""}${selectionnable ? "" : " verrouille"}`}
      data-studio-objet={d.id} data-studio-selectionnable={selectionnable || undefined}
      data-studio-cote={d.id} data-studio-cote-etat={d.toResolve ? "a-resoudre" : "resolue"} data-studio-cote-valeur={valeur === null ? undefined : valeur.toFixed(3)}
      data-studio-calque={d.layerId ?? "default"}
      onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(d.id, e.shiftKey); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(d.id, e.shiftKey); }}>
      <line className="studio-cote-attache" x1={d.start.x} y1={d.start.y} x2={g.a.x} y2={g.a.y} />
      <line className="studio-cote-attache" x1={d.end.x} y1={d.end.y} x2={g.b.x} y2={g.b.y} />
      <line className="studio-cote-ligne" x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} />
      <line className="studio-cote-trait" x1={g.a.x - t.x} y1={g.a.y - t.y} x2={g.a.x + t.x} y2={g.a.y + t.y} />
      <line className="studio-cote-trait" x1={g.b.x - t.x} y1={g.b.y - t.y} x2={g.b.x + t.x} y2={g.b.y + t.y} />
      {valeur === null
        ? <text x={g.texte.x} y={g.texte.y} transform={`rotate(${g.angle} ${g.texte.x} ${g.texte.y})`} data-studio-cote-texte>à résoudre</text>
        : <text x={g.texte.x} y={g.texte.y} transform={`rotate(${g.angle} ${g.texte.x} ${g.texte.y})`} data-studio-cote-texte>{formaterMetres(valeur, LOCALE)}</text>}
    </g>
  );
}

/** Nom affiché du type d'objet (libellé d'accessibilité). */
const NOMS: Record<StudioShape["type"], string> = { line: "Ligne", rectangle: "Rectangle", circle: "Cercle", arc: "Arc", polyline: "Polyligne" };

/** Nombre du chemin arrondi au nanomètre (pas de résidu flottant comme 1e-16 dans l'attribut `d`). */
const nano = (v: number): string => {
  const r = Math.round(v * 1e9) / 1e9;
  return String(Object.is(r, -0) ? 0 : r);
};

/** Tracé SVG d'une forme, dans le repère du document : arcs exacts (`studioSvgPath`). */
export function TraceForme({ o, className }: { o: StudioShape; className?: string }) {
  switch (o.type) {
    case "line": return <line className={className} x1={o.start.x} y1={o.start.y} x2={o.end.x} y2={o.end.y} />;
    case "rectangle": return <rect className={className} x={o.origin.x} y={o.origin.y} width={o.width} height={o.height} />;
    case "circle": return <circle className={className} cx={o.center.x} cy={o.center.y} r={o.radius} />;
    default: {
      const ouvert = o.type === "arc" || !o.closed;
      return <path className={[className, ouvert ? "studio-ouvert" : ""].filter(Boolean).join(" ") || undefined} d={studioSvgPath(o, false, nano)} />;
    }
  }
}

function Forme({ o, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { o: StudioShape }) {
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`${NOMS[o.type]} ${o.id}`} aria-pressed={choisie}
      data-studio-calque={o.layerId ?? "default"} data-studio-objet={o.id} data-studio-type={o.type} data-studio-selectionnable={selectionnable || undefined}
      onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(o.id, e.shiftKey); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(o.id, e.shiftKey); }}
      className={`studio-shape${choisie ? " selected" : ""}${selectionnable ? "" : " verrouille"}`}>
      <TraceForme o={o} />
    </g>
  );
}

export function Dessin2D({ svgRef, doc, cadre, pas, outil, selection, trace, survol, rectangle, glissement, apercuForme, sommetsPoses = [], clicsVersPlanche, surPlanche, surSurvol, surPointeurBas, surPointeurHaut, surClicCapture, surSelection }: Dessin2DProps) {
  const visible = (layerId: string | undefined) => estVisible(doc, layerId);
  const fin = survol?.point;
  const r = Math.max(cadre.w / 160, 0.08);
  const zone = rectangle ? rectangleEntre(rectangle.debut, rectangle.fin) : null;
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
      <g className="studio-apercu" pointerEvents="none">
        {apercuForme ? <g data-studio-apercu-forme={apercuForme.type}><TraceForme o={apercuForme} className="studio-apercu-trace" /></g>
          : trace && fin && (outil === "studio.dessin.rectangle"
            ? <rect x={Math.min(trace.point.x, fin.x)} y={Math.min(trace.point.y, fin.y)} width={Math.abs(fin.x - trace.point.x)} height={Math.abs(fin.y - trace.point.y)} />
            : <line x1={(sommetsPoses[sommetsPoses.length - 1] ?? trace.point).x} y1={(sommetsPoses[sommetsPoses.length - 1] ?? trace.point).y} x2={fin.x} y2={fin.y} />)}
        {trace && <circle className="studio-point-pose" cx={trace.point.x} cy={trace.point.y} r={r} />}
        {sommetsPoses.map((p, i) => <circle key={i} className="studio-point-pose" data-studio-sommet-pose={i} cx={p.x} cy={p.y} r={r * 0.8} />)}
        {survol?.accroche && <rect className="studio-accroche" data-studio-accroche={`${survol.accroche.objectId}:${survol.accroche.anchor}`} x={survol.accroche.point.x - r} y={survol.accroche.point.y - r} width={2 * r} height={2 * r} />}
        {zone && rectangle && <rect className={`studio-rectangle-selection ${rectangle.mode}`} data-studio-rectangle-selection={rectangle.mode}
          x={zone.min.x} y={zone.min.y} width={zone.max.x - zone.min.x} height={zone.max.y - zone.min.y} />}
      </g>
    </svg>
  );
}
