/**
 * Rendu SVG des graphismes de la planche (EX-055) : splines (courbes de Bézier `C` exactes), hachures (contour et traits
 * dérivés par le modèle), symboles (posés par leur transformation `local-objet → local-2d`) et leur transparence
 * (`opacity`). Repère du document, comme les formes ; mêmes primitives que l'export SVG (`studioPrimitivesGraphisme`).
 * Un graphisme se désigne au clic ou au clavier (il se retire par « Retirer les graphismes »).
 */
import type { ReactElement } from "react";
import { studioPrimitivesGraphisme, type StudioGraphisme, type StudioPrimitiveGraphisme } from "@parcours/atelier-model";
import type { PropsElement } from "./formes";

export const NOMS_GRAPHISMES: Record<StudioGraphisme["type"], string> = { spline: "Spline", hachure: "Hachure", symbole: "Symbole" };

function primitive(p: StudioPrimitiveGraphisme, i: number): ReactElement {
  switch (p.genre) {
    case "bezier": return <path key={i} className="studio-ouvert" d={`M ${p.depart.x} ${p.depart.y}${p.morceaux.map((m) => ` C ${m.map((q) => `${q.x} ${q.y}`).join(" ")}`).join("")}`} />;
    case "segment": return <line key={i} x1={p.a.x} y1={p.a.y} x2={p.b.x} y2={p.b.y} />;
    case "cercle": return <circle key={i} cx={p.centre.x} cy={p.centre.y} r={p.rayon} />;
    case "polygone": return <polygon key={i} points={p.points.map((q) => `${q.x},${q.y}`).join(" ")} />;
  }
}

export function Graphisme({ g, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { g: StudioGraphisme }) {
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`${NOMS_GRAPHISMES[g.type]} ${g.id}`} aria-pressed={choisie}
      data-studio-calque={g.layerId ?? "default"} data-studio-graphisme={g.id} data-studio-type={g.type} data-studio-opacite={g.opacite ?? 1}
      opacity={g.opacite} onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(g.id, e.shiftKey); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(g.id, e.shiftKey); }}
      className={`studio-shape studio-graphisme${choisie ? " selected" : ""}${selectionnable ? "" : " verrouille"}`}>
      {studioPrimitivesGraphisme(g).map(primitive)}
    </g>
  );
}
