/**
 * Communication (COM, Issue #280) — règles d'audience, pures (aucune base) et testées par `com-audience.test.ts`.
 *
 * Une conversation appartient à un projet et porte une audience explicite (COM-D3) :
 *   `participants` : les personnes nommées, tant qu'elles sont participantes et ont un accès au projet (jamais l'accès
 *                    support, qui n'est pas un participant) ;
 *   `equipe`       : le propriétaire et les éditeurs (même frontière que l'écart E1) ;
 *   `projet`       : tous les membres, lecteurs compris ; l'accès support la lit sans y écrire.
 *
 * Tout est recalculé depuis le rôle COURANT au projet (`loadProjectAccess`) : un retrait du projet ou une révocation vaut
 * à la requête suivante (COM-R5, S6). Une mention, une référence ou une affectation ne change jamais ces règles (COM-R3).
 */
import { createHash } from "node:crypto";
import type { ComAudience, ComMode } from "../db/schema.js";
import { seesTeam } from "./audience.js";
import type { ProjectRole } from "./owned-project.js";

export const COM_AUDIENCES = ["participants", "equipe", "projet"] as const satisfies readonly ComAudience[];
export const COM_MODES = ["contexte", "groupe", "direct"] as const satisfies readonly ComMode[];

/** Participation active d'une personne à une conversation `participants` (null = aucune ou retirée). */
export interface Participation {
  historyFrom: Date | null;
  removedAt: Date | null;
}

export interface Lecteur {
  userId: string;
  /** Rôle courant au projet ; null = aucun accès (retiré, révoqué, jamais membre). */
  role: ProjectRole | null;
  participation: Participation | null;
}

const participe = (p: Participation | null): boolean => !!p && p.removedAt === null;

/** La conversation est-elle lisible par ce lecteur ? Refus par défaut. */
export function peutLire(audience: ComAudience, l: Lecteur): boolean {
  if (!l.role) return false;
  if (audience === "projet") return true;
  if (audience === "equipe") return seesTeam(l.role);
  return l.role !== "support" && participe(l.participation);
}

/** Écrire (message, réponse, accusé) : lire, et ne pas être l'accès support (lecture seule). */
export function peutEcrire(audience: ComAudience, l: Lecteur): boolean {
  return l.role !== "support" && peutLire(audience, l);
}

/** Gérer la conversation (audience, participants, animation) : l'animateur qui la lit encore, ou le propriétaire du projet. */
export function peutGerer(audience: ComAudience, l: Lecteur, stewardId: string): boolean {
  if (l.role === "proprietaire") return true;
  return l.userId === stewardId && peutEcrire(audience, l);
}

/** Premier instant de l'historique lu par ce lecteur : la participation peut ne donner que les messages postérieurs à l'ajout. */
export function debutHistorique(audience: ComAudience, l: Lecteur): Date | null {
  return audience === "participants" ? (l.participation?.historyFrom ?? null) : null;
}

/** Libellé clair de l'audience, affiché avant l'envoi (COM-R1) : « Visible par : … ». */
export function libelleAudience(audience: ComAudience, projet: { code: string }, participants: readonly string[] = []): string {
  if (audience === "equipe") return `Visible par : équipe du projet ${projet.code} (propriétaire et éditeurs)`;
  if (audience === "projet") return `Visible par : tous les membres du projet ${projet.code}, lecteurs compris`;
  return `Visible par : ${participants.length ? participants.join(", ") : "aucun participant"}`;
}

/** Les audiences permises pour un mode : direct et groupe restent `participants` (COM-D3). */
export function audiencePermise(mode: ComMode, audience: ComAudience): boolean {
  return mode === "contexte" || audience === "participants";
}

export interface RefusCom {
  status: number;
  body: { error: string; message: string; [k: string]: unknown };
}

/**
 * Changement d'audience (COM-D5) : refusé pour une conversation directe ou de groupe (audience fixe) et si un auteur
 * perdait la lecture de son propre message. `auteurs` : rôle courant et participation de chaque auteur.
 */
export function refusChangementAudience(mode: ComMode, avant: ComAudience, apres: ComAudience, auteurs: readonly Lecteur[]): RefusCom | null {
  if (avant === apres) return { status: 409, body: { error: "audience_inchangee", message: "La conversation a déjà cette audience." } };
  if (!audiencePermise(mode, apres) || mode !== "contexte") {
    return { status: 409, body: { error: "audience_fixe", message: "Une conversation directe ou de groupe garde ses participants : créez un fil contextuel, ou partagez un extrait choisi." } };
  }
  const perdants = auteurs.filter((a) => a.role && !peutLire(apres, a)).map((a) => a.userId);
  if (perdants.length) {
    return { status: 409, body: { error: "audience_auteur_exclu", message: "Cette audience retirerait la lecture de leurs propres messages à des auteurs de la conversation.", auteurs: perdants } };
  }
  return null;
}

/** Mentions : hors projet = refus ; membre qui ne lit pas la conversation = accepté, jamais notifié (COM-D7). */
export function trierMentions(mentions: readonly string[], lecteurs: ReadonlyMap<string, Lecteur>, audience: ComAudience): { horsProjet: string[]; sansAcces: string[]; notifiables: string[] } {
  const horsProjet: string[] = [];
  const sansAcces: string[] = [];
  const notifiables: string[] = [];
  for (const id of new Set(mentions)) {
    const l = lecteurs.get(id);
    if (!l || !l.role || l.role === "support") horsProjet.push(id);
    else if (!peutLire(audience, l)) sansAcces.push(id);
    else notifiables.push(id);
  }
  return { horsProjet, sansAcces, notifiables };
}

/** Empreinte d'un aperçu (partage, action liée) : destinataires réels triés et contenu exact (COM-D9). */
export function empreinteApercu(destinataires: readonly string[], contenu: unknown): string {
  return createHash("sha256").update(JSON.stringify({ d: [...destinataires].sort(), c: contenu })).digest("hex").slice(0, 32);
}

/** Empreinte d'un envoi idempotent : même auteur, même `clientRequestId`, même contenu = rejeu. */
export function empreinteEnvoi(contenu: unknown): string {
  return createHash("sha256").update(JSON.stringify(contenu)).digest("hex");
}

/** Extrait court d'un message pour une notification ou la boîte (après contrôle d'audience). */
export function extrait(texte: string, n = 120): string {
  const t = texte.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** États de remise distincts (COM-R6) : accepté par Fadi ≠ ouvert ≠ accusé ; aucun ne vaut revue ni approbation. */
export function etatRemise(m: { openedAt: Date | null; acknowledgedAt: Date | null }): "accepte" | "ouvert" | "accuse" {
  if (m.acknowledgedAt) return "accuse";
  if (m.openedAt) return "ouvert";
  return "accepte";
}
