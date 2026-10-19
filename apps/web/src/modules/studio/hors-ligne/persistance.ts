/**
 * Brouillon hors ligne d'une variante Studio (A.5-09, B.3-10) : ce qui doit survivre à un rechargement, une coupure
 * réseau ou une mise à jour du service worker — la révision de base (contexte serveur lu), les pas de commandes non
 * enregistrés, et les enveloppes non confirmées (`PlanEnvoi` : lots, `requestId` fixés à la création, base de chaque
 * lot). Au retour du réseau, ces enveloppes repartent telles quelles, mêmes `requestId` : le serveur reconnaît un
 * rejeu et n'écrit jamais deux fois. Un refus `stale_revision` est conservé (`conflit`) : rien n'est écrasé.
 * Pur : ni React, ni DOM, ni IndexedDB (l'écriture est dans `lib/local-store.ts`).
 */
import type { StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import type { PlanEnvoi } from "../import/envoi";
import { annulerBrouillon, appliquerBrouillon, creerBrouillon, peutAnnuler, type Brouillon } from "../planche2d/brouillon";

export const VERSION_BROUILLON_HORS_LIGNE = 1;

/** Conflit conservé : la tête serveur a avancé ailleurs ; le brouillon reste sur sa base, rien n'est envoyé. */
export interface ConflitHorsLigne {
  /** Tête serveur constatée (réponse 409 ou lecture), si connue. */
  headRevisionId: string | null;
  at: string;
}

export interface BrouillonHorsLigne {
  version: typeof VERSION_BROUILLON_HORS_LIGNE;
  /** Révision sur laquelle reposent les pas (contexte serveur tel qu'il a été lu). */
  base: StudioContext;
  pas: StudioCommand[][];
  refaire: StudioCommand[][];
  /** Enveloppes non confirmées (requestId et baseRevisionId compris), ou null. */
  plan: PlanEnvoi | null;
  conflit: ConflitHorsLigne | null;
}

export const cleVariante = (projectId: string, studyId: string, variantId: string): string => `${projectId}|${studyId}|${variantId}`;

export function versHorsLigne(base: StudioContext, b: Brouillon, plan: PlanEnvoi | null, conflit: ConflitHorsLigne | null): BrouillonHorsLigne {
  return { version: VERSION_BROUILLON_HORS_LIGNE, base, pas: b.pas.map(p => [...p]), refaire: b.refaire.map(p => [...p]), plan, conflit };
}

/** Rien à conserver : ni commande en attente, ni enveloppe non confirmée, ni conflit. */
export const horsLigneVide = (h: Pick<BrouillonHorsLigne, "pas" | "plan" | "conflit">): boolean => h.pas.length === 0 && !h.plan && !h.conflit;

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const estLots = (v: unknown): v is StudioCommand[][] => Array.isArray(v) && v.every(l => Array.isArray(l) && l.every(c => estObjet(c) && typeof c.toolId === "string"));

function lirePlan(v: unknown): PlanEnvoi | null {
  if (v === null) return null;
  if (!estObjet(v) || !estLots(v.lots) || !Array.isArray(v.requestIds) || typeof v.envoyes !== "number" || typeof v.base !== "string") throw new Error("plan illisible");
  const requestIds = v.requestIds as unknown[];
  if (requestIds.length !== v.lots.length || !requestIds.every(id => typeof id === "string" && id.length > 0)) throw new Error("identifiants illisibles");
  if (!Number.isInteger(v.envoyes) || v.envoyes < 0 || v.envoyes > v.lots.length) throw new Error("avancement illisible");
  return { lots: v.lots, requestIds: requestIds as string[], envoyes: v.envoyes, base: v.base };
}

/** Relit un brouillon sérialisé ; lève une erreur pour un contenu illisible (jamais réinterprété en silence). */
export function lireHorsLigne(json: string): BrouillonHorsLigne {
  const v: unknown = JSON.parse(json);
  if (!estObjet(v) || v.version !== VERSION_BROUILLON_HORS_LIGNE) throw new Error("version inconnue");
  const base = v.base;
  if (!estObjet(base) || !estObjet(base.revision) || typeof base.revision.id !== "string" || !estObjet(base.revision.document) || !estObjet(base.variant)) throw new Error("base illisible");
  if (!estLots(v.pas) || !estLots(v.refaire)) throw new Error("commandes illisibles");
  const c = v.conflit;
  if (c !== null && !(estObjet(c) && (c.headRevisionId === null || typeof c.headRevisionId === "string") && typeof c.at === "string")) throw new Error("conflit illisible");
  return { version: VERSION_BROUILLON_HORS_LIGNE, base: base as unknown as StudioContext, pas: v.pas, refaire: v.refaire, plan: lirePlan(v.plan ?? null), conflit: (c as ConflitHorsLigne | null) ?? null };
}

/**
 * Reconstruit le brouillon sur un document : chaque pas est rejoué par le modèle (tout ou rien), puis les pas
 * annulés sont rejoués et annulés à nouveau pour rester « rétablissables ». Lève `StudioValidationError` si un pas
 * ne s'applique plus.
 */
export function restaurerBrouillon(document: StudioContext["revision"]["document"], pas: readonly (readonly StudioCommand[])[], refaire: readonly (readonly StudioCommand[])[] = []): Brouillon {
  let b = creerBrouillon(document);
  for (const p of pas) b = appliquerBrouillon(b, p);
  const nbPas = b.pas.length;
  let r = b;
  try {
    // `refaire[0]` est le pas annulé le plus récent, donc le premier à reprendre.
    for (const p of refaire) r = appliquerBrouillon(r, p);
    for (let i = 0; i < refaire.length; i++) { if (!peutAnnuler(r)) throw new Error("historique borné"); r = annulerBrouillon(r); }
    if (r.pas.length !== nbPas) throw new Error("historique incohérent");
    return r;
  } catch {
    // Les pas annulés ne sont qu'une commodité : seuls les pas en attente comptent.
    return b;
  }
}

export type ResultatReport = { ok: true; brouillon: Brouillon } | { ok: false };

/**
 * Report des commandes en attente sur une nouvelle tête (après un conflit) : réussi seulement si le modèle applique
 * chaque pas sur le nouveau document (`applyStudioCommands`). Sinon rien ne change : résolution manuelle.
 */
export function reporterSurTete(document: StudioContext["revision"]["document"], pas: readonly (readonly StudioCommand[])[]): ResultatReport {
  try { return { ok: true, brouillon: restaurerBrouillon(document, pas) }; }
  catch { return { ok: false }; }
}
