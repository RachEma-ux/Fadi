/**
 * Événements adressés aux extensions (protocole 1.0, lot 7, permission « evenements ») et minuteries. Pur.
 *
 *   projet.ouvert      { nom }                                      un dessin vient d'être ouvert
 *   projet.enregistre  null                                         le dessin vient d'être enregistré
 *   modele.change      { ajoutes, modifies, supprimes, origine }    après chaque opération validée, annulée ou rétablie
 *   selection.change   { selection }                                la sélection a changé
 *   minuterie.echeance { id }                                       une minuterie armée par l'extension arrive à terme
 *
 * Règles (spécification du protocole, « Les événements ») :
 *  - une extension ne reçoit que les événements que sa fiche déclare (`abonnements`) ;
 *  - un événement n'arrive jamais au milieu d'une opération : la Planche l'émet après, et l'hôte de l'extension le met
 *    en file derrière l'appel en cours ;
 *  - une extension n'est pas prévenue de ses propres changements ;
 *  - une chaîne de réactions entre extensions est coupée au troisième rebond ;
 *  - une extension qui réagit en modifiant le dessin le fait dans une opération « discrète », rattachée au pas
 *    d'annulation de l'utilisateur.
 */
import { differencePlanche } from "./delta.js";
import type { Id, Modele } from "./geometrie-libre.js";
import type { EvenementExtension, PaquetExtension } from "./protocole-extensions.js";

/** Nombre de rebonds admis dans une chaîne de réactions : le changement fait au troisième n'est plus annoncé. */
export const REBONDS_MAX = 3;
/** Au-delà, les listes d'un « modele.change » sont coupées et l'événement le dit (`tronque`). */
export const MAX_IDS_EVENEMENT = 2000;
export const BORNES_MINUTERIE = { delaiMaxMs: 600_000, actives: 10 } as const;

export type OrigineChangement = "utilisateur" | "extension" | "annulation" | "retablissement";

export interface ChangementModele {
  readonly ajoutes: readonly Id[];
  readonly modifies: readonly Id[];
  readonly supprimes: readonly Id[];
  readonly origine: OrigineChangement;
  /** Vrai si une liste a été coupée à `MAX_IDS_EVENEMENT` : l'extension relit alors le modèle. */
  readonly tronque: boolean;
}

/** D'où vient le changement annoncé : l'extension qui l'a fait (jamais prévenue), et le rang dans la chaîne de réactions. */
export interface CauseEvenement {
  readonly extension?: string;
  readonly rebond: number;
}

/**
 * Faces, arêtes et objets du contexte racine ajoutés, modifiés ou supprimés entre deux modèles ; un objet dont la
 * définition a changé compte comme modifié. `null` : rien n'a changé.
 */
export function resumerChangement(avant: Modele, apres: Modele, origine: OrigineChangement): ChangementModele | null {
  if (avant === apres) return null;
  const delta = differencePlanche(avant, apres);
  if (!delta) return null;
  const ajoutes: Id[] = [];
  const modifies = new Set<Id>();
  const supprimes: Id[] = [];
  for (const table of ["faces", "aretes", "occurrences"] as const) {
    for (const [id, v] of Object.entries(delta.racine?.[table] ?? {})) {
      if (v === null) supprimes.push(id);
      else if (Object.prototype.hasOwnProperty.call(avant.racine[table], id)) modifies.add(id);
      else ajoutes.push(id);
    }
  }
  // Un sommet déplacé change les arêtes et les faces qui s'y appuient, sans toucher leur enregistrement.
  const sommets = new Set(Object.keys(delta.racine?.sommets ?? {}));
  if (sommets.size) {
    const connu = (table: "aretes" | "faces", id: Id) => Object.prototype.hasOwnProperty.call(avant.racine[table], id);
    for (const a of Object.values(apres.racine.aretes)) if (connu("aretes", a.id) && (sommets.has(a.a) || sommets.has(a.b))) modifies.add(a.id);
    for (const f of Object.values(apres.racine.faces)) if (connu("faces", f.id) && (f.exterieur.some((id) => sommets.has(id)) || f.trous.some((t) => t.some((id) => sommets.has(id))))) modifies.add(f.id);
  }
  const definitions = new Set(Object.keys(delta.definitions ?? {}));
  if (definitions.size) for (const o of Object.values(apres.racine.occurrences)) if (definitions.has(o.definition) && !ajoutes.includes(o.id)) modifies.add(o.id);
  const couper = (l: readonly Id[]) => l.slice(0, MAX_IDS_EVENEMENT);
  const liste = [...modifies];
  return { ajoutes: couper(ajoutes), modifies: couper(liste), supprimes: couper(supprimes), origine, tronque: ajoutes.length > MAX_IDS_EVENEMENT || liste.length > MAX_IDS_EVENEMENT || supprimes.length > MAX_IDS_EVENEMENT };
}

/**
 * Extensions à prévenir d'un événement : celles qui y sont abonnées, sauf l'extension qui en est la cause ; personne
 * quand la chaîne de réactions a atteint `REBONDS_MAX`.
 */
export function destinatairesEvenement(paquets: readonly PaquetExtension[], evenement: EvenementExtension, cause: CauseEvenement = { rebond: 0 }): readonly PaquetExtension[] {
  if (cause.rebond >= REBONDS_MAX) return [];
  return paquets.filter((p) => p.fiche.id !== cause.extension && p.fiche.permissions.includes("evenements") && p.fiche.abonnements.includes(evenement));
}

/** Relit le délai d'une minuterie demandée par une extension ; `null` = refusé. */
export function lireDelaiMinuterie(v: unknown): number | null {
  const d = v && typeof v === "object" && !Array.isArray(v) ? (v as { delaiMs?: unknown }).delaiMs : undefined;
  return typeof d === "number" && Number.isFinite(d) && d >= 0 && d <= BORNES_MINUTERIE.delaiMaxMs ? Math.round(d) : null;
}
