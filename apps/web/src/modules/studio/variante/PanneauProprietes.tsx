/**
 * Panneau « Propriétés du dessin » : effectifs, sélection (valeur mesurée d'une cote), extrusion de la sélection, saisie
 * numérique de l'outil actif, calques, note. Lecture seule : tout est affiché, rien n'est modifiable.
 */
import type { ReactNode } from "react";
import { formatStudioAngle, studioAngularValue, type StudioAnnotation, type StudioDimension, type StudioDocument, type StudioShape } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { formaterMetres, valeurCote } from "../planche2d/geometrie-2d";
import type { ValeursExtrusion } from "../vue3d/extrusion";
import { FormulaireExtrusion } from "../vue3d/FormulaireExtrusion";

export interface PropsPanneauProprietes {
  titre: string | undefined;
  drawing: StudioDocument;
  selectionIds: readonly string[];
  selected: StudioShape | StudioDimension | StudioAnnotation | null;
  writable: boolean;
  formesChoisies: readonly StudioShape[];
  extrusion: ValeursExtrusion;
  surExtrusion: (v: ValeursExtrusion) => void;
  surExtruder: () => void;
  surAplatir: () => void;
  surSupprimer: () => void;
  /** Formulaire de l'outil actif (absent pour la Sélection). */
  formulaire: ReactNode;
  /** Panneau des calques. */
  calques: ReactNode;
}

export function PanneauProprietes({ titre, drawing, selectionIds, selected, writable, formesChoisies, extrusion, surExtrusion, surExtruder, surAplatir, surSupprimer, formulaire, calques }: PropsPanneauProprietes) {
  return <aside className="studio-properties" aria-label="Propriétés du dessin"><h2>{titre}</h2><p>{`${drawing.objects.length} objets · ${drawing.dimensions?.length ?? 0} cotes`}</p>
    {selectionIds.length > 0 && <div className="studio-selection" data-studio-selection={selected?.id} data-studio-selection-compte={selectionIds.length}>
      {selected ? <p>Objet sélectionné : <span translate="no">{selected.id.slice(0, 8)}</span></p> : <p>{`${selectionIds.length} objets sélectionnés`}</p>}
      {selected?.type === "dimension" && (selected.toResolve
        ? <p data-studio-cote-statut="a-resoudre">À résoudre : un objet coté a été supprimé.</p>
        : <p data-studio-cote-statut={selected.links.start || selected.links.end ? "liee" : "libre"}>Valeur mesurée : <span translate="no">{formaterMetres(valeurCote(selected) ?? 0, LOCALE)}</span> · {selected.links.start || selected.links.end ? "Associée : suit l’objet coté." : "Libre."}</p>)}
      {selected?.type === "angular-dimension" && (selected.toResolve
        ? <p data-studio-cote-statut="a-resoudre">À résoudre : un segment lié a été supprimé.</p>
        : <p data-studio-cote-statut={selected.links.first ? "liee" : "libre"}>Angle mesuré : <span translate="no" data-studio-angle-mesure>{formatStudioAngle(studioAngularValue(selected) ?? 0, LOCALE)}</span> · {selected.links.first ? "Associée : suit les segments." : "Libre."}</p>)}
      <button type="button" disabled={!writable} onClick={surSupprimer} data-studio-supprimer-selection><Icon name="studio-delete" size={18} /> Supprimer la sélection</button>
    </div>}
    {formesChoisies.length > 0 && <FormulaireExtrusion valeurs={extrusion} modifiable={writable} formes={formesChoisies.length} extrudes={formesChoisies.filter(o => o.extrusion).length}
      surValeurs={surExtrusion} surExtruder={surExtruder} surAplatir={surAplatir} />}
    {formulaire}
    {calques}
    <div className="studio-note"><strong>Une planche autonome</strong><p>Les tracés restent en brouillon jusqu’à la confirmation du serveur. Aucun modèle 3D n’est nécessaire.</p></div></aside>;
}
