/**
 * Synthèse de la vue (lecture de l'emprise, D-GD-39) : pour chaque couche d'objets visible, le nombre d'objets qui
 * recoupent la vue sur le total de la couche (lus en base, filtre de la couche appliqué) et, si l'indicateur actif est
 * porté par la couche, son minimum, sa moyenne simple et son maximum sur les entités évaluées de la vue. Une valeur
 * absente n'est jamais comptée : elle est « non évaluée ». Panneau flottant, refermé par son bouton ou Alt+V.
 */
import { abregerValeur, formatNombre, type SyntheseCouche } from "@parcours/geodata-model";

export interface LigneSynthese {
  readonly coucheId: string;
  readonly titre: string;
  readonly etat: "chargement" | "ok" | "erreur";
  readonly synthese?: SyntheseCouche;
  /** Plus d'objets dans la vue que la borne lue : comptes et statistiques partiels. */
  readonly tronque?: boolean;
  readonly indicateur?: { readonly titre: string; readonly unite: string | null } | null;
  readonly erreur?: string;
}

const val = (x: number | null, unite: string | null) => (x === null ? "non évaluée" : abregerValeur(x, unite));

/** `decalee` : panneau Données ouvert à gauche ; `haute` : mini-carte affichée dessous. */
export function SyntheseVue(p: { lignes: readonly LigneSynthese[]; zoom: number; onFermer(): void; decalee: boolean; haute: boolean }) {
  return (
    <section className={`gd-synthese${p.decalee ? " gd-synthese-decalee" : ""}${p.haute ? " gd-synthese-haute" : ""}`} aria-label="Synthèse de la vue" data-gd-synthese>
      <div className="gd-ligne-titre">
        <h2>Synthèse de la vue</h2>
        <button type="button" onClick={p.onFermer} aria-label="Fermer la synthèse de la vue" title="Fermer (Alt+V)">×</button>
      </div>
      {!p.lignes.length && <p className="gd-etat" data-gd-synthese-vide>Aucune couche d'objets visible : ajoutez-en depuis le Catalogue.</p>}
      <ul className="gd-liste">
        {p.lignes.map((l) => (
          <li key={l.coucheId} data-gd-synthese-couche={l.coucheId}>
            <strong translate="no">{l.titre}</strong>
            {l.etat === "chargement" && <span className="gd-discret" role="status">Calcul…</span>}
            {l.etat === "erreur" && <span className="gd-alerte" role="status">{l.erreur}</span>}
            {l.etat === "ok" && l.synthese && (
              <>
                <span data-gd-synthese-compte={`${l.synthese.dansVue}/${l.synthese.total}`}>
                  <span>{formatNombre(l.synthese.dansVue, 0)}</span>
                  <span>dans la vue sur</span>
                  <span>{formatNombre(l.synthese.total, 0)}</span>
                </span>
                {l.tronque && <span className="gd-discret">Plus d'objets que la borne de lecture : comptes partiels.</span>}
                {l.indicateur && l.synthese.indicateur && (
                  <dl className="gd-synthese-stats" data-gd-synthese-indicateur={l.coucheId}>
                    <dt translate="no">{l.indicateur.titre}</dt>
                    <dd>
                      <span>Min</span><span translate="no">{val(l.synthese.indicateur.min, l.indicateur.unite)}</span>
                      <span>Moyenne</span><span translate="no" data-gd-synthese-moyenne>{val(l.synthese.indicateur.moyenne, l.indicateur.unite)}</span>
                      <span>Max</span><span translate="no">{val(l.synthese.indicateur.max, l.indicateur.unite)}</span>
                    </dd>
                    <dd className="gd-discret">
                      <span>Entités évaluées :</span>
                      <span>{formatNombre(l.synthese.indicateur.evaluees, 0)}</span>
                      <span>· non évaluées :</span>
                      <span data-gd-synthese-non-evaluees>{formatNombre(l.synthese.indicateur.nonEvaluees, 0)}</span>
                    </dd>
                  </dl>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="gd-discret">Objets lus en base qui recoupent la vue. Moyenne simple des entités évaluées, non pondérée ; une valeur absente n'est jamais comptée.</p>
      <p className="gd-discret"><span>Zoom</span> <span>{formatNombre(p.zoom, 1)}</span></p>
    </section>
  );
}
