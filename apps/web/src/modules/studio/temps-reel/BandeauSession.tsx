/**
 * Temps réel — bandeau de session en direct dans l'espace de travail du Studio (RTC-2, Issue #283). Toujours affichés
 * (PLAN.md § 2) : la portée (variante), la révision montrée par la session, qui la voit, le suivi ou la navigation libre
 * et l'état de la connexion. Un changement de révision est proposé, jamais appliqué en silence ; suivre le présentateur
 * ne déplace que la vue, jamais la sélection ni le brouillon. Règle d'or : chaque commande a son icône, sa barre (ce
 * bandeau, ou la ligne d'un participant) et un raccourci Ctrl+Alt+Maj+lettre, branché ici.
 */
import { useEffect, useState } from "react";
import "./temps-reel.css";
import { COMMANDES_TEMPS_REEL, declenche, propsRaccourci, type CommandeTempsReel } from "../../collaboration/commandes-collaboration";
import { IconeCollaboration, RaccourciCollaboration } from "../../collaboration/IconeCollaboration";
import { estHote, estPresentateur, nomPresentateur, type EtatConnexion, type Participant } from "./etat-session";
import type { SessionTempsReel } from "./useSessionTempsReel";

const LIBELLE_CONNEXION: Record<EtatConnexion, string> = {
  "hors-session": "Hors session",
  connexion: "Connexion…",
  connecte: "Connecté",
  reconnexion: "Reconnexion…",
  "acces-retire": "Votre accès à ce projet a changé : la session est fermée pour vous.",
  "non-connecte": "Votre connexion à Fadi a expiré : reconnectez-vous pour revenir dans la session.",
  "session-close": "La session est close.",
  indisponible: "Trop de connexions ouvertes : fermez un autre onglet de session.",
};

const ROLE: Record<Participant["roles"][number], string> = { hote: "Hôte", presentateur: "Présentateur", participant: "Participant" };
const court = (id: string) => id.slice(-8);

export interface BandeauSessionProps {
  tr: SessionTempsReel;
  /** Révision affichée par cet écran (sa variante) et tête de la variante. */
  revisionAffichee: string;
  teteVariante: string;
  nomVariante: string;
  /** Affichage du présentateur différent du sien : l'écran le signale, sans changer de domaine ni de planche. */
  affichageLocal: "2d" | "3d" | "double";
  surAfficherRevision: (revisionId: string) => void;
  /**
   * Où ce bandeau s'affiche : `barre` (hors session) — une entrée compacte « En direct » dans la barre de l'espace, qui
   * ouvre le panneau des sessions par-dessus le canevas sans lui prendre de hauteur ; `bandeau` (en session) — le
   * bandeau complet sous la barre. Chaque emplacement ne répond qu'aux raccourcis de son état.
   */
  emplacement: "barre" | "bandeau";
}

export function BandeauSession({ tr, revisionAffichee, teteVariante, nomVariante, affichageLocal, surAfficherRevision, emplacement }: BandeauSessionProps) {
  const { etat, sessions, actions, erreur, enCours } = tr;
  const [participantsOuverts, setParticipantsOuverts] = useState(false);
  const [entreeOuverte, setEntreeOuverte] = useState(false);
  const enSessionMaintenant = etat.connexion !== "hors-session";
  // Entrer dans une session referme le panneau d'entrée : en la quittant, on retrouve l'entrée compacte.
  useEffect(() => { if (enSessionMaintenant) setEntreeOuverte(false); }, [enSessionMaintenant]);
  const enSession = etat.connexion !== "hors-session";
  const s = etat.session;
  const hote = estHote(etat), presente = estPresentateur(etat), suit = tr.suit;
  const hoteAbsent = !!s && etat.connexion === "connecte" && !etat.participants.some((p) => p.userId === s.hoteId);
  const revisionDifferente = !!s && s.revisionId !== revisionAffichee;
  const nouvelleRevision = etat.revisionDisponible ?? (s && s.portee === "studio-revision" && teteVariante !== s.revisionId ? teteVariante : null);
  const vueAilleurs = !!etat.vue && !presente && suit && etat.vue.affichage !== affichageLocal && affichageLocal !== "double";

  /** Commandes disponibles maintenant (le raccourci n'agit que sur celles-ci). */
  const actif = emplacement === "barre" ? !enSession && tr.disponible : enSession;
  const disponibles: Partial<Record<CommandeTempsReel, () => void>> = !actif ? {} : !enSession
    ? { "ouvrir-session": () => void actions.ouvrir(revisionAffichee), ...(sessions[0] ? { "rejoindre-session": () => actions.rejoindre(sessions[0]!.id) } : {}) }
    : {
        "quitter-session": () => actions.quitter(),
        ...(etat.connexion === "connecte" && !presente ? { [suit ? "naviguer-librement" : "suivre-presentateur"]: () => actions.suivre(!suit) } : {}),
        ...(hote && !presente ? { presenter: () => void actions.presenter(etat.moi) } : {}),
        ...(hoteAbsent ? { "reprendre-animation": () => void actions.reprendre() } : {}),
        ...(revisionDifferente && s ? { "afficher-revision-session": () => surAfficherRevision(s.revisionId) } : {}),
        ...(hote && nouvelleRevision ? { "passer-revision": () => void actions.passerRevision(nouvelleRevision) } : {}),
        ...(hote && s?.statut === "ouverte" ? { "clore-session": () => void actions.clore() } : {}),
      };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      for (const c of COMMANDES_TEMPS_REEL) {
        const f = disponibles[c];
        if (f && declenche(e, c)) { e.preventDefault(); f(); return; }
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  if (!actif) return null;
  const bouton = (c: CommandeTempsReel, libelle?: string, primaire = false) => {
    const f = disponibles[c];
    return <BoutonSession commande={c} libelle={libelle} onClick={f ?? (() => {})} disabled={!f || enCours} primaire={primaire} />;
  };

  if (!enSession) {
    return (
      <span className="tr-entree" data-tr-entree onKeyDown={(e) => { if (e.key === "Escape" && entreeOuverte) { e.preventDefault(); setEntreeOuverte(false); } }}>
        <button type="button" className="tr-entree-bouton" aria-expanded={entreeOuverte} aria-controls="tr-sessions-direct" onClick={() => setEntreeOuverte((o) => !o)} data-tr-entree-bouton>
          <span className="tr-direct" aria-hidden="true" />{sessions.length ? `En direct (${sessions.length})` : "En direct"}
        </button>
        {entreeOuverte && <section id="tr-sessions-direct" className="tr-bandeau tr-flottant" aria-label="Sessions en direct" data-tr-bandeau="hors-session">
          <span className="tr-titre">Sessions en direct</span>
          {sessions.length
            ? sessions.slice(0, 3).map((x) => (
              <span key={x.id} className="tr-session-dispo" data-tr-session={x.id}>
                <span translate="no">{x.titre}</span>
                <span className="tr-detail">{`${x.connectes.length} connecté(s) · hôte : ${x.hote.nom}`}</span>
                <BoutonSession commande="rejoindre-session" onClick={() => actions.rejoindre(x.id)} disabled={enCours} primaire />
              </span>
            ))
            : <span className="tr-detail">Aucune session ouverte sur cette variante.</span>}
          {bouton("ouvrir-session")}
          {erreur && <p className="studio-alert" role="alert">{erreur}</p>}
        </section>}
      </span>
    );
  }

  const fin = etat.connexion === "acces-retire" || etat.connexion === "non-connecte" || etat.connexion === "session-close" || etat.connexion === "indisponible";
  return (
    <section className="tr-bandeau" aria-label="Session en direct" data-tr-bandeau={etat.connexion} data-tr-session={s?.id}>
      <span className="tr-titre"><span className="tr-direct" aria-hidden="true" />En direct</span>
      {s && <span className="tr-portee" data-tr-portee>
        <span translate="no">{s.titre}</span>
        <span className="tr-detail">{`Variante « ${nomVariante} » · révision ${court(s.revisionId)}${s.portee === "paquet-revue" ? " (revue figée)" : ""}`}</span>
        <span className="tr-detail">Visible par : les participants de la session, membres du projet</span>
      </span>}
      <span className="tr-etat" role="status" data-tr-connexion={etat.connexion}>{LIBELLE_CONNEXION[etat.connexion]}</span>
      {!fin && s && <span className="tr-detail" data-tr-suivi={presente ? "presentateur" : suit ? "suit" : "libre"}>
        {presente ? "Vous présentez : votre vue est partagée." : suit ? `Vous suivez ${nomPresentateur(etat) || "le présentateur"}.` : "Navigation libre."}
      </span>}
      <span className="tr-commandes">
        {!fin && !presente && bouton(suit ? "naviguer-librement" : "suivre-presentateur")}
        {!fin && hote && !presente && bouton("presenter")}
        {!fin && hoteAbsent && bouton("reprendre-animation")}
        {!fin && hote && nouvelleRevision && bouton("passer-revision")}
        {!fin && hote && bouton("clore-session")}
        {bouton("quitter-session")}
        {!fin && <button type="button" className="button-secondary" aria-expanded={participantsOuverts} onClick={() => setParticipantsOuverts((o) => !o)} data-tr-participants-bouton>
          {`Participants (${etat.participants.length})`}
        </button>}
      </span>
      {!fin && revisionDifferente && s && <p className="studio-info" role="status" data-tr-revision-differente>
        {`La session montre la révision ${court(s.revisionId)} ; cet écran montre la révision ${court(revisionAffichee)}.`} {bouton("afficher-revision-session")}
      </p>}
      {!fin && nouvelleRevision && <p className="studio-info" role="status" data-tr-revision-disponible={nouvelleRevision}>
        {`Une révision plus récente existe (${court(nouvelleRevision)}) : la session reste sur sa révision tant que l’hôte ne la change pas.`}
      </p>}
      {vueAilleurs && <p className="studio-info" role="status" data-tr-vue-ailleurs>{etat.vue!.affichage === "3d" ? "Le présentateur montre la vue 3D." : "Le présentateur montre la planche 2D."}</p>}
      {hoteAbsent && !fin && <p className="studio-info" role="status" data-tr-hote-absent>L’hôte n’est plus connecté : le propriétaire ou un responsable du projet peut reprendre l’animation après deux minutes.</p>}
      {etat.resynchronise && !fin && <p className="studio-info" role="status" data-tr-resynchronise>Reconnecté : l’état de la session a été relu.</p>}
      {(erreur ?? etat.erreur) && <p className="studio-alert" role="alert" data-tr-erreur>{erreur ?? etat.erreur}</p>}
      {participantsOuverts && !fin && <ul className="tr-participants" aria-label="Participants de la session" data-tr-participants>
        {etat.participants.map((p) => <li key={p.userId} data-tr-participant={p.userId}>
          <span translate="no">{p.nom}</span>
          <span className="tr-detail">{[...p.roles.map((r) => ROLE[r]), ...(p.roles.includes("presentateur") ? [] : [p.suit ? "suit le présentateur" : "navigation libre"])].join(" · ")}</span>
          {hote && p.userId !== etat.moi && <>
            <BoutonSession commande="designer-presentateur" onClick={() => void actions.presenter(p.userId)} disabled={enCours || s?.presentateurId === p.userId} />
            <BoutonSession commande="transmettre-hote" onClick={() => void actions.transmettre(p.userId)} disabled={enCours} />
          </>}
        </li>)}
      </ul>}
    </section>
  );
}

/** Bouton d'une commande de session : icône propre, libellé, raccourci affiché et déclaré (`aria-keyshortcuts`). */
function BoutonSession({ commande, libelle, onClick, disabled, primaire = false }: { commande: CommandeTempsReel; libelle?: string | undefined; onClick: () => void; disabled?: boolean; primaire?: boolean }) {
  return (
    <button type="button" className={primaire ? "button-primary tr-commande" : "button-secondary tr-commande"} disabled={disabled} onClick={onClick} {...propsRaccourci(commande)}>
      <IconeCollaboration commande={commande} />
      {libelle ?? LIBELLES[commande]}
      <RaccourciCollaboration commande={commande} />
    </button>
  );
}

const LIBELLES: Record<CommandeTempsReel, string> = {
  "ouvrir-session": "Ouvrir une session en direct", "rejoindre-session": "Rejoindre", "quitter-session": "Quitter la session",
  "suivre-presentateur": "Suivre le présentateur", "naviguer-librement": "Naviguer librement", presenter: "Présenter",
  "designer-presentateur": "Désigner comme présentateur", "transmettre-hote": "Transmettre l’animation", "reprendre-animation": "Reprendre l’animation",
  "afficher-revision-session": "Afficher la révision de la session", "passer-revision": "Passer la session à la nouvelle révision", "clore-session": "Clore la session",
};
