/**
 * Aperçu du geste en cours (jamais une donnée du document) : forme en cours de tracé, élastique d'un tracé à deux points,
 * points posés, repère d'accrochage, rectangle de sélection (fenêtre ou capture).
 */
import type { StudioPoint, StudioShape } from "@parcours/atelier-model";
import type { Cadre } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import { rectangleEntre } from "../selection";
import type { PointPose, RectangleSelection } from "../Dessin2D";
import { TraceForme } from "./formes";

export interface PropsApercu {
  cadre: Cadre;
  outil: StudioToolId;
  trace: PointPose | null;
  survol: PointPose | null;
  rectangle: RectangleSelection | null;
  apercuForme?: StudioShape | null | undefined;
  sommetsPoses: readonly StudioPoint[];
}

export function Apercu({ cadre, outil, trace, survol, rectangle, apercuForme, sommetsPoses }: PropsApercu) {
  const fin = survol?.point;
  const r = Math.max(cadre.w / 160, 0.08);
  const zone = rectangle ? rectangleEntre(rectangle.debut, rectangle.fin) : null;
  return (
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
  );
}
