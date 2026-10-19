/**
 * Textes d'interface du chargement des outils et des ressources (français source ; chacun traduit dans
 * `lib/i18n/en.json`, contrôlé par test). Les gabarits `{0}` sont remplis par `gabarit`.
 */
import { LIBELLES_ETATS, LIBELLES_PHASES, MESSAGES_ERREUR_MOTEUR } from "./gestionnaire-ressources";
import { MOTEURS } from "./moteurs";
import { DEFINITIONS_PERF } from "./perf";

export const TEXTES_RESSOURCES = Object.freeze({
  titre: "Ressources d’exécution",
  aide: "Moteurs partagés par les outils : chargés une seule fois, à l’ouverture de la planche ou au premier usage d’un outil qui en a besoin. Précaché ne veut pas dire chargé.",
  legende: "États techniques des moteurs",
  colMoteur: "Moteur",
  colEtat: "État",
  colUsages: "Usages",
  verifier: "Vérifier le cache",
  preparer: "Préparer le profil hors ligne",
  liberer: "Libérer",
  verification: "Vérification du cache…",
  preparation: "Préparation du profil hors ligne…",
  nonEvalueSansSw: "Hors connexion : non évalué (service worker absent ou pas encore installé).",
  nonEvalueSansCarte: "Hors connexion : non évalué (carte des morceaux de ce build illisible).",
  nonEvalueSansCache: "Hors connexion : non évalué (aucun cache pour ce build sur cet appareil).",
  toutDisponible: "Tous les outils du catalogue sont disponibles hors connexion sur cet appareil.",
  indisponibles: "{0} outil(s) indisponible(s) hors connexion (fichiers absents du cache) :",
  ranges: "{0} fichier(s) rangé(s) dans le cache, {1} échec(s).",
  cachePurge: "Le cache de cette version de l’application a été supprimé de l’appareil (mise à jour ou nettoyage du navigateur) : aucun outil n’est disponible hors connexion. Rechargez la page en ligne pour retrouver le travail hors connexion.",
  fileLocale: "Brouillons locaux non synchronisés conservés sur cet appareil : {0}.",
  fileLocaleNonEvaluee: "Brouillons locaux non synchronisés : non évalué.",
  persistance: {
    persistant: "Stockage de l’appareil persistant : la file locale n’est pas évincée sous pression de quota.",
    "non-persistant": "Stockage de l’appareil non persistant (aucune commande locale à protéger pour l’instant).",
    refuse: "Stockage persistant refusé par le navigateur : la file locale reste sur l’appareil, mais une éviction reste possible sous pression de quota.",
    "non-evalue": "Persistance du stockage : non évaluée.",
  },
  miseAJour: "Une nouvelle version de l’application est installée. Vos commandes locales non synchronisées restent sur cet appareil ; rechargez la page quand vous le souhaitez.",
  perfTitre: "Mesures PERF-01 à PERF-10",
  perfAide: "Relevé de cette session, sans seuil ni verdict : les limites seront décidées (DEC-13).",
  colCode: "Code",
  colMesure: "Mesure",
  colN: "n",
  colMediane: "Médiane",
  colDerniere: "Dernière",
  nonMesure: "non mesuré",
  nonApplicable: "non applicable",
  telechargerReleve: "Télécharger le relevé (JSON)",
  plancheIndisponible: "La planche n’a pas pu être chargée (réseau ou cache de l’appareil). Rien n’a été modifié.",
  reessayer: "Réessayer",
  chargementPlanche: "Chargement de la planche…",
  tas: "{0} Mo (tas)",
});

export const gabarit = (t: string, ...v: (string | number)[]): string => t.replace(/\{(\d+)\}/g, (_m, i: string) => String(v[Number(i)] ?? ""));

/** Tous les textes affichés (pour le contrôle des traductions). */
export function tousLesTextes(): string[] {
  const { persistance, ...simples } = TEXTES_RESSOURCES;
  return [
    ...Object.values(simples), ...Object.values(persistance), ...Object.values(LIBELLES_ETATS), ...Object.values(LIBELLES_PHASES),
    ...Object.values(MESSAGES_ERREUR_MOTEUR), ...MOTEURS.map((m) => m.libelleFR), ...DEFINITIONS_PERF.map((d) => d.mesure),
  ];
}
