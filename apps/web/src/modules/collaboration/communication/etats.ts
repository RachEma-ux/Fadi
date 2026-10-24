/**
 * Communication (COM, Issue #280) — aides pures de l'interface, sans DOM : états d'envoi montrés à l'utilisateur
 * (concept « Offline capture and synchronization », COM-6), mentions qui ne donneront aucun accès (COM-R3, COM-D7) et
 * libellés des journaux. Testé par `etats.test.ts`.
 */
import type { ComAudience, ComMembre, ElementBoite, ProjectRole } from "../../../lib/api";

export type EtatEnvoi = "brouillon" | "en-attente" | "envoi" | "accepte" | "bloque";

/** Libellés des états (concept : « Saved on this device », « Waiting to send », « Uploading », « Accepted by Fadi », « Blocked or failed »). */
export const LIBELLE_ETAT: Record<EtatEnvoi, string> = {
  brouillon: "Enregistré sur cet appareil",
  "en-attente": "En attente d’envoi",
  envoi: "Envoi en cours",
  accepte: "Accepté par Fadi",
  bloque: "Bloqué : action requise",
};

/** Message affiché pour un envoi urgent sans réseau (concept « Urgent communication »), jamais une fausse remise. */
export const URGENT_HORS_LIGNE = "Non envoyé — pas de connexion. Utilisez la procédure de contact immédiat du projet si une réponse est nécessaire maintenant.";

/** État d'un envoi d'après la mutation (file rejouable) et le brouillon local. */
export function etatEnvoi(m: { status: "idle" | "pending" | "success" | "error"; isPaused: boolean } | null, brouillon: string): EtatEnvoi | null {
  if (m?.status === "pending") return m.isPaused ? "en-attente" : "envoi";
  if (m?.status === "error") return "bloque";
  if (brouillon.trim()) return "brouillon";
  if (m?.status === "success") return "accepte";
  return null;
}

/** Explication d'un refus du serveur pour un envoi en file (révocation, conversation devenue illisible…). */
export function raisonBlocage(status: number | null, message: string | null): string {
  if (status === 404) return "Vous n’avez plus accès à cette conversation : rien n’a été publié. Votre texte reste dans le brouillon.";
  if (status === 403) return message ?? "Vous ne pouvez plus écrire dans cette conversation : rien n’a été publié.";
  if (status === 409) return message ?? "Conflit : rien n’a été publié.";
  return message ?? "L’envoi a échoué : réessayez.";
}

const lit = (audience: ComAudience, role: ProjectRole, participant: boolean) =>
  audience === "projet" || (audience === "equipe" ? role === "proprietaire" || role === "editeur" : participant);

/** Membres mentionnés qui ne liront pas la conversation : la mention ne leur ouvre rien (avertissement avant l'envoi). */
export function mentionsSansAcces(audience: ComAudience, mentions: readonly string[], membres: readonly ComMembre[], participantsActifs: readonly string[]): ComMembre[] {
  return membres.filter((m) => mentions.includes(m.id) && !lit(audience, m.role, participantsActifs.includes(m.id)));
}

/** Libellé d'une entrée du journal d'une conversation. */
export function libelleJournal(e: { action: string; acteur: string; detail: Record<string, unknown> }): string {
  const d = e.detail;
  const AUD: Record<string, string> = { equipe: "équipe", projet: "tout le projet", participants: "participants nommés" };
  switch (e.action) {
    case "creer": return `${e.acteur} a créé la conversation`;
    case "audience": return `${e.acteur} a changé l’audience : ${AUD[String(d["avant"])] ?? d["avant"]} → ${AUD[String(d["apres"])] ?? d["apres"]}`;
    case "participant-ajoute": return `${e.acteur} a ajouté ${String(d["email"] ?? "?")} (${d["historique"] === "tout" ? "tout l’historique" : "à partir de l’ajout"})`;
    case "participant-retire": return `${e.acteur} a retiré ${String(d["email"] ?? "?")}`;
    case "animation": return `${e.acteur} a transféré l’animation de ${String(d["deEmail"] ?? "?")} à ${String(d["versEmail"] ?? "?")}`;
    case "modification-message": return `${e.acteur} a modifié un message`;
    case "retrait-message": return `${e.acteur} a retiré un message`;
    case "partage-envoye": return `${e.acteur} a partagé un extrait vers une autre conversation`;
    case "partage-recu": return `${e.acteur} a partagé ici un extrait d’une autre conversation`;
    case "action-liee": return `${e.acteur} a créé une action liée (${d["type"] === "demande" ? "demande de précision" : "observation Studio"})`;
    default: return `${e.acteur} · ${e.action}`;
  }
}

export const LIBELLE_BOITE: Record<ElementBoite["kind"], string> = {
  message: "Message",
  mention: "Mention",
  accuse: "Accusé demandé",
  "demande-a-repondre": "À répondre",
  "demande-repondue": "Réponse à clore",
};

export const LIBELLE_STATUT_DEMANDE: Record<string, string> = { ouverte: "ouverte", repondue: "répondue", close: "close" };

/** Identifiant de requête d'un envoi (rejeu idempotent, même après rechargement). */
export function nouvelIdRequete(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `com-${crypto.randomUUID()}` : `com-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
