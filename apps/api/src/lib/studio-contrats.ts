/**
 * Contrats versionnés des routes de l'API Studio (réserve G1, ADR-STUDIO-PILOTE-01 P-11) — mécanisme.
 *
 * Chaque route déclarée par `routes/studio*.ts` porte un **contrat de route** `studio-api-<nom>/<n>` qui couvre son
 * entrée (paramètres d'adresse et de requête, corps — validé par le schéma zod de la route) et sa réponse (statuts de
 * succès, nature du corps et schéma zod de la réponse JSON, vérifié par `routes/studio-contrats.test.ts`). Les
 * contrats sont déclarés dans `lib/studio-contrats-routes.ts`, un par constante, et posés sur la route par
 * `avecContrat(CONTRAT)` placé avant le gestionnaire.
 *
 * Exposition de la version : **en-tête** `X-Studio-Contrat` sur toute réponse de la route (succès comme refus), comme
 * les autres métadonnées de l'API Studio (`X-Studio-Revision`, `X-Studio-Package`) ; le corps n'est jamais modifié
 * (le client web existant, qui ne lit pas cet en-tête, est inchangé). Un champ `schema` dans le corps n'a pas été
 * retenu : plusieurs réponses portent déjà un `schema` qui leur est propre (feuille, dossier, rapport de fidélité).
 *
 * Version demandée : un client peut envoyer `X-Studio-Contrat: <identifiant>` ; s'il ne désigne pas exactement le
 * contrat que la route sert, la requête est refusée **avant tout accès** — 400 `contrat_incompatible`, rien n'est lu
 * ni écrit (même règle que l'enveloppe de commandes, dont un `contractVersion` autre que `studio-commands/1` est
 * refusé). Sans en-tête, la route sert sa version courante (rétrocompatible).
 *
 * Règles d'évolution : ajouter un champ facultatif à une réponse, un statut de refus ou un paramètre facultatif garde
 * la version (le schéma de réponse est mis à jour : il est strict au premier niveau, le test échoue sinon) ; retirer
 * ou renommer un champ, en changer le type ou le sens, rendre obligatoire une entrée facultative : nouvelle version
 * (`/2`), déclarée par un nouveau contrat.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

export const STUDIO_CONTRAT_ENTETE = "X-Studio-Contrat";
/** Forme d'un identifiant de contrat de route : `studio-api-<nom>/<version>`. */
export const STUDIO_CONTRAT_FORME = /^studio-api-[a-z0-9]+(?:-[a-z0-9]+)*\/[1-9][0-9]*$/;

/** Nature du corps d'une réponse de succès. */
export type StudioCorpsReponse = "json" | "fichier" | "vide";

export interface StudioContratRoute {
  /** `studio-api-<nom>/<version>`. */
  readonly id: string;
  /** Routes servies (`MÉTHODE /chemin` sous `/projects/:projectId/studio`), telles que déclarées. */
  readonly routes: readonly string[];
  /** Objet de la route, en une phrase. */
  readonly objet: string;
  /** Entrée : paramètres d'adresse, de requête et corps admis (le corps est validé par le schéma zod de la route). */
  readonly entree: string;
  /** Statuts de succès possibles. */
  readonly statuts: readonly number[];
  readonly corps: StudioCorpsReponse;
  /** Schéma de la réponse de succès (corps JSON) ; null pour un fichier ou une réponse vide. */
  readonly reponse: z.ZodType | null;
  /** Type de contenu d'un fichier (corps `fichier`). */
  readonly typeFichier?: string;
}

/** Déclare un contrat de route ; une forme invalide fait échouer le chargement du module (jamais une route sans contrat lisible). */
export function contratRoute(c: StudioContratRoute): StudioContratRoute {
  if (!STUDIO_CONTRAT_FORME.test(c.id)) throw new Error(`Contrat de route mal formé : ${c.id}`);
  if (!c.routes.length || !c.statuts.length) throw new Error(`Contrat ${c.id} : routes et statuts attendus.`);
  if ((c.corps === "json") !== (c.reponse !== null)) throw new Error(`Contrat ${c.id} : schéma de réponse exigé pour un corps JSON, et lui seul.`);
  return Object.freeze({ ...c, routes: Object.freeze([...c.routes]), statuts: Object.freeze([...c.statuts]) });
}

/** Corps d'un refus de l'API Studio (4xx) : un code `error`, puis des détails propres au refus. */
export const studioReponseRefus = z.looseObject({ error: z.string().min(1), message: z.string().optional() });

/** Gestionnaire posé avant celui de la route ; porte son contrat (`.contrat`) pour l'inventaire des routes. */
export type StudioGestionnaireContrat = RequestHandler & { readonly contrat: StudioContratRoute };

/**
 * Pose le contrat sur la route : en-tête `X-Studio-Contrat` sur la réponse ; une version demandée incompatible est
 * refusée (400 `contrat_incompatible`) avant le gestionnaire, donc avant tout accès.
 */
export function avecContrat(contrat: StudioContratRoute): StudioGestionnaireContrat {
  const gestionnaire = (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader(STUDIO_CONTRAT_ENTETE, contrat.id);
    const demande = req.get(STUDIO_CONTRAT_ENTETE);
    if (demande !== undefined && demande.trim() !== contrat.id) {
      res.status(400).json({
        error: "contrat_incompatible", attendu: contrat.id, recu: demande,
        message: `Contrat demandé « ${demande} » incompatible : cette route sert ${contrat.id}.`,
      });
      return;
    }
    next();
  };
  return Object.assign(gestionnaire, { contrat });
}
