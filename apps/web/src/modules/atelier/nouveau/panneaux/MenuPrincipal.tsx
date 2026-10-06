/**
 * Menu principal (D-160) : enregistrer maintenant (Ctrl + S), exporter, importer, imprimer (feuilles en PDF),
 * partager après enregistrement confirmé, ouvrir un autre projet. Les entrées ouvrent les menus existants : rien
 * n'est dupliqué.
 */
import { t } from "../messages";
export interface PropsMenuPrincipal {
  lecture: boolean;
  onEnregistrer: () => void;
  onPartager: () => void;
  onDocuments: () => void;
  onProjets: () => void;
}

/** Ouvre un menu existant de la barre (Exporter, Importer) et place le focus sur sa première entrée. */
export function ouvrirMenuBarre(selecteur: string): void {
  const d = document.querySelector<HTMLDetailsElement>(selecteur);
  if (!d) return;
  d.open = true;
  requestAnimationFrame(() => d.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), label")?.focus());
}

export function MenuPrincipal({ lecture, onEnregistrer, onPartager, onDocuments, onProjets }: PropsMenuPrincipal) {
  const fermer = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
  return (
    <details className="barre-menu" data-menu-principal>
      <summary aria-label={t("menu.titre")}>{t("menu.fichier")}</summary>
      <div className="exports-liste menu-principal-liste">
        <button type="button" data-menu="enregistrer" disabled={lecture} onClick={(e) => { fermer(e); onEnregistrer(); }}>
          {t("menu.enregistrer")} <kbd>Ctrl S</kbd>
        </button>
        <button type="button" data-menu="exporter" onClick={(e) => { fermer(e); ouvrirMenuBarre(".barre-exports"); }}>{t("menu.exporter")}</button>
        <button type="button" data-menu="importer" disabled={lecture} onClick={(e) => { fermer(e); ouvrirMenuBarre(".barre-imports"); }}>{t("menu.importer")}</button>
        <button type="button" data-menu="imprimer" onClick={(e) => { fermer(e); onDocuments(); }}>{t("menu.imprimer")}</button>
        <button type="button" data-menu="partager" onClick={(e) => { fermer(e); onPartager(); }}>{t("menu.partager")}</button>
        <button type="button" data-menu="projets" onClick={(e) => { fermer(e); onProjets(); }}>{t("menu.projets")}</button>
      </div>
    </details>
  );
}
