/**
 * Disposition « Canevas » (D-156, ergonomie de référence SketchUp pour le Web) : le dessin occupe toute la zone,
 * outils et panneaux flottent par-dessus sans jamais le redimensionner. Les cinq repères de l'Atelier (UX1) restent
 * présents en permanence : la colonne d'icônes de droite ouvre chacun dans un panneau flottant exclusif (un seul à
 * la fois). Rien n'est dupliqué : navigateur, inspecteur, modifications et versions sont les panneaux existants.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { etatUi, type EtatUi, type PanneauFlottant } from "../etat-ui";
import { OUTILS_PAR_ID, type Outil } from "../outils";
import { libelleTouche, raccourciDe } from "../raccourcis";
import { t } from "../messages";

/** Panneaux proposés dans la colonne, dans l'ordre (étiquette, pictogramme, raccourci d'accessibilité). */
export const PANNEAUX_CANEVAS: { id: PanneauFlottant; libelle: string; picto: string }[] = [
  { id: "instructeur", libelle: t("panneau.instructeur"), picto: "?" },
  { id: "entite", libelle: t("panneau.entite"), picto: "ⓘ" },
  { id: "outliner", libelle: t("panneau.outliner"), picto: "☰" },
  { id: "modifications", libelle: t("panneau.modifications"), picto: "⚑" },
  { id: "versions", libelle: t("panneau.versions"), picto: "⧉" },
  { id: "affichage", libelle: t("panneau.affichage"), picto: "◐" },
  { id: "materiaux", libelle: t("panneau.materiaux"), picto: "▤" },
  { id: "modele", libelle: t("panneau.modele"), picto: "ℹ" },
  { id: "navigation", libelle: t("panneau.navigation"), picto: "✥" },
  { id: "raccourcis", libelle: t("panneau.raccourcis"), picto: "⌨" },
];

export function ColonnePanneaux({ ui, alertes, panneaux = PANNEAUX_CANEVAS }: { ui: EtatUi; alertes: number; panneaux?: { id: PanneauFlottant; libelle: string; picto: string }[] }) {
  return (
    <nav className="canevas-colonne" aria-label={t("canevas.panneaux")} data-canevas-colonne>
      {panneaux.map((p) => (
        <button key={p.id} type="button" className="canevas-icone" aria-pressed={ui.panneauFlottant === p.id} data-panneau-icone={p.id} onClick={() => etatUi.basculerPanneau(p.id)} title={p.libelle}>
          <span aria-hidden="true" className="canevas-picto">{p.picto}</span>
          <span className="canevas-etiquette">{p.libelle}</span>
          {p.id === "modifications" && alertes > 0 && <span className="pastille">{alertes}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Cadre d'un panneau flottant (titre, contenu défilant, poignée de repli). À l'ouverture, le focus va au panneau ;
 * Échap ou × le ferment et rendent le focus à son icône (clavier, D-161). */
export function CadrePanneau({ id, titre, children }: { id: PanneauFlottant; titre: string; children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const fermer = () => {
    etatUi.set({ panneauFlottant: null });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-panneau-icone="${id}"]`)?.focus());
  };
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="canevas-panneau"
      id={`canevas-panneau-${id}`}
      aria-label={titre}
      data-panneau-flottant={id}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        fermer();
      }}
    >
      <header className="canevas-panneau-tete">
        <h3>{titre}</h3>
        <button type="button" className="canevas-fermer" onClick={fermer} aria-label={t("panneau.fermer", { titre })}>×</button>
      </header>
      <div className="canevas-panneau-corps">{children}</div>
      <button type="button" className="canevas-poignee" onClick={fermer} aria-label={t("panneau.replier", { titre })} />
    </section>
  );
}

/** Étapes d'une opération tirées de l'aide de l'outil (phrases séparées par « ; » ou « . »). */
export function etapesOutil(o: Outil): string[] {
  return o.aide
    .split(/\s*;\s*|\.\s+/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
}

/** Instructeur (D-156) : l'outil actif expliqué — description, opération en étapes, astuces. */
export function Instructeur({ ui }: { ui: EtatUi }) {
  const o = OUTILS_PAR_ID[ui.outil];
  if (!o) return <p className="inspecteur-aide">Aucun outil actif.</p>;
  const touche = libelleTouche(raccourciDe(o, ui.raccourcis));
  return (
    <div className="instructeur" data-instructeur={o.id}>
      <p className="instructeur-outil">
        <span aria-hidden="true" className="canevas-picto">{o.picto}</span> <strong>{o.libelle}</strong>
      </p>
      <h4>Opération</h4>
      <ol>{etapesOutil(o).map((e, i) => <li key={i}>{e}</li>)}</ol>
      <h4>Astuces</h4>
      <ul>
        <li>Exemple : {o.exemple}</li>
        {touche && <li>Raccourci : <kbd>{touche}</kbd></li>}
        <li>Valeur exacte : tapez-la pendant le tracé dans le champ Mesures (longueur, « dx;dy », facteur ou angle), puis Entrée.</li>
        <li>Échap : annule le tracé en cours, puis revient à l'outil précédent.</li>
        {o.condition && <li>Disponible {o.condition === "niveau" ? "quand un niveau est actif" : o.condition === "selection" ? "avec une sélection" : o.condition === "selection-mur" ? "avec un mur sélectionné" : "avec une ligne sélectionnée"}.</li>}
      </ul>
    </div>
  );
}
