/**
 * Menu principal de la Planche de Sandbox : exports OBJ / STL du brouillon et PNG de la vue. Aucune Planche nommée,
 * aucun projet, aucun export serveur (IFC) : la Planche de Sandbox n'appartient qu'à elle-même. Composant pur : il
 * reçoit les rappels ; la Planche exécute.
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";

export interface ActionsMenuPlanche {
  /** OBJ / STL (P-6, D-173) : maillages du brouillon, écrits dans la page. */
  exporterMaillage(format: "obj" | "stl"): void;
  telechargerPng(): Promise<void>;
}

export function MenuPlanche({ actions }: { actions: ActionsMenuPlanche }) {
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermerDehors = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOuvert(false);
      }
    };
    // Fenêtre où vit le menu (page ou Planche détachée).
    const w = ref.current?.ownerDocument.defaultView ?? window;
    w.addEventListener("pointerdown", fermerDehors, true);
    w.addEventListener("keydown", clavier, true);
    return () => {
      w.removeEventListener("pointerdown", fermerDehors, true);
      w.removeEventListener("keydown", clavier, true);
    };
  }, [ouvert]);
  const fermer = () => setOuvert(false);
  const png = async () => {
    setOccupe(true);
    try {
      await actions.telechargerPng();
    } finally {
      setOccupe(false);
      fermer();
    }
  };
  return (
    <div className="planche-menu-principal" ref={ref} data-planche-menu-principal>
      <button type="button" className="planche-menu-bouton" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => (ouvert ? fermer() : setOuvert(true))} title={t("planche.menu-principal")} data-planche-menu-ouvrir data-planche-nom="">
        <IconeSandbox nom="fichier" className="outil-picto" />
        <span className="planche-menu-titre">{t("planche.brouillon")}</span>
      </button>
      {ouvert && (
        <div className="planche-menu planche-menu-liste" role="menu" aria-label={t("planche.menu-principal")}>
          <ul role="none">
            <li role="none"><button type="button" role="menuitem" data-planche-exporter-obj onClick={() => { actions.exporterMaillage("obj"); fermer(); }}>{t("planche.exporter-obj")}</button></li>
            <li role="none"><button type="button" role="menuitem" data-planche-exporter-stl onClick={() => { actions.exporterMaillage("stl"); fermer(); }}>{t("planche.exporter-stl")}</button></li>
            <li role="none"><button type="button" role="menuitem" disabled={occupe} data-planche-telecharger-png onClick={() => void png()}>{t("planche.telecharger-png")}</button></li>
          </ul>
        </div>
      )}
    </div>
  );
}
