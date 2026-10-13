/**
 * Alertes actives du dossier, distinctes des notifications de collaboration.
 * Une alerte est déterminée par un fait courant ; ouvrir la cloche ne la résout pas.
 */
export type DossierAlertCommand = "retry-project" | "retry-steps" | "retry-programme" | "retry-review" | "retry-local" | "reconnect";
export type DossierAlertAction = { label: string; command: DossierAlertCommand } | { label: string; href: string };
export interface DossierAlert {
  id: string;
  title: string;
  text: string;
  action?: DossierAlertAction;
}
export interface DossierAlertFacts {
  projectId: string;
  code: string;
  /** Un dossier absent ou refusé ne doit pas exposer des alertes calculées sur son ancien cache. */
  projectAvailable: boolean;
  accessKnown: boolean;
  canWrite: boolean;
  accessReason?: string;
  projectReadFailed: boolean;
  projectLastRead?: string;
  localSaveFailed: boolean;
  connected: boolean;
  online: boolean;
  conflicts: number;
  stepsReadFailed: boolean;
  hasSteps: boolean;
  programmeReadFailed: boolean;
  hasProgramme: boolean;
  reviewReadFailed: boolean;
  hasReview: boolean;
  reviewStale: boolean;
  staleStep?: number;
}

export function dossierAlerts(f: DossierAlertFacts): DossierAlert[] {
  if (!f.projectAvailable) return [];
  const project = "/projets/" + encodeURIComponent(f.projectId);
  const alerts: DossierAlert[] = [];
  function add(id: string, label: string, text: string, action?: DossierAlertAction) {
    alerts.push({ id, title: f.code + " · " + label, text, action });
  }
  if (!f.accessKnown) {
    add("access-unknown", "Droits à vérifier", "Les droits du dossier ne sont pas encore connus.", { label: "Vérifier l’accès", command: "retry-project" });
  } else if (!f.canWrite) {
    add("read-only", "Consultation uniquement", f.accessReason || "L’édition n’est pas disponible pour ce dossier.", { label: "Voir la collaboration", href: project + "?module=collaboration" });
  }
  if (f.projectReadFailed) {
    add("project-read", "Dossier à actualiser", f.projectLastRead ? "La dernière lecture réussie du " + f.projectLastRead + " est conservée." : "La dernière version disponible est conservée ; son actualisation n’est pas confirmée.", { label: "Actualiser le dossier", command: "retry-project" });
  }
  if (f.localSaveFailed) {
    add("local-save", "Sauvegarde non confirmée", "Des modifications sont encore en mémoire. Leur conservation sur cet appareil n’est pas confirmée ; réessayez avant de fermer cette page.", f.canWrite ? { label: "Réessayer la sauvegarde", command: "retry-local" } : undefined);
  }
  if (!f.connected) {
    add("connection", "Connexion en attente", "Les copies déjà lues restent visibles avec leurs dates. Le retour du réseau ne confirme ni une sauvegarde, ni une nouvelle lecture.", f.online ? { label: "Rétablir la connexion", command: "reconnect" } : undefined);
  }
  if (f.conflicts > 0) {
    add("conflicts", "Versions à comparer", "Vos modifications attendent une décision explicite. Aucune version n’est remplacée automatiquement.", { label: "Comparer les versions", href: project + "?conflits=1" });
  }
  if (f.stepsReadFailed) {
    add("steps-read", "Avancement à actualiser", f.hasSteps ? "La dernière liste des étapes est conservée ; sa lecture actuelle n’est pas confirmée." : "L’avancement est indisponible. Aucune étape terminée ni prochaine étape n’est déduite de cette absence.", { label: "Actualiser l’avancement", command: "retry-steps" });
  }
  if (f.programmeReadFailed) {
    add("programme-read", "Programme à actualiser", f.hasProgramme ? "La dernière lecture du programme est conservée avec sa date. Son actualisation a échoué." : "Le programme est indisponible. Aucune surface cible n’est déduite de cette absence.", { label: "Actualiser le programme", command: "retry-programme" });
  }
  if (f.reviewReadFailed) {
    add("review-read", "Revue indisponible", f.hasReview ? "La dernière lecture de la revue est conservée avec sa date. Son état actuel n’est pas confirmé." : "La revue technique n’a pas pu être lue. Aucun résultat technique n’est déduit de cette absence.", { label: "Actualiser la revue", command: "retry-review" });
  }
  if (f.reviewStale) {
    add("review-stale", "Revue technique à actualiser", "Les données ont évolué depuis la revue. Une nouvelle revue conserve les réserves à examiner.", { label: "Consulter la revue", href: project + "?module=parcours&etape=11&bilan=1" });
  }
  if (f.staleStep !== undefined) {
    add("steps-stale", "Choix à réexaminer", "Des informations amont ont changé. Consultez les étapes signalées dans le Parcours pour réexaminer leurs choix.", { label: "Ouvrir l’étape", href: project + "?module=parcours&etape=" + f.staleStep });
  }
  return alerts;
}
