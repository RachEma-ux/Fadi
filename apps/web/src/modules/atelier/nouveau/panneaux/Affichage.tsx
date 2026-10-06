/**
 * Panneaux Affichage, Info modèle, Matériaux et arborescence (D-159, ergonomie SketchUp pour le Web). Affichage :
 * masquer / réafficher pour soi (le modèle n'est jamais modifié), isolement, ombres d'affichage en 3D. Info modèle et
 * Matériaux : lecture seule du modèle typé ; une donnée absente est dite « non renseignée ».
 */
import { useMemo, useState } from "react";
import type { ModeleAtelier } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { arborescence, infoModele, masquer, materiauxEnUsage, reafficherDernier, reafficherTout, type NoeudArbre } from "../panneaux-modele";

const nombre = (n: number) => n.toLocaleString("fr-FR");
const metres = (v: number) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

export function masquerSelection(ui: EtatUi): void {
  const r = masquer(ui, ui.selection);
  if (!r) {
    etatUi.set({ aide: ui.selection.length ? "Ces objets sont déjà masqués." : "Sélectionnez d'abord les objets à masquer." });
    return;
  }
  const n = r.pileMasques[r.pileMasques.length - 1]!.length;
  etatUi.set({ ...r, selection: [], aide: `${n} objet(s) masqué(s) pour vous ; le modèle n'est pas modifié.` });
}

export function AffichagePanneau({ ui, etat }: { ui: EtatUi; etat: ModeleAtelier }) {
  const masquesPresents = ui.masques.filter((id) => etat.objets[id]).length;
  return (
    <div className="affichage-panneau" data-affichage-panneau>
      <p className="inspecteur-aide">Pour vous seulement : le modèle partagé n'est jamais modifié.</p>
      <div className="ver-actions affichage-actions">
        <button type="button" disabled={!ui.selection.length} onClick={() => masquerSelection(ui)} data-masquer-selection>
          Masquer la sélection{ui.selection.length ? ` (${ui.selection.length})` : ""}
        </button>
        <button type="button" disabled={!ui.pileMasques.length} onClick={() => { const r = reafficherDernier(ui); if (r) etatUi.set({ masques: r.masques, pileMasques: r.pileMasques, aide: `${r.reaffiches.length} objet(s) réaffiché(s).` }); }} data-reafficher-dernier>
          Réafficher le dernier
        </button>
        <button type="button" disabled={!ui.masques.length} onClick={() => etatUi.set({ ...reafficherTout(), aide: "Tous les objets masqués sont réaffichés." })} data-reafficher-tout>
          Réafficher tout
        </button>
      </div>
      <p className="nav-detail" data-masques={masquesPresents}>{masquesPresents ? `${nombre(masquesPresents)} objet(s) masqué(s).` : "Aucun objet masqué."}</p>
      <div className="ver-actions affichage-actions">
        {ui.isolement ? (
          <button type="button" onClick={() => etatUi.set({ isolement: null, aide: "Isolement quitté : tout l'affichage revient." })} data-affichage-isolement="quitter">Quitter l'isolement ({ui.isolement.length})</button>
        ) : (
          <button type="button" disabled={!ui.selection.length} onClick={() => etatUi.set({ isolement: [...ui.selection], aide: "Sélection isolée : seuls ces objets sont affichés, pour vous seulement." })} data-affichage-isolement="isoler">Isoler la sélection</button>
        )}
      </div>
      <label className="affichage-ombres">
        <input type="checkbox" checked={ui.ombres} onChange={(e) => etatUi.set({ ombres: e.target.checked })} data-ombres />
        Ombres en 3D
      </label>
      <p className="inspecteur-aide">Ombres d'affichage : lumière de direction fixe, ce n'est pas une étude d'ensoleillement (orientation, date et heure non évaluées).</p>
    </div>
  );
}

export function InfoModelePanneau({ etat, revision }: { etat: ModeleAtelier; revision: number | null }) {
  const i = useMemo(() => infoModele(etat), [etat]);
  return (
    <div className="info-modele" data-info-modele>
      <dl className="info-modele-liste">
        <dt>Unité</dt><dd>mètre</dd>
        <dt>Repère</dt><dd>local (m) ; cadastral et géographique séparés, convertis explicitement</dd>
        <dt>Révision enregistrée</dt><dd data-info-revision>{revision === null ? "non évaluée" : `r${revision}`}</dd>
        <dt>Objets</dt><dd data-info-objets>{nombre(i.objets)}</dd>
        <dt>Calques</dt><dd>{nombre(i.calques)}</dd>
        <dt>Groupes</dt><dd>{nombre(i.groupes)}</dd>
        <dt>Relations</dt><dd>{nombre(i.relations)}</dd>
        <dt>Problèmes signalés</dt><dd>{nombre(i.problemes)}</dd>
        <dt>Parcelle</dt><dd>{i.site.parcelle ? "renseignée" : "non renseignée"}</dd>
        <dt>Emprise</dt><dd>{i.site.emprise ? "renseignée" : "non renseignée"}</dd>
        <dt>Hypothèses de site</dt><dd>{nombre(i.site.hypotheses)}</dd>
        <dt>Sources</dt><dd>{nombre(i.site.sources)}</dd>
      </dl>
      <h4>Niveaux</h4>
      <table className="raccourcis-table" data-info-niveaux>
        <thead><tr><th scope="col">Niveau</th><th scope="col">Altitude</th><th scope="col">Hauteur</th><th scope="col">Objets</th></tr></thead>
        <tbody>
          {i.niveaux.map((n) => (
            <tr key={n.id}><th scope="row">{n.nom}</th><td>{metres(n.elevation)}</td><td>{n.hauteur === null ? "non renseignée" : metres(n.hauteur)}</td><td>{nombre(n.objets)}</td></tr>
          ))}
        </tbody>
      </table>
      <h4>Objets par classe</h4>
      <ul className="info-modele-classes">{i.parClasse.map((c) => <li key={c.classe}>{c.libelle} : {nombre(c.nombre)}</li>)}</ul>
      {i.definitions.length > 0 && (
        <>
          <h4>Définitions</h4>
          <ul className="info-modele-classes">{i.definitions.map((d) => <li key={d.libelle}>{d.libelle} : {nombre(d.nombre)}</li>)}</ul>
        </>
      )}
    </div>
  );
}

export function MateriauxPanneau({ etat }: { etat: ModeleAtelier }) {
  const { materiaux, mursSansComposition } = useMemo(() => materiauxEnUsage(etat), [etat]);
  return (
    <div className="materiaux-panneau" data-materiaux>
      <p className="inspecteur-aide">Matériaux déclarés dans les compositions des types de murs, en usage dans le projet (lecture seule ; ils se modifient dans le type de mur, depuis l'inspecteur).</p>
      {materiaux.length === 0 ? (
        <p className="nav-detail">Aucun matériau déclaré.</p>
      ) : (
        <ul className="materiaux-liste">
          {materiaux.map((m) => (
            <li key={m.materiau} data-materiau={m.materiau}>
              <strong>{m.materiau}</strong>
              <span className="nav-detail"> — {m.fonctions.length ? m.fonctions.join(", ") : "fonction non renseignée"} ; {m.types.join(", ")} ; {nombre(m.murs.length)} mur(s)</span>{" "}
              <button type="button" className="lien" onClick={() => etatUi.selectionner(m.murs)} data-materiau-selectionner>Sélectionner les murs</button>
            </li>
          ))}
        </ul>
      )}
      <p className="nav-detail" data-murs-sans-composition={mursSansComposition}>{mursSansComposition ? `${nombre(mursSansComposition)} mur(s) sans composition : matériau non renseigné.` : "Tous les murs ont une composition."}</p>
    </div>
  );
}

function Branche({ n, ui, profondeur }: { n: NoeudArbre; ui: EtatUi; profondeur: number }) {
  if (n.genre === "objet") {
    const choisi = !!n.objetId && ui.selection.includes(n.objetId);
    const masque = !!n.objetId && ui.masques.includes(n.objetId);
    return (
      <li>
        <button type="button" className={`lien arbre-objet${choisi ? " est-choisi" : ""}`} aria-pressed={choisi} onClick={(e) => n.objetId && etatUi.selectionner([n.objetId], e.shiftKey)} data-arbre-objet={n.objetId}>
          {n.libelle}{masque ? " (masqué)" : ""}
        </button>
      </li>
    );
  }
  const ids = (x: NoeudArbre): string[] => (x.objetId ? [x.objetId] : x.enfants.flatMap(ids));
  return (
    <li>
      <details open={profondeur === 0 && n.enfants.length < 30}>
        <summary data-arbre-noeud={n.id}>{n.libelle}</summary>
        {n.genre !== "niveau" && <button type="button" className="lien arbre-tout" onClick={() => etatUi.selectionner(ids(n))} data-arbre-selectionner={n.id}>Sélectionner tout</button>}
        <ul>{n.enfants.map((e) => <Branche key={e.id} n={e} ui={ui} profondeur={profondeur + 1} />)}</ul>
      </details>
    </li>
  );
}

/** Arborescence (Outliner) : niveaux, groupes, blocs et objets ; clic = sélection (Maj : ajouter). */
export function Arborescence({ etat, ui }: { etat: ModeleAtelier; ui: EtatUi }) {
  const [ouvert, setOuvert] = useState(false);
  const arbre = useMemo(() => (ouvert ? arborescence(etat) : []), [etat, ouvert]);
  return (
    <details className="nav-section arbre" onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)} data-arborescence>
      <summary>Arborescence (groupes et blocs)</summary>
      {ouvert && <ul className="arbre-racine">{arbre.map((n) => <Branche key={n.id} n={n} ui={ui} profondeur={0} />)}</ul>}
    </details>
  );
}
