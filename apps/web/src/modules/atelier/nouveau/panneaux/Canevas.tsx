/**
 * Disposition « Canevas » (D-156, ergonomie de référence SketchUp pour le Web) : le dessin occupe toute la zone,
 * outils et panneaux flottent par-dessus sans jamais le redimensionner. Les cinq repères de l'Atelier (UX1) restent
 * présents en permanence : la colonne d'icônes de droite ouvre chacun dans un panneau flottant exclusif (un seul à
 * la fois). Rien n'est dupliqué : navigateur, inspecteur, modifications et versions sont les panneaux existants.
 */
import type { ReactNode } from "react";
import { etatUi, type EtatUi, type PanneauFlottant } from "../etat-ui";
import { OUTILS_PAR_ID, type Outil } from "../outils";
import { libelleTouche, raccourciDe } from "../raccourcis";

/** Panneaux proposés dans la colonne, dans l'ordre (étiquette, pictogramme, raccourci d'accessibilité). */
export const PANNEAUX_CANEVAS: { id: PanneauFlottant; libelle: string; picto: string }[] = [
  { id: "instructeur", libelle: "Instructeur", picto: "?" },
  { id: "entite", libelle: "Info entité", picto: "ⓘ" },
  { id: "outliner", libelle: "Navigateur", picto: "☰" },
  { id: "modifications", libelle: "Modifications", picto: "⚑" },
  { id: "versions", libelle: "Versions", picto: "⧉" },
  { id: "navigation", libelle: "Navigation", picto: "✥" },
  { id: "raccourcis", libelle: "Raccourcis", picto: "⌨" },
];

export function ColonnePanneaux({ ui, alertes, panneaux = PANNEAUX_CANEVAS }: { ui: EtatUi; alertes: number; panneaux?: { id: PanneauFlottant; libelle: string; picto: string }[] }) {
  return (
    <nav className="canevas-colonne" aria-label="Panneaux" data-canevas-colonne>
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

/** Cadre d'un panneau flottant (titre, contenu défilant, poignée de repli). */
export function CadrePanneau({ id, titre, children }: { id: PanneauFlottant; titre: string; children: ReactNode }) {
  return (
    <section className="canevas-panneau" id={`canevas-panneau-${id}`} aria-label={titre} data-panneau-flottant={id}>
      <header className="canevas-panneau-tete">
        <h3>{titre}</h3>
        <button type="button" className="canevas-fermer" onClick={() => etatUi.set({ panneauFlottant: null })} aria-label={`Fermer le panneau ${titre}`}>×</button>
      </header>
      <div className="canevas-panneau-corps">{children}</div>
      <button type="button" className="canevas-poignee" onClick={() => etatUi.set({ panneauFlottant: null })} aria-label={`Replier le panneau ${titre}`} />
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
