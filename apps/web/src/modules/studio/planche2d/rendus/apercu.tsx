/**
 * Aperçu du geste en cours (jamais une donnée du document) : forme en cours de tracé, élastique d'un tracé à deux points,
 * points posés, repère d'accrochage, rectangle de sélection (fenêtre ou capture). Le repère du moteur d'accrochage
 * (`../accrochage/`) a un symbole par mode (carré de l'extrémité, triangle du milieu, rond du centre, losange du
 * quadrant, croix de l'intersection, équerre de la perpendiculaire, cercle tangent, sablier du plus proche), son nom
 * affiché (traduit) et, pour le repérage orthogonal ou polaire, la ligne guide depuis le dernier point.
 */
import type { StudioPoint, StudioShape } from "@parcours/atelier-model";
import { libelleRepere, type PointRepere, type Repere } from "../accrochage";
import type { Cadre } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import { rectangleEntre } from "../selection";
import type { PointPose, RectangleSelection } from "../Dessin2D";
import { TraceForme } from "./formes";
import "../accrochage/accrochage.css";

export interface PropsApercu {
  cadre: Cadre;
  outil: StudioToolId;
  trace: PointPose | null;
  survol: PointRepere | null;
  rectangle: RectangleSelection | null;
  apercuForme?: StudioShape | null | undefined;
  sommetsPoses: readonly StudioPoint[];
}

/** Symbole du repère, centré sur le point, de demi-taille `s` (mètres). */
function Symbole({ genre, p, s }: { genre: Repere["genre"]; p: StudioPoint; s: number }) {
  const { x, y } = p;
  switch (genre) {
    case "extremite": return <rect x={x - s} y={y - s} width={2 * s} height={2 * s} />;
    case "milieu": return <path d={`M${x} ${y - s}L${x + s} ${y + s}L${x - s} ${y + s}Z`} />;
    case "centre": return <circle cx={x} cy={y} r={s} />;
    case "quadrant": return <path d={`M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z`} />;
    case "intersection": return <path d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`} />;
    case "perpendiculaire": return <path d={`M${x - s} ${y + s}L${x + s} ${y + s}M${x} ${y + s}L${x} ${y - s}M${x} ${y + s / 3}L${x + (2 * s) / 3} ${y + s / 3}L${x + (2 * s) / 3} ${y + s}`} />;
    case "tangente": return <><circle cx={x} cy={y} r={s * 0.75} /><path d={`M${x - s * 1.3} ${y - s * 0.75}L${x + s * 1.3} ${y - s * 0.75}`} /></>;
    case "parallele": return <path d={`M${x - s} ${y + s}L${x} ${y - s}M${x} ${y + s}L${x + s} ${y - s}`} />;
    case "proche": return <path d={`M${x - s} ${y - s}L${x + s} ${y - s}L${x - s} ${y + s}L${x + s} ${y + s}Z`} />;
    default: return <path d={`M${x - s} ${y}L${x + s} ${y}M${x} ${y - s}L${x} ${y + s}`} />;
  }
}

function RepereAccrochage({ repere, cadre, r }: { repere: Repere; cadre: Cadre; r: number }) {
  const p = repere.point, s = r * 1.3;
  const portee = cadre.w + cadre.h;
  // Ligne guide : du dernier point au-delà du point suivi, dans le sens du pointeur, jusqu'au bord de la vue.
  let guide: { de: StudioPoint; vers: StudioPoint } | null = null;
  if (repere.guide && repere.angle !== undefined) {
    const de = repere.guide.de, ux = Math.cos(repere.angle), uy = Math.sin(repere.angle);
    const sens = Math.sign((p.x - de.x) * ux + (p.y - de.y) * uy) || 1;
    guide = { de, vers: { x: de.x + sens * portee * ux, y: de.y + sens * portee * uy } };
  }
  return (
    <g className={`studio-repere ${repere.genre}`} data-studio-accroche-mode={repere.genre} data-studio-accroche-point={`${p.x} ${p.y}`}
      data-studio-accroche={repere.ancre ? `${repere.ancre.objectId}:${repere.ancre.anchor}` : undefined} data-studio-accroche-objets={repere.objets.join(" ") || undefined}>
      {guide && <line className="studio-guide" x1={guide.de.x} y1={guide.de.y} x2={guide.vers.x} y2={guide.vers.y} />}
      <Symbole genre={repere.genre} p={p} s={s} />
      <text x={p.x + s * 1.6} y={p.y - s * 1.6} fontSize={r * 2.6}>{libelleRepere(repere)}</text>
    </g>
  );
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
      {survol?.repere ? <RepereAccrochage repere={survol.repere} cadre={cadre} r={r} />
        : survol?.accroche && <rect className="studio-accroche" data-studio-accroche={`${survol.accroche.objectId}:${survol.accroche.anchor}`} x={survol.accroche.point.x - r} y={survol.accroche.point.y - r} width={2 * r} height={2 * r} />}
      {zone && rectangle && <rect className={`studio-rectangle-selection ${rectangle.mode}`} data-studio-rectangle-selection={rectangle.mode}
        x={zone.min.x} y={zone.min.y} width={zone.max.x - zone.min.x} height={zone.max.y - zone.min.y} />}
    </g>
  );
}
