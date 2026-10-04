/** Navigateur du projet (repère 1) : niveaux, calques, objets par classe du niveau actif, documents. */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { EtatModele } from "@parcours/atelier-model";
import type { EtatInterface, EtatVue, Selection, SelectionAtelier } from "../socle";
import { basculerMasque, calques, niveaux, objetsDeProjet, objetsParClasse } from "./navigateur";
import { normaliser } from "../socle";

/** Au-delà, la liste d'une classe est tronquée et le reste annoncé (rien n'est omis en silence). */
const MAX_PAR_CLASSE = 200;

export function Navigateur({
  etat,
  vue,
  etatVue,
  selection,
  sel,
  projetId,
}: {
  etat: EtatModele | null;
  vue: EtatInterface;
  etatVue: EtatVue;
  selection: SelectionAtelier;
  sel: Selection;
  projetId: string;
}) {
  const [filtre, setFiltre] = useState("");
  const q = normaliser(filtre);
  const lNiveaux = useMemo(() => (etat ? niveaux(etat) : []), [etat]);
  const lCalques = useMemo(() => (etat ? calques(etat, etatVue.niveauActifId) : []), [etat, etatVue.niveauActifId]);
  const groupes = useMemo(() => (etat ? objetsParClasse(etat, etatVue.niveauActifId, filtre) : []), [etat, etatVue.niveauActifId, filtre]);
  const projet = useMemo(() => (etat ? objetsDeProjet(etat) : []), [etat]);
  const niveauActif = lNiveaux.find((n) => n.id === etatVue.niveauActifId);

  if (!etat) {
    return (
      <p className="atl-muet" role="status">
        Chargement du modèle…
      </p>
    );
  }

  const changerNiveau = (id: string) => {
    if (id === etatVue.niveauActifId) return;
    selection.vider();
    vue.modifier({ niveauActifId: id });
  };

  return (
    <>
      <label className="atl-sr" htmlFor="atl-filtre-nav">
        Filtrer niveaux, calques et objets
      </label>
      <input id="atl-filtre-nav" className="atl-filtre" type="search" placeholder="Filtrer niveaux, calques, objets…" value={filtre} onChange={(e) => setFiltre(e.target.value)} data-testid="atl-nav-filtre" />

      <section className="atl-bloc" aria-labelledby="atl-niveaux-titre">
        <h3 id="atl-niveaux-titre" tabIndex={-1}>
          Niveaux
        </h3>
        {lNiveaux.length === 0 ? (
          <p className="atl-muet">Aucun niveau dans le modèle.</p>
        ) : (
          <ul className="atl-liste" data-testid="atl-niveaux">
            {lNiveaux
              .filter((n) => !q || normaliser(n.nom).includes(q))
              .map((n) => (
                <li key={n.id}>
                  <button type="button" className="atl-ligne" aria-pressed={n.id === etatVue.niveauActifId} onClick={() => changerNiveau(n.id)} data-testid={`atl-niveau-${n.id}`}>
                    <span>{n.nom}</span>
                    <span className="atl-fin atl-muet">{n.detail}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="atl-bloc" aria-labelledby="atl-calques-titre">
        <h3 id="atl-calques-titre" tabIndex={-1}>
          Calques
        </h3>
        {lCalques.length === 0 ? (
          <p className="atl-muet">Aucun calque : les outils de création resteront inactifs.</p>
        ) : (
          <ul className="atl-liste" data-testid="atl-calques">
            {lCalques
              .filter((c) => !q || normaliser(c.nom).includes(q))
              .map((c) => {
                const masque = etatVue.calquesMasques.includes(c.id);
                const actif = c.id === etatVue.calqueActifId;
                return (
                  <li key={c.id} className="atl-calque">
                    <button type="button" className="atl-ligne" aria-pressed={actif} onClick={() => vue.modifier({ calqueActifId: c.id })} data-testid={`atl-calque-${c.id}`}>
                      <i className="atl-pastille" style={c.couleur ? { background: c.couleur } : undefined} aria-hidden="true" />
                      <span>{c.nom}</span>
                      <span className="atl-fin atl-muet">
                        {[c.verrouille ? "verrouillé" : "", !c.visibleProjet ? "masqué (projet)" : "", !c.presentAuNiveau ? "absent du niveau" : ""].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="atl-oeil"
                      aria-pressed={!masque}
                      aria-label={`${masque ? "Afficher" : "Masquer"} le calque ${c.nom} dans la vue`}
                      title="Masquage de la vue seulement : le modèle ne change pas"
                      onClick={() => vue.modifier({ calquesMasques: basculerMasque(etatVue.calquesMasques, c.id) })}
                      data-testid={`atl-calque-oeil-${c.id}`}
                    >
                      <span aria-hidden="true">{masque ? "◌" : "◉"}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="atl-bloc" aria-labelledby="atl-objets-titre">
        <h3 id="atl-objets-titre" tabIndex={-1}>
          Objets par classe {niveauActif ? `(${niveauActif.nom})` : ""}
        </h3>
        {groupes.length === 0 ? (
          <p className="atl-muet">{filtre ? "Aucun objet ne correspond au filtre." : "Aucun objet sur ce niveau."}</p>
        ) : (
          <ul className="atl-liste" data-testid="atl-objets">
            {groupes.map((g) => (
              <li key={g.classe}>
                <details open={!!q}>
                  <summary className="atl-ligne">
                    <span>{g.libelle}</span>
                    <span className="atl-fin">
                      <b>{g.nombre}</b> <span className="atl-muet">/ {g.total}</span>
                    </span>
                  </summary>
                  <ul className="atl-liste atl-sous">
                    {g.objets.slice(0, MAX_PAR_CLASSE).map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          className="atl-ligne"
                          aria-pressed={sel.ids.includes(o.id)}
                          onClick={(e) => selection.choisir([o.id], e.shiftKey ? "ajouter" : e.ctrlKey || e.metaKey ? "basculer" : "remplacer")}
                          data-testid={`atl-objet-${o.id}`}
                        >
                          {o.libelle}
                        </button>
                      </li>
                    ))}
                    {g.objets.length > MAX_PAR_CLASSE && <li className="atl-muet">… et {g.objets.length - MAX_PAR_CLASSE} de plus : affinez le filtre.</li>}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        {projet.length > 0 && (
          <details className="atl-projet">
            <summary className="atl-ligne">
              <span>Objets du projet (sans niveau)</span>
              <span className="atl-fin">{projet.reduce((s, g) => s + g.nombre, 0)}</span>
            </summary>
            <ul className="atl-liste atl-sous">
              {projet.flatMap((g) =>
                g.objets.map((o) => (
                  <li key={o.id}>
                    <button type="button" className="atl-ligne" aria-pressed={sel.ids.includes(o.id)} onClick={() => selection.choisir([o.id])}>
                      <span className="atl-muet">{g.libelle}</span> {o.libelle}
                    </button>
                  </li>
                )),
              )}
            </ul>
          </details>
        )}
      </section>

      <section className="atl-bloc" aria-labelledby="atl-documents-titre">
        <h3 id="atl-documents-titre" tabIndex={-1}>
          Documents
        </h3>
        <Link className="atl-lien" to={`/projets/${encodeURIComponent(projetId)}?module=documents`} data-testid="atl-documents">
          Ouvrir le catalogue des documents
        </Link>
        <p className="atl-muet atl-petit">Les vues et feuilles du nouvel Atelier arrivent avec les documents dérivés (lot 5).</p>
      </section>
    </>
  );
}
