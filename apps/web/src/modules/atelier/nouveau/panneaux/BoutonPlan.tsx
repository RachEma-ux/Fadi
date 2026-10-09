/**
 * Bouton « Plan » à deux fonctions (D-195) : il active le mode Plan et offre, dans une liste déroulante ancrée sous
 * lui, le choix du niveau. Un clic active le mode et ouvre la liste ; choisir un niveau l'affiche et ferme la liste ;
 * Échap, un clic ailleurs ou un nouveau clic sur le bouton ferment sans rien changer. Le sélecteur de niveau
 * indépendant de la barre a disparu avec lui. Le texte du bouton reste exactement « Plan » (le chevron est en CSS).
 */
import { useEffect, useId, useRef, useState } from "react";
import { t } from "../messages";

export interface NiveauChoix {
  id: string;
  nom: string;
  elevation: number;
}

export interface PropsBoutonPlan {
  /** Mode Plan actif (le bouton est enfoncé). */
  actif: boolean;
  niveaux: readonly NiveauChoix[];
  niveauId: string | null;
  /** Format d'une élévation en mètres (virgule décimale). */
  fmt: (v: number) => string;
  /** Activer le mode Plan (idempotent). */
  onMode: () => void;
  onNiveau: (id: string) => void;
}

export function BoutonPlan({ actif, niveaux, niveauId, fmt, onMode, onNiveau }: PropsBoutonPlan) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const liste = useRef<HTMLUListElement | null>(null);
  const idListe = useId();

  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: PointerEvent) => {
      const c = e.target as Node | null;
      if (racine.current && c && !racine.current.contains(c)) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Échap ne ferme que la liste : les autres écouteurs d'Échap (fin de tracé, outil précédent) ne sont pas appelés.
      e.stopImmediatePropagation();
      setOuvert(false);
      bouton.current?.focus();
    };
    window.addEventListener("pointerdown", surClic);
    window.addEventListener("keydown", surTouche, true);
    return () => {
      window.removeEventListener("pointerdown", surClic);
      window.removeEventListener("keydown", surTouche, true);
    };
  }, [ouvert]);

  const choisir = (id: string) => {
    if (id !== niveauId) onNiveau(id);
    setOuvert(false);
    bouton.current?.focus();
  };

  // Flèches, Début, Fin : parcours de la liste au clavier (rôle menu).
  const surClavierListe = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = Array.from(liste.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const vers = (j: number) => {
      e.preventDefault();
      items[(j + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") vers(i + 1);
    else if (e.key === "ArrowUp") vers(i - 1);
    else if (e.key === "Home") vers(0);
    else if (e.key === "End") vers(items.length - 1);
  };

  return (
    <div className="barre-plan" ref={racine}>
      <button
        type="button"
        ref={bouton}
        aria-pressed={actif}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idListe : undefined}
        title={t("plan.aide")}
        data-bouton-plan
        onClick={(e) => {
          onMode();
          const clavier = e.detail === 0;
          setOuvert((o) => {
            const prochain = !o;
            // Ouverte au clavier : le focus va au niveau courant ; à la souris ou au doigt, il reste sur le bouton.
            if (prochain && clavier) requestAnimationFrame(() => liste.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
            return prochain;
          });
        }}
      >
        Plan
        <span aria-hidden="true" className="barre-plan-chevron">▾</span>
      </button>
      {ouvert && (
        <ul id={idListe} className="barre-plan-liste" role="menu" aria-label={t("plan.niveaux")} ref={liste} data-plan-niveaux onKeyDown={surClavierListe}>
          {niveaux.map((n) => (
            <li key={n.id} role="none">
              <button type="button" role="menuitemradio" aria-checked={n.id === niveauId} data-plan-niveau={n.id} onClick={() => choisir(n.id)}>
                <span className="barre-plan-nom">{n.nom}</span>
                <span className="barre-plan-elevation">{fmt(n.elevation)} m</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
