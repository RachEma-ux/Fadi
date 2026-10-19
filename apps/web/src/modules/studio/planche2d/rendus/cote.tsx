/** Rendu SVG d'une cote (planche 2D) : attaches, ligne de cote, traits obliques, valeur mesurée ou « à résoudre ». */
import type { StudioDimension } from "@parcours/atelier-model";
import { LOCALE } from "../../../../lib/i18n";
import { formaterMetres, traceCote, valeurCote } from "../geometrie-2d";
import type { PropsElement } from "./formes";

export function Cote({ d, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { d: StudioDimension }) {
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
