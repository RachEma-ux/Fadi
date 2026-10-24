/**
 * Audience à l'intérieur d'un projet (écart E1 du cadrage des règles communes, 2026-10-24) — correction minimale, sans
 * construire COM : chaque commentaire du projet et chaque fil Studio (commentaire d'origine, ses réponses, son
 * observation, ses tâches et ses décisions) porte une audience.
 *
 *   `equipe` : le propriétaire et les éditeurs ; ni les lecteurs ni l'accès support ne le lisent.
 *   `projet` : tous les membres du projet, lecteurs compris (et l'accès support, en lecture seule).
 *
 * Le filtrage est fait par le serveur sur TOUTES les lectures (listes, détail, journal, notifications et leurs
 * extraits, archive exportée) : ce qui n'est pas lisible est absent, jamais masqué par le client. Les éléments antérieurs
 * à cette règle sont `projet` (migration additive : aucun changement silencieux de qui les lit) ; un nouvel élément est
 * `equipe` par défaut, sauf choix « Visible par les lecteurs ». Un lecteur écrit toujours en `projet` : il ne peut pas
 * publier dans une audience qu'il ne lit pas. Une réponse suit l'audience de son fil.
 */
import { z } from "zod";
import type { CommentAudience, StudioCommentAudience } from "../db/schema.js";
import type { ProjectRole } from "./owned-project.js";

export type { CommentAudience, StudioCommentAudience } from "../db/schema.js";

export const AUDIENCES = ["equipe", "projet"] as const satisfies readonly CommentAudience[];
export const audienceSchema = z.enum(AUDIENCES);

/** Défaut d'un nouvel élément : l'équipe (propriétaire et éditeurs). */
export const DEFAULT_AUDIENCE: CommentAudience = "equipe";

/** Le rôle lit-il les éléments réservés à l'équipe ? Propriétaire et éditeur seulement. */
export function seesTeam(role: ProjectRole): boolean {
  return role === "proprietaire" || role === "editeur";
}

/** Un élément d'audience `audience` est-il lisible par ce rôle ? NULL (ligne d'archive antérieure) vaut `projet`. */
export function audienceVisible(role: ProjectRole, audience: CommentAudience | null | undefined): boolean {
  return seesTeam(role) || (audience ?? "projet") === "projet";
}

export class AudienceError extends Error {
  constructor(public readonly status: number, public readonly body: { error: string; message: string }) {
    super(body.message);
  }
}

/**
 * Audience d'un nouvel élément écrit par `role` : réponse = audience de son fil (une valeur différente est refusée) ;
 * lecteur = `projet` (refus explicite s'il demande `equipe`) ; sinon le choix transmis, à défaut l'équipe.
 */
export function audienceOfNew(role: ProjectRole, requested: CommentAudience | undefined, threadAudience?: CommentAudience | null): CommentAudience;
export function audienceOfNew(role: ProjectRole, requested: CommentAudience | undefined, threadAudience: StudioCommentAudience | null | undefined): StudioCommentAudience;
/**
 * Un fil `revue` (constat d'une revue externe, phase 4) n'existe que sur Studio : une réponse de l'équipe le suit et reste
 * lisible par les destinataires du paquet ; il ne se crée jamais par cette voie (`audienceSchema` n'admet pas `revue`).
 */
export function audienceOfNew(role: ProjectRole, requested: CommentAudience | undefined, threadAudience: StudioCommentAudience | null | undefined = undefined): StudioCommentAudience {
  if (threadAudience !== undefined) {
    const thread = threadAudience ?? "projet";
    if (requested !== undefined && requested !== thread) throw new AudienceError(422, { error: "audience_du_fil", message: "Une réponse suit l'audience de son fil : changez l'audience du commentaire d'origine." });
    return thread;
  }
  if (!seesTeam(role)) {
    if (requested === "equipe") throw new AudienceError(422, { error: "audience_interdite", message: "Un lecteur écrit pour tout le projet : il ne lit pas les éléments réservés à l'équipe." });
    return "projet";
  }
  return requested ?? DEFAULT_AUDIENCE;
}

/**
 * Changement d'audience d'un fil : par son auteur ou par le propriétaire, tous deux de l'équipe (un lecteur ne change
 * rien). Passer un fil à `equipe` est refusé tant qu'il contient un message d'une personne qui ne le lirait plus
 * (lecteur actuel) : son propre texte lui disparaîtrait.
 */
export function audienceChangeRefusal(actor: { role: ProjectRole; isAuthor: boolean }, next: CommentAudience, threadHasReaderAuthor: boolean): AudienceError | null {
  if (!seesTeam(actor.role) || (!actor.isAuthor && actor.role !== "proprietaire")) {
    return new AudienceError(403, { error: "forbidden", message: "Seul l'auteur (propriétaire ou éditeur) ou le propriétaire du projet change l'audience d'un fil." });
  }
  if (next === "equipe" && threadHasReaderAuthor) {
    return new AudienceError(409, { error: "audience_lecteur_dans_le_fil", message: "Ce fil contient un message d'un lecteur : le réserver à l'équipe le lui retirerait." });
  }
  return null;
}
