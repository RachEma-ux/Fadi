/**
 * Rendus SVG par type de forme (planche 2D) : un tracé par type, dans le repère du document, et l'élément interactif
 * (sélection, accessibilité, attributs `data-studio-*` lus par les recettes). Ajouter un type de forme = une entrée dans
 * `TRACES` et `NOMS`.
 */
import type { ReactElement } from "react";
import { studioSvgPath, type StudioShape } from "@parcours/atelier-model";

/** Nom affiché du type d'objet (libellé d'accessibilité). */
export const NOMS: Record<StudioShape["type"], string> = { line: "Ligne", rectangle: "Rectangle", circle: "Cercle", arc: "Arc", polyline: "Polyligne" };

/** Nombre du chemin arrondi au nanomètre (pas de résidu flottant comme 1e-16 dans l'attribut `d`). */
const nano = (v: number): string => {
  const r = Math.round(v * 1e9) / 1e9;
  return String(Object.is(r, -0) ? 0 : r);
};

/** Courbe (arc, polyligne) en `<path>` à arcs exacts ; un tracé ouvert porte `studio-ouvert` (sans remplissage). */
function chemin(o: Extract<StudioShape, { type: "arc" | "polyline" }>, className: string | undefined, ouvert: boolean): ReactElement {
  return <path className={[className, ouvert ? "studio-ouvert" : ""].filter(Boolean).join(" ") || undefined} d={studioSvgPath(o, false, nano)} />;
}

/** Tracé de chaque type de forme. */
export const TRACES: { [K in StudioShape["type"]]: (o: Extract<StudioShape, { type: K }>, className?: string) => ReactElement } = {
  line: (o, className) => <line className={className} x1={o.start.x} y1={o.start.y} x2={o.end.x} y2={o.end.y} />,
  rectangle: (o, className) => <rect className={className} x={o.origin.x} y={o.origin.y} width={o.width} height={o.height} />,
  circle: (o, className) => <circle className={className} cx={o.center.x} cy={o.center.y} r={o.radius} />,
  arc: (o, className) => chemin(o, className, true),
  polyline: (o, className) => chemin(o, className, !o.closed),
};

/** Tracé SVG d'une forme, dans le repère du document : arcs exacts (`studioSvgPath`). */
export function TraceForme({ o, className }: { o: StudioShape; className?: string }) {
  return (TRACES[o.type] as (o: StudioShape, className?: string) => ReactElement)(o, className);
}

export interface PropsElement { choisie: boolean; selectionnable: boolean; surSelection: (id: string, ajouter: boolean) => void; versPlanche: boolean }

export function Forme({ o, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { o: StudioShape }) {
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
