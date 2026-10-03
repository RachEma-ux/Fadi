/**
 * Client API · Comptes — inscription, session, profil (nom affiché) et notifications dans l'application.
 * Code déplacé de `lib/api.ts` (L0.5) ; réexporté par `lib/api/index.ts` (objet `api` inchangé).
 */

import { request } from "./http";

export interface CurrentUser {
  id: string;
  email: string;
  /** Nom affiché choisi dans Paramètres (« Bonjour … », initiales) ; null tant que rien n'est saisi. */
  displayName: string | null;
}

export interface NotificationItem {
  id: string;
  at: string;
  kind: "acces" | "commentaire" | "reservation";
  projectId: string;
  projectCode: string;
  projectName: string;
  stepNumber: number | null;
  text: string;
  /** Postérieure à votre dernière consultation. */
  unread: boolean;
}

export interface NotificationsView {
  seenAt: string | null;
  items: NotificationItem[];
}

export const comptesApi = {
  register: (email: string, password: string) =>
    request<CurrentUser>("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<CurrentUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<CurrentUser>("/auth/me"),
  updateProfile: (displayName: string | null) => request<CurrentUser>("/auth/me", { method: "PATCH", body: JSON.stringify({ displayName }) }),
  /** Notifications dans l'application (accès reçus, commentaires des autres, réservations d'édition), relues des données datées. */
  listNotifications: () => request<NotificationsView>("/notifications"),
  markNotificationsSeen: () => request<{ seenAt: string }>("/notifications/seen", { method: "POST" }),
};
