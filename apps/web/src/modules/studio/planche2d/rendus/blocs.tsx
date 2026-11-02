/**
 * Rendu SVG des insertions de blocs et des contraintes de la planche (X.1-01). Une insertion trace les formes de sa
 * définition posées (`studioFormesInsertion` : géométrie dérivée, jamais stockée) dans un groupe désignable au clic ou au
 * clavier, comme une forme ; une contrainte est marquée par son symbole près de sa première cible, en rouge quand elle
 * est « à résoudre » (ou que sa cible ne convient plus). Repère du document, comme les formes.
 */
import type { StudioDocument } from "@parcours/atelier-model";
import { SYMBOLES_CONTRAINTES, etatsContraintes } from "../../blocs/blocs-ui";
import type { InsertionPosee } from "../selection";
import { TraceForme, type PropsElement } from "./formes";

export function Insertion({ p, nom, choisie, selectionnable, surSelection, versPlanche }: PropsElement & { p: InsertionPosee; nom: string }) {
  return (
    <g role="button" tabIndex={selectionnable ? 0 : -1} aria-disabled={!selectionnable || undefined} aria-label={`Insertion ${p.id}`} data-studio-bloc-nom={nom} aria-pressed={choisie}
      data-studio-calque={p.layerId ?? "default"} data-studio-insertion={p.id} data-studio-bloc={p.insertion.bloc} data-studio-type="insertion" data-studio-selectionnable={selectionnable || undefined}
      data-studio-rotation={p.insertion.rotation} data-studio-echelle={p.insertion.echelle} data-studio-symetrie={p.insertion.symetrie ? "oui" : undefined}
      onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(p.id, e.shiftKey); } }}
      onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(p.id, e.shiftKey); }}
      className={`studio-shape studio-insertion${choisie ? " selected" : ""}${selectionnable ? "" : " verrouille"}`}>
      {p.formes.map((o) => <TraceForme key={o.id} o={o} />)}
    </g>
  );
}

/** Symboles sans traduction (H, V, ∥, ⊥… : signes graphiques). */
const SANS_TRADUCTION = { translate: "no" } as Record<string, string>;

/**
 * Marques des contraintes : symbole et statut (attributs lus par les recettes), jamais une donnée ; décoratives (la
 * boîte « Contraintes » en donne la liste accessible).
 */
export function MarquesContraintes({ doc, taille }: { doc: StudioDocument; taille: number }) {
  const etats = etatsContraintes(doc);
  if (!etats.length) return null;
  return (
    <g className="studio-contraintes-marques" aria-hidden="true" data-studio-contraintes-marques={etats.length}>
      {etats.filter((c) => c.point).map((c) => (
        <text key={c.id} x={c.point!.x} y={c.point!.y} fontSize={taille} {...SANS_TRADUCTION}
          className={`studio-contrainte-marque${c.statut === "satisfaite" ? "" : " a-resoudre"}`} data-studio-contrainte-marque={c.id} data-studio-contrainte-statut={c.statut}>
          {SYMBOLES_CONTRAINTES[c.type]}
        </text>
      ))}
    </g>
  );
}
