/**
 * Bandeaux de l'espace de travail : titre de l'espace (nommé pour les lecteurs d'écran ; le fil d'Ariane et l'en-tête de
 * Fadi nomment déjà le projet, l'étude, la variante et la révision), alerte (recharger la version serveur), bandeau d'une
 * révision historique, état de connexion (en ligne / hors ligne / n en attente / conflit, `hors-ligne/etat.ts`) et, en
 * conflit, les choix offerts au brouillon hors ligne : recharger la version serveur (après confirmation) ou reporter
 * les commandes en attente sur la nouvelle version courante.
 */
import { Link } from "react-router-dom";
import type { StudioContext } from "../../../lib/api";
import { cheminVarianteStudio, type OptionsDomaineVariante } from "../routes-studio";
import { MODES_PLANCHE, type ModePlanche } from "../domaines/definitions";
import { etatHorsLigne, type EntreeEtatHorsLigne } from "../hors-ligne/etat";
import { warning } from "./etat-variante";
import "../hors-ligne/hors-ligne.css";

/** Sous-titre de l'espace selon la planche affichée (libellés existants : « Dessin 2D », « Vue 3D »). */
export const SOUS_TITRE_PLANCHE: Readonly<Record<ModePlanche, string>> = Object.freeze({
  "2d": "Dessin 2D · Repère local · Mètres",
  "3d": "Vue 3D · Repère local · Mètres",
  double: "Dessin 2D et vue 3D · Repère local · Mètres",
});
export const libelleModePlanche = (m: ModePlanche): string => MODES_PLANCHE.find((x) => x.id === m)!.libelleFR;

/** Titre de l'espace : le nom de l'étude, lu par les lecteurs d'écran (visible dans le fil d'Ariane). */
export function TitreEspace({ context }: { context: StudioContext | null }) {
  return <h1 className="studio-masque" data-studio-titre-espace>{context ? <span translate="no">{context.study.name}</span> : "Votre espace de dessin"}</h1>;
}

/** `surRecharger` : abandon confirmé du brouillon (conservé hors ligne compris) puis relecture de la version serveur. */
export function AlerteStudio({ error, blocked, surRecharger }: { error: string; blocked: boolean; surRecharger?: () => void }) {
  return error ? <div className="studio-alert" role="alert" data-studio-erreur-planche>{error}{blocked && <button onClick={() => { if (surRecharger) surRecharger(); else if (window.confirm(warning())) window.location.reload(); }}>Recharger la version serveur</button>}</div> : null;
}

/** État de connexion de la variante, rangé dans la barre d'état ; en conflit seulement, les choix s'affichent à part. */
export function EtatConnexionStudio({ etat }: { etat: EntreeEtatHorsLigne }) {
  const e = etatHorsLigne(etat);
  return <span className={`studio-connexion studio-connexion-${e.code}`} data-studio-hors-ligne={e.code} data-studio-en-attente={etat.enAttente} data-studio-conserve={etat.conserve ? "oui" : "non"}>
    <span role="status" data-studio-connexion>{e.texte}</span>
    {e.detail && <span className="studio-connexion-detail">{e.detail}</span>}
  </span>;
}

export function ChoixConflitStudio({ etat, surRecharger, surReporter }: { etat: EntreeEtatHorsLigne; surRecharger: () => void; surReporter: () => void }) {
  if (etat.autreOnglet) return <div className="studio-connexion studio-connexion-choix" data-studio-conflit-onglet>
    <button type="button" onClick={surRecharger} data-studio-reprendre-onglet>Reprendre le brouillon de l’autre onglet</button>
  </div>;
  return etat.conflit ? <div className="studio-connexion studio-connexion-choix" data-studio-conflit-hors-ligne>
    <button type="button" onClick={surReporter} disabled={!etat.enLigne} data-studio-reporter>Reporter les commandes sur la nouvelle version</button>
    <button type="button" onClick={surRecharger} data-studio-recharger>Recharger la version serveur</button>
  </div> : null;
}

/** Bandeau d'une révision historique (lecture seule) ; « Revenir à la version courante » garde domaine et planche. */
export function BandeauHistorique({ projectId, studyId, variantId, adresse = {} }: { projectId: string; studyId: string; variantId: string; adresse?: OptionsDomaineVariante }) {
  return <div className="studio-alert studio-history-banner" data-studio-lecture-seule-revision><span>Révision historique en lecture seule. Aucune modification n’est possible ici.</span><Link to={cheminVarianteStudio(projectId, studyId, variantId, null, adresse)} data-studio-version-courante>Revenir à la version courante</Link></div>;
}
