/**
 * Rendus SVG des annotations (planche 2D) : cote angulaire (arc de cote, attaches, valeur en degrés ou « à résoudre »)
 * et texte (contenu du projet, jamais traduit : `translate="no"`). Coordonnées du document, comme les formes et les
 * cotes ; la géométrie dérivée vient du modèle (`dessinerCoteAngulaire`), jamais d'un second calcul.
 */
import { dessinerCoteAngulaire, studioSvgPath, studioTextRotationDegrees, type StudioAngularDimension, type StudioAnnotation, type StudioText } from "@parcours/atelier-model";
import { LOCALE } from "../../../../lib/i18n";
import type { PropsElement } from "./formes";
import "./annotations.css";

/** Hauteur du libellé d'une cote angulaire sur la planche (mètres du dessin, comme celui des cotes). */
const LIBELLE = 0.34;
const ANCRE = { left: "start", center: "middle", right: "end" } as const;
/** Donnée du projet ou valeur mesurée : le dictionnaire anglais ne la touche pas (attribut HTML `translate`, absent des types SVG). */
const SANS_TRADUCTION = { translate: "no" } as Record<string, string>;

const nano = (v: number): string => {
  const r = Math.round(v * 1e9) / 1e9;
  return String(Object.is(r, -0) ? 0 : r);
};

function proprietes({ choisie, selectionnable, surSelection, versPlanche }: PropsElement, id: string) {
  return {
    role: "button", tabIndex: selectionnable ? 0 : -1, "aria-disabled": !selectionnable || undefined, "aria-pressed": choisie,
    "data-studio-objet": id, "data-studio-selectionnable": selectionnable || undefined,
    onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => { if (selectionnable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); surSelection(id, e.shiftKey); } },
    onClick: (e: { shiftKey: boolean; stopPropagation: () => void }) => { if (versPlanche) return; e.stopPropagation(); if (selectionnable) surSelection(id, e.shiftKey); },
  } as const;
}

export function CoteAngulaire({ d, ...p }: PropsElement & { d: StudioAngularDimension }) {
  const g = dessinerCoteAngulaire(d, LOCALE, LIBELLE);
  return (
    <g {...proprietes(p, d.id)} aria-label={`Cote angulaire ${d.id}`}
      className={`studio-cote-angulaire${p.choisie ? " selected" : ""}${d.toResolve ? " a-resoudre" : ""}${p.selectionnable ? "" : " verrouille"}`}
      data-studio-type={d.type} data-studio-calque={d.layerId ?? "default"}
      data-studio-cote-angulaire={d.id} data-studio-cote-etat={d.toResolve ? "a-resoudre" : "resolue"} data-studio-angle={g.value === null ? undefined : g.value.toFixed(3)}>
      <path className="studio-cote-angulaire-arc" d={studioSvgPath(g.arc, false, nano)} />
      {g.extensions.map(([a, b], i) => <line key={i} className="studio-cote-angulaire-attache" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)}
      {g.value === null
        ? <text x={g.text.x} y={g.text.y} transform={`rotate(${g.angle} ${g.text.x} ${g.text.y})`} data-studio-cote-texte>à résoudre</text>
        : <text x={g.text.x} y={g.text.y} transform={`rotate(${g.angle} ${g.text.x} ${g.text.y})`} data-studio-cote-texte {...SANS_TRADUCTION}>{g.label}</text>}
    </g>
  );
}

export function TexteAnnotation({ t, ...p }: PropsElement & { t: StudioText }) {
  const deg = studioTextRotationDegrees(t);
  return (
    <g {...proprietes(p, t.id)} aria-label={`Texte ${t.id}`} className={`studio-texte${p.choisie ? " selected" : ""}${p.selectionnable ? "" : " verrouille"}`}
      data-studio-type={t.type} data-studio-calque={t.layerId ?? "default"} data-studio-texte={t.id}>
      <text x={t.position.x} y={t.position.y} fontSize={t.height} textAnchor={ANCRE[t.justification]} transform={deg ? `rotate(${deg} ${t.position.x} ${t.position.y})` : undefined}
        {...SANS_TRADUCTION} data-studio-texte-contenu>{t.content}</text>
    </g>
  );
}

/** Annotation du document : cote angulaire ou texte. */
export function Annotation({ a, ...p }: PropsElement & { a: StudioAnnotation }) {
  return a.type === "text" ? <TexteAnnotation t={a} {...p} /> : <CoteAngulaire d={a} {...p} />;
}
