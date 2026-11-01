/**
 * Boîtes de dialogue de l'espace de travail : gestionnaire « Outils », palette (Ctrl+K), import DXF, feuille.
 * Accessibilité (I.5-02) : le focus est piégé dans la boîte ouverte (Tab / Maj+Tab bouclent, un focus sorti y revient),
 * Échap la ferme même si le focus s'est perdu, et le focus revient à l'élément d'origine à la fermeture.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { StudioCommand, StudioDocument, StudioDxfResultat, StudioIfcResultat, StudioSheetTitleBlock } from "@parcours/atelier-model";
import type { EntreeCatalogue } from "../planche2d/catalogue";
import { GestionnaireOutils, PaletteCommandes } from "../planche2d/CatalogueOutils";
import { PanneauFeuille } from "../feuille/PanneauFeuille";
import { DialogueImportDxf } from "../import/DialogueImportDxf";
import { DialogueImportIfc } from "../import/DialogueImportIfc";
import { PanneauModelesExternes } from "../echanges/PanneauModelesExternes";
import { PanneauDossier } from "../dossier/PanneauDossier";
import { PanneauEchanges } from "../echanges/PanneauEchanges";
import { DialogueApprobation } from "../publication/DialogueApprobation";
import { DialogueFusion } from "../fusion/DialogueFusion";
import { DialogueEnregistrerConsole } from "../console/DialogueEnregistrerConsole";
import { DialogueIllustration, type DialogueIllustrationProps } from "../illustration/DialogueIllustration";
import { PanneauAgents } from "../illustration/PanneauAgents";
import { DialogueGraphismes } from "../graphismes/DialogueGraphismes";
import { DialogueSystemeProjet } from "../graphismes/DialogueSystemeProjet";
import { DialogueBlocs } from "../blocs/DialogueBlocs";
import { DialogueContraintes } from "../blocs/DialogueContraintes";
import type { Cible } from "../console/transfert";
import { appartientAuDialogue, focalisables, suivantDansLePiege } from "./piege-focus";
import type { RaisonIndisponible } from "./droits";

export type DialogueStudio = "outils" | "palette" | "feuille" | "import-dxf" | "import-ifc" | "modeles-externes" | "dossier" | "echanges" | "enregistrer-console" | "illustration" | "agents" | "graphismes" | "systeme-projet" | "approbation" | "blocs" | "contraintes" | "fusion" | "annulation-fusion" | null;

export interface PropsDialoguesStudio {
  dialogue: DialogueStudio;
  surFermer: () => void;
  disponible: (e: EntreeCatalogue) => boolean;
  /** Raison d'une entrée non lançable (droit réel, révision, enregistrement, contexte), `variante/droits.ts`. */
  raison?: (e: EntreeCatalogue) => RaisonIndisponible | null;
  surExecuter: (e: EntreeCatalogue) => void;
  drawing: StudioDocument;
  modifiable: boolean;
  /** Ajout de l'import au brouillon ; faux si le lot est refusé. */
  surImporter: (cs: StudioCommand[], r: StudioDxfResultat) => boolean;
  /** Ajout d'un import IFC (lot F3) au brouillon ; faux si le lot est refusé. */
  surImporterIfc?: (cs: StudioCommand[], r: StudioIfcResultat) => boolean;
  /** Droit d'écriture du serveur sur la variante affichée (modèles externes) ; faux sur une révision historique. */
  ecritureServeur?: boolean;
  /** Révision affichée (la feuille la compose, jamais le brouillon). */
  revision: StudioDocument;
  brouillonNonEnregistre: boolean;
  /** Cartouche prérempli, calculé à l'ouverture de la feuille. */
  cartouche: () => StudioSheetTitleBlock;
  /** Feuilles composées et dossier (E.3) : étude, variante et révision affichée. */
  portee: { projectId: string; studyId: string; variantId: string; revisionId: string };
  /** Console (aucun projet) : « Enregistrer dans un projet » crée une étude avec ces commandes, puis `surEnregistre`. */
  enregistrementConsole?: { commandes: readonly StudioCommand[]; surEnregistre: (c: Cible) => void };
  /** Lot F : rendu du modèle capturé par la vue 3D pour la boîte « Illustration depuis la vue ». */
  captureIllustration?: DialogueIllustrationProps["capture"];
  /** Graphismes et système de projet (EX-055, EX-023) : commandes ajoutées au brouillon ; faux si le lot est refusé. */
  surAppliquer?: (cs: StudioCommand[]) => boolean;
  /** Calque actif (graphisme créé) et sélection de la planche (graphismes cochés). */
  calqueActif?: string;
  selection?: readonly string[];
  /** Fusion de variantes (lot W3-D) : une révision a été écrite dans la variante affichée (fusion ou annulation). */
  surFusionEcrite?: () => void;
}

/** Piège du focus de la boîte ouverte ; rend le focus à l'élément d'origine à la fermeture. */
function usePiegeFocus(dialogue: DialogueStudio, surFermer: () => void) {
  const ouvert = dialogue !== null;
  const zone = useRef<HTMLDivElement>(null);
  const origine = useRef<HTMLElement | null>(null);
  const fermer = useRef(surFermer);
  fermer.current = surFermer;
  // L'élément d'origine est relevé au rendu qui ouvre la boîte, avant que celle-ci ne prenne le focus.
  if (ouvert && !origine.current && typeof document !== "undefined") {
    const actif = document.activeElement;
    origine.current = actif instanceof HTMLElement && actif !== document.body ? actif : null;
    if (!origine.current) origine.current = document.body;
  }
  const boite = () => zone.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
  // Clé : l'identité de la boîte. Passer directement d'une boîte à une autre (Outils → palette) donne le focus à la
  // nouvelle, si son contenu ne l'a pas déjà pris (feuille, import).
  useEffect(() => {
    if (!dialogue) return;
    const b = boite();
    if (b && !appartientAuDialogue(document.activeElement, b)) (focalisables(b)[0] ?? b).focus();
  }, [dialogue]);
  // Écouteurs et retour du focus : liés à l'ouverture seule (l'origine reste celle de la première boîte ouverte).
  useEffect(() => {
    if (!ouvert) return;
    // Un focus pris hors de la boîte y revient, sauf dans un portail qui lui appartient (data-studio-dialogue-portail).
    const surFocus = (e: FocusEvent) => {
      const d = boite();
      if (d && e.target instanceof Element && !appartientAuDialogue(e.target, d)) (focalisables(d)[0] ?? d).focus();
    };
    // Échap ferme la boîte même si le focus s'en est perdu (sur le corps de la page).
    const surTouche = (e: globalThis.KeyboardEvent) => {
      const d = boite();
      if (e.key === "Escape" && d && !appartientAuDialogue(document.activeElement, d)) { e.preventDefault(); fermer.current(); }
    };
    document.addEventListener("focusin", surFocus);
    document.addEventListener("keydown", surTouche);
    const depart = origine.current;
    return () => {
      document.removeEventListener("focusin", surFocus);
      document.removeEventListener("keydown", surTouche);
      origine.current = null;
      // Après la fermeture, le focus revient à l'élément d'origine (s'il est encore là et que rien d'autre ne l'a pris).
      queueMicrotask(() => {
        const perdu = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
        if (!perdu || !depart || depart === document.body || !depart.isConnected) return;
        // Origine rangée dans un menu refermé de la barre compacte : le focus revient au bouton « ▾ » de ce menu.
        const menu = depart.closest<HTMLElement>("[data-studio-menu-liste][hidden]");
        const bouton = menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) : null;
        (bouton ?? depart).focus();
      });
    };
  }, [ouvert]);
  const tabulation = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const d = zone.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) return;
    // Dans un portail de la boîte, Tab suit l'ordre du portail (le navigateur).
    if (document.activeElement && !d.contains(document.activeElement) && appartientAuDialogue(document.activeElement, d)) return;
    const liste = focalisables(d);
    const i = liste.indexOf(document.activeElement as HTMLElement);
    const k = suivantDansLePiege(liste.length, i, e.shiftKey);
    if (liste.length === 0) { e.preventDefault(); d.focus(); return; }
    if (k !== null) { e.preventDefault(); liste[k]!.focus(); }
  };
  return { zone, tabulation };
}

export function DialoguesStudio({ dialogue, surFermer, disponible, raison, surExecuter, drawing, modifiable, surImporter, surImporterIfc, ecritureServeur = false, revision, brouillonNonEnregistre, cartouche, portee, enregistrementConsole, captureIllustration = null, surAppliquer, calqueActif, selection = [], surFusionEcrite }: PropsDialoguesStudio) {
  const { zone, tabulation } = usePiegeFocus(dialogue, surFermer);
  return <div ref={zone} onKeyDown={tabulation} data-studio-dialogues={dialogue ?? undefined}>
    {dialogue === "outils" && <GestionnaireOutils disponible={disponible} raison={raison} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "palette" && <PaletteCommandes disponible={disponible} raison={raison} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "import-dxf" && <DialogueImportDxf doc={drawing} modifiable={modifiable} surFermer={surFermer} surAjouter={surImporter} />}
    {dialogue === "import-ifc" && <DialogueImportIfc doc={drawing} modifiable={modifiable} surFermer={surFermer} surAjouter={surImporterIfc ?? (() => false)} />}
    {dialogue === "modeles-externes" && <PanneauModelesExternes {...portee} brouillon={drawing} modifiable={modifiable} ecriture={ecritureServeur} brouillonNonEnregistre={brouillonNonEnregistre}
      surFermer={surFermer} surAjouter={surImporterIfc ?? (() => false)} />}
    {dialogue === "feuille" && <PanneauFeuille doc={revision} brouillonNonEnregistre={brouillonNonEnregistre} surFermer={surFermer} cartouche={cartouche()} />}
    {dialogue === "dossier" && <PanneauDossier {...portee} revision={revision} brouillonNonEnregistre={brouillonNonEnregistre} surFermer={surFermer} />}
    {dialogue === "echanges" && <PanneauEchanges surFermer={surFermer} />}
    {dialogue === "approbation" && <DialogueApprobation projectId={portee.projectId} studyId={portee.studyId} surFermer={surFermer} />}
    {(dialogue === "fusion" || dialogue === "annulation-fusion") && <DialogueFusion projectId={portee.projectId} studyId={portee.studyId} variantId={portee.variantId} mode={dialogue === "fusion" ? "fusion" : "annulation"}
      brouillonNonEnregistre={brouillonNonEnregistre} surFermer={surFermer} surEcrite={surFusionEcrite ?? (() => window.location.reload())} />}
    {dialogue === "illustration" && <DialogueIllustration projectId={portee.projectId} studyId={portee.studyId} variantId={portee.variantId} capture={captureIllustration} modifiable={ecritureServeur} surFermer={surFermer} />}
    {dialogue === "agents" && <PanneauAgents projectId={portee.projectId} surFermer={surFermer} />}
    {dialogue === "enregistrer-console" && enregistrementConsole && <DialogueEnregistrerConsole commandes={enregistrementConsole.commandes} surFermer={surFermer} surEnregistre={enregistrementConsole.surEnregistre} />}
    {dialogue === "graphismes" && <DialogueGraphismes doc={drawing} modifiable={modifiable && !!surAppliquer} layerId={calqueActif} coches={selection.filter((id) => drawing.graphismes?.some((g) => g.id === id))} surAppliquer={surAppliquer ?? (() => false)} surFermer={surFermer} />}
    {dialogue === "blocs" && <DialogueBlocs doc={drawing} modifiable={modifiable && !!surAppliquer} layerId={calqueActif} selection={selection} surAppliquer={surAppliquer ?? (() => false)} surFermer={surFermer} />}
    {dialogue === "contraintes" && <DialogueContraintes doc={drawing} modifiable={modifiable && !!surAppliquer} selection={selection} surAppliquer={surAppliquer ?? (() => false)} surFermer={surFermer} />}
    {dialogue === "systeme-projet" && <DialogueSystemeProjet doc={drawing} modifiable={modifiable && !!surAppliquer} surAppliquer={surAppliquer ?? (() => false)} surFermer={surFermer} />}
  </div>;
}
