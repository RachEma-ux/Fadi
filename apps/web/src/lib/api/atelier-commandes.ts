/**
 * Client API · service de commandes du nouvel Atelier (cahier des charges §5.4, tâche L2.4).
 *
 * Routes, sous le préfixe `/projects/:projectId/atelier` :
 * `GET /model?revision=n`, `GET /model/niveaux/:niveauId`, `POST /commands`, `POST /commands/annuler`,
 * `POST /commands/retablir`, `POST /commands/essai`, `GET /journal?apres=n`, `GET /problemes`.
 * Utilisé par le bus local de l'Atelier (`modules/atelier/bus`) et par ses panneaux (journal, problèmes).
 *
 * Réponses d'écriture (§5.4, figées) — rendues comme une union discriminée `ResultatEcriture`, jamais levées :
 * - 200 `{ revision, applique: [{ type, objetIds }], effets: { vues, documents, problemes, propositions,
 *   remplacements }, journalId }` (lot sans changement : révision inchangée) → `accepte` ;
 * - 400 `{ erreur: "invalide", details: [{ chemin, objet, cause, action, message }] }` (D-024) → `invalide` ;
 * - 409 `{ erreur: "conflit", baseRevision, revisionCourante, conflits: [{ objetId, motif, etatServeur }] }`
 *   → `conflit` ;
 * - 403 / 404 → `interdit` ; 423 (réservation d'autrui) → `reserve` ;
 * - pas de réponse, ou 502 / 503 / 504 d'un relais → `injoignable` (la joignabilité est mise à jour par
 *   `request`, `lib/reachability.ts`) ; tout autre statut → `erreur`.
 * Les lectures (`GET`) lèvent `ErreurAtelierApi` (réponse HTTP d'erreur) ou l'erreur réseau d'origine.
 *
 * Détails que le §5.4 ne fixe pas — décidés ici (L2.4) et à aligner côté API (L2.2) :
 * 1. `GET /model` rend l'`EtatModele` d'`@parcours/atelier-model` tel quel (`projetId`, `revision`,
 *    `empreinte`, `versionOntologie`, `objets`, `relations`, `catalogue`, `proprietesProjet`, `supprimes`) ;
 *    un enrobage `{ modele: EtatModele }` est aussi accepté.
 * 2. `GET /model/niveaux/:niveauId` rend `{ revision, empreinte?, niveauId, objets, relations }` ; `objets`
 *    est un enregistrement par identifiant (un tableau est accepté et converti).
 * 3. `POST /commands/annuler` et `/commands/retablir` reçoivent `{ requestId, baseRevision, journalId? }` :
 *    `requestId` propre à l'annulation (idempotence comme `/commands`), `baseRevision` = révision courante
 *    connue (sinon 409) ; `journalId` absent = la dernière entrée annulable (annuler) ou la dernière
 *    annulation rétablissable (rétablir) de l'auteur. Réponses comme `/commands`.
 * 4. `POST /commands/essai` reçoit l'enveloppe complète ; 200 rend la même forme que `/commands` sans
 *    `journalId` (rien n'est journalisé) ; `revision` est la révision qu'aurait produite le lot.
 * 5. `GET /journal?apres=n` rend `{ revisionCourante, entrees: [{ journalId, requestId, revision,
 *    baseRevision, label, types, objetIds, inverseDe, auteur?, creeLe }] }`, entrées de révision > n,
 *    dans l'ordre croissant ; un tableau nu d'entrées est accepté (`revisionCourante` = la plus grande).
 * 6. `GET /problemes` rend `{ revision, problemes: [Probleme & { categorie }] }` avec `categorie` parmi
 *    `reference` (références à réparer), `conflit` (conflits en attente), `document` (documents périmés),
 *    `harmonie` (réserves Harmonie) ; un tableau nu est accepté.
 * 7. `journalId` est une chaîne (un nombre reçu est converti) ; les identifiants de projet et de niveau sont
 *    encodés dans l'URL (`encodeURIComponent`).
 */
import {
  CONTRAT_COMMANDES,
  type CodeProbleme,
  type Commande,
  type EffetDocument,
  type EffetVue,
  type EnveloppeCommandes,
  type EtatModele,
  type IdObjet,
  type ObjetModele,
  type Probleme,
  type Proposition,
  type Relation,
  type Remplacement,
  type TypeCommande,
} from "@parcours/atelier-model";
import { isNetworkError } from "../reachability";
import { ApiError, request } from "./http";

export { CONTRAT_COMMANDES };

// ---------------------------------------------------------------------------
// Types des réponses (§5.4)
// ---------------------------------------------------------------------------

export interface EffetsReponse {
  readonly vues: readonly EffetVue[];
  readonly documents: readonly EffetDocument[];
  readonly problemes: readonly Probleme[];
  readonly propositions: readonly Proposition[];
  readonly remplacements: readonly Remplacement[];
}

export interface ReponseCommandes {
  readonly revision: number;
  readonly applique: readonly { readonly type: TypeCommande; readonly objetIds: readonly IdObjet[] }[];
  readonly effets: EffetsReponse;
  readonly journalId: string;
}

/** Réponse de `/commands/essai` : rien n'est journalisé. */
export type ReponseEssai = Omit<ReponseCommandes, "journalId">;

/** Détail d'un refus 400 (D-024) ; `code` et `objetIds` quand le serveur les fournit. */
export interface DetailErreur {
  readonly chemin: string;
  readonly objet: string;
  readonly cause: string;
  readonly action: string;
  readonly message: string;
  readonly code?: CodeProbleme;
  readonly objetIds?: readonly string[];
}

export interface ConflitObjet {
  readonly objetId: IdObjet;
  readonly motif: string;
  /** Objet tel qu'il est sur le serveur ; `null` = supprimé ou absent. */
  readonly etatServeur: ObjetModele | null;
}

export interface ReponseConflit {
  readonly erreur: "conflit";
  readonly baseRevision: number;
  readonly revisionCourante: number;
  readonly conflits: readonly ConflitObjet[];
}

export type ResultatEcriture<R = ReponseCommandes> =
  | { readonly statut: "accepte"; readonly reponse: R }
  | { readonly statut: "invalide"; readonly http: 400; readonly details: readonly DetailErreur[]; readonly message: string }
  | { readonly statut: "conflit"; readonly http: 409; readonly conflit: ReponseConflit }
  | { readonly statut: "interdit"; readonly http: 403 | 404; readonly message: string }
  | { readonly statut: "reserve"; readonly http: 423; readonly message: string }
  | { readonly statut: "injoignable"; readonly message: string }
  | { readonly statut: "erreur"; readonly http: number; readonly message: string };

export interface InstantaneNiveau {
  readonly revision: number;
  readonly empreinte?: string;
  readonly niveauId: IdObjet;
  readonly objets: Readonly<Record<IdObjet, ObjetModele>>;
  readonly relations: readonly Relation[];
}

export interface EntreeJournal {
  readonly journalId: string;
  readonly requestId: string;
  /** Révision produite par l'entrée. */
  readonly revision: number;
  readonly baseRevision: number;
  readonly label: string;
  readonly types: readonly TypeCommande[];
  readonly objetIds: readonly IdObjet[];
  /** Entrée annulée par celle-ci (`/commands/annuler`, `/commands/retablir`), sinon `null`. */
  readonly inverseDe: string | null;
  readonly auteur?: string;
  readonly creeLe: string;
}

export interface ReponseJournal {
  readonly revisionCourante: number;
  readonly entrees: readonly EntreeJournal[];
}

export type CategorieProbleme = "reference" | "conflit" | "document" | "harmonie";
export type ProblemeAtelier = Probleme & { readonly categorie: CategorieProbleme };

export interface ReponseProblemes {
  readonly revision: number | null;
  readonly problemes: readonly ProblemeAtelier[];
}

/** Corps de `/commands/annuler` et `/commands/retablir` (décision 3 de l'en-tête). */
export interface DemandeInverse {
  readonly requestId: string;
  readonly baseRevision: number;
  readonly journalId?: string;
}

/** Réponse HTTP d'erreur à une lecture. */
export class ErreurAtelierApi extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ErreurAtelierApi";
  }
}

// ---------------------------------------------------------------------------
// Lecture défensive des corps
// ---------------------------------------------------------------------------

type Corps = Record<string, unknown>;
const estObjet = (v: unknown): v is Corps => typeof v === "object" && v !== null && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texte = (v: unknown, defaut = ""): string => (typeof v === "string" ? v : v === undefined || v === null ? defaut : String(v));
const tableau = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Message lisible d'un corps d'erreur (`message`, sinon `erreur` / `error`, sinon le statut). */
function messageDe(corps: unknown, http: number): string {
  if (estObjet(corps)) {
    if (typeof corps.message === "string" && corps.message) return corps.message;
    if (typeof corps.erreur === "string" && corps.erreur) return corps.erreur;
    if (typeof corps.error === "string" && corps.error) return corps.error;
  }
  return `Réponse ${http} du serveur`;
}

function lireEffets(v: unknown): EffetsReponse {
  const e = estObjet(v) ? v : {};
  return {
    vues: tableau(e.vues),
    documents: tableau(e.documents),
    problemes: tableau(e.problemes),
    propositions: tableau(e.propositions),
    remplacements: tableau(e.remplacements),
  };
}

function lireReponseCommandes(corps: unknown): ReponseCommandes | null {
  if (!estObjet(corps) || !estNombre(corps.revision)) return null;
  return {
    revision: corps.revision,
    applique: tableau<Corps>(corps.applique).map((a) => ({ type: a.type as TypeCommande, objetIds: tableau<string>(a.objetIds) })),
    effets: lireEffets(corps.effets),
    journalId: texte(corps.journalId),
  };
}

function lireReponseEssai(corps: unknown): ReponseEssai | null {
  const r = lireReponseCommandes(corps);
  if (!r) return null;
  const { journalId: _ignore, ...essai } = r;
  void _ignore;
  return essai;
}

function lireDetails(corps: unknown): DetailErreur[] {
  if (!estObjet(corps)) return [];
  return tableau<Corps>(corps.details).map((d) => {
    const detail: DetailErreur = {
      chemin: texte(d.chemin),
      objet: texte(d.objet),
      cause: texte(d.cause),
      action: texte(d.action),
      message: texte(d.message, [texte(d.objet), texte(d.cause)].filter(Boolean).join(" : ")),
      ...(typeof d.code === "string" ? { code: d.code as CodeProbleme } : {}),
      ...(Array.isArray(d.objetIds) ? { objetIds: (d.objetIds as unknown[]).map((x) => texte(x)) } : {}),
    };
    return detail;
  });
}

function lireConflit(corps: unknown): ReponseConflit {
  const c = estObjet(corps) ? corps : {};
  return {
    erreur: "conflit",
    baseRevision: estNombre(c.baseRevision) ? c.baseRevision : -1,
    revisionCourante: estNombre(c.revisionCourante) ? c.revisionCourante : -1,
    conflits: tableau<Corps>(c.conflits).map((x) => ({
      objetId: texte(x.objetId),
      motif: texte(x.motif),
      etatServeur: estObjet(x.etatServeur) ? (x.etatServeur as unknown as ObjetModele) : null,
    })),
  };
}

function lireEntreeJournal(x: Corps): EntreeJournal {
  return {
    journalId: texte(x.journalId),
    requestId: texte(x.requestId),
    revision: estNombre(x.revision) ? x.revision : -1,
    baseRevision: estNombre(x.baseRevision) ? x.baseRevision : -1,
    label: texte(x.label),
    types: tableau<TypeCommande>(x.types),
    objetIds: tableau<unknown>(x.objetIds).map((i) => texte(i)),
    inverseDe: x.inverseDe === null || x.inverseDe === undefined ? null : texte(x.inverseDe),
    ...(typeof x.auteur === "string" ? { auteur: x.auteur } : {}),
    creeLe: texte(x.creeLe),
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Requête HTTP (par défaut `request` de `http.ts` : cookie de session, joignabilité). Injectable pour les tests. */
export type Requete = <T>(chemin: string, init?: RequestInit) => Promise<T>;

export const cheminAtelier = (projectId: string, suite: string) => `/projects/${encodeURIComponent(projectId)}/atelier${suite}`;

export interface ClientAtelierCommandes {
  lireModele(projectId: string, revision?: number): Promise<EtatModele>;
  lireNiveau(projectId: string, niveauId: string): Promise<InstantaneNiveau>;
  envoyerCommandes(projectId: string, enveloppe: EnveloppeCommandes): Promise<ResultatEcriture>;
  annuler(projectId: string, demande: DemandeInverse): Promise<ResultatEcriture>;
  retablir(projectId: string, demande: DemandeInverse): Promise<ResultatEcriture>;
  essayer(projectId: string, enveloppe: EnveloppeCommandes): Promise<ResultatEcriture<ReponseEssai>>;
  lireJournal(projectId: string, apres: number): Promise<ReponseJournal>;
  lireProblemes(projectId: string): Promise<ReponseProblemes>;
}

export function creerClientAtelierCommandes(requete: Requete = request): ClientAtelierCommandes {
  /** Lecture : 2xx → corps ; réponse d'erreur → `ErreurAtelierApi` ; échec réseau → erreur d'origine. */
  async function lire(chemin: string): Promise<unknown> {
    try {
      return await requete<unknown>(chemin);
    } catch (err) {
      if (err instanceof ApiError) throw new ErreurAtelierApi(err.status, err.body, messageDe(err.body, err.status));
      throw err;
    }
  }

  async function ecrire<R>(chemin: string, corps: unknown, lireOk: (c: unknown) => R | null): Promise<ResultatEcriture<R>> {
    let reponse: unknown;
    try {
      reponse = await requete<unknown>(chemin, { method: "POST", body: JSON.stringify(corps) });
    } catch (err) {
      if (err instanceof ApiError) {
        const { status, body } = err;
        if (status === 400) return { statut: "invalide", http: 400, details: lireDetails(body), message: messageDe(body, status) };
        if (status === 409) return { statut: "conflit", http: 409, conflit: lireConflit(body) };
        if (status === 403 || status === 404) return { statut: "interdit", http: status, message: messageDe(body, status) };
        if (status === 423) return { statut: "reserve", http: 423, message: messageDe(body, status) };
        return { statut: "erreur", http: status, message: messageDe(body, status) };
      }
      // `request` lève une `TypeError` sans réponse (réseau, relais 502 / 503 / 504) et a déjà déclaré le serveur injoignable.
      if (isNetworkError(err)) return { statut: "injoignable", message: err instanceof Error ? err.message : String(err) };
      return { statut: "erreur", http: 0, message: err instanceof Error ? err.message : String(err) };
    }
    const r = lireOk(reponse);
    return r === null ? { statut: "erreur", http: 200, message: "Réponse inattendue du serveur (révision absente)" } : { statut: "accepte", reponse: r };
  }

  return {
    async lireModele(projectId, revision) {
      const suite = revision === undefined ? "/model" : `/model?revision=${encodeURIComponent(String(revision))}`;
      const corps = await lire(cheminAtelier(projectId, suite));
      const modele = estObjet(corps) && estObjet(corps.modele) ? corps.modele : corps;
      if (!estObjet(modele) || !estNombre(modele.revision) || !estObjet(modele.objets)) {
        throw new ErreurAtelierApi(200, corps, "Instantané du modèle illisible (révision ou objets absents)");
      }
      return modele as unknown as EtatModele;
    },
    async lireNiveau(projectId, niveauId) {
      const corps = await lire(cheminAtelier(projectId, `/model/niveaux/${encodeURIComponent(niveauId)}`));
      if (!estObjet(corps) || !estNombre(corps.revision)) throw new ErreurAtelierApi(200, corps, "Instantané du niveau illisible");
      const objets: Record<IdObjet, ObjetModele> = Array.isArray(corps.objets)
        ? Object.fromEntries((corps.objets as ObjetModele[]).map((o) => [o.id, o]))
        : estObjet(corps.objets)
          ? (corps.objets as Record<IdObjet, ObjetModele>)
          : {};
      return {
        revision: corps.revision,
        ...(typeof corps.empreinte === "string" ? { empreinte: corps.empreinte } : {}),
        niveauId: texte(corps.niveauId, niveauId),
        objets,
        relations: tableau<Relation>(corps.relations),
      };
    },
    envoyerCommandes: (projectId, enveloppe) => ecrire(cheminAtelier(projectId, "/commands"), enveloppe, lireReponseCommandes),
    annuler: (projectId, demande) => ecrire(cheminAtelier(projectId, "/commands/annuler"), demande, lireReponseCommandes),
    retablir: (projectId, demande) => ecrire(cheminAtelier(projectId, "/commands/retablir"), demande, lireReponseCommandes),
    essayer: (projectId, enveloppe) => ecrire(cheminAtelier(projectId, "/commands/essai"), enveloppe, lireReponseEssai),
    async lireJournal(projectId, apres) {
      const corps = await lire(cheminAtelier(projectId, `/journal?apres=${encodeURIComponent(String(apres))}`));
      const brutes = Array.isArray(corps) ? corps : estObjet(corps) ? tableau<unknown>(corps.entrees) : [];
      const entrees = brutes.filter(estObjet).map(lireEntreeJournal).sort((a, b) => a.revision - b.revision);
      const revisionCourante =
        estObjet(corps) && estNombre(corps.revisionCourante) ? corps.revisionCourante : entrees.reduce((m, e) => Math.max(m, e.revision), apres);
      return { revisionCourante, entrees };
    },
    async lireProblemes(projectId) {
      const corps = await lire(cheminAtelier(projectId, "/problemes"));
      const problemes = Array.isArray(corps) ? corps : estObjet(corps) ? tableau<unknown>(corps.problemes) : [];
      return {
        revision: estObjet(corps) && estNombre(corps.revision) ? corps.revision : null,
        problemes: problemes.filter(estObjet) as unknown as ProblemeAtelier[],
      };
    },
  };
}

/** Client par défaut (session du navigateur). */
export const atelierCommandesApi: ClientAtelierCommandes = creerClientAtelierCommandes();

/** Commandes d'un lot → enveloppe `atelier-commands/1`. */
export function construireEnveloppe(requestId: string, baseRevision: number, label: string, commands: readonly Commande[]): EnveloppeCommandes {
  return { requestId, baseRevision, contract: CONTRAT_COMMANDES, label, commands };
}
