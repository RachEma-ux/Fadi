/** Boîtes de dialogue de l'espace de travail : gestionnaire « Outils », palette (Ctrl+K), import DXF, feuille. */
import type { StudioCommand, StudioDocument, StudioDxfResultat, StudioSheetTitleBlock } from "@parcours/atelier-model";
import type { EntreeCatalogue } from "../planche2d/catalogue";
import { GestionnaireOutils, PaletteCommandes } from "../planche2d/CatalogueOutils";
import { PanneauFeuille } from "../feuille/PanneauFeuille";
import { DialogueImportDxf } from "../import/DialogueImportDxf";

export type DialogueStudio = "outils" | "palette" | "feuille" | "import-dxf" | null;

export interface PropsDialoguesStudio {
  dialogue: DialogueStudio;
  surFermer: () => void;
  disponible: (e: EntreeCatalogue) => boolean;
  surExecuter: (e: EntreeCatalogue) => void;
  drawing: StudioDocument;
  modifiable: boolean;
  /** Ajout de l'import au brouillon ; faux si le lot est refusé. */
  surImporter: (cs: StudioCommand[], r: StudioDxfResultat) => boolean;
  /** Révision affichée (la feuille la compose, jamais le brouillon). */
  revision: StudioDocument;
  brouillonNonEnregistre: boolean;
  /** Cartouche prérempli, calculé à l'ouverture de la feuille. */
  cartouche: () => StudioSheetTitleBlock;
}

export function DialoguesStudio({ dialogue, surFermer, disponible, surExecuter, drawing, modifiable, surImporter, revision, brouillonNonEnregistre, cartouche }: PropsDialoguesStudio) {
  return <>
    {dialogue === "outils" && <GestionnaireOutils disponible={disponible} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "palette" && <PaletteCommandes disponible={disponible} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "import-dxf" && <DialogueImportDxf doc={drawing} modifiable={modifiable} surFermer={surFermer} surAjouter={surImporter} />}
    {dialogue === "feuille" && <PanneauFeuille doc={revision} brouillonNonEnregistre={brouillonNonEnregistre} surFermer={surFermer} cartouche={cartouche()} />}
  </>;
}
