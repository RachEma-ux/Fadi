/**
 * Rendu en plan des objets architecturaux (A.4) sur la planche 2D : parties pleines du mur (interrompues par ses
 * ouvertures, `studioPlanArchitecture`) et ouvertures (montants et vide). Chaque mur et chaque ouverture est un élément
 * désignable portant son identifiant (`data-studio-architecture`), le même que dans la vue 3D. Un document dont
 * l'architecture serait incohérente n'est pas dessiné (le modèle l'aurait refusé).
 */
import { useMemo, type ReactNode } from "react";
import { studioPlanArchitecture, type StudioDocument, type StudioPoint } from "@parcours/atelier-model";
import { estSelectionnable, estVisible } from "../calques";
import { LIBELLES_STRUCTURE, LIBELLES_TYPE_OUVERTURE } from "../architecture/architecture-ui";
import "./architecture.css";

const points = (pts: readonly StudioPoint[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

export interface PropsArchitecture2D {
  doc: StudioDocument;
  /** Murs et ouvertures choisis (sélection de la planche et objet du panneau Architecture). */
  selection: ReadonlySet<string>;
  /** `ajouter` : Maj tenue (bascule du mur dans la sélection). */
  surSelection: (id: string, ajouter: boolean) => void;
  /** Les clics vont à la planche (outil Ouverture : désigner le mur). */
  versPlanche: boolean;
}

export function Architecture2D({ doc, selection, surSelection, versPlanche }: PropsArchitecture2D) {
  const plan = useMemo(() => { try { return studioPlanArchitecture(doc.architecture); } catch { return null; } }, [doc.architecture]);
  if (!plan || !doc.architecture?.length) return null;
  const element = (id: string, layerId: string | undefined, nom: string, type: "wall" | "opening" | "ladder" | "column" | "beam" | "slab", contenu: ReactNode) => {
    const selectionnable = estSelectionnable(doc, layerId);
    return (
      <g key={id} role="button" tabIndex={selectionnable ? 0 : -1} aria-label={`${nom} ${id}`} aria-pressed={selection.has(id)} aria-disabled={!selectionnable || undefined}
        className={`studio-architecture studio-architecture-${type}${selection.has(id) ? " selected" : ""}${selectionnable ? "" : " verrouille"}`}
        data-studio-architecture={id} data-studio-type={type} data-studio-calque={layerId ?? "default"}
        onKeyDown={(e) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(id, e.shiftKey); } }}
        onClick={(e) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(id, e.shiftKey); }}>
        {contenu}
      </g>
    );
  };
  return <g data-studio-architecture-plan="">
    {plan.murs.filter((m) => estVisible(doc, m.mur.layerId)).map((m) => element(m.mur.id, m.mur.layerId, "Mur", "wall",
      <>{m.morceaux.map((q, i) => <polygon key={i} points={points(q)} />)}</>))}
    {plan.ouvertures.filter((o) => estVisible(doc, o.layerId)).map((o) => element(o.id, o.layerId, o.kind ? LIBELLES_TYPE_OUVERTURE[o.kind as keyof typeof LIBELLES_TYPE_OUVERTURE] : "Ouverture", "opening",
      <><polygon className="studio-architecture-vide" points={points(o.contour)} />{o.montants.map(([a, b], i) => <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)}</>))}
    {(plan.echelles ?? []).filter((e) => estVisible(doc, e.echelle.layerId)).map((e) => element(e.echelle.id, e.echelle.layerId, "Échelle d’accès", "ladder",
      <>{[...e.montants, e.echelons].map((q, i) => <polygon key={i} points={points(q)} />)}</>))}
    {/* Lot W3-B : poteaux, poutres et dalles, par leur emprise (une dalle sous les autres, translucide). */}
    {(plan.structure ?? []).filter((e) => estVisible(doc, e.element.layerId)).map((e) => element(e.element.id, e.element.layerId, LIBELLES_STRUCTURE[e.element.type], e.element.type,
      <polygon className={e.element.type === "slab" ? "studio-architecture-dalle" : undefined} points={points(e.emprise)} />))}
  </g>;
}
