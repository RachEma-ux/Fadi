/**
 * Un éditeur qui n'écrit que si le rôle le permet : pour un projet partagé
 * en lecture, ses champs et boutons sont désactivés (fieldset) et un
 * rappel le dit ; les liens et plis restent utilisables. Le serveur reste
 * seul juge (403 avec motif si une écriture passait quand même).
 */
import type { ReactNode } from "react";
import { lockedHint, READ_ONLY_HINT, useProjectAccess } from "../lib/access";

export function WriteFieldset({ projectId, children, className, hint = true }: { projectId: string; children: ReactNode; className?: string; hint?: boolean }) {
  const access = useProjectAccess(projectId);
  if (access.canWrite) return <>{children}</>;
  return (
    <fieldset className={`access-fieldset${className ? ` ${className}` : ""}`} disabled aria-readonly="true">
      {hint && <p className="h7-muted access-readonly-hint">{access.lock && !access.holdsLock && access.mayEdit ? lockedHint(access.lock) : READ_ONLY_HINT}</p>}
      {children}
    </fieldset>
  );
}
