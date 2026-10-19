/**
 * Règles pures des exigences Studio (E.1-02 à E.1-06) : aucune requête, aucun DOM. Le serveur
 * (`routes/studio-exigences.ts`) les applique sous transaction, sous le verrou du projet ; les tests les éprouvent
 * sans base (`studio-exigences.test.ts`).
 *
 * - Un jeu d'exigences par étude, **versionné en ajout seul** : chaque modification enregistre la version suivante
 *   (`baseVersion` = version lue par le client, sinon 409 `version_perimee`) ; une version n'est jamais réécrite.
 *   Aucune exigence n'est fournie par Fadi : sans enregistrement, l'étude n'a aucun jeu.
 * - Les exigences sont validées par le modèle (`validerExigences`) : métrique, comparaison, unité de la métrique et
 *   source déclarée. Une acceptation de référence partenaire ne vient jamais du client (`preparerVersion`) : seul
 *   `accepter` la pose, avec le compte et l'horloge du serveur ; tant qu'elle manque, l'exigence n'est pas utilisée.
 * - Un contrôle (`controlerExigences`) examine UNE révision avec UNE version : son résultat est enregistré tel quel,
 *   lié à l'une et à l'autre, avec son état d'exécution et, s'il a tourné, sa conclusion. Rien n'est réécrit.
 *
 * Droits (rôles de projet existants, `owned-project.ts`) : lire jeux et contrôles `read` ; modifier le jeu `modify` ;
 * accepter une référence partenaire `owner` (propriétaire seul, comme l'approbation d'une publication) ; lancer un
 * contrôle `write` (il n'écrit qu'un résultat, jamais le modèle). Une étude ou une variante archivée refuse les écritures.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  accepterExigence, controlerExigences, preparerVersion, StudioValidationError, validerExigences, type ExigenceStudio, type JeuExigences,
  type ResultatControle,
} from "@parcours/atelier-model";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const studioExigencesEditionSchema = z.object({
  /** Version lue par le client ; 0 = aucun jeu encore. */
  baseVersion: z.number().int().min(0),
  exigences: z.array(z.unknown()).max(500),
  motif: z.string().trim().min(1).max(2000).optional(),
  requestId: identifier.optional(),
}).strict();
export const studioExigenceAcceptationSchema = z.object({
  baseVersion: z.number().int().min(1),
  exigenceId: identifier,
  requestId: identifier.optional(),
}).strict();
export const studioControleSchema = z.object({
  /** Révision examinée ; tête de la variante par défaut. */
  revisionId: identifier.optional(),
  /** Version du jeu examinée ; version courante par défaut. */
  version: z.number().int().min(1).optional(),
  requestId: identifier.optional(),
}).strict();
export type StudioExigencesEdition = z.infer<typeof studioExigencesEditionSchema>;
export type StudioExigenceAcceptation = z.infer<typeof studioExigenceAcceptationSchema>;

/** Refus d'une règle : statut HTTP et corps. */
export interface RefusExigences { status: number; body: Record<string, unknown> }
export type Decision<T> = { ok: T } | { refus: RefusExigences };

/** JSON canonique (clés triées, ordre des tableaux conservé). */
export function canonique(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonique).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonique((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const empreinte = (value: unknown): string => createHash("sha256").update(canonique(value)).digest("hex");

const perimee = (courante: number): RefusExigences => ({
  status: 409, body: { error: "version_perimee", message: "Le jeu d’exigences a changé depuis votre lecture : relisez la version courante.", currentVersion: courante },
});

/**
 * Prochaine version d'une édition : base exacte, exigences valides, acceptations conservées seulement à contenu
 * inchangé et jamais forgées. `courante` = dernière version (null : aucun jeu).
 */
export function deciderEdition(courante: Pick<JeuExigences, "version" | "exigences"> | null, input: StudioExigencesEdition): Decision<{ version: number; exigences: ExigenceStudio[] }> {
  const actuelle = courante?.version ?? 0;
  if (input.baseVersion !== actuelle) return { refus: perimee(actuelle) };
  let proposees: ExigenceStudio[];
  try { proposees = validerExigences(input.exigences, "exigences"); }
  catch (e) {
    if (e instanceof StudioValidationError) return { refus: { status: 400, body: { error: "invalid_input", message: e.message, path: e.path } } };
    throw e;
  }
  const r = preparerVersion(courante?.exigences ?? [], proposees);
  if ("refus" in r) {
    if (r.refus === "inchangee") return { refus: { status: 409, body: { error: "inchangee", message: "Aucune modification : aucune version n’est créée.", currentVersion: actuelle } } };
    return { refus: { status: 400, body: { error: "acceptation_forgee", message: "Une acceptation de référence partenaire ne se saisit pas : elle est posée par « Accepter », puis retirée si l’exigence change.", exigenceId: r.exigenceId } } };
  }
  return { ok: { version: actuelle + 1, exigences: r.exigences } };
}

/** Acceptation d'une référence partenaire par le compte et à l'heure du serveur. */
export function deciderAcceptation(courante: Pick<JeuExigences, "version" | "exigences"> | null, input: StudioExigenceAcceptation, acteur: { id: string; email: string }, maintenant: Date): Decision<{ version: number; exigences: ExigenceStudio[] }> {
  const actuelle = courante?.version ?? 0;
  if (!courante || input.baseVersion !== actuelle) return { refus: perimee(actuelle) };
  const r = accepterExigence(courante.exigences, input.exigenceId, { par: acteur.id, parEmail: acteur.email, le: maintenant.toISOString() });
  if ("refus" in r) {
    const messages = {
      "exigence-inconnue": "Exigence introuvable dans la version courante.",
      "pas-une-reference": "Seule une exigence reprise d’une référence partenaire s’accepte.",
      "deja-acceptee": "Cette exigence est déjà acceptée.",
    } as const;
    return { refus: { status: r.refus === "exigence-inconnue" ? 404 : 409, body: { error: r.refus.replace(/-/g, "_"), message: messages[r.refus] } } };
  }
  return { ok: { version: actuelle + 1, exigences: r.exigences } };
}

/**
 * Choix de la version examinée par un contrôle : celle demandée (doit exister), sinon la courante, sinon aucune.
 * `versions` = numéros existants.
 */
export function versionExaminee(versions: readonly number[], demandee: number | undefined): Decision<number | null> {
  if (demandee !== undefined) return versions.includes(demandee) ? { ok: demandee } : { refus: { status: 404, body: { error: "not_found", message: "Version du jeu d’exigences introuvable." } } };
  return { ok: versions.length ? Math.max(...versions) : null };
}

/** Résultat d'un contrôle et colonnes dérivées (état d'exécution et conclusion distincts). */
export function resultatControle(studyId: string, revisionId: string, document: unknown, jeu: Pick<JeuExigences, "version" | "exigences"> | null): { result: ResultatControle; execution: ResultatControle["execution"]; conclusion: ResultatControle["conclusion"] } {
  const result = controlerExigences(studyId, revisionId, document, jeu);
  return { result, execution: result.execution, conclusion: result.execution === "execute" ? result.conclusion : null };
}

/** Rejeu d'une écriture identifiée par `requestId` : même auteur et même contenu, sinon 409. */
export function rejeuAdmis(stocke: { authorId: string; payloadHash: string | null }, acteurId: string, payloadHash: string): RefusExigences | null {
  if (stocke.authorId === acteurId && stocke.payloadHash === payloadHash) return null;
  return { status: 409, body: { error: "request_conflict", message: "Cet identifiant de requête est déjà utilisé pour un autre contenu ou auteur." } };
}
