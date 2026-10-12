import type { ParcoursStep } from "../../lib/api";

/** Les services de lecture, la persistance locale et les envois restent distincts. */
export interface DossierSyncState {
  projectId: string;
  /** null : la file locale n'a pas pu être lue, jamais assimilée à zéro. */
  pending: number | null;
  conflicts: number;
  busy: boolean;
  busyLabel?: string;
  localStatus: "loading" | "ready" | "error";
  localSaveError: string | null;
  online: boolean;
  reachable: boolean;
}

export type DossierActionIntent = "retry-local" | "reconnect" | "review-conflicts" | "retry-steps" | "retry-access";
export interface DossierPrimaryAction {
  label: string;
  detail: string;
  disabled: boolean;
  href?: string;
  intent?: DossierActionIntent;
}
export type DossierStepSummary = Pick<ParcoursStep, "number" | "status"> & Partial<Pick<ParcoursStep, "title" | "goal">>;
export interface DossierActionInput {
  projectId: string;
  access: { known: boolean; canWrite: boolean; locked?: boolean };
  steps: { status: "loading" | "error" | "ready"; data?: readonly DossierStepSummary[] };
  sync: DossierSyncState;
  /** Seul un nouveau dossier confirmé peut proposer « Commencer ». */
  confirmedNew?: boolean;
  resumedStep?: number;
  /** Travail réellement consulté dans ce dossier ; jamais déduit d'une alerte d'aperçu ou de revue. */
  currentWork?: "programme" | "atelier" | "review" | "parcours";
}

export function completeParcoursList(steps: readonly DossierStepSummary[] | undefined): steps is readonly DossierStepSummary[] {
  return !!steps && steps.length === 21 && new Set(steps.map((step) => step.number)).size === 21 && steps.every((step) => Number.isInteger(step.number) && step.number >= 1 && step.number <= 21 && ["a-faire", "en-cours", "termine"].includes(step.status));
}

/** Une décision pure : aucun appel, mutation, changement de dossier ou avancement inventé. */
export function resolveDossierPrimaryAction(input: DossierActionInput): DossierPrimaryAction {
  const { projectId, access, steps, sync } = input;
  const parcours = `/projets/${encodeURIComponent(projectId)}?module=parcours`;
  if (!access.known) return { label: "Vérifier l’accès au dossier", detail: "Les droits de ce dossier ne sont pas encore connus. Aucune écriture n’est proposée avant leur lecture.", intent: "retry-access", disabled: !sync.online || !sync.reachable };
  if (sync.projectId !== projectId) return { label: "Chargement de l’état du dossier…", detail: "Les informations de synchronisation de ce dossier sont en cours de lecture.", disabled: true };
  if (sync.busy) return { label: sync.busyLabel || "Enregistrement en cours…", detail: "Attendez le résultat de l’opération en cours dans ce dossier.", disabled: true };
  if (sync.localSaveError && access.canWrite) return { label: "Réessayer la sauvegarde", detail: "La saisie reste en mémoire, mais sa conservation sur cet appareil n’est pas confirmée. Réessayez avant de poursuivre.", intent: "retry-local", disabled: false };
  if (sync.conflicts > 0 && access.canWrite) {
    if (!sync.online || !sync.reachable) return { label: "Rétablir la connexion", detail: "La comparaison attend le serveur. Votre saisie et le conflit restent conservés ; aucune version n’est remplacée.", intent: "reconnect", disabled: !sync.online };
    return { label: "Comparer les versions", detail: "Comparez votre saisie à la version du serveur avant de décider explicitement laquelle conserver.", intent: "review-conflicts", disabled: false };
  }
  if (steps.status === "loading") return { label: "Chargement du Parcours…", detail: "L’étape à poursuivre sera proposée après la lecture des 21 étapes.", disabled: true };
  if (steps.status === "error" || !completeParcoursList(steps.data)) return { label: "Réessayer l’avancement", detail: "La liste complète des étapes n’est pas disponible. Aucun avancement ni prochaine étape n’est déduit de cette absence.", intent: "retry-steps", disabled: !sync.online || !sync.reachable };
  // Ces destinations consultent le travail explicitement choisi, y compris avec un accès en lecture seule.
  if (input.currentWork === "programme") return { label: "Ouvrir le programme", detail: "Consultez les espaces, les surfaces et les exigences du programme de ce dossier.", href: `/projets/${encodeURIComponent(projectId)}?module=programmation`, disabled: false };
  if (input.currentWork === "atelier") return { label: "Ouvrir l’Atelier", detail: "Retrouvez la maquette, les plans et les vues de ce dossier dans l’Atelier.", href: `/projets/${encodeURIComponent(projectId)}?module=atelier`, disabled: false };
  if (input.currentWork === "review") return { label: "Consulter la revue", detail: "Consultez le bilan de la revue technique et ses points à examiner pour ce dossier.", href: `${parcours}&etape=11&bilan=1`, disabled: false };
  const ordered = [...steps.data].sort((a, b) => a.number - b.number);
  const completed = ordered.every((step) => step.status === "termine");
  if (!access.canWrite || completed) return {
    label: "Consulter le Parcours",
    detail: completed ? "Les 21 étapes sont terminées. Retrouvez les informations, les choix et les documents du Parcours." : access.locked ? "L’édition est réservée. Le Parcours et ses informations restent consultables." : "Ce dossier est en lecture seule. Le Parcours et ses informations restent consultables.",
    href: parcours,
    disabled: false,
  };
  const starts = input.confirmedNew === true && ordered.every((step) => step.status === "a-faire");
  const next = starts ? ordered[0]! : ordered.find((step) => step.number === input.resumedStep && step.status !== "termine") ?? ordered.find((step) => step.status === "en-cours") ?? ordered.find((step) => step.status !== "termine")!;
  const stepLabel = `Étape ${String(next.number).padStart(2, "0")} / 21${next.title ? ` — ${next.title}` : ""}`;
  return { label: starts ? "Commencer le Parcours" : "Poursuivre le Parcours", detail: `${stepLabel}${next.goal ? ` · ${next.goal}` : ""}`, href: `${parcours}&etape=${next.number}`, disabled: false };
}
