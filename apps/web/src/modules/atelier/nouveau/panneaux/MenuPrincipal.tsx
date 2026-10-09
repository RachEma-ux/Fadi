/**
 * Menu principal (D-160, D-195) : enregistrer maintenant (Ctrl + S), exporter et importer (sous-menus réels, les
 * échanges du modèle ont quitté la barre), imprimer (feuilles en PDF), partager après enregistrement confirmé,
 * Harmonie (étape 10), ouvrir un autre projet. Rien n'est dupliqué : les listes d'exports et d'imports sont rendues
 * ici, une seule fois.
 */
import type { ReactNode } from "react";
import { t } from "../messages";

export interface PropsMenuPrincipal {
  lecture: boolean;
  onEnregistrer: () => void;
  onPartager: () => void;
  onDocuments: () => void;
  onProjets: () => void;
  /** Sous-menu Exporter (modèle de l'Atelier) ; absent en Documents et en Planche, qui ont leurs propres exports. */
  exports?: ReactNode;
  /** Sous-menu Importer ; absent en Documents et en Planche. */
  imports?: ReactNode;
  /** « Harmonie » (sous-page de l'étape 10) ; absent ailleurs. */
  onHarmonie?: () => void;
}

/** Ferme le menu qui contient `el` et tous ses menus parents (un sous-menu Exporter referme aussi Fichier). */
export function fermerMenus(el: Element | null): void {
  for (let d = el?.closest("details") ?? null; d; d = d.parentElement?.closest("details") ?? null) d.removeAttribute("open");
}

/**
 * Sous-menus de Fichier (Exporter, Importer) en accordéon exclusif : en ouvrir un referme l'autre — au basculement, donc
 * après le clic, jamais au pointeur enfoncé (la liste ne bouge pas sous le doigt avant que le clic n'aboutisse).
 */
export function sousMenuExclusif(e: React.SyntheticEvent<HTMLDetailsElement>): void {
  const d = e.currentTarget;
  if (!d.open) return;
  for (const autre of Array.from(d.parentElement?.querySelectorAll<HTMLDetailsElement>(":scope > details[data-sous-menu][open]") ?? [])) if (autre !== d) autre.removeAttribute("open");
}

/** Fichier qui se referme (clic ailleurs, Échap, entrée choisie) : ses sous-menus se replient aussi, prêts pour la prochaine ouverture. */
export function refermerSousMenus(e: React.SyntheticEvent<HTMLDetailsElement>): void {
  const d = e.currentTarget;
  if (d.open) return;
  for (const sd of Array.from(d.querySelectorAll<HTMLDetailsElement>("details[open]"))) sd.removeAttribute("open");
}

export function MenuPrincipal({ lecture, onEnregistrer, onPartager, onDocuments, onProjets, exports, imports, onHarmonie }: PropsMenuPrincipal) {
  const fermer = (e: React.MouseEvent<HTMLElement>) => fermerMenus(e.currentTarget);
  return (
    <details className="barre-menu" data-menu-principal onToggle={refermerSousMenus}>
      <summary aria-label={t("menu.titre")}>{t("menu.fichier")}</summary>
      <div className="exports-liste menu-principal-liste">
        <button type="button" data-menu="enregistrer" disabled={lecture} onClick={(e) => { fermer(e); onEnregistrer(); }}>
          {t("menu.enregistrer")} <kbd>Ctrl S</kbd>
        </button>
        {exports}
        {imports}
        <button type="button" data-menu="imprimer" onClick={(e) => { fermer(e); onDocuments(); }}>{t("menu.imprimer")}</button>
        <button type="button" data-menu="partager" onClick={(e) => { fermer(e); onPartager(); }}>{t("menu.partager")}</button>
        {onHarmonie && (
          <button type="button" id="atelier-harmonie-button" data-menu="harmonie" aria-controls="atelier-harmonie-page" aria-expanded="false" onClick={(e) => { fermer(e); onHarmonie(); }}>
            {t("menu.harmonie")}
          </button>
        )}
        <button type="button" data-menu="projets" onClick={(e) => { fermer(e); onProjets(); }}>{t("menu.projets")}</button>
      </div>
    </details>
  );
}
