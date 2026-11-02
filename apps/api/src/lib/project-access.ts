/**
 * Partage du projet écrit dans les participations — règles pures (Issue #262, lot OP-PONT : retrait du pont
 * `op_sync_access`). Les écritures sur base sont dans `project-access-db.ts`.
 *
 * Le partage (« membres du projet ») n'a plus de table propre : un partage EST une participation non terminée d'un
 * compte, hors propriétaire, portant le rôle de partage — origine `acces`, portée projet, un seul par participation :
 * Lecteur (`lecteur`) ou Concepteur (`editeur`). L'export accordé à un lecteur (écart E2) est `can_export` de la
 * participation ; un éditeur exporte toujours. `project_members` reste lisible comme VUE de compatibilité (init.sql).
 * Ces règles reprennent exactement celles de l'ancien miroir (`op_sync_access`) : même rôle métier, même export, même
 * cycle (un contact devient actif par un partage ; une participation suspendue le reste).
 */
import { ACCESS_ROLE_MIRROR } from "./participations.js";
import type { ProjectBusinessRole } from "../db/schema.js";

export type ShareRole = "lecteur" | "editeur";
export const SHARE_ROLES: readonly ShareRole[] = ["lecteur", "editeur"];

/** Rôle métier du partage (portée projet, origine `acces`) : lecteur → Lecteur, editeur → Concepteur. */
export function shareBusinessRole(role: ShareRole): ProjectBusinessRole {
  return ACCESS_ROLE_MIRROR[role]!;
}

/** Rôle de partage lu depuis les rôles `acces` d'une participation (Concepteur l'emporte) ; null sans rôle de partage. */
export function shareRoleFromRoles(roles: readonly ProjectBusinessRole[]): ShareRole | null {
  if (!roles.length) return null;
  return roles.includes("concepteur") ? "editeur" : "lecteur";
}

/**
 * Valeur de `can_export` sur la participation : un éditeur n'en a pas besoin (FALSE, il exporte toujours) ; un lecteur
 * garde l'export accordé. `undefined` = inchangé (valeur actuelle `current`) ; `null` = ligne d'archive antérieure à
 * l'écart E2, qui vaut le droit d'origine : TRUE.
 */
export function shareExportFlag(role: ShareRole, canExport: boolean | null | undefined, current = false): boolean {
  if (role !== "lecteur") return false;
  if (canExport === undefined) return current;
  return canExport ?? true;
}

/** Export effectif d'un partage : un éditeur exporte toujours ; un lecteur selon l'export accordé. */
export function shareExports(role: ShareRole, flag: boolean | null): boolean {
  return role === "editeur" || (flag ?? true);
}

/** Acceptation d'une invitation par un compte déjà membre : le rôle le plus large est conservé. */
export function mergedShareRole(current: ShareRole | null, incoming: ShareRole): ShareRole {
  return current === "editeur" ? "editeur" : incoming;
}

/** Ligne `project_members` d'une archive (Studio) : rôle de partage reconnu, sinon null (rien n'est accordé). */
export function archivedShareRole(value: unknown): ShareRole | null {
  return value === "lecteur" || value === "editeur" ? value : null;
}
