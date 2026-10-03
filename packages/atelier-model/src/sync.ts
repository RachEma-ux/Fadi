/**
 * Logique pure de synchronisation (partagée navigateur / serveur, T06 / T08 / T09) : cibles d'annulation et de
 * rétablissement dans un journal, rejeu de lots en attente sur un état serveur plus récent (rebase), états
 * visibles d'un lot. Aucune entrée-sortie : le bus client et le service de commandes l'appellent.
 */
import { appliquerLot, ErreurCommande, type Commande, type Enveloppe } from "./commandes/index.js";
import type { ModeleAtelier } from "./modele.js";

export type KindJournal = "commande" | "annulation" | "retablissement";

export interface EntreeJournal {
  id: string;
  kind: KindJournal;
  requestId: string;
  label: string;
  baseRevision: number;
  resultRevision: number;
  inverseOf: string | null;
  /** Commande inverse (instantané différentiel) ; absente dans les lectures allégées. */
  inverse?: Commande;
}

/** Dernière entrée annulable : commande ou rétablissement le plus récent non encore annulé. */
export function cibleAnnulation<E extends EntreeJournal>(entrees: readonly E[]): E | null {
  const tri = [...entrees].sort((a, b) => b.resultRevision - a.resultRevision);
  const annulees = new Set(tri.filter((e) => e.kind === "annulation").map((e) => e.inverseOf));
  return tri.find((e) => e.kind !== "annulation" && !annulees.has(e.id)) ?? null;
}

/** Dernière annulation rétablissable : postérieure à la dernière commande, non encore rétablie. */
export function cibleRetablissement<E extends EntreeJournal>(entrees: readonly E[]): E | null {
  const tri = [...entrees].sort((a, b) => b.resultRevision - a.resultRevision);
  const retablies = new Set(tri.filter((e) => e.kind === "retablissement").map((e) => e.inverseOf));
  const derniereCommande = tri.find((e) => e.kind === "commande");
  return tri.find((e) => e.kind === "annulation" && !retablies.has(e.id) && (!derniereCommande || e.resultRevision > derniereCommande.resultRevision)) ?? null;
}

export type EtatLot = "local" | "synchronisation" | "synchronise" | "conflit" | "refuse";

export interface LotEnAttente {
  enveloppe: Enveloppe;
  etat: EtatLot;
  creeA: string;
  /** Détail du refus ou du conflit renvoyé par le serveur (409 / 400), s'il y en a un. */
  detail: Record<string, unknown> | null;
}

export interface ResultatRejeu {
  etat: ModeleAtelier;
  /** Lots qui s'appliquent encore sur l'état serveur (révision de base réalignée). */
  rejoues: LotEnAttente[];
  /** Lots qui ne s'appliquent plus (objet disparu, précondition fausse) : brouillons à traiter, jamais perdus. */
  incompatibles: { lot: LotEnAttente; erreur: { code: string; chemin: string; message: string } }[];
}

/**
 * Rejoue des lots en attente sur un état serveur plus récent : chaque lot est réappliqué dans l'ordre avec la
 * révision de base réalignée ; un lot qui échoue devient un brouillon incompatible (état « conflit ») et les
 * suivants continuent sur l'état sans lui. L'état d'affichage ne ment jamais : un brouillon n'est pas « synchronisé ».
 */
export function rejouerLots(etatServeur: ModeleAtelier, revisionServeur: number, lots: readonly LotEnAttente[]): ResultatRejeu {
  let courant = etatServeur;
  let revision = revisionServeur;
  const rejoues: LotEnAttente[] = [];
  const incompatibles: ResultatRejeu["incompatibles"] = [];
  for (const lot of lots) {
    if (lot.etat === "conflit" || lot.etat === "refuse") {
      incompatibles.push({ lot, erreur: { code: "conserve", chemin: "", message: "brouillon en attente de décision" } });
      continue;
    }
    const enveloppe: Enveloppe = { ...lot.enveloppe, baseRevision: revision };
    try {
      const r = appliquerLot(courant, enveloppe);
      courant = r.etat;
      revision += 1;
      rejoues.push({ ...lot, enveloppe, etat: "local", detail: null });
    } catch (err) {
      if (err instanceof ErreurCommande) {
        incompatibles.push({ lot: { ...lot, etat: "conflit", detail: { code: err.code, chemin: err.chemin, message: err.message } }, erreur: { code: err.code, chemin: err.chemin, message: err.message } });
        continue;
      }
      throw err;
    }
  }
  return { etat: courant, rejoues, incompatibles };
}
