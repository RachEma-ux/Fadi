/**
 * Boîtes de dialogue de l'espace de travail : gestionnaire « Outils », palette (Ctrl+K), import DXF, feuille.
 * Accessibilité (I.5-02) : le focus est piégé dans la boîte ouverte (Tab / Maj+Tab bouclent, un focus sorti y revient),
 * Échap la ferme même si le focus s'est perdu, et le focus revient à l'élément d'origine à la fermeture.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { StudioCommand, StudioDocument, StudioDxfResultat, StudioSheetTitleBlock } from "@parcours/atelier-model";
import type { EntreeCatalogue } from "../planche2d/catalogue";
import { GestionnaireOutils, PaletteCommandes } from "../planche2d/CatalogueOutils";
import { PanneauFeuille } from "../feuille/PanneauFeuille";
import { DialogueImportDxf } from "../import/DialogueImportDxf";
import { focalisables, suivantDansLePiege } from "./piege-focus";

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

/** Piège du focus de la boîte ouverte ; rend le focus à l'élément d'origine à la fermeture. */
function usePiegeFocus(ouvert: boolean, surFermer: () => void) {
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
  useEffect(() => {
    if (!ouvert) return;
    const boite = () => zone.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
    // La boîte prend le focus si son contenu ne l'a pas déjà fait (feuille, import).
    const b = boite();
    if (b && !b.contains(document.activeElement)) (focalisables(b)[0] ?? b).focus();
    const surFocus = (e: FocusEvent) => {
      const d = boite();
      if (d && e.target instanceof Node && !d.contains(e.target)) (focalisables(d)[0] ?? d).focus();
    };
    // Échap ferme la boîte même si le focus s'en est perdu (sur le corps de la page).
    const surTouche = (e: globalThis.KeyboardEvent) => {
      const d = boite();
      if (e.key === "Escape" && d && !d.contains(document.activeElement)) { e.preventDefault(); fermer.current(); }
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
        if (perdu && depart && depart !== document.body && depart.isConnected) depart.focus();
      });
    };
  }, [ouvert]);
  const tabulation = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const d = zone.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!d) return;
    const liste = focalisables(d);
    const i = liste.indexOf(document.activeElement as HTMLElement);
    const k = suivantDansLePiege(liste.length, i, e.shiftKey);
    if (liste.length === 0) { e.preventDefault(); d.focus(); return; }
    if (k !== null) { e.preventDefault(); liste[k]!.focus(); }
  };
  return { zone, tabulation };
}

export function DialoguesStudio({ dialogue, surFermer, disponible, surExecuter, drawing, modifiable, surImporter, revision, brouillonNonEnregistre, cartouche }: PropsDialoguesStudio) {
  const { zone, tabulation } = usePiegeFocus(dialogue !== null, surFermer);
  return <div ref={zone} onKeyDown={tabulation} data-studio-dialogues={dialogue ?? undefined}>
    {dialogue === "outils" && <GestionnaireOutils disponible={disponible} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "palette" && <PaletteCommandes disponible={disponible} surExecuter={surExecuter} surFermer={surFermer} />}
    {dialogue === "import-dxf" && <DialogueImportDxf doc={drawing} modifiable={modifiable} surFermer={surFermer} surAjouter={surImporter} />}
    {dialogue === "feuille" && <PanneauFeuille doc={revision} brouillonNonEnregistre={brouillonNonEnregistre} surFermer={surFermer} cartouche={cartouche()} />}
  </div>;
}
