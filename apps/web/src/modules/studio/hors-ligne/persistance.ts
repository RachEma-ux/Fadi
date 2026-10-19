/**
 * Brouillon hors ligne d'une variante Studio (A.5-09, B.3-10) : ce qui doit survivre à un rechargement, une coupure
 * réseau ou une mise à jour du service worker — la révision de base (contexte serveur lu), les pas de commandes non
 * enregistrés, et les enveloppes non confirmées (`PlanEnvoi` : lots, `requestId` fixés à la création, base de chaque
 * lot). Au retour du réseau, ces enveloppes repartent telles quelles, mêmes `requestId` : le serveur reconnaît un
 * rejeu et n'écrit jamais deux fois. Un refus `stale_revision` est conservé (`conflit`) : rien n'est écrasé.
 * Chaque brouillon appartient à un utilisateur (`userId`, aussi dans la clé) : un autre compte du même appareil ne le
 * relit ni ne le rejoue jamais. Les pas dessinés hors ligne APRÈS une enveloppe en attente restent derrière elle
 * (`pasCouverts`) : ils repartent ensuite, sur la révision que l'enveloppe aura produite.
 * Pur : ni React, ni DOM, ni IndexedDB (l'écriture est dans `lib/local-store.ts`).
 */
import { studioChevauchements, studioElementsModifies, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import type { PlanEnvoi } from "../import/envoi";
import { annulerBrouillon, appliquerBrouillon, avecPlancher, creerBrouillon, documentBrouillon, peutAnnuler, type Brouillon } from "../planche2d/brouillon";

export const VERSION_BROUILLON_HORS_LIGNE = 1;

/** Conflit conservé : la tête serveur a avancé ailleurs ; le brouillon reste sur sa base, rien n'est envoyé. */
export interface ConflitHorsLigne {
  /** Tête serveur constatée (réponse 409 ou lecture), si connue. */
  headRevisionId: string | null;
  at: string;
}

export interface BrouillonHorsLigne {
  version: typeof VERSION_BROUILLON_HORS_LIGNE;
  /** Propriétaire : un autre utilisateur de l'appareil ne le relit ni ne le rejoue jamais. */
  userId: string;
  /** Révision sur laquelle reposent les pas (contexte serveur tel qu'il a été lu). */
  base: StudioContext;
  pas: StudioCommand[][];
  refaire: StudioCommand[][];
  /** Enveloppes non confirmées (requestId et baseRevisionId compris), ou null. */
  plan: PlanEnvoi | null;
  /** Nombre de pas (en tête de `pas`) mis dans `plan` ; 0 sans plan. */
  pasCouverts: number;
  conflit: ConflitHorsLigne | null;
}

/** Clé d'une variante POUR un utilisateur : deux comptes du même appareil n'ont jamais la même ligne. */
export const cleVariante = (userId: string, projectId: string, studyId: string, variantId: string): string => [userId, projectId, studyId, variantId].join("|");

export function versHorsLigne(userId: string, base: StudioContext, b: Brouillon, plan: PlanEnvoi | null, pasCouverts: number, conflit: ConflitHorsLigne | null): BrouillonHorsLigne {
  return { version: VERSION_BROUILLON_HORS_LIGNE, userId, base, pas: b.pas.map(p => [...p]), refaire: b.refaire.map(p => [...p]), plan, pasCouverts: plan ? pasCouverts : 0, conflit };
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

/**
 * Relit un brouillon sérialisé ; lève une erreur pour un contenu illisible (jamais réinterprété en silence) ou qui
 * appartient à un autre utilisateur que `userId`.
 */
export function lireHorsLigne(json: string, userId: string): BrouillonHorsLigne {
  const v: unknown = JSON.parse(json);
  if (!estObjet(v) || v.version !== VERSION_BROUILLON_HORS_LIGNE) throw new Error("version inconnue");
  if (typeof v.userId !== "string" || v.userId !== userId) throw new Error("brouillon d'un autre utilisateur");
  const base = v.base;
  if (!estObjet(base) || !estObjet(base.revision) || typeof base.revision.id !== "string" || !estObjet(base.revision.document) || !estObjet(base.variant)) throw new Error("base illisible");
  if (!estLots(v.pas) || !estLots(v.refaire)) throw new Error("commandes illisibles");
  const c = v.conflit;
  if (c !== null && !(estObjet(c) && (c.headRevisionId === null || typeof c.headRevisionId === "string") && typeof c.at === "string")) throw new Error("conflit illisible");
  const plan = lirePlan(v.plan ?? null);
  const n = v.pasCouverts;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > v.pas.length || (!plan && n !== 0)) throw new Error("pas couverts illisibles");
  // Les enveloppes portent exactement les pas couverts, dans l'ordre : sinon un rejeu enverrait autre chose.
  if (plan && JSON.stringify(v.pas.slice(0, n).flat()) !== JSON.stringify(plan.lots.flat())) throw new Error("enveloppes et pas incohérents");
  return { version: VERSION_BROUILLON_HORS_LIGNE, userId: v.userId, base: base as unknown as StudioContext, pas: v.pas, refaire: v.refaire, plan, pasCouverts: n, conflit: (c as ConflitHorsLigne | null) ?? null };
}

/**
 * Reconstruit le brouillon sur un document : chaque pas est rejoué par le modèle (tout ou rien), puis les pas
 * annulés sont rejoués et annulés à nouveau pour rester « rétablissables ». `plancher` : pas couverts par une
 * enveloppe en attente (non annulables). Lève `StudioValidationError` si un pas ne s'applique plus.
 */
export function restaurerBrouillon(document: StudioContext["revision"]["document"], pas: readonly (readonly StudioCommand[])[], refaire: readonly (readonly StudioCommand[])[] = [], plancher = 0): Brouillon {
  let b = creerBrouillon(document);
  for (const p of pas) b = appliquerBrouillon(b, p);
  const nbPas = b.pas.length;
  let r = b;
  try {
    // `refaire[0]` est le pas annulé le plus récent, donc le premier à reprendre.
    for (const p of refaire) r = appliquerBrouillon(r, p);
    for (let i = 0; i < refaire.length; i++) { if (!peutAnnuler(r)) throw new Error("historique borné"); r = annulerBrouillon(r); }
    if (r.pas.length !== nbPas) throw new Error("historique incohérent");
  } catch {
    // Les pas annulés ne sont qu'une commodité : seuls les pas en attente comptent.
    r = b;
  }
  return avecPlancher(r, plancher);
}

/**
 * `chevauchements` : éléments que le brouillon change ET que la nouvelle tête a changés autrement depuis la base
 * (`studioChevauchements`) ; vide si la base n'est pas fournie. Les reporter remplacerait le changement d'autrui : le
 * report n'est alors confirmé que par l'utilisateur, jamais en silence (A.5-06, A.5-08).
 */
export type ResultatReport = { ok: true; brouillon: Brouillon; chevauchements: string[] } | { ok: false };

/**
 * Report des commandes en attente sur une nouvelle tête (après un conflit) : revalidé par le modèle, réussi seulement
 * s'il applique chaque pas sur le nouveau document (`applyStudioCommands`). Sinon rien ne change : résolution manuelle.
 * Les changements d'autrui présents dans la tête restent sous les pas reportés : annuler ne les retire jamais.
 */
export function reporterSurTete(document: StudioContext["revision"]["document"], pas: readonly (readonly StudioCommand[])[], base?: StudioContext["revision"]["document"]): ResultatReport {
  let brouillon: Brouillon;
  try { brouillon = restaurerBrouillon(document, pas); }
  catch { return { ok: false }; }
  let chevauchements: string[] = [];
  if (base) {
    try { chevauchements = studioChevauchements(base, documentBrouillon(restaurerBrouillon(base, pas)), document); }
    // Les pas ne s'appliquent plus à leur propre base (impossible en pratique) : tout ce qui a changé est à vérifier.
    catch { chevauchements = studioElementsModifies(base, document); }
  }
  return { ok: true, brouillon, chevauchements };
}

/** Identifiants cités par la confirmation d'un report (`objects:a` → `a`), dix au plus puis « … ». Donnée du projet. */
export function identifiantsCites(cles: readonly string[], max = 10): string {
  const ids = cles.map((c) => (c.includes(":") ? c.slice(c.indexOf(":") + 1) : c));
  return ids.length > max ? `${ids.slice(0, max).join(", ")}, …` : ids.join(", ");
}
