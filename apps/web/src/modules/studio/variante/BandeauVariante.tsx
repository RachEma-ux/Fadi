/** En-tête de l'espace de travail : titre de l'étude, alerte (recharger la version serveur), contexte et état d'enregistrement. */
import { Link } from "react-router-dom";
import type { StudioContext } from "../../../lib/api";
import { cheminProjetStudio, cheminVarianteStudio } from "../routes-studio";
import { warning } from "./etat-variante";

export function EnTeteStudio({ context }: { context: StudioContext | null }) {
  return <header className="studio-heading"><div><p className="studio-eyebrow">FADI / STUDIO</p><h1>{context ? <span translate="no">{context.study.name}</span> : "Votre espace de dessin"}</h1><p>Dessin 2D · Repère local · Mètres</p></div><span className="studio-badge">Planche 2D</span></header>;
}

export function AlerteStudio({ error, blocked }: { error: string; blocked: boolean }) {
  return error ? <div className="studio-alert" role="alert" data-studio-erreur-planche>{error}{blocked && <button onClick={() => { if (window.confirm(warning())) window.location.reload(); }}>Recharger la version serveur</button>}</div> : null;
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
}

/** Bandeau de révision historique, contexte (études, variante, révision, état) et bascule des commentaires. */
export function BandeauVariante({ projectId, studyId, variantId, context, historical, etat, commentaires, surCommentaires }: PropsBandeauVariante) {
  return <>{historical && <div className="studio-alert studio-history-banner" data-studio-lecture-seule-revision><span>Révision historique en lecture seule. Aucune modification n’est possible ici.</span><Link to={cheminVarianteStudio(projectId, studyId, variantId)}>Revenir à la version courante</Link></div>}<div className="studio-context"><Link to={cheminProjetStudio(projectId)}>Études</Link><span translate="no">{context.variant.name}</span><span>Révision <span translate="no" title={context.revision.id}>{context.revision.id.slice(-8)}</span></span><span role="status" data-studio-etat>{etat}</span><button type="button" aria-pressed={commentaires} onClick={surCommentaires} data-studio-basculer-commentaires>Commentaires</button></div>{!context.canWrite && <p role="status" data-studio-lecture-seule>Lecture seule</p>}</>;
}
