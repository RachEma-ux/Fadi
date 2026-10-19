/**
 * En-tête de l'espace de travail : titre de l'étude, alerte (recharger la version serveur), contexte et état
 * d'enregistrement, état de connexion (en ligne / hors ligne / n en attente / conflit, `hors-ligne/etat.ts`) et, en
 * conflit, les choix offerts au brouillon hors ligne : recharger la version serveur (après confirmation) ou reporter
 * les commandes en attente sur la nouvelle version courante.
 */
import { Link } from "react-router-dom";
import type { StudioContext } from "../../../lib/api";
import { cheminProjetStudio, cheminVarianteStudio } from "../routes-studio";
import { etatHorsLigne, type EntreeEtatHorsLigne } from "../hors-ligne/etat";
import { warning } from "./etat-variante";
import "../hors-ligne/hors-ligne.css";

export function EnTeteStudio({ context }: { context: StudioContext | null }) {
  return <header className="studio-heading"><div><p className="studio-eyebrow">FADI / STUDIO</p><h1>{context ? <span translate="no">{context.study.name}</span> : "Votre espace de dessin"}</h1><p>Dessin 2D · Repère local · Mètres</p></div><span className="studio-badge">Planche 2D</span></header>;
}

/** `surRecharger` : abandon confirmé du brouillon (conservé hors ligne compris) puis relecture de la version serveur. */
export function AlerteStudio({ error, blocked, surRecharger }: { error: string; blocked: boolean; surRecharger?: () => void }) {
  return error ? <div className="studio-alert" role="alert" data-studio-erreur-planche>{error}{blocked && <button onClick={() => { if (surRecharger) surRecharger(); else if (window.confirm(warning())) window.location.reload(); }}>Recharger la version serveur</button>}</div> : null;
}

/**
 * État de connexion de la variante, rangé dans la ligne de contexte (aucune rangée de plus au-dessus de la planche) ;
 * en conflit seulement, les choix du brouillon hors ligne s'affichent sur leur propre ligne.
 */
export function EtatConnexionStudio({ etat }: { etat: EntreeEtatHorsLigne }) {
  const e = etatHorsLigne(etat);
  return <span className={`studio-connexion studio-connexion-${e.code}`} data-studio-hors-ligne={e.code} data-studio-en-attente={etat.enAttente} data-studio-conserve={etat.conserve ? "oui" : "non"}>
    <span role="status" data-studio-connexion>{e.texte}</span>
    {e.detail && <span className="studio-connexion-detail">{e.detail}</span>}
  </span>;
}

export function ChoixConflitStudio({ etat, surRecharger, surReporter }: { etat: EntreeEtatHorsLigne; surRecharger: () => void; surReporter: () => void }) {
  return etat.conflit ? <div className="studio-connexion studio-connexion-choix" data-studio-conflit-hors-ligne>
    <button type="button" onClick={surReporter} disabled={!etat.enLigne} data-studio-reporter>Reporter les commandes sur la nouvelle version</button>
    <button type="button" onClick={surRecharger} data-studio-recharger>Recharger la version serveur</button>
  </div> : null;
}

export interface PropsBandeauVariante {
  projectId: string;
  studyId: string;
  variantId: string;
  context: StudioContext;
  historical: boolean;
  etat: string;
  commentaires: boolean;
  surCommentaires: () => void;
  /** État de connexion (version courante seulement) et choix du brouillon hors ligne en conflit. */
  connexion?: { etat: EntreeEtatHorsLigne; surRecharger: () => void; surReporter: () => void };
}

/** Bandeau de révision historique, contexte (études, variante, révision, état) et bascule des commentaires. */
export function BandeauVariante({ projectId, studyId, variantId, context, historical, etat, commentaires, surCommentaires, connexion }: PropsBandeauVariante) {
  return <>{historical && <div className="studio-alert studio-history-banner" data-studio-lecture-seule-revision><span>Révision historique en lecture seule. Aucune modification n’est possible ici.</span><Link to={cheminVarianteStudio(projectId, studyId, variantId)}>Revenir à la version courante</Link></div>}<div className="studio-context"><Link to={cheminProjetStudio(projectId)}>Études</Link><span translate="no">{context.variant.name}</span><span>Révision <span translate="no" title={context.revision.id}>{context.revision.id.slice(-8)}</span></span><span role="status" data-studio-etat>{etat}</span>{!historical && connexion && <EtatConnexionStudio etat={connexion.etat} />}<button type="button" aria-pressed={commentaires} onClick={surCommentaires} data-studio-basculer-commentaires>Commentaires</button></div>{!historical && connexion && <ChoixConflitStudio {...connexion} />}{!context.canWrite && <p role="status" data-studio-lecture-seule>Lecture seule</p>}</>;
}
