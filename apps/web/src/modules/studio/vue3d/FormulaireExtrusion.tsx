/**
 * Formulaire « Volume » de la sélection : base, hauteur et épaisseur (lignes) en mètres, direction d'extrusion (+Z ou
 * −Z, lot F1), saisies par l'utilisateur (aucune valeur proposée). « Extruder » et « Aplatir » sont les mêmes commandes que la barre Volume. En lecture seule
 * le formulaire est désactivé.
 */
import type { FormEvent } from "react";
import { Icon } from "../../../components/Icon";
import type { ValeursExtrusion } from "./extrusion";

export interface FormulaireExtrusionProps {
  valeurs: ValeursExtrusion;
  modifiable: boolean;
  /** Au moins une ligne ou un rectangle sélectionné. */
  formes: number;
  /** Nombre d'objets extrudés dans la sélection. */
  extrudes: number;
  surValeurs: (v: ValeursExtrusion) => void;
  surExtruder: () => void;
  surAplatir: () => void;
}

const CHAMPS: { cle: "base" | "hauteur" | "epaisseur"; libelle: string; requis: boolean; min?: number }[] = [
  { cle: "base", libelle: "Base (m)", requis: true },
  { cle: "hauteur", libelle: "Hauteur (m)", requis: true },
  { cle: "epaisseur", libelle: "Épaisseur (m, lignes, facultative)", requis: false },
];

export function FormulaireExtrusion({ valeurs, modifiable, formes, extrudes, surValeurs, surExtruder, surAplatir }: FormulaireExtrusionProps) {
  const soumettre = (e: FormEvent) => { e.preventDefault(); surExtruder(); };
  return (
    <form className="studio-extrusion" onSubmit={soumettre} data-studio-extrusion aria-labelledby="studio-extrusion-titre">
      <h3 id="studio-extrusion-titre">Volume</h3>
      <p data-studio-extrusion-etat={extrudes > 0 ? "extrude" : "plat"}>{extrudes > 0 ? `${extrudes} objet(s) extrudé(s) dans la sélection` : "Sélection non extrudée : hauteur non évaluée."}</p>
      <fieldset disabled={!modifiable || formes === 0}>
        <legend>Extrusion en mètres</legend>
        {CHAMPS.map((c) => (
          <label key={c.cle}>{c.libelle}
            <input type="number" step="any" required={c.requis} name={`extrusion-${c.cle}`} value={Number.isFinite(valeurs[c.cle]) ? valeurs[c.cle] : ""}
              onChange={(e) => surValeurs({ ...valeurs, [c.cle]: e.target.value === "" ? Number.NaN : e.target.valueAsNumber })} />
          </label>
        ))}
        <label>Direction d’extrusion
          <select name="extrusion-direction" required value={valeurs.direction} onChange={(e) => surValeurs({ ...valeurs, direction: e.target.value as ValeursExtrusion["direction"] })} data-studio-extrusion-direction>
            <option value="">Choisir la direction…</option>
            <option value="+z">Vers le haut (+Z, normale du plan)</option>
            <option value="-z">Vers le bas (−Z)</option>
          </select>
        </label>
        <button type="submit" data-studio-extruder-selection><Icon name="studio-extrude" size={18} /> Extruder la sélection</button>
        <button type="button" className="studio-extrusion-aplatir" disabled={extrudes === 0} onClick={surAplatir} data-studio-aplatir-selection><Icon name="studio-flatten" size={18} /> Aplatir la sélection</button>
      </fieldset>
    </form>
  );
}
