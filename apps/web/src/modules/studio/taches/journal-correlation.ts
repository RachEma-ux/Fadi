/**
 * Journal de corrélation commande ↔ tâche de Studio (EX-095, REF-02 : « Des mesures agrégées de latence, de mémoire,
 * d'erreurs et de tâches doivent permettre de détecter une dégradation de service sans enregistrer inutilement les
 * géométries confidentielles ou des secrets d'accès. Les traces sont corrélées par identifiants non sensibles de
 * commande/job. »).
 *
 * - **Commandes** : un lot envoyé au serveur est noté par son `commandId` (le `requestId` du lot, tiré au hasard par
 *   l'appareil), les identifiants d'outils du registre et le nombre de commandes — jamais leurs paramètres (géométrie) ;
 *   sa confirmation note la révision produite et la latence ; un refus, son statut HTTP et son code d'erreur seuls.
 * - **Tâches** : chaque changement d'état de l'ordonnanceur est noté par son `jobId` (`job-<n>`), sa clé logique, sa
 *   classe, sa révision d'entrée, la latence d'exécution et, quand le navigateur l'expose, le tas JavaScript utilisé
 *   (sinon absent : non évalué). Une tâche est rattachée à la commande déclarée par sa demande, sinon à la commande qui a
 *   produit sa révision d'entrée.
 * - **Contrôle avant publication** (`controlerJournal`, `exporterJournal`) : seuls les champs déclarés sont admis ; une
 *   valeur qui ressemble à un secret (jeton, en-tête d'autorisation, mot de passe, clé, cookie), à une adresse de
 *   courriel, ou à de la géométrie (coordonnées, tableaux de nombres, paramètres de commande) fait échouer le contrôle et
 *   **empêche l'export** du journal. Le journal n'est jamais envoyé nulle part par ce module : il se lit dans la session
 *   (`globalThis.__fadiJournal`) et s'exporte sur demande, contrôlé.
 *
 * Pur (ni React, ni DOM) : horloge et mémoire injectables.
 */
import type { EvenementTache } from "./ordonnanceur";

export type EvenementCommande = "soumise" | "confirmee" | "refusee" | "non-confirmee";
export interface EntreeCommande {
  readonly type: "commande"; readonly t: number; readonly commandId: string; readonly evenement: EvenementCommande;
  readonly outils: readonly string[]; readonly nombre: number; readonly dureeMs?: number; readonly revision?: string; readonly statut?: number; readonly code?: string;
}
export interface EntreeTache {
  readonly type: "tache"; readonly t: number; readonly jobId: string; readonly commandId: string | null; readonly cle: string; readonly classe: string;
  readonly evenement: string; readonly revision: string; readonly tentative: number; readonly dureeMs?: number; readonly memoireOctets?: number;
}
export type EntreeJournal = EntreeCommande | EntreeTache;

/** Champs admis dans une entrée (tout autre champ fait échouer le contrôle). */
const CHAMPS: Readonly<Record<EntreeJournal["type"], readonly string[]>> = Object.freeze({
  commande: ["type", "t", "commandId", "evenement", "outils", "nombre", "dureeMs", "revision", "statut", "code"],
  tache: ["type", "t", "jobId", "commandId", "cle", "classe", "evenement", "revision", "tentative", "dureeMs", "memoireOctets"],
});
const NUMERIQUES = new Set(["t", "nombre", "dureeMs", "statut", "tentative", "memoireOctets"]);
/** Identifiant non sensible : lettres, chiffres et `._:-`, 128 caractères au plus. */
export const IDENTIFIANT_NON_SENSIBLE = /^[A-Za-z0-9._:-]{1,128}$/;

export type MotifViolation = "champ-non-declare" | "secret" | "courriel" | "geometrie" | "identifiant-sensible" | "valeur-non-scalaire";
export interface ViolationJournal { readonly index: number; readonly champ: string; readonly motif: MotifViolation }

const SECRETS: readonly RegExp[] = [
  /\bBearer\s+\S+/i, /\bBasic\s+[A-Za-z0-9+/=]{8,}/i,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/, // JWT
  /(?:pass(?:word|wd)?|mot[ _-]?de[ _-]?passe|secret|token|jeton|api[ _-]?key|cl[ée][ _-]?api|authorization|cookie|session[ _-]?id)\s*[:=]/i,
  /\b(?:sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{12,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const COURRIEL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Indices de géométrie dans un texte (JSON de coordonnées, couples de nombres). */
const GEOMETRIE_TEXTE = /"(?:x|y|z|points?|vertices|sommets|start|end|center|centre|coordinates|coordonnees)"\s*:|\(\s*-?\d+(?:\.\d+)?\s*[,;]\s*-?\d+(?:\.\d+)?\s*\)/i;

function controlerChaine(v: string): MotifViolation | null {
  if (SECRETS.some((re) => re.test(v))) return "secret";
  if (COURRIEL.test(v)) return "courriel";
  if (GEOMETRIE_TEXTE.test(v)) return "geometrie";
  return null;
}

/**
 * Contrôle d'un journal avant toute publication : liste des violations (vide : publiable). Fonctionne sur des données
 * quelconques (un journal relu d'ailleurs est contrôlé de la même façon).
 */
export function controlerJournal(entrees: readonly unknown[]): ViolationJournal[] {
  const out: ViolationJournal[] = [];
  entrees.forEach((e, index) => {
    if (!e || typeof e !== "object" || Array.isArray(e)) { out.push({ index, champ: "", motif: "valeur-non-scalaire" }); return; }
    const o = e as Record<string, unknown>;
    const admis = CHAMPS[o["type"] as EntreeJournal["type"]] ?? [];
    for (const [champ, v] of Object.entries(o)) {
      if (!admis.includes(champ)) {
        out.push({ index, champ, motif: /geom|point|vertex|vertices|sommet|coord|param|document|forme|shape/i.test(champ) ? "geometrie" : /pass|secret|token|jeton|cookie|auth|cl[eé]|key/i.test(champ) ? "secret" : "champ-non-declare" });
        continue;
      }
      if (v === undefined || v === null) continue;
      if (NUMERIQUES.has(champ)) { if (typeof v !== "number" || !Number.isFinite(v)) out.push({ index, champ, motif: "valeur-non-scalaire" }); continue; }
      if (champ === "outils") {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) { out.push({ index, champ, motif: Array.isArray(v) && v.some((x) => typeof x === "number") ? "geometrie" : "valeur-non-scalaire" }); continue; }
        for (const x of v as string[]) { const m = IDENTIFIANT_NON_SENSIBLE.test(x) ? null : controlerChaine(x) ?? "identifiant-sensible"; if (m) out.push({ index, champ, motif: m }); }
        continue;
      }
      if (typeof v !== "string") { out.push({ index, champ, motif: typeof v === "object" ? "geometrie" : "valeur-non-scalaire" }); continue; }
      const m = controlerChaine(v);
      if (m) { out.push({ index, champ, motif: m }); continue; }
      if ((champ === "commandId" || champ === "jobId" || champ === "revision") && !IDENTIFIANT_NON_SENSIBLE.test(v)) out.push({ index, champ, motif: "identifiant-sensible" });
    }
  });
  return out;
}

export class ErreurJournal extends Error {
  constructor(readonly violations: readonly ViolationJournal[]) {
    super(`Journal non publiable : ${violations.length} violation(s) (${[...new Set(violations.map((v) => v.motif))].join(", ")}).`);
    this.name = "ErreurJournal";
  }
}

/** Export du journal (JSON) seulement s'il passe le contrôle ; sinon `ErreurJournal`, et rien n'est produit. */
export function exporterJournal(entrees: readonly unknown[]): string {
  const v = controlerJournal(entrees);
  if (v.length) throw new ErreurJournal(v);
  return JSON.stringify({ schema: "studio-journal-correlation/1", entrees }, null, 2);
}

export interface CorrelationCommande { commandId: string; revision: string | null; jobIds: string[]; refus: number }

/** Lot de commandes tel que l'envoie Studio : seuls `requestId` et les `toolId` sont lus. */
export interface LotNote { requestId: string; commands: readonly { toolId: string }[] }

export class JournalCorrelation {
  private readonly lignes: EntreeJournal[] = [];
  private readonly commandeDeRevision = new Map<string, string>();
  private readonly debuts = new Map<string, number>();
  private readonly enChargement = new Set<string>();

  constructor(private readonly o: { taille?: number; horloge?: () => number; memoire?: () => number | null } = {}) {}

  private maintenant(): number { return this.o.horloge ? this.o.horloge() : typeof performance !== "undefined" ? performance.now() : Date.now(); }
  private ajouter(e: EntreeJournal): void {
    this.lignes.push(e);
    const taille = this.o.taille ?? 500;
    if (this.lignes.length > taille) this.lignes.splice(0, this.lignes.length - taille);
  }

  /** Envoi d'un lot : rend la fonction qui note son issue (confirmée, refusée, non confirmée). */
  noterCommande(lot: LotNote): (issue: Exclude<EvenementCommande, "soumise">, d?: { revision?: string; statut?: number; code?: string }) => void {
    const t0 = this.maintenant();
    const base = { type: "commande" as const, commandId: lot.requestId, outils: [...new Set(lot.commands.map((c) => c.toolId))], nombre: lot.commands.length };
    this.ajouter({ ...base, t: t0, evenement: "soumise" });
    let fait = false;
    return (issue, d = {}) => {
      if (fait) return;
      fait = true;
      const t = this.maintenant();
      if (issue === "confirmee" && d.revision) this.commandeDeRevision.set(d.revision, lot.requestId);
      this.ajouter({
        ...base, t, evenement: issue, dureeMs: t - t0,
        ...(d.revision ? { revision: d.revision } : {}), ...(d.statut !== undefined ? { statut: d.statut } : {}), ...(d.code ? { code: d.code } : {}),
      });
    };
  }

  /** Changement d'état d'une tâche (`surEvenement` de l'ordonnanceur). */
  noterTache(e: EvenementTache): void {
    const t = this.maintenant();
    // Une tâche passée par `loading` (IF-007) compte sa durée depuis le début du chargement.
    if (e.etat === "loading") { this.enChargement.add(e.jobId); this.debuts.set(e.jobId, t); }
    else if (e.etat === "running" && !this.enChargement.delete(e.jobId)) this.debuts.set(e.jobId, t);
    const debut = this.debuts.get(e.jobId);
    const final = e.etat === "done" || e.etat === "failed" || e.etat === "cancelled" || e.etat === "superseded" || e.etat === "timed-out" || e.etat === "stale";
    const memoire = final ? this.o.memoire?.() ?? null : null;
    if (final) { this.debuts.delete(e.jobId); this.enChargement.delete(e.jobId); }
    this.ajouter({
      type: "tache", t, jobId: e.jobId, commandId: e.commandId ?? this.commandeDeRevision.get(e.revision) ?? null, cle: e.cle, classe: e.classe,
      evenement: e.etat, revision: e.revision, tentative: e.tentative,
      ...(final && debut !== undefined ? { dureeMs: t - debut } : {}), ...(memoire !== null ? { memoireOctets: memoire } : {}),
    });
  }

  entrees(): readonly EntreeJournal[] { return this.lignes; }

  /** Tâches rattachées à chaque commande (corrélation par identifiants seuls). */
  correler(): CorrelationCommande[] {
    const out = new Map<string, CorrelationCommande>();
    for (const e of this.lignes) {
      if (!e.commandId) continue;
      const c = out.get(e.commandId) ?? { commandId: e.commandId, revision: null, jobIds: [], refus: 0 };
      if (e.type === "commande") {
        if (e.revision) c.revision = e.revision;
        if (e.evenement === "refusee") c.refus++;
      } else if (!c.jobIds.includes(e.jobId)) c.jobIds.push(e.jobId);
      out.set(e.commandId, c);
    }
    return [...out.values()];
  }
}

/** Tas JavaScript utilisé (Chromium : `performance.memory`) ; null ailleurs (non évalué, jamais zéro). */
export function memoireNavigateur(): number | null {
  const m = (globalThis as { performance?: { memory?: { usedJSHeapSize?: unknown } } }).performance?.memory?.usedJSHeapSize;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

/** Journal de la session Studio, lisible par la recette (`globalThis.__fadiJournal`). */
export const journalStudio = new JournalCorrelation({ memoire: memoireNavigateur });
(globalThis as { __fadiJournal?: unknown }).__fadiJournal = {
  entrees: () => journalStudio.entrees(), correler: () => journalStudio.correler(), exporter: () => exporterJournal(journalStudio.entrees()),
};
