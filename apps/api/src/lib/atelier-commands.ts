/**
 * Service de commandes du nouvel Atelier (cahier des charges §5.4, lot 2, tâche L2.2 ; détails figés par D-029,
 * stockage D-030). Seul chemin d'écriture du modèle typé (R9) : les routes de `routes/atelier-commands.ts` ne
 * font que lire la requête, appeler ce service et rendre sa réponse.
 *
 * Écriture d'un lot (`executerLot`, `inverserEntree`) — une transaction par lot :
 * 1. droits relus à chaque requête (`read` / `write`, rôles de `owned-project.ts`) : 404 sans accès, 403 motivé ;
 * 2. `SELECT … FOR UPDATE` sur la ligne du projet (sérialise les écritures du projet) ;
 * 3. idempotence : une requête dont le `requestId` est déjà journalisé pour ce projet rend la réponse enregistrée
 *    telle quelle, sans rien réappliquer (avant tout autre contrôle : un renvoi après coupure est toujours servi) ;
 * 4. réservation d'édition d'autrui → 423 (relue sous verrou) ;
 * 5. `baseRevision` = révision courante (`projects.model_revision`), sinon 409 détaillé (D-015) ;
 * 6. `appliquerLot` (@parcours/atelier-model) ; refus → 400 `{ erreur: "invalide", details }` ;
 * 7. `ecrireDiff`, journal `atelier_commands` (commandes, inverse, effets, réponse, empreintes, nature),
 *    `ecrireEvenement` (boîte de sortie), `projects.model_revision` avancée — sauf lot sans changement (D-024) :
 *    révision inchangée, entrée journalisée (idempotence), aucun événement ;
 * 8. après validation : `declencherTraitement`.
 *
 * Restauration (D-024) : une commande portant `restauration` n'est acceptée que dans un inverse produit et
 * journalisé par ce serveur, c'est-à-dire par `/commands/annuler` et `/commands/retablir`, qui relisent l'inverse
 * dans le journal ; `/commands` et `/commands/essai` la refusent (400).
 *
 * Initialisation du modèle typé (choix L2.2) : à la première lecture ou écriture d'un projet qui n'a pas encore
 * de tête `atelier_models`, le service crée son modèle dans une transaction, sous verrou : import de P.118
 * (`importerP118` + `ecrireEtat`) pour un projet issu de l'exemple (`source_example_id = p118-exemple-complet`,
 * copies comprises), modèle vide (`etatVide`) sinon. Le modèle naît à la révision courante du projet (sans
 * l'avancer : l'ancien Atelier partage `model_revision` jusqu'au lot 4, D-030) ; l'initialisation est journalisée
 * (nature `import`, `request_id` = `initialisation`, inverse vide), sans événement (révision inchangée), et borne la
 * reconstruction des révisions passées.
 *
 * Révisions passées (`GET /model?revision=n`, D-030) : état courant, puis inverses du journal appliqués de la plus
 * récente à la plus ancienne entrée de révision > n ; l'empreinte obtenue est contrôlée contre l'empreinte de base
 * journalisée.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import {
  appliquerCommande,
  appliquerLot,
  calculerEmpreinte,
  CONTRAT_COMMANDES,
  EFFETS_VIDES,
  etatVide,
  importerP118,
  problemesReferences,
  TYPES_COMMANDE,
  VERSION_ONTOLOGIE,
  type Commande,
  type Effets,
  type EnveloppeCommandes,
  type ErreurCommande,
  type EtatModele,
  type IdObjet,
  type JeuDonneesP118,
  type ObjetModele,
  type Probleme,
  type TypeCommande,
} from "@parcours/atelier-model";
import { db } from "../db/client.js";
import type { EditingLock } from "../db/schema.js";
import { dataFileUrl } from "../runtime-paths.js";
import { chargerEtat, chargerNiveau, ecrireDiff, ecrireEtat, etatVersLignes, lignesVersEtat, type Executeur } from "./atelier-rows.js";
import { declencherTraitement, ecrireEvenement, EVENEMENT_COMMANDE_VALIDEE } from "./atelier-events.js";
import { P118_EXAMPLE_ID } from "./design-context.js";
import { newId } from "./ids.js";
import { activeLock, FORBIDDEN_MESSAGE, loadProjectAccess, lockedMessage, roleAllows, type AccessibleProject } from "./owned-project.js";

// ---------------------------------------------------------------------------
// Réponses (§5.4, D-029)
// ---------------------------------------------------------------------------

export interface EffetsReponse {
  readonly vues: Effets["vues"];
  readonly documents: Effets["documents"];
  readonly problemes: Effets["problemes"];
  readonly propositions: Effets["propositions"];
  readonly remplacements: Effets["remplacements"];
}

export interface ReponseCommandes {
  readonly revision: number;
  /** Empreinte `atelier-empreinte/1` du modèle après le lot (en plus du §5.4). */
  readonly empreinte: string;
  readonly applique: readonly { readonly type: TypeCommande; readonly objetIds: readonly IdObjet[] }[];
  readonly effets: EffetsReponse;
  readonly journalId: string;
}

export type ReponseEssai = Omit<ReponseCommandes, "journalId">;

export interface DetailErreur {
  readonly chemin: string;
  readonly objet: string;
  readonly cause: string;
  readonly action: string;
  readonly message: string;
  readonly code: string;
  readonly objetIds?: readonly string[];
}

export interface ConflitObjet {
  readonly objetId: IdObjet;
  readonly motif: string;
  readonly etatServeur: ObjetModele | null;
}

/** Réponse HTTP d'échec (levée dans la transaction pour l'annuler, rendue telle quelle par la route). */
export class ReponseAtelier extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body["message"] === "string" ? (body["message"] as string) : `HTTP ${status}`);
    this.name = "ReponseAtelier";
  }
}

const detail = (code: string, chemin: string, objet: string, cause: string, action: string, objetIds?: readonly string[]): DetailErreur => ({
  code,
  chemin,
  objet,
  cause,
  action,
  message: `${objet} : ${cause}. Action : ${action}.`,
  ...(objetIds ? { objetIds } : {}),
});

function invalide(details: readonly DetailErreur[]): ReponseAtelier {
  return new ReponseAtelier(400, { erreur: "invalide", message: details[0]?.message ?? "Requête invalide.", details });
}

const detailDe = (e: ErreurCommande): DetailErreur => ({
  code: e.code,
  chemin: e.chemin,
  objet: e.objet,
  cause: e.cause,
  action: e.action,
  message: e.message,
  ...(e.objetIds ? { objetIds: e.objetIds } : {}),
});

// ---------------------------------------------------------------------------
// Accès
// ---------------------------------------------------------------------------

/** 404 sans accès, 403 (motif) si le rôle ne suffit pas. La réservation d'édition est contrôlée sous verrou. */
export async function exigerAcces(projetId: string, userId: string, besoin: "read" | "write"): Promise<AccessibleProject> {
  const acces = await loadProjectAccess(projetId, userId);
  if (!acces) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: "Projet introuvable." });
  if (!roleAllows(acces.role, besoin)) throw new ReponseAtelier(403, { error: "forbidden", erreur: "interdit", message: FORBIDDEN_MESSAGE[besoin], role: acces.role });
  return acces;
}

interface LigneProjet {
  readonly id: string;
  readonly model_revision: number;
  readonly editing_lock: EditingLock | null;
  readonly source_example_id: string | null;
}

async function lignes<T>(ex: Executeur, requete: ReturnType<typeof sql>): Promise<T[]> {
  return (await ex.execute(requete)).rows as unknown as T[];
}

async function verrouillerProjet(ex: Executeur, projetId: string): Promise<LigneProjet> {
  const p = (await lignes<LigneProjet>(ex, sql`SELECT id, model_revision, editing_lock, source_example_id FROM projects WHERE id = ${projetId} FOR UPDATE`))[0];
  if (!p) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: "Projet introuvable." });
  return { ...p, model_revision: Number(p.model_revision) };
}

function exigerSansReservation(p: LigneProjet, userId: string): void {
  const lock = activeLock({ editingLock: p.editing_lock });
  if (lock && lock.userId !== userId) throw new ReponseAtelier(423, { error: "locked", erreur: "reserve", message: lockedMessage(lock), lock });
}

// ---------------------------------------------------------------------------
// Initialisation du modèle typé
// ---------------------------------------------------------------------------

const REQUETE_INITIALISATION = "initialisation";
let jeuP118: JeuDonneesP118 | null = null;

function donneesP118(): JeuDonneesP118 {
  jeuP118 ??= JSON.parse(readFileSync(dataFileUrl("examples/p118-native-model.json"), "utf8")) as JeuDonneesP118;
  return jeuP118;
}

const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;

/** Crée le modèle typé d'un projet verrouillé qui n'en a pas (voir l'en-tête). */
async function initialiserModele(ex: Executeur, p: LigneProjet, source?: SourceModele): Promise<EtatModele> {
  const p118 = p.source_example_id === P118_EXAMPLE_ID;
  const base = source
    ? "modele" in source
      ? source.modele
      : importerP118(source.natif, { projetId: p.id }).modele
    : p118
      ? importerP118(donneesP118(), { projetId: p.id }).modele
      : etatVide(p.id, VERSION_ONTOLOGIE);
  const etat: EtatModele = { ...base, projetId: p.id, revision: p.model_revision, empreinte: calculerEmpreinte(base) };
  await ecrireEtat(ex, etat);
  const journalId = newId("acmd");
  const label = source
    ? "modele" in source
      ? "Import du modèle typé d'une archive"
      : "Import du modèle natif d'une archive dans le modèle typé"
    : p118
      ? "Import de l'exemple P.118 dans le modèle typé"
      : "Création du modèle typé (vide)";
  const reponse: ReponseCommandes = { revision: etat.revision, empreinte: etat.empreinte, applique: [], effets: effetsReponse(EFFETS_VIDES), journalId };
  await ex.execute(sql`
    INSERT INTO atelier_commands (id, project_id, request_id, contract, nature, label, base_revision, result_revision, commands, inverse, effets, response, base_fingerprint, result_fingerprint, author_id, inverse_of)
    VALUES (${journalId}, ${p.id}, ${REQUETE_INITIALISATION}, ${CONTRAT_COMMANDES}, 'import', ${label}, ${etat.revision}, ${etat.revision}, '[]'::jsonb, '[]'::jsonb, ${json(EFFETS_VIDES)},
      ${json(reponse)}, ${etat.empreinte}, ${etat.empreinte}, NULL, NULL)`);
  // Aucun événement : révision inchangée, comme un lot sans changement (D-024). Un événement périmerait le bilan
  // Harmonie et notifierait les membres à la simple première lecture.
  return etat;
}

/** État courant d'un projet verrouillé ; créé s'il n'existe pas encore. */
async function etatSousVerrou(ex: Executeur, p: LigneProjet): Promise<EtatModele> {
  return (await chargerEtat(ex, p.id)) ?? (await initialiserModele(ex, p));
}

/** S'assure que le modèle typé existe (transaction d'écriture seulement s'il faut le créer). */
async function assurerModele(projetId: string): Promise<void> {
  const tete = await lignes<{ n: number }>(db, sql`SELECT 1 AS n FROM atelier_models WHERE project_id = ${projetId}`);
  if (tete.length > 0) return;
  await db.transaction(async (tx) => {
    const p = await verrouillerProjet(tx, projetId);
    if ((await lignes(tx, sql`SELECT 1 FROM atelier_models WHERE project_id = ${projetId}`)).length > 0) return;
    await initialiserModele(tx, p);
  });
}

/** Lecture cohérente (instantané unique, aucune écriture). */
function lecture<T>(fn: (tx: Executeur) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx), { isolationLevel: "repeatable read", accessMode: "read only" });
}

// ---------------------------------------------------------------------------
// Réponses et contrôles communs
// ---------------------------------------------------------------------------

function effetsReponse(e: Effets): EffetsReponse {
  return { vues: e.vues, documents: e.documents, problemes: e.problemes, propositions: e.propositions, remplacements: e.remplacements };
}

const idsTouches = (e: Partial<Pick<Effets, "objetsCrees" | "objetsModifies" | "objetsSupprimes">>): IdObjet[] => [
  ...new Set([...(e.objetsCrees ?? []), ...(e.objetsModifies ?? []), ...(e.objetsSupprimes ?? [])]),
];

/** `applique` : objets touchés par chaque commande, rejouée seule sur l'état de départ (même moteur, D-029). */
function appliqueDe(avant: EtatModele, commandes: readonly Commande[], effetsLot: Effets): ReponseCommandes["applique"] {
  if (commandes.length === 1) return [{ type: commandes[0]!.type, objetIds: idsTouches(effetsLot) }];
  const res: { type: TypeCommande; objetIds: IdObjet[] }[] = [];
  let etat = avant;
  for (const c of commandes) {
    const r = appliquerCommande(etat, c);
    if (!r.ok) {
      res.push({ type: c.type, objetIds: [] });
      continue;
    }
    etat = r.etat;
    res.push({ type: c.type, objetIds: idsTouches(r.effets) });
  }
  return res;
}

const TYPES = new Set<string>(TYPES_COMMANDE);
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Forme de l'enveloppe, avant tout accès à la base ; refuse une `restauration` venue du client (D-024). */
export function validerEnveloppe(corps: unknown): EnveloppeCommandes {
  const env = "Enveloppe";
  if (!estObjet(corps)) throw invalide([detail("parametre-invalide", "", env, "objet JSON attendu", "envoyer une enveloppe atelier-commands/1")]);
  const d: DetailErreur[] = [];
  const { requestId, baseRevision, contract, label, commands } = corps;
  if (typeof requestId !== "string" || requestId.trim() === "" || requestId.length > 200) d.push(detail("parametre-invalide", "requestId", env, "requestId absent ou trop long", "fournir un identifiant de requête (UUID)"));
  if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision) || baseRevision < 0) d.push(detail("parametre-invalide", "baseRevision", env, "révision de base absente", "envoyer la révision connue du modèle (entier ≥ 0)"));
  if (contract !== CONTRAT_COMMANDES) d.push(detail("parametre-invalide", "contract", env, `contrat « ${String(contract)} » non pris en charge`, `envoyer « ${CONTRAT_COMMANDES} »`));
  if (typeof label !== "string") d.push(detail("parametre-invalide", "label", env, "libellé absent", "fournir un libellé d'historique"));
  if (!Array.isArray(commands) || commands.length === 0) d.push(detail("parametre-invalide", "commands", env, "aucune commande", "envoyer au moins une commande"));
  else {
    commands.forEach((c: unknown, i) => {
      if (!estObjet(c) || typeof c["type"] !== "string" || !TYPES.has(c["type"])) {
        d.push(detail("parametre-invalide", `commands[${i}].type`, `Commande ${i + 1}`, `type « ${estObjet(c) ? String(c["type"]) : "?"} » inconnu du contrat`, "choisir un type de l'annexe B"));
      } else if (c["restauration"] !== undefined) {
        d.push(
          detail(
            "parametre-invalide",
            `commands[${i}].restauration`,
            `Commande ${c["type"]}`,
            "une restauration n'est acceptée que dans un inverse produit et journalisé par le serveur (D-024)",
            "passer par /commands/annuler ou /commands/retablir",
          ),
        );
      }
    });
  }
  if (d.length > 0) throw invalide(d);
  return corps as unknown as EnveloppeCommandes;
}

interface LigneJournal {
  readonly id: string;
  readonly request_id: string;
  readonly nature: "commande" | "annulation" | "retablissement" | "import";
  readonly label: string;
  readonly base_revision: number;
  readonly result_revision: number;
  readonly inverse: Commande[];
  readonly effets: Partial<Effets>;
  readonly response: ReponseCommandes;
  readonly base_fingerprint: string;
  readonly result_fingerprint: string;
  readonly author_id: string | null;
  readonly inverse_of: string | null;
  readonly created_at: Date | string;
}

/** 409 détaillé (§5.4) : objets changés sur le serveur depuis `baseRevision`, tels qu'ils sont maintenant. */
async function conflit(ex: Executeur, etat: EtatModele, baseRevision: number, message?: string, conflitsImposes?: readonly ConflitObjet[]): Promise<ReponseAtelier> {
  let conflits: ConflitObjet[] = [...(conflitsImposes ?? [])];
  if (!conflitsImposes) {
    const entrees = await lignes<Pick<LigneJournal, "label" | "result_revision" | "effets" | "nature">>(
      ex,
      sql`SELECT label, result_revision, effets, nature FROM atelier_commands
          WHERE project_id = ${etat.projetId} AND result_revision > ${baseRevision} AND result_revision > base_revision
          ORDER BY result_revision DESC, created_at DESC LIMIT 500`,
    );
    const vus = new Map<IdObjet, ConflitObjet>();
    for (const e of entrees) {
      const eff = e.effets;
      const marquer = (ids: readonly IdObjet[] | undefined, verbe: string) => {
        for (const id of ids ?? []) {
          if (vus.has(id)) continue;
          vus.set(id, { objetId: id, motif: `${verbe} par « ${e.label} » (révision ${e.result_revision})`, etatServeur: etat.objets[id] ?? null });
        }
      };
      marquer(eff.objetsSupprimes, "supprimé");
      marquer(eff.objetsCrees, "créé");
      marquer(eff.objetsModifies, "modifié");
    }
    conflits = [...vus.values()];
  }
  return new ReponseAtelier(409, {
    erreur: "conflit",
    message:
      message ??
      `Le modèle a changé depuis la révision ${baseRevision} (révision courante ${etat.revision}) : recharger le modèle et rejouer les commandes${conflits.length === 0 ? " (changement sans objet journalisé : ancien Atelier ou révision inconnue)" : ""}.`,
    baseRevision,
    revisionCourante: etat.revision,
    conflits,
  });
}

/** Réponse enregistrée d'une requête déjà validée (idempotence), ou `null`. */
async function reponseEnregistree(ex: Executeur, projetId: string, requestId: string): Promise<ReponseCommandes | null> {
  const r = (await lignes<{ response: ReponseCommandes }>(ex, sql`SELECT response FROM atelier_commands WHERE project_id = ${projetId} AND request_id = ${requestId}`))[0];
  return r ? r.response : null;
}

interface Journalisation {
  readonly nature: "commande" | "annulation" | "retablissement";
  readonly inverseDe: string | null;
  readonly auteur: string;
  readonly enveloppe: EnveloppeCommandes;
}

/** Applique, écrit et journalise un lot accepté ; rend la réponse et indique si un événement a été écrit. */
async function valider(ex: Executeur, avant: EtatModele, j: Journalisation): Promise<{ reponse: ReponseCommandes; change: boolean }> {
  const r = appliquerLot(avant, j.enveloppe);
  if (!r.ok) throw await refus(ex, avant, r.erreurs, j.enveloppe.baseRevision, j.nature !== "commande");
  const apres = r.etat;
  const change = apres.revision !== avant.revision;
  const journalId = newId("acmd");
  const reponse: ReponseCommandes = {
    revision: apres.revision,
    empreinte: apres.empreinte,
    applique: appliqueDe(avant, j.enveloppe.commands, r.effets),
    effets: effetsReponse(r.effets),
    journalId,
  };
  if (change) {
    await ecrireDiff(ex, avant, apres);
    await ex.execute(sql`UPDATE projects SET model_revision = ${apres.revision}, updated_at = now() WHERE id = ${avant.projetId}`);
  }
  // La réponse rendue est celle relue du journal (`RETURNING`) : jsonb réordonne les clés, et un renvoi idempotent
  // doit recevoir exactement les mêmes octets que le premier envoi.
  const enregistree = await lignes<{ response: ReponseCommandes }>(
    ex,
    sql`
    INSERT INTO atelier_commands (id, project_id, request_id, contract, nature, label, base_revision, result_revision, commands, inverse, effets, response, base_fingerprint, result_fingerprint, author_id, inverse_of)
    VALUES (${journalId}, ${avant.projetId}, ${j.enveloppe.requestId}, ${CONTRAT_COMMANDES}, ${j.nature}, ${j.enveloppe.label}, ${avant.revision}, ${apres.revision},
      ${json(j.enveloppe.commands)}, ${json(r.inverse)}, ${json(r.effets)}, ${json(reponse)}, ${avant.empreinte}, ${apres.empreinte}, ${j.auteur}, ${j.inverseDe})
    RETURNING response`,
  );
  if (change) {
    await ecrireEvenement(ex, journalId, {
      event: EVENEMENT_COMMANDE_VALIDEE,
      payload: { projectId: avant.projetId, revision: apres.revision, objetIds: idsTouches(r.effets), types: [...new Set(j.enveloppe.commands.map((c) => c.type))], auteur: j.auteur, nature: j.nature },
    });
  }
  return { reponse: enregistree[0]?.response ?? reponse, change };
}

/**
 * Refus du moteur → 400 détaillé. Pour un inverse (annuler / rétablir), une restauration dont les conditions ne
 * tiennent plus (objet changé depuis) est un conflit : 409 avec les objets en cause, tels qu'ils sont.
 */
async function refus(ex: Executeur, etat: EtatModele, erreurs: readonly ErreurCommande[], baseRevision: number, inverse: boolean): Promise<ReponseAtelier> {
  if (erreurs.some((e) => e.code === "conflit-revision")) return conflit(ex, etat, baseRevision);
  if (inverse && erreurs.some((e) => e.code === "precondition" && /(^|\.)restauration/.test(e.chemin))) {
    const ids = [...new Set(erreurs.flatMap((e) => e.objetIds ?? []))];
    return conflit(
      ex,
      etat,
      baseRevision,
      `Inversion impossible : ${erreurs[0]?.message ?? "le modèle a changé depuis l'entrée du journal"}`,
      ids.map((id) => ({ objetId: id, motif: erreurs.find((e) => e.objetIds?.includes(id))?.cause ?? "modifié depuis", etatServeur: etat.objets[id] ?? null })),
    );
  }
  return invalide(erreurs.map(detailDe));
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/**
 * Modèle de départ d'un projet importé d'une archive (D-052) : l'état typé d'une archive version 2 (identifiants
 * conservés, déjà vérifié par `modeleArchive`), ou le jeu de domaines natifs d'une archive version 1 ou d'un export
 * du prototype, passé par l'importeur du lot 1.
 */
export type SourceModele = { readonly modele: EtatModele } | { readonly natif: JeuDonneesP118 };

/**
 * Crée le modèle typé d'un projet dans la transaction de l'appelant (import de l'exemple ou d'une archive, D-052) :
 * la source donnée, sinon P.118 importé pour un projet issu de l'exemple, sinon un modèle vide. Sans effet si le
 * modèle existe déjà.
 */
export async function initialiserModeleServeur(tx: Executeur, projetId: string, source?: SourceModele): Promise<EtatModele> {
  const p = await verrouillerProjet(tx, projetId);
  return (await chargerEtat(tx, p.id)) ?? (await initialiserModele(tx, p, source));
}

/**
 * L'état typé d'une archive version 2, vérifié avant toute écriture : forme de `EtatModele`, conversion en lignes
 * sans erreur et empreinte conforme au contenu (un fichier retouché à la main est refusé). Message d'erreur sinon.
 */
export function modeleArchive(brut: Record<string, unknown>): EtatModele | string {
  const m = brut as Partial<EtatModele>;
  const dict = (x: unknown) => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!dict(m.objets) || !Array.isArray(m.relations) || !dict(m.catalogue) || !Array.isArray(m.proprietesProjet) || typeof m.empreinte !== "string" || !Number.isInteger(m.versionOntologie)) {
    return "Modèle typé de l'archive incomplet.";
  }
  if (m.versionOntologie !== VERSION_ONTOLOGIE) return `Modèle typé de l'archive : ontologie ${String(m.versionOntologie)} non prise en charge.`;
  const etat = { ...(m as EtatModele), supprimes: Array.isArray(m.supprimes) ? m.supprimes : [] };
  try {
    if (calculerEmpreinte(etat) !== etat.empreinte) return "Modèle typé de l'archive : empreinte non conforme au contenu.";
    lignesVersEtat(etatVersLignes(etat));
  } catch (e) {
    return `Modèle typé de l'archive illisible : ${e instanceof Error ? e.message : String(e)}`;
  }
  return etat;
}

/**
 * État du modèle typé dans une transaction du serveur (projet verrouillé ici), créé s'il n'existe pas encore :
 * pour un traitement du serveur qui lit le modèle avant d'émettre ses propres commandes (`executerLotServeur`).
 */
export async function etatPourServeur(tx: Executeur, projetId: string): Promise<EtatModele> {
  return etatSousVerrou(tx, await verrouillerProjet(tx, projetId));
}

/**
 * Lot émis par le serveur lui-même (transmission de la parcelle, D-052), dans la transaction de l'appelant : même
 * moteur, même journal, même événement qu'un `POST /commands`, à la révision courante. L'appelant appelle
 * `apresLotServeur` une fois sa transaction validée.
 */
export async function executerLotServeur(
  tx: Executeur,
  projetId: string,
  auteurId: string,
  label: string,
  commandes: readonly Commande[],
): Promise<{ reponse: ReponseCommandes; change: boolean }> {
  const avant = await etatPourServeur(tx, projetId);
  const enveloppe: EnveloppeCommandes = { contract: CONTRAT_COMMANDES, requestId: newId("serveur"), baseRevision: avant.revision, label, commands: commandes };
  return valider(tx, avant, { nature: "commande", inverseDe: null, auteur: auteurId, enveloppe });
}

/** Après la validation de la transaction d'un `executerLotServeur` qui a changé le modèle. */
export function apresLotServeur(projetId: string): void {
  declencherTraitement(projetId);
}

/** `POST /commands` */
export async function executerLot(projetId: string, user: { id: string }, corps: unknown): Promise<ReponseCommandes> {
  await exigerAcces(projetId, user.id, "write");
  const enveloppe = validerEnveloppe(corps);
  const { reponse, change } = await db.transaction(async (tx) => {
    const p = await verrouillerProjet(tx, projetId);
    const deja = await reponseEnregistree(tx, projetId, enveloppe.requestId);
    if (deja) return { reponse: deja, change: false };
    exigerSansReservation(p, user.id);
    const avant = await etatSousVerrou(tx, p);
    if (enveloppe.baseRevision !== avant.revision) throw await conflit(tx, avant, enveloppe.baseRevision);
    return valider(tx, avant, { nature: "commande", inverseDe: null, auteur: user.id, enveloppe });
  });
  if (change) declencherTraitement(projetId);
  return reponse;
}

export interface DemandeInverse {
  readonly requestId: string;
  readonly baseRevision: number;
  readonly journalId?: string;
}

function validerDemandeInverse(corps: unknown): DemandeInverse {
  const env = "Demande";
  if (!estObjet(corps)) throw invalide([detail("parametre-invalide", "", env, "objet JSON attendu", "envoyer { requestId, baseRevision, journalId? }")]);
  const d: DetailErreur[] = [];
  const { requestId, baseRevision, journalId } = corps;
  if (typeof requestId !== "string" || requestId.trim() === "" || requestId.length > 200) d.push(detail("parametre-invalide", "requestId", env, "requestId absent ou trop long", "fournir un identifiant de requête (UUID)"));
  if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision) || baseRevision < 0) d.push(detail("parametre-invalide", "baseRevision", env, "révision de base absente", "envoyer la révision connue du modèle (entier ≥ 0)"));
  if (journalId !== undefined && journalId !== null && typeof journalId !== "string" && typeof journalId !== "number") d.push(detail("parametre-invalide", "journalId", env, "identifiant d'entrée illisible", "envoyer l'identifiant rendu par /journal"));
  if (d.length > 0) throw invalide(d);
  return { requestId: requestId as string, baseRevision: baseRevision as number, ...(journalId !== undefined && journalId !== null ? { journalId: String(journalId) } : {}) };
}

/**
 * `POST /commands/annuler` (sens `annuler`) et `/commands/retablir` (sens `retablir`) : applique l'inverse
 * journalisé d'une entrée (nouvelle microversion, `inverse_of`). Sans `journalId` : dernière entrée annulable
 * (commande ou rétablissement non encore inversé) de l'auteur, ou dernière annulation de l'auteur non encore
 * rétablie et non suivie d'une nouvelle commande de sa part.
 */
export async function inverserEntree(projetId: string, user: { id: string }, sens: "annuler" | "retablir", corps: unknown): Promise<ReponseCommandes> {
  await exigerAcces(projetId, user.id, "write");
  const demande = validerDemandeInverse(corps);
  const { reponse, change } = await db.transaction(async (tx) => {
    const p = await verrouillerProjet(tx, projetId);
    const deja = await reponseEnregistree(tx, projetId, demande.requestId);
    if (deja) return { reponse: deja, change: false };
    exigerSansReservation(p, user.id);
    const avant = await etatSousVerrou(tx, p);
    if (demande.baseRevision !== avant.revision) throw await conflit(tx, avant, demande.baseRevision);
    const cible = await entreeAInverser(tx, projetId, user.id, sens, demande.journalId);
    const label = sens === "annuler" ? `Annuler : ${cible.label}` : cible.label.startsWith("Annuler : ") ? `Rétablir : ${cible.label.slice("Annuler : ".length)}` : `Rétablir : ${cible.label}`;
    const enveloppe: EnveloppeCommandes = { requestId: demande.requestId, baseRevision: avant.revision, contract: CONTRAT_COMMANDES, label, commands: cible.inverse };
    return valider(tx, avant, { nature: sens === "annuler" ? "annulation" : "retablissement", inverseDe: cible.id, auteur: user.id, enveloppe });
  });
  if (change) declencherTraitement(projetId);
  return reponse;
}

async function entreeAInverser(ex: Executeur, projetId: string, userId: string, sens: "annuler" | "retablir", journalId: string | undefined): Promise<LigneJournal> {
  const natures = sens === "annuler" ? sql`('commande', 'retablissement')` : sql`('annulation')`;
  const objet = journalId ? `Entrée ${journalId}` : "Journal";
  let ligne: LigneJournal | undefined;
  if (journalId) {
    ligne = (await lignes<LigneJournal>(ex, sql`SELECT * FROM atelier_commands WHERE project_id = ${projetId} AND id = ${journalId}`))[0];
    if (!ligne) throw invalide([detail("precondition", "journalId", objet, "introuvable dans le journal du projet", "choisir une entrée rendue par /journal")]);
    const admises = sens === "annuler" ? ["commande", "retablissement"] : ["annulation"];
    if (!admises.includes(ligne.nature)) {
      throw invalide([
        detail("precondition", "journalId", objet, `entrée de nature « ${ligne.nature} » : ${sens === "annuler" ? "seule une commande ou un rétablissement s'annule" : "seule une annulation se rétablit"}`, sens === "annuler" ? "choisir une commande" : "choisir une annulation"),
      ]);
    }
    const inversee = await lignes(ex, sql`SELECT 1 FROM atelier_commands WHERE inverse_of = ${journalId}`);
    if (inversee.length > 0) throw invalide([detail("precondition", "journalId", objet, sens === "annuler" ? "déjà annulée" : "déjà rétablie", "recharger le journal")]);
  } else {
    const apresDerniereCommande =
      sens === "retablir"
        ? sql`AND c.result_revision >= coalesce((SELECT max(result_revision) FROM atelier_commands x WHERE x.project_id = ${projetId} AND x.author_id = ${userId} AND x.nature = 'commande' AND x.result_revision > x.base_revision), -1)`
        : sql``;
    ligne = (
      await lignes<LigneJournal>(
        ex,
        sql`SELECT c.* FROM atelier_commands c
            WHERE c.project_id = ${projetId} AND c.author_id = ${userId} AND c.nature IN ${natures} AND jsonb_array_length(c.inverse) > 0
              AND NOT EXISTS (SELECT 1 FROM atelier_commands i WHERE i.inverse_of = c.id) ${apresDerniereCommande}
            ORDER BY c.result_revision DESC, c.created_at DESC LIMIT 1`,
      )
    )[0];
    if (!ligne) throw invalide([detail("precondition", "journalId", objet, sens === "annuler" ? "aucune entrée à annuler pour ce compte" : "aucune annulation à rétablir pour ce compte", "rien à faire")]);
  }
  if (!Array.isArray(ligne.inverse) || ligne.inverse.length === 0) throw invalide([detail("precondition", "journalId", objet, "entrée sans inverse (lot sans changement ou import)", "rien à annuler")]);
  return ligne;
}

/** `POST /commands/essai` : exécution à blanc, aucune écriture du lot (D-015 : rôle d'écriture exigé). */
export async function essayerLot(projetId: string, user: { id: string }, corps: unknown): Promise<ReponseEssai> {
  await exigerAcces(projetId, user.id, "write");
  const enveloppe = validerEnveloppe(corps);
  await assurerModele(projetId);
  return lecture(async (tx) => {
    const avant = await chargerEtat(tx, projetId);
    if (!avant) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: "Modèle introuvable." });
    if (enveloppe.baseRevision !== avant.revision) throw await conflit(tx, avant, enveloppe.baseRevision);
    const r = appliquerLot(avant, enveloppe);
    if (!r.ok) throw await refus(tx, avant, r.erreurs, enveloppe.baseRevision, false);
    return { revision: r.etat.revision, empreinte: r.etat.empreinte, applique: appliqueDe(avant, enveloppe.commands, r.effets), effets: effetsReponse(r.effets) };
  });
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

/** `GET /model?revision=n` : état courant, ou reconstruit à la révision `n` par les inverses du journal (D-030). */
export async function lireModele(projetId: string, user: { id: string }, revision?: number): Promise<EtatModele> {
  await exigerAcces(projetId, user.id, "read");
  await assurerModele(projetId);
  return lecture(async (tx) => {
    const courant = await chargerEtat(tx, projetId);
    if (!courant) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: "Modèle introuvable." });
    if (revision === undefined || revision === courant.revision) return courant;
    const borne = (await lignes<{ r: number | null }>(tx, sql`SELECT min(result_revision) AS r FROM atelier_commands WHERE project_id = ${projetId} AND nature = 'import'`))[0]?.r;
    if (revision > courant.revision || borne === null || borne === undefined || revision < Number(borne)) {
      throw new ReponseAtelier(404, {
        error: "not_found",
        erreur: "revision-introuvable",
        message: `Révision ${revision} hors de l'historique du modèle typé (de ${borne ?? "?"} à ${courant.revision}).`,
      });
    }
    const entrees = await lignes<Pick<LigneJournal, "id" | "inverse" | "base_fingerprint" | "base_revision" | "label">>(
      tx,
      sql`SELECT id, inverse, base_fingerprint, base_revision, label FROM atelier_commands
          WHERE project_id = ${projetId} AND result_revision > ${revision} AND result_revision > base_revision
          ORDER BY result_revision DESC, created_at DESC`,
    );
    let etat = courant;
    for (const e of entrees) {
      const r = appliquerLot(etat, { requestId: `reconstruction-${e.id}`, baseRevision: etat.revision, contract: CONTRAT_COMMANDES, label: `Reconstruction : ${e.label}`, commands: e.inverse });
      if (!r.ok) throw new Error(`Reconstruction de la révision ${revision} impossible à l'entrée ${e.id} : ${r.erreurs.map((x) => x.message).join(" ; ")}`);
      if (r.etat.empreinte !== e.base_fingerprint) throw new Error(`Reconstruction : empreinte ${r.etat.empreinte} après l'entrée ${e.id}, ${e.base_fingerprint} attendue.`);
      etat = r.etat;
    }
    return { ...etat, revision };
  });
}

export interface ReponseNiveau {
  readonly revision: number;
  readonly empreinte: string;
  readonly niveauId: IdObjet;
  readonly niveau: ObjetModele;
  readonly objets: Readonly<Record<IdObjet, ObjetModele>>;
  readonly relations: EtatModele["relations"];
}

/** `GET /model/niveaux/:niveauId` (D-029) ; `objets` comprend le niveau lui-même. */
export async function lireNiveau(projetId: string, user: { id: string }, niveauId: string): Promise<ReponseNiveau> {
  await exigerAcces(projetId, user.id, "read");
  await assurerModele(projetId);
  const n = await lecture((tx) => chargerNiveau(tx, projetId, niveauId));
  if (!n) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: `Niveau ${niveauId} introuvable.` });
  const objets: Record<IdObjet, ObjetModele> = { [n.niveau.id]: n.niveau };
  for (const o of n.objets) objets[o.id] = o;
  return { revision: n.revision, empreinte: n.empreinte, niveauId, niveau: n.niveau, objets, relations: n.relations };
}

export interface EntreeJournal {
  readonly journalId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly baseRevision: number;
  readonly label: string;
  readonly nature: string;
  readonly types: readonly string[];
  readonly objetIds: readonly IdObjet[];
  readonly inverseDe: string | null;
  readonly auteur?: string;
  readonly auteurId: string | null;
  readonly empreinte: string;
  readonly creeLe: string;
}

/** `GET /journal?apres=n` : entrées de révision > n, ordre croissant (D-029). */
export async function lireJournal(projetId: string, user: { id: string }, apres: number): Promise<{ revisionCourante: number; entrees: EntreeJournal[] }> {
  await exigerAcces(projetId, user.id, "read");
  await assurerModele(projetId);
  return lecture(async (tx) => {
    const p = (await lignes<{ model_revision: number }>(tx, sql`SELECT model_revision FROM projects WHERE id = ${projetId}`))[0];
    const rows = await lignes<{
      id: string;
      request_id: string;
      result_revision: number;
      base_revision: number;
      label: string;
      nature: string;
      types: string[];
      effets: Partial<Effets>;
      inverse_of: string | null;
      author_id: string | null;
      email: string | null;
      result_fingerprint: string;
      created_at: Date | string;
    }>(
      tx,
      sql`SELECT c.id, c.request_id, c.result_revision, c.base_revision, c.label, c.nature, c.effets, c.inverse_of, c.author_id, u.email, c.result_fingerprint, c.created_at,
            coalesce((SELECT jsonb_agg(x->>'type') FROM jsonb_array_elements(c.commands) x), '[]'::jsonb) AS types
          FROM atelier_commands c LEFT JOIN users u ON u.id = c.author_id
          WHERE c.project_id = ${projetId} AND c.result_revision > ${apres}
          ORDER BY c.result_revision ASC, c.created_at ASC`,
    );
    return {
      revisionCourante: Number(p?.model_revision ?? 0),
      entrees: rows.map((r) => ({
        journalId: r.id,
        requestId: r.request_id,
        revision: Number(r.result_revision),
        baseRevision: Number(r.base_revision),
        label: r.label,
        nature: r.nature,
        types: [...new Set(r.types)],
        objetIds: idsTouches(r.effets),
        inverseDe: r.inverse_of,
        ...(r.email ? { auteur: r.email } : {}),
        auteurId: r.author_id,
        empreinte: r.result_fingerprint,
        creeLe: new Date(r.created_at).toISOString(),
      })),
    };
  });
}

export type ProblemeAtelier = Probleme & { readonly categorie: "reference" | "conflit" | "document" | "harmonie" };

/**
 * `GET /problemes` (D-029) : références à réparer (résolveur d'atelier-model sur l'état courant) et documents
 * produits périmés (`produced_documents.model_revision` < révision courante, R11). Conflits : aucun en attente côté
 * serveur au lot 2 (un lot en conflit est refusé par 409 et reste dans la file du client). Réserves Harmonie :
 * restent dans les étapes (L2.3 / lot 4).
 */
export async function lireProblemes(projetId: string, user: { id: string }): Promise<{ revision: number; problemes: ProblemeAtelier[] }> {
  await exigerAcces(projetId, user.id, "read");
  await assurerModele(projetId);
  return lecture(async (tx) => {
    const etat = await chargerEtat(tx, projetId);
    if (!etat) throw new ReponseAtelier(404, { error: "not_found", erreur: "introuvable", message: "Modèle introuvable." });
    const problemes: ProblemeAtelier[] = problemesReferences({ objets: etat.objets }).map((p) => ({ ...p, categorie: "reference" as const }));
    const docs = await lignes<{ kind: string; label: string; model_revision: number }>(
      tx,
      sql`SELECT kind, label, model_revision FROM produced_documents WHERE project_id = ${projetId} AND model_revision < ${etat.revision} ORDER BY kind`,
    );
    for (const d of docs) {
      problemes.push({
        categorie: "document",
        code: "document-perime",
        gravite: "avertissement",
        message: `Document « ${d.label} » (${d.kind}) produit à la révision ${d.model_revision}, périmé : le modèle est à la révision ${etat.revision}. Action : le reproduire.`,
        objetIds: [],
      });
    }
    return { revision: etat.revision, problemes };
  });
}
