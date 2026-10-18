/**
 * Planche SVG : objets et cotes des calques visibles (un calque masqué n'est pas dessiné), aperçu du tracé et repère
 * d'accrochage. Coordonnées SVG = repère `local-2d` du document, en mètres. Un objet d'un calque verrouillé est dessiné
 * mais ni sélectionnable ni modifiable.
 */
import type { MouseEvent, PointerEvent, Ref } from "react";
import type { StudioDimension, StudioDocument, StudioPoint, StudioShape } from "@parcours/atelier-model";
import { LOCALE } from "../../../lib/i18n";
import { estSelectionnable, estVisible } from "./calques";
import { formaterMetres, traceCote, valeurCote, viewBox, type Cadre, type PointAccroche } from "./geometrie-2d";
import type { StudioToolId } from "./raccourcis";

export interface PointPose { point: StudioPoint; accroche: PointAccroche | null }

export interface Dessin2DProps {
  svgRef: Ref<SVGSVGElement>;
  doc: StudioDocument;
  cadre: Cadre;
  outil: StudioToolId;
  selection: string | null;
  /** Premier point posé (tracé ou point de base du déplacement). */
  trace: PointPose | null;
  survol: PointPose | null;
  /** Les clics sur un objet vont à la planche (pose de point) plutôt qu'à la sélection. */
  clicsVersPlanche: (o: { id: string }) => boolean;
  surPlanche: (e: MouseEvent<SVGSVGElement>) => void;
  surSurvol: (e: PointerEvent<SVGSVGElement>) => void;
  surSelection: (id: string) => void;
}

function Cote({ d, choisie, selectionnable, surSelection, versPlanche }: { d: StudioDimension; choisie: boolean; selectionnable: boolean; surSelection: (id: string) => void; versPlanche: boolean }) {
  const g = traceCote(d);
  const valeur = valeurCote(d);
  const u = { x: g.b.x - g.a.x, y: g.b.y - g.a.y };
  const l = Math.hypot(u.x, u.y) || 1;
  const t = { x: (u.x / l - u.y / l) * 0.12, y: (u.y / l + u.x / l) * 0.12 };
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`Cote ${d.id}`} aria-pressed={choisie}
      className={`studio-cote${choisie ? " selected" : ""}${d.toResolve ? " a-resoudre" : ""}${selectionnable ? "" : " verrouille"}`}
      data-studio-cote={d.id} data-studio-cote-etat={d.toResolve ? "a-resoudre" : "resolue"} data-studio-cote-valeur={valeur === null ? undefined : valeur.toFixed(3)}
      data-studio-calque={d.layerId ?? "default"}
      onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(d.id); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(d.id); }}>
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

function Forme({ o, choisie, selectionnable, surSelection, versPlanche }: { o: StudioShape; choisie: boolean; selectionnable: boolean; surSelection: (id: string) => void; versPlanche: boolean }) {
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`${o.type === "line" ? "Ligne" : "Rectangle"} ${o.id}`} aria-pressed={choisie}
      data-studio-calque={o.layerId ?? "default"}
      onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(o.id); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(o.id); }}
      className={`studio-shape${choisie ? " selected" : ""}${selectionnable ? "" : " verrouille"}`}>
      {o.type === "line" ? <line x1={o.start.x} y1={o.start.y} x2={o.end.x} y2={o.end.y} /> : <rect x={o.origin.x} y={o.origin.y} width={o.width} height={o.height} />}
    </g>
  );
}

export function Dessin2D({ svgRef, doc, cadre, outil, selection, trace, survol, clicsVersPlanche, surPlanche, surSurvol, surSelection }: Dessin2DProps) {
  const visible = (layerId: string | undefined) => estVisible(doc, layerId);
  const fin = survol?.point;
  const r = Math.max(cadre.w / 160, 0.08);
  return (
    <svg ref={svgRef} viewBox={viewBox(cadre)} role="group" aria-label="Planche de dessin 2D" data-studio-outil-actif={outil} onPointerMove={surSurvol} onClick={surPlanche}>
      <defs><pattern id="studio-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dbe5eb" strokeWidth="0.025" /></pattern></defs>
      <rect x={cadre.x} y={cadre.y} width={cadre.w} height={cadre.h} fill="url(#studio-grid)" />
      {doc.objects.filter((o) => visible(o.layerId)).map((o) => (
        <Forme key={o.id} o={o} choisie={selection === o.id} selectionnable={estSelectionnable(doc, o.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(o)} />
      ))}
      {(doc.dimensions ?? []).filter((d) => visible(d.layerId)).map((d) => (
        <Cote key={d.id} d={d} choisie={selection === d.id} selectionnable={estSelectionnable(doc, d.layerId)} surSelection={surSelection} versPlanche={clicsVersPlanche(d)} />
      ))}
      <g className="studio-apercu" pointerEvents="none">
        {trace && fin && (outil === "studio.dessin.rectangle"
          ? <rect x={Math.min(trace.point.x, fin.x)} y={Math.min(trace.point.y, fin.y)} width={Math.abs(fin.x - trace.point.x)} height={Math.abs(fin.y - trace.point.y)} />
          : <line x1={trace.point.x} y1={trace.point.y} x2={fin.x} y2={fin.y} />)}
        {trace && <circle className="studio-point-pose" cx={trace.point.x} cy={trace.point.y} r={r} />}
        {survol?.accroche && <rect className="studio-accroche" data-studio-accroche={`${survol.accroche.objectId}:${survol.accroche.anchor}`} x={survol.accroche.point.x - r} y={survol.accroche.point.y - r} width={2 * r} height={2 * r} />}
      </g>
    </svg>
  );
}
