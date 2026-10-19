/** Formulaire « Valeurs en mètres » de l'outil actif (champs de `champsFormulaire`), mode de construction de l'arc. */
import type { FormEvent } from "react";
import type { StudioDimension, StudioShape } from "@parcours/atelier-model";
import { champsFormulaire, type Valeurs } from "../planche2d/outils/formulaire";
import type { ModeArc } from "../planche2d/outils/type";
import { CASES_TRANSFORMATION, type CleTransformation } from "../planche2d/outils/modification";
import type { StudioToolId } from "../planche2d/raccourcis";

export interface PropsFormulaireValeurs {
  tool: StudioToolId;
  selected: StudioShape | StudioDimension | null;
  desactive: boolean;
  values: Valeurs;
  surValeur: (k: keyof Valeurs, v: number) => void;
  modeArc: ModeArc;
  surModeArc: (m: ModeArc) => void;
  sommetsTexte: string;
  surSommets: (texte: string) => void;
  fermee: boolean;
  surFermee: (fermee: boolean) => void;
  surSoumettre: (e: FormEvent) => void;
}

export function FormulaireValeurs({ tool, selected, desactive, values, surValeur, modeArc, surModeArc, sommetsTexte, surSommets, fermee, surFermee, surSoumettre }: PropsFormulaireValeurs) {
  const { fields, label, saisiePolyligne, bouton } = champsFormulaire(tool, selected);
  return <form onSubmit={surSoumettre} data-studio-formulaire={tool}><fieldset disabled={desactive}><legend>Valeurs en mètres</legend>
    {tool === "studio.dessin.arc" && <label>Construction de l’arc<select value={modeArc} onChange={e => surModeArc(e.target.value as ModeArc)} data-studio-mode-arc><option value="trois-points">Trois points (début, passage, fin)</option><option value="centre">Centre, début, fin</option></select></label>}
    {fields.map(k => CASES_TRANSFORMATION.has(k as CleTransformation) ? <label key={k} className="studio-case"><input type="checkbox" checked={values[k] !== 0} onChange={e => surValeur(k, e.target.checked ? 1 : 0)} data-studio-champ={k} /> {label(k)}</label> : <label key={k}>{label(k)}<input type="number" step="any" required value={Number.isFinite(values[k]) ? values[k] : ""} onChange={e => surValeur(k, e.target.valueAsNumber)} data-studio-champ={k} /></label>)}
    {saisiePolyligne && <><label>Sommets (x y ; …)<input type="text" required value={sommetsTexte} onChange={e => surSommets(e.target.value)} data-studio-champ="sommets" /></label><label className="studio-case"><input type="checkbox" checked={fermee} onChange={e => surFermee(e.target.checked)} data-studio-champ="fermee" /> Fermée</label></>}
    <button type="submit">{bouton}</button></fieldset></form>;
}
