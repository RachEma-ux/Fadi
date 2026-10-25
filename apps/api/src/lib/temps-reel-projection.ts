/**
 * Temps réel — projection par destinataire (RT-R1, RT-R7 ; PLAN.md § 3). Pur, testé par `temps-reel-projection.test.ts`.
 *
 * Le serveur ne diffuse jamais le contenu d'un client tel quel : pour chaque destinataire, il construit ce que ce
 * destinataire peut recevoir. Règles de la première version :
 * - aucun message à une connexion dont le droit n'a pas été relu récemment (`droitFrais`) ;
 * - une sélection ne cite que des objets du document épinglé par la session (un identifiant forgé ou absent est retiré,
 *   jamais relayé) ;
 * - une annotation réservée à l'équipe n'est annoncée qu'au propriétaire et aux éditeurs (`audienceVisible`, écart E1) ;
 * - aucune propriété, aucun titre ni aucune vignette d'objet ne passent par le canal : seuls des identifiants, que le
 *   destinataire relit par les routes HTTP avec son propre droit.
 */
import { audienceVisible } from "./audience.js";
import type { ProjectRole } from "./owned-project.js";
import { BORNES_TEMPS_REEL, type EvenementDurable, type MessageServeur } from "./temps-reel-protocole.js";

export interface Destinataire {
  userId: string;
  role: ProjectRole;
  /** Instant (ms) de la dernière relecture réussie du droit de cette connexion ; 0 = à relire avant toute diffusion. */
  droitRelu: number;
}

export function droitFrais(d: Destinataire, maintenant: number): boolean {
  return d.droitRelu > 0 && maintenant - d.droitRelu <= BORNES_TEMPS_REEL.fraicheurDroitMs;
}

/** Identifiants d'objets conservés : présents dans le document épinglé, sans doublon, dans l'ordre reçu. */
export function objetsAutorises(ids: readonly string[], objetsDuDocument: ReadonlySet<string>): string[] {
  const vus = new Set<string>();
  const garde: string[] = [];
  for (const id of ids) {
    if (!objetsDuDocument.has(id) || vus.has(id)) continue;
    vus.add(id);
    garde.push(id);
  }
  return garde;
}

/** L'événement durable peut-il être annoncé à ce destinataire ? */
export function evenementVisible(e: EvenementDurable, d: Pick<Destinataire, "role">): boolean {
  if (e.nature === "annotation") return audienceVisible(d.role, e.audience);
  return true;
}

/**
 * Message à envoyer à ce destinataire, ou `null` s'il ne doit rien recevoir. Les messages éphémères d'une personne ne
 * lui sont jamais renvoyés (`de`).
 */
export function projeter(message: MessageServeur, d: Destinataire, maintenant: number, objetsDuDocument: ReadonlySet<string>): MessageServeur | null {
  if (!droitFrais(d, maintenant)) return null;
  switch (message.type) {
    case "evenement": return evenementVisible(message.evenement, d) ? message : null;
    case "selection": {
      if (message.de === d.userId) return null;
      return { ...message, objectIds: objetsAutorises(message.objectIds, objetsDuDocument) };
    }
    case "vue": case "pointeur": case "pointeur-masque":
      return message.de === d.userId ? null : message;
    default: return message;
  }
}
