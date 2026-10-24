/**
 * Types de notification calculés par `GET /notifications` : libellé court (pastille de la cloche, réglages) et
 * description (Paramètres). Textes source en français, traduits par `en.json` à l'affichage.
 */
import type { NotificationKind } from "../lib/api";

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  acces: "Accès",
  commentaire: "Commentaire",
  "commentaire-studio": "Commentaire Studio",
  reservation: "Réservation",
  modification: "Modification",
  verrou: "Verrou",
  peremption: "Document périmé",
  revue: "Revue externe",
};

export const NOTIFICATION_KIND_DESCRIPTION: Record<NotificationKind, string> = {
  acces: "Un accès à un projet vous est donné (invitation, rôle).",
  commentaire: "Un autre membre commente un projet ou une étape du Parcours.",
  "commentaire-studio": "Un autre membre commente une variante Studio ou fait avancer une observation dont vous êtes responsable ou auteur.",
  reservation: "Un autre membre réserve l’édition d’un projet.",
  modification: "Un autre membre modifie dans l’Atelier des objets que vous avez créés ou modifiés.",
  verrou: "Un verrou d’étage, de zone ou d’objet est pris, libéré ou vous est transmis.",
  peremption: "Un export de dessin que vous avez produit est périmé par une modification d’un autre membre.",
  revue: "Un paquet de revue vous est partagé, l’équipe répond à vos constats, ou une réponse arrive sur une revue que vous coordonnez.",
};

/** Ordre d'affichage par défaut (celui du serveur prévaut quand il est connu). */
export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_KIND_LABEL) as NotificationKind[];
