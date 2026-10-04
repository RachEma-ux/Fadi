/**
 * « Harmonie du bâtiment » — la sous-page de l'Atelier à l'étape 10
 * (`atelier-harmonie-page-app`, V8.4 du prototype) : choix et intentions
 * (le panneau Harmonie de l'étape), programme lié, bilan du bâtiment et
 * espaces, réunis sur une page que l'on ouvre depuis le bouton « Harmonie »
 * du bandeau de l'Atelier (`#atelier-harmonie-button`) ou depuis l'étape, et
 * que l'on quitte par « ← Retour à l’Atelier » ou Échap. Le dessin reste
 * monté pendant l'affichage ; aucune donnée n'est copiée.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export type HarmonySection = "choices" | "programme" | "bilan";

export function AtelierHarmonyPage({
  projectName,
  open,
  onOpenChange,
  choices,
  programme,
  bilan,
}: {
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le panneau Harmonie de l'étape (choix & intentions). */
  choices: ReactNode;
  /** Programme lié, répartition et cadre du modèle ; `null` sans programme. */
  programme: ReactNode | null;
  /** Bilan du bâtiment, plans et ambiances. */
  bilan: ReactNode;
}) {
  const programmeRef = useRef<HTMLDetailsElement | null>(null);
  const bilanRef = useRef<HTMLDetailsElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [pendingSection, setPendingSection] = useState<HarmonySection | null>(null);

  function expand(section: HarmonySection) {
    const el = section === "programme" ? programmeRef.current : section === "bilan" ? bilanRef.current : document.getElementById("ah84-choices");
    if (!el) return;
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }

  useEffect(() => {
    document.getElementById("atelier-harmonie-button")?.setAttribute("aria-expanded", String(open));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("ah84-active");
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    titleRef.current?.focus({ preventScroll: true });
    if (pendingSection) {
      expand(pendingSection);
      setPendingSection(null);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("ah84-active");
      document.removeEventListener("keydown", onKey);
      window.dispatchEvent(new Event("resize"));
    };
  }, [open, onOpenChange, pendingSection]);

  return (
    <section id="atelier-harmonie-page" className="ah84-page" hidden={!open} aria-labelledby="ah84-title">
      <header className="ah84-page-head">
        <div>
          <span className="ah84-kicker">ATELIER ARCHITECTURAL · ÉTAPE 10 / 21 · ANALYSER</span>
          <h1 id="ah84-title" ref={titleRef} tabIndex={-1}>
            Harmonie du bâtiment
          </h1>
          <p className="ah84-project">{projectName}</p>
          <p>Choix, intentions, programme lié et bilan du bâtiment réunis ici. Le dessin reste accessible dans l’Atelier.</p>
        </div>
        <button type="button" className="button-primary ah84-back" onClick={() => onOpenChange(false)}>
          ← Retour à l’Atelier
        </button>
      </header>
      <nav className="ah84-links" aria-label="Rubriques Harmonie du bâtiment">
        <button type="button" className="button-secondary" onClick={() => expand("choices")}>
          Choix & intentions
        </button>
        {programme && (
          <button type="button" className="button-secondary" onClick={() => expand("programme")}>
            Programme lié
          </button>
        )}
        <button type="button" className="button-secondary" onClick={() => expand("bilan")}>
          Bilan & espaces
        </button>
      </nav>
      <div id="ah84-choices">{choices}</div>
      {programme && (
        <details className="fold-card ah84-fold" id="ah84-programme" ref={programmeRef}>
          <summary>Programme lié, Répartition et cadre du modèle</summary>
          <div className="fold-card-body">{programme}</div>
        </details>
      )}
      <details className="fold-card ah84-fold" id="ah84-bilan" ref={bilanRef}>
        <summary>Bilan du bâtiment, plans et ambiances</summary>
        <div className="fold-card-body">
          <p>Lecture du modèle courant et des choix enregistrés. Les hypothèses et les réserves restent identifiées.</p>
          {bilan}
        </div>
      </details>
      <footer className="ah84-page-footer">
        <button type="button" className="button-secondary" onClick={() => onOpenChange(false)}>
          ← Retour à l’Atelier
        </button>
      </footer>
    </section>
  );
}
