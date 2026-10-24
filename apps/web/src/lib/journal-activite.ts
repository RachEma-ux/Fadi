/**
 * Journal d'activité (Issue #262, phase 3 bis, OP-D13 (a)) : appels des trois vues filtrées par le serveur
 * (administration, « Mon historique », historique de la participation d'un projet) et libellés lisibles des actions.
 * Les libellés sont écrits en français et traduits à l'affichage par `en.json` (D-163). Pur hors des appels réseau.
 * Aucune de ces lectures n'est conservée hors ligne (`NON_PERSISTED_QUERIES`).
 */
import { apiRequest } from "./api";

export type ActorView =
  | { kind: "vous" }
  | { kind: "systeme" }
  | { kind: "administrateur" }
  | { kind: "autre" }
  | { kind: "compte"; id: string; email: string | null; displayName: string | null };

export type DetailValue = string | number | boolean | null;

export interface JournalEntry {
  id: number;
  at: string;
  action: string;
  family: string;
  actor: ActorView;
  target: { type: string | null; id: string | null } | null;
  projectId: string | null;
  details: Record<string, DetailValue>;
  subjects: Record<string, ActorView>;
  ip?: string | null;
}

export interface JournalPage {
  entries: JournalEntry[];
  nextCursor: number | null;
  projects: Record<string, { code: string; name: string }>;
  families?: string[];
  export?: { available: boolean; reason: string };
}

export interface AdminJournalFilters {
  actor?: string;
  action?: string;
  family?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const journalApi = {
  admin: (f: AdminJournalFilters, before?: number) => apiRequest<JournalPage>(`/admin/audit${query({ ...f, before })}`),
  mine: (before?: number) => apiRequest<JournalPage>(`/auth/me/history${query({ before })}`),
  project: (projectId: string, family?: string, before?: number) =>
    apiRequest<JournalPage>(`/projects/${encodeURIComponent(projectId)}/journal${query({ family, before })}`),
};

// ---------------------------------------------------------------------------------------------------------------------
// Libellés (français ; traduits à l'affichage)
// ---------------------------------------------------------------------------------------------------------------------

export const ACTION_LABEL: Readonly<Record<string, string>> = {
  "auth.login.succeeded": "Connexion réussie",
  "auth.login.failed": "Connexion refusée",
  "auth.login.locked": "Compte verrouillé après des échecs de connexion",
  "auth.login.mfa_failed": "Code de double authentification refusé",
  "auth.logout": "Déconnexion",
  "auth.password.changed": "Mot de passe modifié",
  "auth.password.reset_requested": "Réinitialisation du mot de passe demandée",
  "auth.password.reset": "Mot de passe réinitialisé",
  "auth.sessions.revoked": "Sessions fermées",
  "auth.mfa.enabled": "Double authentification activée",
  "auth.mfa.disabled": "Double authentification désactivée",
  "auth.mfa.recovery_used": "Code de secours utilisé",
  "auth.email.verified": "Adresse confirmée",
  "auth.register": "Inscription",
  "account.activated": "Compte activé par invitation",
  "account.export": "Export des données personnelles",
  "account.deletion.requested": "Suppression du compte programmée",
  "account.deletion.cancelled": "Suppression du compte annulée",
  "account.anonymized": "Compte anonymisé",
  "admin.user.role_changed": "Rôle de plateforme modifié",
  "admin.user.suspended": "Compte suspendu",
  "admin.user.reactivated": "Compte réactivé",
  "admin.user.sessions_revoked": "Sessions révoquées par l’administration",
  "admin.user.deletion_requested": "Suppression programmée par l’administration",
  "admin.user.deletion_cancelled": "Suppression annulée par l’administration",
  "admin.user.anonymized_now": "Compte anonymisé par l’administration",
  "admin.user.promoted_by_script": "Promotion administrateur par le script d’exploitation",
  "invitation.created": "Invitation envoyée",
  "invitation.resent": "Invitation renouvelée",
  "invitation.cancelled": "Invitation annulée",
  "invitation.accepted": "Invitation acceptée",
  "invitation.declined": "Invitation déclinée",
  "invitation.refused": "Invitation refusée par le contrôle",
  "support.granted": "Accès support accordé",
  "support.revoked": "Accès support révoqué",
  "support.accessed": "Accès support utilisé (consultation)",
  "project.member.added": "Membre ajouté au projet",
  "project.member.role_changed": "Rôle d’un membre changé",
  "project.member.export_changed": "Droit d’export d’un lecteur changé",
  "project.member.removed": "Membre retiré du projet",
  "project.member.left": "Membre parti du projet",
  "project.ownership.transferred": "Propriété du projet transférée",
  "comment.audience_changed": "Audience d’un fil changée",
  "mail.quota_exceeded": "Courriel écarté (quota atteint)",
};

export const FAMILY_LABEL: Readonly<Record<string, string>> = {
  auth: "Connexion et sécurité",
  account: "Compte",
  admin: "Administration",
  invitation: "Invitations",
  support: "Accès support",
  project: "Participation au projet",
  comment: "Commentaires",
  mail: "Courriels",
  participation: "Participations",
  person: "Personnes",
  review: "Revue externe",
};

/** Libellé d'une action ; une action encore inconnue de l'interface (famille future) reste lisible par son code. */
export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? `Action non répertoriée : ${action}`;
}

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? family;
}

export function actorLabel(a: ActorView): string {
  switch (a.kind) {
    case "vous": return "Vous";
    case "systeme": return "Système (aucun compte connecté)";
    case "administrateur": return "Un administrateur de la plateforme";
    case "autre": return "Un autre compte";
    case "compte":
      if (!a.email) return "Compte supprimé";
      return a.displayName ? `${a.displayName} (${a.email})` : a.email;
  }
}

/** Le libellé d'un compte est une donnée (nom, adresse) : à ne pas traduire. */
export const isAccountData = (a: ActorView) => a.kind === "compte" && !!a.email;

export const DETAIL_LABEL: Readonly<Record<string, string>> = {
  purpose: "finalité", role: "rôle", roleBefore: "rôle avant", roleAfter: "rôle après", canExport: "export",
  canExportBefore: "export avant", canExportAfter: "export après", audienceBefore: "audience avant", audienceAfter: "audience après",
  module: "module", hours: "durée (heures)", mfa: "double authentification", revokedSessions: "sessions fermées", count: "nombre",
  exceptCurrent: "sauf la session courante", remaining: "codes restants", reason: "motif", from: "ancienne valeur", to: "nouvelle valeur", status: "statut",
  sent: "courriel envoyé", unlocked: "déverrouillé", via: "voie", previousOwnerRoleAfter: "rôle de l’ancien propriétaire",
  replies: "réponses", path: "chemin consulté",
};

export const SUBJECT_LABEL: Readonly<Record<string, string>> = {
  memberId: "membre", adminId: "administrateur", fromOwnerId: "ancien propriétaire", toOwnerId: "nouveau propriétaire",
  previousOwnerId: "ancien propriétaire", newOwnerId: "nouveau propriétaire", userId: "compte",
};

const VALUE_LABEL: Readonly<Record<string, string>> = {
  lecteur: "lecteur", editeur: "éditeur", proprietaire: "propriétaire", equipe: "équipe", projet: "projet",
  project_participation: "participation à un projet", platform_account: "compte de la plateforme", totp: "code TOTP",
  recovery_code: "code de secours", user: "utilisateur", admin: "administrateur", collaboration: "Collaboration", studio: "Studio",
  "compte-existant": "compte existant",
};

/** Valeur lisible et indicateur « donnée à ne pas traduire » (code technique, chemin, nombre). */
export function detailValue(v: DetailValue): { text: string; raw: boolean } {
  if (v === null) return { text: "—", raw: false };
  if (typeof v === "boolean") return { text: v ? "oui" : "non", raw: false };
  if (typeof v === "number") return { text: String(v), raw: true };
  const known = VALUE_LABEL[v];
  return known ? { text: known, raw: false } : { text: v, raw: true };
}
